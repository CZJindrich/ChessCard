/**
 * What the board shows for a selected piece (GDD §15.5): gold move dots with danger, Chimney
 * and Hot Wax badges, strike rings with damage / lethal / Take / push previews, and the
 * special Strike uses (relight a Wick, light a Shrine). Pure queries over the engine API;
 * everything is filtered through `validateAction`, so pips and turn order are respected.
 */
import { applyAction, cardTargets, chebyshev, legalMoves, legalStrikes, posKey, previewSnuffStrike, validateAction } from '../engine';
import type { Action, GameState, Piece, Pos, StrikeOption } from '../engine/types';

export interface MoveMark {
  /** Where the dot is drawn (the entry Chimney for a Chimney move). */
  pos: Pos;
  /** The move action's destination. */
  to: Pos;
  /** Damage the piece would take at the next Snuff Strike if it ends here (null = safe). */
  danger: number | null;
  /** Chimney move: the paired exit the piece lands on. */
  chimneyExit: Pos | null;
  hotWax: boolean;
}

export interface StrikeMark {
  pos: Pos;
  option: StrikeOption;
}

export type SpecialKind = 'relight' | 'light_shrine';

export interface SpecialMark {
  pos: Pos;
  kind: SpecialKind;
  action: Action;
}

export interface PieceHighlights {
  pieceId: string;
  moves: MoveMark[];
  strikes: StrikeMark[];
  specials: SpecialMark[];
}

const EMPTY: Omit<PieceHighlights, 'pieceId'> = { moves: [], strikes: [], specials: [] };

function tileAt(state: GameState, p: Pos) {
  if (p.x < 0 || p.y < 0 || p.x >= state.board.w || p.y >= state.board.h) return null;
  return state.board.tiles[p.y * state.board.w + p.x] ?? null;
}

function chimneyPartner(state: GameState, p: Pos): Pos | null {
  const tile = tileAt(state, p);
  if (!tile || tile.type !== 'chimney' || tile.chimneyPair === null) return null;
  for (let i = 0; i < state.board.tiles.length; i++) {
    const other = state.board.tiles[i];
    const pos = { x: i % state.board.w, y: Math.floor(i / state.board.w) };
    if (other.type === 'chimney' && other.chimneyPair === tile.chimneyPair && (pos.x !== p.x || pos.y !== p.y)) return pos;
  }
  return null;
}

/** Damage the piece takes at the next Snuff Strike after `action` (Ward absorption included). */
export function dangerAfter(state: GameState, action: Action, pieceId: string): number | null {
  const next = applyAction(state, action);
  if (!next.ok) return null;
  const preview = previewSnuffStrike(next.state);
  let total = 0;
  for (const e of preview.events) if (e.type === 'damage' && e.pieceId === pieceId && !e.blockedByWard) total += e.amount;
  return total > 0 ? total : null;
}

function movesFor(state: GameState, seat: number, piece: Piece): MoveMark[] {
  const flying = piece.flying;
  return legalMoves(state, piece.id)
    .filter((to) => validateAction(state, { type: 'move', seat, pieceId: piece.id, to }).ok)
    .map((to) => {
      const action: Action = { type: 'move', seat, pieceId: piece.id, to };
      const viaChimney = tileAt(state, to)?.type === 'chimney' && chebyshev(piece.pos, to) > 0 ? chimneyPartner(state, to) : null;
      const entry = viaChimney && !(viaChimney.x === piece.pos.x && viaChimney.y === piece.pos.y) ? viaChimney : null;
      return {
        pos: entry ?? to,
        to,
        danger: dangerAfter(state, action, piece.id),
        chimneyExit: entry ? to : null,
        hotWax: !flying && tileAt(state, to)?.type === 'hot_wax',
      };
    });
}

function strikesFor(state: GameState, seat: number, piece: Piece): StrikeMark[] {
  return legalStrikes(state, piece.id)
    .filter((o) => validateAction(state, { type: 'strike', seat, pieceId: piece.id, target: o.target }).ok)
    .map((option) => ({ pos: option.target, option }));
}

function neighbours(p: Pos, includeSelf: boolean): Pos[] {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (includeSelf || dx !== 0 || dy !== 0) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

function specialsFor(state: GameState, seat: number, piece: Piece): SpecialMark[] {
  const out: SpecialMark[] = [];
  for (const other of Object.values(state.pieces)) {
    if (other.kind !== 'hero' || !other.smoldering || chebyshev(other.pos, piece.pos) !== 1) continue;
    const action: Action = { type: 'relight', seat, pieceId: piece.id, wickId: other.id };
    if (validateAction(state, action).ok) out.push({ pos: other.pos, kind: 'relight', action });
  }
  for (const p of neighbours(piece.pos, true)) {
    if (tileAt(state, p)?.type !== 'votive_shrine') continue;
    const action: Action = { type: 'light_shrine', seat, pieceId: piece.id, shrine: p };
    if (validateAction(state, action).ok) out.push({ pos: p, kind: 'light_shrine', action });
  }
  return out;
}

/** Every highlight for one of the acting seat's pieces (empty for pieces it cannot use now). */
export function pieceHighlights(state: GameState, seat: number, pieceId: string): PieceHighlights {
  const piece = state.pieces[pieceId];
  if (!piece || piece.owner !== seat || state.phase !== 'players') return { pieceId, ...EMPTY };
  return { pieceId, moves: movesFor(state, seat, piece), strikes: strikesFor(state, seat, piece), specials: specialsFor(state, seat, piece) };
}

/** Night setup: the tiles a piece may be deployed to. */
export function deployTargets(state: GameState, seat: number, pieceId: string): Pos[] {
  if (state.phase !== 'night_setup') return [];
  const out: Pos[] = [];
  for (let y = 0; y < state.board.h; y++) {
    for (let x = 0; x < state.board.w; x++) {
      const to = { x, y };
      if (validateAction(state, { type: 'deploy', seat, pieceId, to }).ok) out.push(to);
    }
  }
  return out;
}

/** A piece can still do something this seat turn (the End Turn "smart" check, Tab cycling). */
export function pieceIsReady(state: GameState, seat: number, piece: Piece): boolean {
  if (piece.owner !== seat || piece.exhausted || piece.smoldering) return false;
  if (piece.movesLeft > 0 && legalMoves(state, piece.id).some((to) => validateAction(state, { type: 'move', seat, pieceId: piece.id, to }).ok)) return true;
  if (piece.strikesLeft > 0 && legalStrikes(state, piece.id).length > 0) return true;
  return false;
}

/** The acting seat's Ready pieces, hero first then by summon order. */
export function readyPieces(state: GameState, seat: number): Piece[] {
  return Object.values(state.pieces)
    .filter((p) => pieceIsReady(state, seat, p))
    .sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero') || a.summonOrder - b.summonOrder);
}

export function playableCards(state: GameState, seat: number): string[] {
  const player = state.players[seat];
  if (!player) return [];
  return player.hand.filter((c) => cardTargets(state, seat, c.uid).playable).map((c) => c.uid);
}

/** Anything left to do this turn? (End Turn pulses when not.) */
export function hasRemainingActions(state: GameState, seat: number): boolean {
  return readyPieces(state, seat).length > 0 || playableCards(state, seat).length > 0;
}

/** Tile keys of a piece's move range (enemy inspection outline). */
export function moveRangeKeys(state: GameState, pieceId: string): Set<string> {
  return new Set(legalMoves(state, pieceId).map(posKey));
}
