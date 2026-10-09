/**
 * A deterministic game driver for flow tests. `pass` seats only end their turns; `play` seats
 * strike (lethal first), play the first playable card, then step toward the nearest Snuff.
 * Bots use the engine's placeholder planner and `botChoice`, as the client controller would.
 */
import {
  activeSeats,
  applyAction,
  botChoice,
  cardTargets,
  chebyshev,
  legalMoves,
  legalStrikes,
  pendingAutomation,
  planBotTurn,
  validateAction,
} from '../../../src/engine';
import type { Action, GameState, Pos } from '../../../src/engine';

export type Policy = 'pass' | 'play';

export interface RunOptions {
  policy: Policy;
  maxSteps: number;
  /** Called before every action with the state it applies to. */
  onState?: (s: GameState) => void;
  stopWhen?: (s: GameState) => boolean;
}

export interface RunResult {
  state: GameState;
  actions: Action[];
}

function legal(s: GameState, a: Action): boolean {
  return validateAction(s, a).ok;
}

function nearestSnuffDistance(s: GameState, p: Pos): number {
  const snuff = Object.values(s.pieces).filter((q) => q.side === 'snuff');
  return snuff.length === 0 ? 0 : Math.min(...snuff.map((q) => chebyshev(q.pos, p)));
}

/** The next action a `play` seat takes in its turn. */
export function playAction(s: GameState, seat: number): Action {
  const own = Object.values(s.pieces)
    .filter((p) => p.owner === seat && !p.exhausted && !p.smoldering)
    .sort((a, b) => a.summonOrder - b.summonOrder);
  for (const piece of own) {
    if (piece.strikesLeft <= 0) continue;
    const options = legalStrikes(s, piece.id);
    const option = options.find((o) => o.lethal && !o.isPlume) ?? options.find((o) => !o.isPlume) ?? options[0];
    if (option) {
      const a: Action = { type: 'strike', seat, pieceId: piece.id, target: option.target };
      if (legal(s, a)) return a;
    }
  }
  for (const card of s.players[seat].hand) {
    const info = cardTargets(s, seat, card.uid);
    if (!info.playable) continue;
    const a: Action = { type: 'play_card', seat, cardUid: card.uid, targets: info.steps === 0 ? [] : [info.targets[0].choice] };
    if (legal(s, a)) return a;
  }
  for (const piece of own) {
    if (piece.movesLeft <= 0) continue;
    const here = nearestSnuffDistance(s, piece.pos);
    const best = legalMoves(s, piece.id)
      .map((to) => ({ to, d: nearestSnuffDistance(s, to) }))
      .filter((m) => m.d < here)
      .sort((a, b) => a.d - b.d)[0];
    if (best) {
      const a: Action = { type: 'move', seat, pieceId: piece.id, to: best.to };
      if (legal(s, a)) return a;
    }
  }
  return { type: 'end_turn', seat };
}

function nextAction(s: GameState, policy: Policy): Action {
  if (pendingAutomation(s)) return { type: 'advance' };
  const seats = activeSeats(s);
  if (s.phase === 'players') {
    if (s.activeSeat === null) return { type: 'claim_turn', seat: seats[0] };
    const seat = s.activeSeat;
    if (s.players[seat].kind !== 'human') return planBotTurn(s, seat, 'bot_warden')[0];
    return policy === 'play' ? playAction(s, seat) : { type: 'end_turn', seat };
  }
  const choice = botChoice(s, seats[0]);
  if (!choice) throw new Error(`no choice in ${s.phase} for seat ${seats[0]}`);
  return choice;
}

export function runGame(start: GameState, opts: RunOptions): RunResult {
  let s = start;
  const actions: Action[] = [];
  for (let step = 0; step < opts.maxSteps && !s.result; step++) {
    if (opts.stopWhen?.(s)) break;
    opts.onState?.(s);
    const action = nextAction(s, opts.policy);
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`${action.type} rejected in ${s.phase}: ${result.reason}`);
    actions.push(action);
    s = result.state;
  }
  return { state: s, actions };
}

/** Replay a recorded action list from a fresh state. */
export function replay(start: GameState, actions: readonly Action[]): GameState {
  let s = start;
  for (const action of actions) {
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`replay: ${action.type} rejected: ${result.reason}`);
    s = result.state;
  }
  return s;
}
