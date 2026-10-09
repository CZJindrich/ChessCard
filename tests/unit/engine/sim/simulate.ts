/**
 * Whole-game simulation with bots in every seat (E5 balance harness). Each seat turn is planned
 * once with `planTurn` and replayed action by action, as the client controller and the server
 * do; an action that became illegal triggers a re-plan. Decisions outside seat turns come from
 * `botChoice`. Used by `bots*.test.ts` (short runs) and the WW_SIM=1 balance sweep.
 */
import { customSelection, NO_FLAGS, resolveConfig } from '../../../../src/config';
import { activeSeats, applyAction, botChoice, createGame, lastFlameStandings, pendingAutomation, planTurn } from '../../../../src/engine';
import type { Action, BotLevel, DifficultyId, DreadCause, GameState, GloryReason, LengthId, ModeId, RuleValues } from '../../../../src/engine';

export interface SimSeat {
  kind: BotLevel;
  hero: string | null;
}

export interface SimGameOptions {
  mode: ModeId;
  length: LengthId;
  difficulty: DifficultyId;
  seats: SimSeat[];
  seed: string;
  overrides?: Partial<RuleValues>;
  /** Override every planner's node budget (tests). */
  budget?: number;
  /**
   * Keep the planners' wall-clock safety net (default off: a loaded machine must not change the
   * plans, so sweeps are reproducible; budgets alone bound the search).
   */
  wallClock?: boolean;
  maxSteps?: number;
  /** Called with every state before its action (invariant checks). */
  onAction?: (s: GameState, a: Action) => void;
}

export interface SimSeatResult {
  seat: number;
  hero: string;
  glory: number;
  placement: number | null;
  alive: boolean;
  /** Last Flame: Glory by reason (empty in Vigil). */
  gloryBy: Partial<Record<GloryReason, number>>;
  /** Units (not heroes) of this seat that died, and how many of them a rival seat felled. */
  unitsLost: number;
  unitsLostToRivals: number;
}

export interface SimGameResult {
  seed: string;
  mode: ModeId;
  difficulty: DifficultyId;
  heroes: string[];
  finished: boolean;
  /** Vigil: victory / defeat; Last Flame: the end reason. */
  outcome: string;
  nights: number;
  rounds: number;
  /** Player actions applied (advance excluded). */
  actions: number;
  seatTurns: number;
  /** Plan actions that had become illegal when replayed (each forces a re-plan). */
  replans: number;
  maxExpansions: number;
  maxBudget: number;
  planMs: number;
  maxPlanMs: number;
  finalDread: number | null;
  dreadAtBossNight: number | null;
  bossId: string | null;
  bossHpLeft: number | null;
  bossMaxHp: number | null;
  bossRounds: number;
  /** Guttered King CHECKMATEs (crown sockets filled). */
  bossCrowns: number;
  /** Vigil: Dread when each regular Night reached Dawn (before the Dawn recovery). */
  dreadBeforeDawn: number[];
  /** Vigil: net Dread change by cause on the regular Nights (Dawn recovery is negative) and on the Boss Night. */
  dreadBy: { regular: Partial<Record<DreadCause, number>>; boss: Partial<Record<DreadCause, number>> };
  seatsResult: SimSeatResult[];
}

export function simConfigState(opts: SimGameOptions): GameState {
  const seats = opts.seats.map((seat, i) => ({ kind: seat.kind, hero: seat.hero, name: `Bot ${i + 1}` }));
  const selection = customSelection({
    mode: opts.mode,
    length: opts.length,
    difficulty: opts.difficulty,
    overrides: { seed: opts.seed, seats, ...(opts.overrides ?? {}) },
    flags: { ...NO_FLAGS },
  });
  return createGame(resolveConfig(selection).config);
}

interface Turn {
  seat: number;
  plan: Action[];
}

function now(): number {
  return performance.now();
}

function decision(s: GameState): Action | null {
  if (pendingAutomation(s)) return { type: 'advance' };
  if (s.phase === 'players') {
    if (s.activeSeat !== null) return null;
    const seat = activeSeats(s)[0];
    return seat === undefined ? null : { type: 'claim_turn', seat };
  }
  for (const seat of activeSeats(s)) {
    const choice = botChoice(s, seat);
    if (choice) return choice;
  }
  const haunter = s.players.find((p) => p.haunt.pending);
  return haunter ? botChoice(s, haunter.seat) : null;
}

export function simulateGame(opts: SimGameOptions): SimGameResult {
  let s = simConfigState(opts);
  const out: SimGameResult = {
    seed: opts.seed,
    mode: opts.mode,
    difficulty: opts.difficulty,
    heroes: s.players.map((p) => p.hero),
    finished: false,
    outcome: 'unfinished',
    nights: 0,
    rounds: 0,
    actions: 0,
    seatTurns: 0,
    replans: 0,
    maxExpansions: 0,
    maxBudget: 0,
    planMs: 0,
    maxPlanMs: 0,
    finalDread: null,
    dreadAtBossNight: null,
    bossId: null,
    bossHpLeft: null,
    bossMaxHp: null,
    bossRounds: 0,
    bossCrowns: 0,
    dreadBeforeDawn: [],
    dreadBy: { regular: {}, boss: {} },
    seatsResult: [],
  };
  const unitsLost = s.players.map(() => ({ all: 0, rivals: 0 }));
  let turn: Turn | null = null;
  const plan = (seat: number): Action[] => {
    const t = now();
    const result = planTurn(s, seat, opts.seats[seat].kind, {
      ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
      ...(opts.wallClock ? {} : { now: () => 0 }),
    });
    const dt = now() - t;
    out.planMs += dt;
    out.maxPlanMs = Math.max(out.maxPlanMs, dt);
    out.maxExpansions = Math.max(out.maxExpansions, result.expansions);
    out.maxBudget = Math.max(out.maxBudget, result.budget);
    return result.actions.slice();
  };
  for (let step = 0; step < (opts.maxSteps ?? 20_000) && !s.result; step++) {
    let action = decision(s);
    if (!action && s.phase === 'players' && s.activeSeat !== null) {
      const seat = s.activeSeat;
      if (!turn || turn.seat !== seat) {
        turn = { seat, plan: plan(seat) };
        out.seatTurns += 1;
      }
      action = turn.plan.shift() ?? { type: 'end_turn', seat };
    }
    if (!action) throw new Error(`no action in ${s.phase} (night ${s.night}, round ${s.round})`);
    if (s.isBossNight && out.dreadAtBossNight === null && s.vigil) out.dreadAtBossNight = s.vigil.dread;
    if (s.phase === 'dawn' && action.type === 'advance' && s.vigil) out.dreadBeforeDawn.push(s.vigil.dread);
    opts.onAction?.(s, action);
    const result = applyAction(s, action);
    if (!result.ok) {
      if (!turn || action.type === 'advance') throw new Error(`${action.type} rejected in ${s.phase}: ${result.reason}`);
      out.replans += 1;
      turn = { seat: turn.seat, plan: plan(turn.seat) };
      continue;
    }
    for (const e of result.events) {
      if (e.type === 'piece_died' && e.kind === 'unit') {
        const owner = s.pieces[e.pieceId]?.owner;
        if (owner === null || owner === undefined) continue;
        unitsLost[owner].all += 1;
        if (e.killerSeat !== null && e.killerSeat !== owner) unitsLost[owner].rivals += 1;
      }
      if (e.type !== 'dread_changed') continue;
      const by = s.isBossNight ? out.dreadBy.boss : out.dreadBy.regular;
      by[e.cause] = (by[e.cause] ?? 0) + e.to - e.from;
    }
    if (action.type === 'end_turn') turn = null;
    if (action.type !== 'advance') out.actions += 1;
    s = result.state;
  }
  return finish(s, out, unitsLost);
}

function finish(s: GameState, out: SimGameResult, unitsLost: ReadonlyArray<{ all: number; rivals: number }>): SimGameResult {
  out.finished = s.result !== null;
  out.nights = s.night;
  out.rounds = s.stats.roundsPlayed;
  out.bossRounds = s.isBossNight ? s.round : 0;
  out.finalDread = s.vigil?.dread ?? null;
  if (s.boss) {
    out.bossId = s.boss.id;
    out.bossMaxHp = s.boss.maxHp;
    out.bossHpLeft = s.pieces[s.boss.pieceId]?.hp ?? 0;
    out.bossCrowns = s.boss.crowns;
  }
  if (s.result?.mode === 'vigil') out.outcome = s.result.outcome;
  if (s.result?.mode === 'last_flame') out.outcome = s.result.reason;
  const standings = s.config.mode === 'last_flame' ? lastFlameStandings(s) : [];
  out.seatsResult = s.players.map((p) => ({
    seat: p.seat,
    hero: p.hero,
    glory: p.glory,
    placement: standings.find((st) => st.seat === p.seat)?.placement ?? null,
    alive: !p.eliminated,
    gloryBy: { ...(s.lastFlame?.gloryBySeat[p.seat] ?? {}) },
    unitsLost: unitsLost[p.seat]?.all ?? 0,
    unitsLostToRivals: unitsLost[p.seat]?.rivals ?? 0,
  }));
  return out;
}
