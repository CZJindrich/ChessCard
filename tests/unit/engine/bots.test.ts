/**
 * E5 bots (GDD §12.5): planBotTurn determinism, node budgets, legality across many seeds, whole
 * bot-vs-bot games, hint, and the per-level non-turn decisions (botChoice).
 */
import { describe, expect, it } from 'vitest';
import { activeSeats, applyAction, botChoice, getContent, hint, planBotTurn, planTurn, sq, validateAction } from '../../../src/engine';
import type { Action, BotLevel, GameState } from '../../../src/engine';
import { act, blankScenario, candleAt, enemyAt, heroPiece, lockMelee, newGame, plumeAt, toPlayers, unitAt } from './helpers';
import { simulateGame } from './sim/simulate';

const LEVELS: BotLevel[] = ['bot_apprentice', 'bot_warden', 'bot_elder'];

/** A real game in its first players phase (seat 0 is a bot of `level`). */
function botGame(level: BotLevel, seed: string, hero = 'sconce_paladin'): GameState {
  let s = newGame({ seed, seats: [{ kind: level, hero }], overrides: { moth_die: true, tolls: true } });
  for (let guard = 0; guard < 20 && s.phase !== 'players'; guard++) {
    const seat = activeSeats(s)[0];
    const choice = seat === undefined ? null : botChoice(s, seat);
    s = act(s, choice ?? { type: 'advance' }).state;
  }
  expect(s.phase).toBe('players');
  return s;
}

/** Replay a plan on the real reducer; every action must be legal. */
function replayPlan(s: GameState, plan: readonly Action[]): GameState {
  let state = s;
  for (const action of plan) {
    const v = validateAction(state, action);
    expect(v, `${action.type} ${JSON.stringify(action)}`).toEqual({ ok: true });
    state = act(state, action).state;
  }
  return state;
}

describe('planBotTurn', () => {
  it('returns a full, legal seat turn ending with end_turn at every level', () => {
    for (const level of LEVELS) {
      const s = botGame(level, `plan-${level}`);
      const plan = planBotTurn(s, 0, level, { budget: 400 });
      expect(plan.at(-1)).toEqual({ type: 'end_turn', seat: 0 });
      expect(plan.filter((a) => a.type === 'end_turn')).toHaveLength(1);
      const after = replayPlan(s, plan);
      expect(after.players[0].turnEnded).toBe(true);
    }
  });

  it('is deterministic: the same state gives the same plan, and the state is never touched', () => {
    for (const level of LEVELS) {
      const s = botGame(level, `det-${level}`, 'lampwright');
      const before = JSON.stringify(s);
      const first = planBotTurn(s, 0, level, { budget: 600 });
      const second = planBotTurn(JSON.parse(before) as GameState, 0, level, { budget: 600 });
      expect(second).toEqual(first);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it('counts node expansions against the budget, never above it', () => {
    const reg = getContent();
    const s = botGame('bot_warden', 'budget');
    for (const level of LEVELS) {
      const full = planTurn(s, 0, level);
      expect(full.budget).toBe(reg.bots.byId[level].nodeBudget);
      expect(full.expansions).toBeGreaterThan(0);
      expect(full.expansions).toBeLessThanOrEqual(full.budget);
      for (const budget of [1, 7, 40]) {
        const small = planTurn(s, 0, level, { budget });
        expect(small.expansions).toBeLessThanOrEqual(budget);
        expect(small.actions.at(-1)).toEqual({ type: 'end_turn', seat: 0 });
      }
    }
  });

  it('stops at the wall-clock safety net and still returns the best plan so far', () => {
    const s = botGame('bot_elder', 'clock');
    let t = 0;
    const result = planTurn(s, 0, 'bot_elder', { now: () => (t += 1000) });
    expect(result.timedOut).toBe(true);
    expect(result.expansions).toBeLessThan(result.budget);
    expect(result.actions.at(-1)).toEqual({ type: 'end_turn', seat: 0 });
    replayPlan(s, result.actions);
  });

  it('answers only end_turn outside its own seat turn', () => {
    const s = newGame({ seed: 'idle', seats: [{ kind: 'bot_warden', hero: 'moth_witch' }] });
    expect(planBotTurn(s, 0, 'bot_warden')).toEqual([{ type: 'end_turn', seat: 0 }]);
  });

  it('kills the Sootling about to hit a Candle (every level)', () => {
    for (const level of LEVELS) {
      const s = blankScenario('sconce_paladin', 'd2');
      s.players[0].kind = level;
      s.players[0].hand = [];
      candleAt(s, 'c4');
      const sootling = enemyAt(s, 'sootling', 'd3');
      lockMelee(s, sootling, 'c4');
      const plan = planBotTurn(s, 0, level);
      const after = replayPlan(s, plan);
      expect(after.pieces[sootling.id]).toBeUndefined();
    }
  });

  it('steps a unit onto a Plume it cannot pop, so nothing rises', () => {
    const s = blankScenario('sconce_paladin', 'a1');
    s.players[0].kind = 'bot_warden';
    s.players[0].hand = [];
    const squire = unitAt(s, 'sconce_squire', 'f4');
    plumeAt(s, 'f5', 'snuffer_knight');
    const after = replayPlan(s, planBotTurn(s, 0, 'bot_warden'));
    const blocked = after.pieces[squire.id].pos.x === sq('f5').x && after.pieces[squire.id].pos.y === sq('f5').y;
    const popped = after.plumes.length === 0;
    expect(blocked || popped).toBe(true);
  });
});

describe('hint', () => {
  it("is the Warden planner's first action and always legal", () => {
    const s = botGame('bot_warden', 'hint', 'ember_duelist');
    s.players[0].kind = 'human';
    const action = hint(s, 0);
    expect(action).not.toBeNull();
    expect(validateAction(s, action as Action)).toEqual({ ok: true });
    expect(action).toEqual(planBotTurn(s, 0, 'bot_warden')[0]);
  });

  it('is null when the seat is not acting', () => {
    const s = newGame({ seed: 'hint-idle' });
    expect(hint(s, 0)).toBeNull();
    const players = toPlayers(newGame({ seed: 'hint-other', seats: [{ kind: 'human', hero: 'lampwright' }, { kind: 'human', hero: 'moth_witch' }] }));
    const other = players.activeSeat === 0 ? 1 : 0;
    expect(hint(players, other)).toBeNull();
  });
});

describe('whole bot games', () => {
  it('Vigil: bots in every seat finish the game and never send an illegal action', () => {
    for (const [i, seats] of [
      [{ kind: 'bot_warden' as const, hero: 'moth_witch' }],
      [{ kind: 'bot_apprentice' as const, hero: 'lampwright' }, { kind: 'bot_warden' as const, hero: 'ember_duelist' }],
    ].entries()) {
      const result = simulateGame({ mode: 'vigil', length: 'short', difficulty: 'dusk', seats, seed: `whole-v-${i}`, budget: 60 });
      expect(result.finished).toBe(true);
      expect(result.replans).toBe(0);
      expect(['victory', 'defeat']).toContain(result.outcome);
      expect(result.maxExpansions).toBeLessThanOrEqual(60);
    }
  }, 120_000);

  it('Last Flame: 2-4 bots finish with standings and never send an illegal action', () => {
    const heroes = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'];
    for (const count of [2, 3, 4]) {
      const seats = heroes.slice(0, count).map((hero, i) => ({ kind: LEVELS[i % 3], hero }));
      const result = simulateGame({ mode: 'last_flame', length: 'short', difficulty: 'dusk', seats, seed: `whole-lf-${count}`, budget: 40 });
      expect(result.finished).toBe(true);
      expect(result.replans).toBe(0);
      expect(result.seatsResult.every((r) => r.placement !== null && r.placement >= 1 && r.placement <= count)).toBe(true);
    }
  }, 180_000);

  it('the same seed replays the same bot game', () => {
    const opts = { mode: 'vigil' as const, length: 'short' as const, difficulty: 'candlelit' as const, seats: [{ kind: 'bot_warden' as const, hero: 'sconce_paladin' }], seed: 'replay-bots', budget: 50, maxSteps: 300 };
    const trail = (): string[] => {
      const out: string[] = [];
      simulateGame({ ...opts, onAction: (_s, a) => out.push(JSON.stringify(a)) });
      return out;
    };
    expect(trail()).toEqual(trail());
  }, 60_000);
});

describe('botChoice', () => {
  it('Apprentice and timed-out humans keep the default tiles and Ready; Warden deploys toward its Candle first', () => {
    const human = newGame({ seed: 'deploy', seats: [{ kind: 'human', hero: 'sconce_paladin' }] });
    expect(botChoice(human, 0)).toEqual({ type: 'ready', seat: 0 });
    const apprentice = newGame({ seed: 'deploy', seats: [{ kind: 'bot_apprentice', hero: 'sconce_paladin' }] });
    expect(botChoice(apprentice, 0)).toEqual({ type: 'ready', seat: 0 });
    let s = newGame({ seed: 'deploy', seats: [{ kind: 'bot_warden', hero: 'sconce_paladin' }] });
    const choices: Action[] = [];
    for (let guard = 0; guard < 8 && !s.players[0].ready; guard++) {
      const choice = botChoice(s, 0);
      expect(choice).not.toBeNull();
      choices.push(choice as Action);
      s = act(s, choice as Action).state;
    }
    expect(s.players[0].ready).toBe(true);
    expect(choices.at(-1)).toEqual({ type: 'ready', seat: 0 });
    expect(choices.slice(0, -1).every((a) => a.type === 'deploy')).toBe(true);
    const candles = Object.values(s.pieces).filter((p) => p.kind === 'candle');
    const hero = heroPiece(s, 0);
    const nearest = Math.min(...candles.map((c) => Math.max(Math.abs(c.pos.x - hero.pos.x), Math.abs(c.pos.y - hero.pos.y))));
    expect(nearest).toBeLessThanOrEqual(2);
  });

  it('Toll: the Blessing for the Apprentice and for a timed-out human', () => {
    for (const kind of ['human', 'bot_apprentice'] as const) {
      const s = toPlayers(newGame({ seed: 'toll', seats: [{ kind, hero: 'moth_witch' }] }));
      s.phase = 'toll';
      s.toll = { offer: { blessing: 'lucky_wick', curse: 'ill_omen' }, chooser: 0, active: null, curseReward: false, history: [] };
      expect(botChoice(s, 0)).toEqual({ type: 'choose_toll', seat: 0, tollId: 'lucky_wick' });
    }
  });

  it('draft: the Apprentice takes the cheapest card, the Warden its best-valued one; Boons by level', () => {
    const base = toPlayers(newGame({ seed: 'draft', seats: [{ kind: 'bot_apprentice', hero: 'lampwright' }] }));
    base.phase = 'chandlery';
    base.players[0].chandlery = { offer: ['grand_illumination', 'spark', 'tinder_bolt'], picksLeft: 1, picked: [], skipped: false, heirloomOffer: ['brass_thimble', 'moth_velvet_cloak'], boonDone: false, boonPicked: null };
    expect(botChoice(base, 0)).toEqual({ type: 'draft_pick', seat: 0, cardId: 'spark' });
    const warden: GameState = JSON.parse(JSON.stringify(base)) as GameState;
    warden.players[0].kind = 'bot_warden';
    expect(botChoice(warden, 0)).toEqual({ type: 'draft_pick', seat: 0, cardId: 'tinder_bolt' });
    for (const s of [base, warden]) {
      s.players[0].chandlery = { ...(s.players[0].chandlery as NonNullable<GameState['players'][0]['chandlery']>), picksLeft: 0 };
      const boon = botChoice(s, 0);
      expect(boon?.type).toBe('boon_pick');
      expect(applyAction(s, boon as Action).ok).toBe(true);
    }
    expect(botChoice(warden, 0)).toMatchObject({ boon: 'heirloom', args: { heirloomId: 'brass_thimble' } });
  });

  it('carry-over: a Warden keeps its most valuable units, the Apprentice the defaults', () => {
    const s = blankScenario('lampwright', 'd2');
    const taper = unitAt(s, 'taper', 'a1');
    const golem = unitAt(s, 'bellows_golem', 'b1');
    const ram = unitAt(s, 'brass_ram', 'c1');
    golem.hp = 2;
    s.phase = 'dawn';
    s.players[0].carryOver = { defaults: [ram.id, taper.id], chosen: null };
    s.players[0].kind = 'bot_apprentice';
    expect(botChoice(s, 0)).toEqual({ type: 'carry_over', seat: 0, keep: [ram.id, taper.id] });
    s.players[0].kind = 'bot_warden';
    expect(botChoice(s, 0)).toEqual({ type: 'carry_over', seat: 0, keep: [ram.id, golem.id] });
  });
});
