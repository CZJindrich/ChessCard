/**
 * Bot entry points (GDD §12.5): `planBotTurn` (a full seat turn ending with end_turn), `hint`
 * (the Warden planner's first action) and `botChoice` (decisions outside a seat turn).
 *
 * Planners never touch the real state: they plan on `planningState` (the seat's view with
 * sampled RNG streams), count node expansions against the level's budget and stop early only
 * when the wall-clock safety net trips. The controller and the server replay the plan one action
 * at a time; an action that has become illegal ends the turn.
 */
import { getContent } from '../content';
import { validateAction } from '../reducer';
import { planningState } from './planningState';
import { Budget, defaultClock, levelProfile } from './profiles';
import { beamPlan, greedyPlan, rootNode, withLookahead } from './search';
import type { PlanNode, SearchEnv } from './search';
import type { Action, BotLevel, ContentRegistry, GameState } from '../types';

export { botChoice, CARD_VALUE } from './choices';
export { W as BOT_WEIGHTS } from './evaluate';

export interface PlanOptions {
  reg?: ContentRegistry;
  /** Override the level's node budget (tests). */
  budget?: number;
  /** Clock for the wall-clock safety net (default `performance.now`). */
  now?: () => number;
}

export interface PlanResult {
  /** The seat turn, ending with end_turn. */
  actions: Action[];
  /** Node expansions spent (never above the budget). */
  expansions: number;
  budget: number;
  /** The wall-clock safety net stopped the search early. */
  timedOut: boolean;
  /** End-of-turn score of the chosen plan (bots/evaluate.ts). */
  score: number;
}

function endTurnOnly(seat: number, budget: number): PlanResult {
  return { actions: [{ type: 'end_turn', seat }], expansions: 0, budget, timedOut: false, score: 0 };
}

function search(env: SearchEnv, root: PlanNode): PlanNode {
  if (env.profile.greedy) return greedyPlan(root, env);
  const beam = beamPlan(root, env);
  return env.profile.lookahead > 0 ? withLookahead(beam, env) : beam.best;
}

/** Plan a seat turn and report how much of the budget it used. */
export function planTurn(s: GameState, seat: number, level: BotLevel, opts: PlanOptions = {}): PlanResult {
  const reg = opts.reg ?? getContent();
  const base = levelProfile(level, reg);
  const profile = opts.budget !== undefined ? { ...base, budget: opts.budget } : base;
  if (s.result || s.phase !== 'players' || s.activeSeat !== seat || !s.players[seat]) return endTurnOnly(seat, profile.budget);
  const plan = planningState(s, seat);
  const budget = new Budget(profile.budget, profile.wallClockMs, opts.now ?? defaultClock());
  const env: SearchEnv = { reg, seat, profile, rivalGlory: profile.rivalGlory, root: plan, budget };
  const best = search(env, rootNode(plan, env));
  return {
    actions: [...best.actions, { type: 'end_turn', seat }],
    expansions: budget.expansions,
    budget: profile.budget,
    timedOut: budget.hitClock,
    score: best.end,
  };
}

/** A full seat turn, ending with end_turn. */
export function planBotTurn(s: GameState, seat: number, level: BotLevel, opts: PlanOptions = {}): Action[] {
  return planTurn(s, seat, level, opts).actions;
}

/** Hint (H, §12.5): the Warden planner's first action for the seat, or null when it is not its turn. */
export function hint(s: GameState, seat: number, reg: ContentRegistry = getContent()): Action | null {
  if (s.result || s.phase !== 'players' || s.activeSeat !== seat) return null;
  const first = planTurn(s, seat, 'bot_warden', { reg }).actions[0];
  return first && validateAction(s, first, reg).ok ? first : null;
}
