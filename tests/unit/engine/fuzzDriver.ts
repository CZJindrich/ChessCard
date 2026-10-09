/**
 * Random legal play for fuzz tests: every seat (bots included) picks random legal actions —
 * moves, strikes, cards (multi-step targeting walked at random), Hero Powers, free actions,
 * undo, relights, Shrines, turn claims, and random Toll / carry-over / draft / Boon choices,
 * with the occasional Retry vote. Deterministic for a given seed.
 */
import {
  activeSeats,
  cardTargets,
  freeActionTargets,
  legalMoves,
  legalStrikes,
  pendingAutomation,
  powerTargets,
  retryOpen,
  validateAction,
} from '../../../src/engine';
import type { Action, CardTargetChoice, CardTargetInfo, GameState, Pos } from '../../../src/engine';

export class Rand {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(items: readonly T[]): T | undefined {
    return items.length > 0 ? items[this.int(items.length)] : undefined;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

function legal(s: GameState, a: Action): Action | null {
  return validateAction(s, a).ok ? a : null;
}

/** Walk a multi-step target query at random; null when it cannot be completed. */
function walkTargets(r: Rand, first: CardTargetInfo, next: (chosen: CardTargetChoice[]) => CardTargetInfo): CardTargetChoice[] | null {
  let info = first;
  const chosen: CardTargetChoice[] = [];
  for (let guard = 0; guard < 6; guard++) {
    if (!info.playable) return null;
    if (info.step >= info.steps) return chosen;
    if (info.targets.length === 0 || (info.complete && r.chance(0.15))) return info.complete ? chosen : null;
    const option = r.pick(info.targets);
    if (!option) return null;
    chosen.push(option.choice);
    info = next(chosen);
  }
  return null;
}

function cardAction(r: Rand, s: GameState, seat: number): Action | null {
  const card = r.pick(s.players[seat].hand);
  if (!card) return null;
  let info = cardTargets(s, seat, card.uid);
  if (!info.playable) return null;
  let mode: number | undefined;
  if (info.modeOptions) {
    const modes = info.modeOptions.map((m, i) => (m.playable ? i : -1)).filter((i) => i >= 0);
    mode = r.pick(modes);
    if (mode === undefined) return null;
    info = cardTargets(s, seat, card.uid, { mode });
  }
  const m = mode;
  const targets = walkTargets(r, info, (chosen) => cardTargets(s, seat, card.uid, { mode: m, chosen }));
  if (!targets) return null;
  return legal(s, { type: 'play_card', seat, cardUid: card.uid, targets, ...(mode !== undefined ? { mode } : {}) });
}

function powerAction(r: Rand, s: GameState, seat: number): Action | null {
  const info = powerTargets(s, seat);
  const targets = walkTargets(r, info, (chosen) => powerTargets(s, seat, { chosen }));
  return targets ? legal(s, { type: 'use_power', seat, targets }) : null;
}

function freeAction(r: Rand, s: GameState, seat: number): Action | null {
  const kind = r.chance(0.7) ? 'ring_bell' : 'melt';
  const info = freeActionTargets(s, seat, kind);
  const option = info.playable ? r.pick(info.targets) : undefined;
  if (!option || option.choice.kind !== 'piece') return null;
  return legal(s, { type: 'free_action', seat, kind, pieceId: option.choice.pieceId });
}

function ownReady(s: GameState, seat: number) {
  return Object.values(s.pieces).filter((p) => p.owner === seat && !p.exhausted && !p.smoldering);
}

function moveAction(r: Rand, s: GameState, seat: number): Action | null {
  const piece = r.pick(ownReady(s, seat).filter((p) => p.movesLeft > 0));
  const to: Pos | undefined = piece ? r.pick(legalMoves(s, piece.id)) : undefined;
  return piece && to ? legal(s, { type: 'move', seat, pieceId: piece.id, to }) : null;
}

function strikeAction(r: Rand, s: GameState, seat: number): Action | null {
  const piece = r.pick(ownReady(s, seat).filter((p) => p.strikesLeft > 0));
  const option = piece ? r.pick(legalStrikes(s, piece.id)) : undefined;
  return piece && option ? legal(s, { type: 'strike', seat, pieceId: piece.id, target: option.target }) : null;
}

function supportAction(r: Rand, s: GameState, seat: number): Action | null {
  const wick = r.pick(Object.values(s.pieces).filter((p) => p.kind === 'hero' && p.smoldering));
  for (const piece of ownReady(s, seat)) {
    if (wick) {
      const a = legal(s, { type: 'relight', seat, pieceId: piece.id, wickId: wick.id });
      if (a) return a;
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const a = legal(s, { type: 'light_shrine', seat, pieceId: piece.id, shrine: { x: piece.pos.x + dx, y: piece.pos.y + dy } });
        if (a) return a;
      }
    }
  }
  return null;
}

/** One random seat-turn action (falls back to end_turn). */
function turnAction(r: Rand, s: GameState, seat: number): Action {
  const roll = r.next();
  const generators =
    roll < 0.3
      ? [strikeAction, moveAction, cardAction]
      : roll < 0.55
        ? [moveAction, strikeAction, cardAction]
        : roll < 0.8
          ? [cardAction, strikeAction, moveAction]
          : roll < 0.88
            ? [powerAction, cardAction]
            : roll < 0.92
              ? [freeAction, supportAction]
              : roll < 0.97
                ? [(_r: Rand, st: GameState, se: number) => legal(st, { type: 'undo', seat: se })]
                : [];
  for (const gen of generators) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const a = gen(r, s, seat);
      if (a) return a;
    }
  }
  return { type: 'end_turn', seat };
}

function subset<T>(r: Rand, items: readonly T[], max: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  const n = r.int(Math.min(max, pool.length) + 1);
  for (let i = 0; i < n; i++) out.push(pool.splice(r.int(pool.length), 1)[0]);
  return out;
}

function boonAction(r: Rand, s: GameState, seat: number): Action {
  const player = s.players[seat];
  const owned = [...player.deck, ...player.discard, ...player.hand];
  const options: Action[] = [{ type: 'boon_pick', seat, boon: null, args: {} }];
  const heirloom = r.pick(player.chandlery?.heirloomOffer ?? []);
  if (heirloom) options.push({ type: 'boon_pick', seat, boon: 'heirloom', args: { heirloomId: heirloom } });
  const card = r.pick(owned.filter((c) => !c.tempered));
  if (card) options.push({ type: 'boon_pick', seat, boon: 'temper', args: { cardUid: card.uid } });
  options.push({ type: 'boon_pick', seat, boon: 'prune', args: { cardUids: subset(r, owned, 2).map((c) => c.uid) } });
  return r.pick(options.filter((a) => validateAction(s, a).ok)) ?? options[0];
}

/** A random legal choice for a seat outside its turn (deploy/ready, Toll, carry-over, Chandlery). */
function choiceAction(r: Rand, s: GameState, seat: number): Action | null {
  const player = s.players[seat];
  switch (s.phase) {
    case 'night_setup': {
      const own = r.pick(Object.values(s.pieces).filter((p) => p.owner === seat));
      if (own && r.chance(0.3)) {
        const to = { x: r.int(s.board.w), y: r.int(s.board.h) };
        const deploy = legal(s, { type: 'deploy', seat, pieceId: own.id, to });
        if (deploy) return deploy;
      }
      return legal(s, { type: 'ready', seat });
    }
    case 'toll': {
      const offer = s.toll.offer;
      return offer ? legal(s, { type: 'choose_toll', seat, tollId: r.chance(0.5) ? offer.blessing : offer.curse }) : null;
    }
    case 'dawn': {
      const units = Object.values(s.pieces).filter((p) => p.owner === seat && p.kind === 'unit');
      return legal(s, { type: 'carry_over', seat, keep: subset(r, units, 2).map((p) => p.id) });
    }
    case 'chandlery': {
      const ch = player.chandlery;
      if (!ch) return null;
      if (ch.picksLeft > 0) {
        const card = r.pick(ch.offer.filter((id) => !ch.picked.includes(id)));
        return r.chance(0.15) || !card ? legal(s, { type: 'skip_pick', seat }) : legal(s, { type: 'draft_pick', seat, cardId: card });
      }
      return ch.boonDone ? null : boonAction(r, s, seat);
    }
    default:
      return null;
  }
}

export interface FuzzOptions {
  retryChance: number;
  maxRetries: number;
}

/** The next random action, or null when the game is over and no Retry is wanted. */
export function randomAction(r: Rand, s: GameState, retries: number, opts: FuzzOptions): Action | null {
  const humans = s.players.filter((p) => p.kind === 'human').map((p) => p.seat);
  if (retries < opts.maxRetries && retryOpen(s).ok && (s.result !== null || r.chance(opts.retryChance))) {
    const voter = humans.find((seat) => !(s.vigil?.retryVotes ?? []).includes(seat));
    if (voter !== undefined) return legal(s, { type: 'retry_night', seat: voter });
  }
  if (s.result) return null;
  if (pendingAutomation(s)) return { type: 'advance' };
  const seats = activeSeats(s);
  if (s.phase === 'players') {
    if (s.activeSeat === null) {
      const seat = r.pick(seats);
      return seat === undefined ? null : legal(s, { type: 'claim_turn', seat });
    }
    return turnAction(r, s, s.activeSeat);
  }
  for (const seat of seats) {
    const a = choiceAction(r, s, seat);
    if (a) return a;
  }
  return null;
}
