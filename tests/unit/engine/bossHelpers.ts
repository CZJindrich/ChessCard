/**
 * Boss test helpers: a hand-built boss on a blank board, a real Boss Night reached by
 * fast-forwarding Night 1, and a greedy scripted player for whole Boss Night simulations.
 */
import { expect } from 'vitest';
import {
  activeSeats,
  applyAction,
  botChoice,
  cardTargets,
  footprintDistance,
  legalMoves,
  legalStrikes,
  pendingAutomation,
  sq,
} from '../../../src/engine';
import type { Action, GameState, ModeId, Piece, RuleValues, SeatConfig } from '../../../src/engine';
import { spawnBoss } from '../../../src/engine/bosses';
import { makeCtx } from '../../../src/engine/state';
import { act, blankScenario, newGame } from './helpers';

export const HEROES = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'];
export const BOSSES = ['hush_hierophant', 'guttered_king', 'nocturna'];

export function bossPiece(s: GameState): Piece {
  const id = s.boss?.pieceId;
  const piece = id ? s.pieces[id] : undefined;
  if (!piece) throw new Error('no boss on the board');
  return piece;
}

/**
 * A blank Vigil scenario (players phase, seat 0 acting, hero on `heroAt`) with `bossId` spawned
 * on `at` as on a Boss Night. Extra overrides go to the config.
 */
export function blankBoss(bossId: string, at: string, hero = 'sconce_paladin', heroAt = 'a1', overrides: Partial<RuleValues> = {}): GameState {
  const s = blankScenario(hero, heroAt, { overrides: { boss_choice: bossId, ...overrides } });
  s.isBossNight = true;
  s.roundsThisNight = null;
  spawnBoss(makeCtx(s), sq(at));
  return s;
}

export interface BossNightOptions {
  boss: string;
  seats?: number;
  seed?: string;
  mode?: ModeId;
  overrides?: Partial<RuleValues>;
}

function seatList(count: number, mode: ModeId): Array<Partial<SeatConfig>> {
  return Array.from({ length: count }, (_, i) => ({ kind: mode === 'vigil' || i === 0 ? 'human' : 'bot_warden', hero: HEROES[i] }));
}

/** Fast-forward a 2-Night game through Night 1 (no fighting) to the Boss Night's night_setup. */
export function bossNight(opts: BossNightOptions): GameState {
  const mode = opts.mode ?? 'vigil';
  let s = newGame({
    mode,
    seed: opts.seed ?? 'boss-night',
    seats: seatList(opts.seats ?? 1, mode),
    overrides: { nights: 2, boss_choice: opts.boss, tolls: false, boons: false, moth_die: false, ...(opts.overrides ?? {}) },
  });
  for (const p of s.players) if (!p.ready) s = act(s, { type: 'ready', seat: p.seat }).state;
  while (s.phase !== 'players') s = act(s, { type: 'advance' }).state;
  s.round = s.roundsThisNight ?? s.config.turns_per_night;
  s.phase = 'tally';
  for (const [id, p] of Object.entries(s.pieces)) if (p.side === 'snuff') delete s.pieces[id];
  s.plumes = [];
  s.intents = [];
  for (let guard = 0; guard < 30 && !(s.phase === 'night_setup' && s.isBossNight); guard++) {
    if (pendingAutomation(s)) {
      s = act(s, { type: 'advance' }).state;
      continue;
    }
    const seat = activeSeats(s)[0];
    const choice = seat === undefined ? null : botChoice(s, seat);
    if (!choice) throw new Error(`stuck in ${s.phase}`);
    s = act(s, choice).state;
  }
  expect(s.isBossNight).toBe(true);
  expect(s.phase).toBe('night_setup');
  return s;
}

/** Ready every seat and advance to the Boss Night's first players phase. */
export function toBossPlayers(s: GameState): GameState {
  let state = s;
  for (const p of state.players) if (!p.ready) state = act(state, { type: 'ready', seat: p.seat }).state;
  for (let guard = 0; guard < 10 && state.phase !== 'players'; guard++) state = act(state, { type: 'advance' }).state;
  expect(state.phase).toBe('players');
  return state;
}

function legal(s: GameState, a: Action): boolean {
  return applyAction(s, a).ok;
}

function bossDistance(s: GameState, p: Piece): number {
  const boss = s.boss ? s.pieces[s.boss.pieceId] : undefined;
  return boss ? footprintDistance(boss.pos, boss.size, p.pos, p.size) : 0;
}

/**
 * Greedy scripted seat: strike (the boss or a lethal target first), play the first playable
 * card on its first target, move toward the boss, then end the turn.
 */
export function greedyAction(s: GameState, seat: number): Action {
  const own = Object.values(s.pieces)
    .filter((p) => p.owner === seat && !p.exhausted && !p.smoldering)
    .sort((a, b) => a.summonOrder - b.summonOrder);
  for (const piece of own) {
    if (piece.strikesLeft <= 0) continue;
    const options = legalStrikes(s, piece.id).filter((o) => !o.isPlume);
    const pick = options.find((o) => o.targetPieceId === s.boss?.pieceId) ?? options.find((o) => o.lethal) ?? options[0];
    const a: Action | null = pick ? { type: 'strike', seat, pieceId: piece.id, target: pick.target } : null;
    if (a && legal(s, a)) return a;
  }
  for (const card of s.players[seat].hand) {
    const info = cardTargets(s, seat, card.uid);
    if (!info.playable || info.modeOptions || info.steps > 1) continue;
    const targets = info.steps === 0 ? [] : info.targets[0] ? [info.targets[0].choice] : null;
    const a: Action | null = targets ? { type: 'play_card', seat, cardUid: card.uid, targets } : null;
    if (a && legal(s, a)) return a;
  }
  for (const piece of own) {
    if (piece.movesLeft <= 0) continue;
    const here = bossDistance(s, piece);
    const best = legalMoves(s, piece.id)
      .map((to) => ({ to, d: bossDistance(s, { ...piece, pos: to }) }))
      .filter((m) => m.d < here)
      .sort((a, b) => a.d - b.d)[0];
    const a: Action | null = best ? { type: 'move', seat, pieceId: piece.id, to: best.to } : null;
    if (a && legal(s, a)) return a;
  }
  return { type: 'end_turn', seat };
}

export type BossPolicy = 'greedy' | 'pass';

/**
 * Play a game to its end with every human seat on `policy` (bots end their turns). `onState`
 * sees every state before its action; `actions` collects the actions applied.
 */
export function playOut(start: GameState, policy: BossPolicy, maxSteps = 4000, onState?: (s: GameState) => void, actions: Action[] = []): GameState {
  let s = start;
  for (let step = 0; step < maxSteps && !s.result; step++) {
    onState?.(s);
    let action: Action;
    if (pendingAutomation(s)) action = { type: 'advance' };
    else if (s.phase === 'players') {
      if (s.activeSeat === null) action = { type: 'claim_turn', seat: activeSeats(s)[0] };
      else {
        const seat = s.activeSeat;
        action = policy === 'greedy' && s.players[seat].kind === 'human' ? greedyAction(s, seat) : { type: 'end_turn', seat };
      }
    } else {
      const seat = activeSeats(s)[0];
      const choice = seat === undefined ? null : botChoice(s, seat);
      if (!choice) throw new Error(`no choice in ${s.phase}`);
      action = choice;
    }
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`${action.type} rejected in ${s.phase}: ${result.reason}`);
    actions.push(action);
    s = result.state;
  }
  return s;
}
