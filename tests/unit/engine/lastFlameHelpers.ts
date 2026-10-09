/**
 * Last Flame test helpers: games with N seats, a blank-board scenario in the players phase, a
 * greedy scripted player that fights Snuff, rivals and the boss, and a whole-game runner that
 * answers every decision (bots and haunts through `botChoice`).
 */
import { expect } from 'vitest';
import {
  activeSeats,
  applyAction,
  botChoice,
  cardTargets,
  chebyshev,
  legalMoves,
  legalStrikes,
  pendingAutomation,
  sq,
} from '../../../src/engine';
import type { Action, DifficultyId, GameState, LengthId, Piece, RuleValues, SeatConfig, SeatKind } from '../../../src/engine';
import { removePiece } from '../../../src/engine/state';
import { act, heroPiece, newGame, toPlayers } from './helpers';

export const LF_HEROES = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'];

export interface LfOptions {
  seats?: number;
  kinds?: SeatKind[];
  seed?: string;
  length?: LengthId;
  difficulty?: DifficultyId;
  overrides?: Partial<RuleValues>;
}

function lfSeats(opts: LfOptions): Array<Partial<SeatConfig>> {
  const count = opts.seats ?? opts.kinds?.length ?? 2;
  return Array.from({ length: count }, (_, i) => ({ kind: opts.kinds?.[i] ?? 'human', hero: LF_HEROES[i] }));
}

/** A Last Flame game at Night 1's night_setup. */
export function lfGame(opts: LfOptions = {}): GameState {
  return newGame({
    mode: 'last_flame',
    seed: opts.seed ?? 'lf',
    length: opts.length,
    difficulty: opts.difficulty,
    seats: lfSeats(opts),
    overrides: { moth_die: false, ...(opts.overrides ?? {}) },
  });
}

/**
 * A Last Flame game in Night 1's first players phase (seat 0 acting) on an empty flagstone board:
 * no Snuff, Plumes or intents. Heroes stand on `at` (seat order) and seat 0's hero is Ready.
 */
export function lfScenario(at: string[], opts: LfOptions = {}): GameState {
  const s = toPlayers(lfGame({ seats: at.length, ...opts }));
  for (const p of Object.values(s.pieces)) if (p.kind !== 'hero') removePiece(s, p.id);
  s.plumes = [];
  s.intents = [];
  for (const t of s.board.tiles) {
    t.type = 'flagstone';
    t.chimneyPair = null;
    t.shrineLit = false;
  }
  at.forEach((square, seat) => (heroPiece(s, seat).pos = sq(square)));
  Object.assign(heroPiece(s, 0), { movesLeft: 1, strikesLeft: 1, exhausted: false });
  expect(s.activeSeat).toBe(0);
  return s;
}

function legal(s: GameState, a: Action): boolean {
  return applyAction(s, a).ok;
}

/** Nearest foe distance (Snuff, the boss, or a rival piece when no truce holds). */
function foeDistance(s: GameState, seat: number, from: Piece): number {
  const foes = Object.values(s.pieces).filter((p) => !p.smoldering && (p.side === 'snuff' || (p.owner !== null && p.owner !== seat)));
  return foes.length === 0 ? 0 : Math.min(...foes.map((p) => chebyshev(p.pos, from.pos)));
}

/** Strike priorities: a rival hero, the boss, a lethal hit, anything that is not a Plume. */
function strikeAction(s: GameState, seat: number, piece: Piece): Action | null {
  const options = legalStrikes(s, piece.id).filter((o) => !o.isPlume);
  const rivalHero = (id: string | undefined) => {
    const p = id ? s.pieces[id] : undefined;
    return p !== undefined && p.kind === 'hero' && p.owner !== seat;
  };
  const pick =
    options.find((o) => rivalHero(o.targetPieceId)) ??
    options.find((o) => o.targetPieceId === s.boss?.pieceId) ??
    options.find((o) => o.lethal) ??
    options[0];
  const a: Action | null = pick ? { type: 'strike', seat, pieceId: piece.id, target: pick.target } : null;
  return a && legal(s, a) ? a : null;
}

function cardAction(s: GameState, seat: number): Action | null {
  for (const card of s.players[seat].hand) {
    const info = cardTargets(s, seat, card.uid);
    if (!info.playable || info.modeOptions || info.steps > 1) continue;
    const targets = info.steps === 0 ? [] : info.targets[0] ? [info.targets[0].choice] : null;
    const a: Action | null = targets ? { type: 'play_card', seat, cardUid: card.uid, targets } : null;
    if (a && legal(s, a)) return a;
  }
  return null;
}

function moveAction(s: GameState, seat: number, piece: Piece): Action | null {
  const here = foeDistance(s, seat, piece);
  const best = legalMoves(s, piece.id)
    .map((to) => ({ to, d: foeDistance(s, seat, { ...piece, pos: to }) }))
    .filter((m) => m.d < here)
    .sort((a, b) => a.d - b.d)[0];
  const a: Action | null = best ? { type: 'move', seat, pieceId: piece.id, to: best.to } : null;
  return a && legal(s, a) ? a : null;
}

/** Greedy seat turn step: strike, play a card, close in on a foe, else end the turn. */
export function lfGreedyAction(s: GameState, seat: number): Action {
  const own = Object.values(s.pieces)
    .filter((p) => p.owner === seat && !p.exhausted && !p.smoldering)
    .sort((a, b) => a.summonOrder - b.summonOrder);
  for (const piece of own.filter((p) => p.strikesLeft > 0)) {
    const a = strikeAction(s, seat, piece);
    if (a) return a;
  }
  const card = cardAction(s, seat);
  if (card) return card;
  for (const piece of own.filter((p) => p.movesLeft > 0)) {
    const a = moveAction(s, seat, piece);
    if (a) return a;
  }
  return { type: 'end_turn', seat };
}

export type LfPolicy = 'greedy' | 'pass';

/** The next action of a whole-game run (decisions through `botChoice`, turns by `policy`). */
export function lfNextAction(s: GameState, policy: LfPolicy): Action {
  if (pendingAutomation(s)) return { type: 'advance' };
  if (s.phase === 'players' && s.activeSeat !== null) {
    return policy === 'greedy' ? lfGreedyAction(s, s.activeSeat) : { type: 'end_turn', seat: s.activeSeat };
  }
  const seat = activeSeats(s)[0];
  const choice = seat === undefined ? null : botChoice(s, seat);
  if (!choice) throw new Error(`no decision in ${s.phase} (night ${s.night}, round ${s.round})`);
  return choice;
}

/** Play to the end (or `maxSteps`); `onStep` sees each state with the action about to apply. */
export function playLastFlame(start: GameState, policy: LfPolicy, maxSteps = 20_000, onStep?: (s: GameState, a: Action) => void): { state: GameState; actions: Action[] } {
  let s = start;
  const actions: Action[] = [];
  for (let step = 0; step < maxSteps && !s.result; step++) {
    const action = lfNextAction(s, policy);
    onStep?.(s, action);
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`${action.type} rejected in ${s.phase}: ${result.reason}`);
    actions.push(action);
    s = result.state;
  }
  return { state: s, actions };
}

/** Advance (no player input) until `until` holds; every seat ends its turns at once. */
export function advanceUntil(start: GameState, until: (s: GameState) => boolean, maxSteps = 500): GameState {
  let s = start;
  for (let step = 0; step < maxSteps && !until(s); step++) s = act(s, lfNextAction(s, 'pass')).state;
  expect(until(s)).toBe(true);
  return s;
}
