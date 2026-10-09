/**
 * Seat-turn planners (GDD §12.5), all on a planning state (planningState.ts), all spending a
 * node-expansion budget (profiles.ts):
 *
 * - Apprentice (greedy): repeatedly simulate every candidate and take the best one, preferring
 *   any action that kills (the best immediate kill), else the best improvement (blocks,
 *   dodges, summons); stop when nothing improves the end-of-turn score.
 * - Warden (beam search): expand the `beamWidth` best nodes of each depth (ranked by the node
 *   score, which credits unused Strikes), dedupe transpositions, and keep the node with the best
 *   end-of-turn score seen anywhere (the empty plan included).
 * - Elder: a wider, deeper beam, then a one-round lookahead for its best final plans: end the
 *   turn on the real rules (other seats pass), play the Snuff Strike, Rise, Tally and the next
 *   Snuff Move with sampled dice, and score the next round's position too.
 *
 * Every plan ends with end_turn. The same state always gives the same plan (no clock unless the
 * wall-clock safety net trips).
 */
import { activeSeats, pendingAutomation } from '../phases';
import { simulateAction } from '../reducer';
import { candidateActions } from './actionGen';
import type { GenEnv } from './actionGen';
import { endScore, scoreState, stateValue } from './evaluate';
import type { Budget } from './profiles';
import type { Action, GameState, Piece } from '../types';

export interface PlanNode {
  state: GameState;
  actions: Action[];
  end: number;
  node: number;
}

function pieceKey(p: Piece): string {
  const flags = `${p.movesLeft}${p.strikesLeft}${+p.ward}${p.burn}${+p.dazed}${+p.smoldering}${+p.pendingRelight}`;
  return `${p.id}@${p.pos.x},${p.pos.y}:${p.hp}/${p.maxHp}:${flags}:${p.buffs.atk},${p.buffs.range}:${p.charm?.uid ?? ''}`;
}

/** Transposition key: everything a seat turn can change. */
export function signature(s: GameState): string {
  const parts: string[] = [];
  for (const p of Object.values(s.pieces)) parts.push(pieceKey(p));
  for (const m of s.plumes) parts.push(m.id);
  for (const i of s.intents) parts.push(`${i.id}${+i.reversed}`);
  for (const pl of s.players) parts.push(`${pl.flame}:${pl.glory}:${pl.hand.length}:${pl.turn.cardsPlayed}:${+pl.turn.powerUsed}:${+pl.bellUsedThisNight}`);
  parts.push(`${s.activeRules.length}:${s.vigil?.dread ?? ''}:${s.boss?.crowns ?? ''}:${s.phase}:${s.activeSeat}`);
  for (let i = 0; i < s.board.tiles.length; i++) {
    const t = s.board.tiles[i];
    if (t.shrineLit || t.type === 'hot_wax') parts.push(`${i}${t.type[0]}${+t.shrineLit}`);
  }
  return parts.join('|');
}

/** Is this the planning seat's own turn (expandable)? */
function ownTurn(s: GameState, seat: number): boolean {
  return !s.result && s.phase === 'players' && s.activeSeat === seat;
}

export interface SearchEnv extends GenEnv {
  budget: Budget;
}

function makeNode(state: GameState, actions: Action[], env: SearchEnv): PlanNode {
  const scored = scoreState(state, env);
  return { state, actions, end: scored.end, node: scored.node };
}

/** Simulate every candidate of a node (one expansion each); null children are skipped. */
function expand(parent: PlanNode, env: SearchEnv, seen: Set<string>): PlanNode[] {
  const children: PlanNode[] = [];
  for (const cand of candidateActions(parent.state, env)) {
    if (!env.budget.spend()) break;
    const result = simulateAction(parent.state, cand.action, env.reg);
    if (!result.ok) continue;
    const key = signature(result.state);
    if (seen.has(key)) continue;
    seen.add(key);
    children.push(makeNode(result.state, [...parent.actions, cand.action], env));
  }
  return children;
}

export function rootNode(state: GameState, env: SearchEnv): PlanNode {
  return makeNode(state, [], env);
}

// =============================================================================================
// Greedy (Apprentice)
// =============================================================================================

function snuffWeight(s: GameState): number {
  let total = 0;
  for (const p of Object.values(s.pieces)) if (p.side === 'snuff') total += p.kind === 'boss' ? p.hp : 1000;
  return total;
}

function rivalCount(s: GameState, seat: number): number {
  return Object.values(s.pieces).filter((p) => p.side === 'wick' && p.owner !== null && p.owner !== seat && !p.smoldering).length;
}

function killed(parent: PlanNode, child: PlanNode, seat: number): boolean {
  return snuffWeight(child.state) < snuffWeight(parent.state) || rivalCount(child.state, seat) < rivalCount(parent.state, seat);
}

export function greedyPlan(root: PlanNode, env: SearchEnv): PlanNode {
  let current = root;
  const seen = new Set<string>([signature(root.state)]);
  for (let depth = 0; depth < env.profile.maxDepth && ownTurn(current.state, env.seat); depth++) {
    const children = expand(current, env, seen);
    if (children.length === 0) break;
    const kills = children.filter((c) => killed(current, c, env.seat));
    const pool = kills.length > 0 ? kills : children;
    const best = pool.reduce((a, c) => (c.end > a.end ? c : a));
    if (kills.length === 0 && best.end <= current.end + 0.01) break;
    current = best;
    if (env.budget.exhausted()) break;
  }
  return current;
}

// =============================================================================================
// Beam search (Warden, Elder)
// =============================================================================================

/** The `limit` best distinct plans by end score, kept sorted (best first). */
class TopPlans {
  readonly list: PlanNode[] = [];
  constructor(private readonly limit: number) {}

  offer(node: PlanNode): void {
    if (this.limit <= 0) return;
    if (this.list.length >= this.limit && node.end <= this.list[this.list.length - 1].end) return;
    const at = this.list.findIndex((n) => node.end > n.end);
    this.list.splice(at < 0 ? this.list.length : at, 0, node);
    if (this.list.length > this.limit) this.list.pop();
  }
}

export interface BeamResult {
  best: PlanNode;
  finals: PlanNode[];
}

export function beamPlan(root: PlanNode, env: SearchEnv): BeamResult {
  const top = new TopPlans(Math.max(1, env.profile.lookahead));
  top.offer(root);
  let best = root;
  let beam = [root];
  const seen = new Set<string>([signature(root.state)]);
  for (let depth = 0; depth < env.profile.maxDepth && beam.length > 0 && !env.budget.exhausted(); depth++) {
    const next: PlanNode[] = [];
    for (const node of beam) {
      for (const child of expand(node, env, seen)) {
        if (child.end > best.end) best = child;
        top.offer(child);
        if (ownTurn(child.state, env.seat)) next.push(child);
      }
      if (env.budget.exhausted()) break;
    }
    next.sort((a, b) => b.node - a.node);
    beam = next.slice(0, env.profile.beamWidth);
  }
  return { best, finals: top.list };
}

// =============================================================================================
// One-round lookahead (Elder)
// =============================================================================================

const LOOKAHEAD_STEPS = 40;

/** The next action of a lookahead: automation, other seats pass, or null to stop. */
function lookaheadAction(s: GameState, seat: number): Action | null {
  if (s.result) return null;
  if (s.phase === 'players') {
    if (s.activeSeat === seat) return null;
    if (s.activeSeat !== null) return { type: 'end_turn', seat: s.activeSeat };
    const waiting = activeSeats(s).filter((q) => q !== seat);
    return waiting.length > 0 ? { type: 'claim_turn', seat: waiting[0] } : null;
  }
  return pendingAutomation(s) ? { type: 'advance' } : null;
}

/** Score of the position one round later (our next turn), or null when the budget ran out. */
export function lookaheadScore(node: PlanNode, env: SearchEnv): number | null {
  let s = node.state;
  let action: Action | null = { type: 'end_turn', seat: env.seat };
  for (let step = 0; step < LOOKAHEAD_STEPS && action; step++) {
    if (!env.budget.spend()) return null;
    const result = simulateAction(s, action, env.reg);
    if (!result.ok) break;
    s = result.state;
    action = lookaheadAction(s, env.seat);
  }
  return ownTurn(s, env.seat) ? endScore(s, env) : stateValue(s, env);
}

/** Re-rank the final plans: 40% this turn's end score, 60% the next round's. */
export function withLookahead(result: BeamResult, env: SearchEnv): PlanNode {
  let best = result.best;
  let bestScore = -Infinity;
  const finals = result.finals.includes(result.best) ? result.finals : [result.best, ...result.finals];
  for (const node of finals) {
    const look = lookaheadScore(node, env);
    if (look === null) break;
    const combined = 0.4 * node.end + 0.6 * look;
    if (combined > bestScore) {
      bestScore = combined;
      best = node;
    }
  }
  return best;
}
