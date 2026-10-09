/**
 * Piece actions in the players phase (GDD §6.1, §6.6): move, strike, relight, light_shrine and
 * the free action `melt` / `ring_bell`. Each has a validator returning a reason code (§15.6) and an
 * apply function that mutates the cloned state through a Ctx.
 */
import { afterMoveEnd, applyDaze, dismissUnit } from './combat';
import { chebyshev, footprintDistance, samePos, sqName } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { awardGlory } from './modes/lastFlame';
import { findPlan, moveDestinations, performStrike, pieceProfile, strikeOption, strikePlans } from './strike';
import { emit, getPiece, heroOf, isEnemyOfSeat, pieceAt, tileAt } from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type { ActionOf, ContentRegistry, GameState, Piece, Pos, StrikeOption, Validation } from './types';

/** The players phase, and `seat` is the seat acting right now. */
export function checkTurn(s: GameState, seat: number): Validation {
  if (s.phase !== 'players') return fail('WRONG_PHASE');
  const player = s.players[seat];
  if (!player) return fail('INVALID_ACTION');
  if (player.eliminated) return fail('ELIMINATED');
  if (player.turnEnded) return fail('TURN_ENDED');
  if (s.activeSeat !== seat) return fail('NOT_YOUR_TURN');
  return OK;
}

/** One of the acting seat's own pieces, standing and not Exhausted. */
function checkOwnPiece(s: GameState, seat: number, pieceId: string): Validation & { piece?: Piece } {
  const turn = checkTurn(s, seat);
  if (!turn.ok) return turn;
  const piece = getPiece(s, pieceId);
  if (!piece) return fail('UNKNOWN_PIECE');
  if (piece.owner !== seat || piece.side !== 'wick') return fail('NOT_YOUR_PIECE');
  if (piece.smoldering) return fail('HERO_SMOLDERING');
  if (piece.exhausted) return fail('EXHAUSTED');
  return { ok: true, piece };
}

// =============================================================================================
// Move
// =============================================================================================

export function legalMoveTargets(s: GameState, reg: ContentRegistry, pieceId: string): Pos[] {
  const piece = getPiece(s, pieceId);
  return piece ? moveDestinations(s, reg, piece).map((d) => d.to) : [];
}

export function validateMove(s: GameState, reg: ContentRegistry, a: ActionOf<'move'>): Validation {
  const own = checkOwnPiece(s, a.seat, a.pieceId);
  if (!own.ok || !own.piece) return own;
  const profile = pieceProfile(s, reg, own.piece);
  if (!profile || profile.move.type === 'immobile') return fail('IMMOBILE');
  if (own.piece.movesLeft <= 0) return fail(own.piece.strikesLeft > 0 ? 'NO_MOVE_LEFT' : 'PIECE_SPENT');
  const dests = moveDestinations(s, reg, own.piece);
  if (dests.some((d) => samePos(d.to, a.to))) return OK;
  if (tileAt(s, a.to)?.type === 'chimney') return fail('CHIMNEY_BLOCKED');
  return fail('INVALID_TARGET');
}

function moveKind(pattern: { type: string; flying: boolean }, from: Pos, to: Pos, chimney: boolean) {
  if (chimney) return 'chimney' as const;
  if (pattern.type === 'leap') return 'leap' as const;
  if (pattern.flying) return 'fly' as const;
  return chebyshev(from, to) === 1 ? ('step' as const) : ('slide' as const);
}

export function applyMove(ctx: Ctx, a: ActionOf<'move'>): void {
  const { s, reg } = ctx;
  const piece = s.pieces[a.pieceId];
  const profile = pieceProfile(s, reg, piece);
  const dest = moveDestinations(s, reg, piece).find((d) => samePos(d.to, a.to));
  if (!profile || !dest) return;
  const from = piece.pos;
  piece.pos = { ...dest.to };
  piece.movesLeft -= 1;
  emit(ctx, {
    type: 'piece_moved',
    pieceId: piece.id,
    from,
    to: piece.pos,
    kind: moveKind(profile.move, from, dest.to, dest.chimney !== null),
    path: dest.path,
  });
  const via = dest.chimney ? ` through the Chimney at ${sqName(dest.chimney)}` : '';
  addLog(ctx, `${pieceName(reg, piece)} moves ${sqName(from)} → ${sqName(piece.pos)}${via}.`, a.seat);
  afterMoveEnd(ctx, piece, a.seat);
}

// =============================================================================================
// Strike
// =============================================================================================

export function legalStrikeOptions(s: GameState, reg: ContentRegistry, pieceId: string): StrikeOption[] {
  const piece = getPiece(s, pieceId);
  if (!piece || piece.side !== 'wick') return [];
  return strikePlans(s, reg, piece).map((plan) => strikeOption(s, reg, piece, plan));
}

export function validateStrike(s: GameState, reg: ContentRegistry, a: ActionOf<'strike'>): Validation {
  const own = checkOwnPiece(s, a.seat, a.pieceId);
  if (!own.ok || !own.piece) return own;
  if (own.piece.strikesLeft <= 0) return fail(own.piece.movesLeft > 0 ? 'NO_STRIKE_LEFT' : 'PIECE_SPENT');
  const plans = strikePlans(s, reg, own.piece);
  if (plans.length === 0) return fail('NO_TARGET');
  return findPlan(s, plans, a.target) ? OK : fail('INVALID_TARGET');
}

export function applyStrike(ctx: Ctx, a: ActionOf<'strike'>): void {
  const piece = ctx.s.pieces[a.pieceId];
  const plan = findPlan(ctx.s, strikePlans(ctx.s, ctx.reg, piece), a.target);
  if (plan) performStrike(ctx, piece, plan);
}

// =============================================================================================
// Relight and Shrines
// =============================================================================================

export function validateRelight(s: GameState, a: ActionOf<'relight'>): Validation {
  if (s.config.mode !== 'vigil') return fail('MODE_ONLY', { mode: 'Vigil' });
  const own = checkOwnPiece(s, a.seat, a.pieceId);
  if (!own.ok || !own.piece) return own;
  if (own.piece.strikesLeft <= 0) return fail('NO_STRIKE_LEFT');
  const wick = getPiece(s, a.wickId);
  if (!wick || wick.kind !== 'hero' || !wick.smoldering || wick.pendingRelight) return fail('INVALID_TARGET');
  if (footprintDistance(own.piece.pos, own.piece.size, wick.pos, 1) !== 1) return fail('NOT_ADJACENT');
  return OK;
}

/** relight: the hero returns at the end of this seat turn with ⌈max HP/2⌉ HP, Exhausted (§6.6). */
export function applyRelight(ctx: Ctx, a: ActionOf<'relight'>): void {
  const piece = ctx.s.pieces[a.pieceId];
  const wick = ctx.s.pieces[a.wickId];
  piece.strikesLeft -= 1;
  wick.pendingRelight = true;
  addLog(ctx, `${pieceName(ctx.reg, piece)} relights ${pieceName(ctx.reg, wick)}'s wick: back at the end of the turn.`, a.seat);
}

export function validateLightShrine(s: GameState, a: ActionOf<'light_shrine'>): Validation {
  const own = checkOwnPiece(s, a.seat, a.pieceId);
  if (!own.ok || !own.piece) return own;
  if (own.piece.strikesLeft <= 0) return fail('NO_STRIKE_LEFT');
  const tile = tileAt(s, a.shrine);
  if (!tile || tile.type !== 'votive_shrine') return fail('INVALID_TARGET');
  if (tile.shrineLit) return fail('ALREADY_LIT');
  if (tile.gloam) return fail('IN_GLOAM');
  if (chebyshev(own.piece.pos, a.shrine) > 1) return fail('NOT_ADJACENT');
  return OK;
}

export function applyLightShrine(ctx: Ctx, a: ActionOf<'light_shrine'>): void {
  const { s, reg } = ctx;
  const piece = s.pieces[a.pieceId];
  const tile = tileAt(s, a.shrine);
  if (!tile) return;
  piece.strikesLeft -= 1;
  tile.shrineLit = true;
  s.players[a.seat].stats.shrinesLit += 1;
  emit(ctx, { type: 'shrine_changed', pos: a.shrine, lit: true, seat: a.seat });
  addLog(ctx, `${pieceName(reg, piece)} lights the Shrine at ${sqName(a.shrine)}.`, a.seat);
  awardGlory(ctx, a.seat, reg.rules.glory.shrine, 'shrine');
}

// =============================================================================================
// Free actions
// =============================================================================================

export function validateFreeAction(s: GameState, reg: ContentRegistry, a: ActionOf<'free_action'>): Validation {
  const turn = checkTurn(s, a.seat);
  if (!turn.ok) return turn;
  if (a.kind === 'melt') {
    const piece = getPiece(s, a.pieceId);
    if (!piece) return fail('UNKNOWN_PIECE');
    if (piece.owner !== a.seat) return fail('NOT_YOUR_PIECE');
    return piece.kind === 'unit' ? OK : fail('INVALID_TARGET');
  }
  const player = s.players[a.seat];
  if (!player.heirlooms.includes('bell_of_saint_tallow')) return fail('NOT_OWNED');
  if (player.bellUsedThisNight) return fail('ONCE_PER_NIGHT');
  const hero = heroOf(s, a.seat);
  if (!hero || hero.smoldering) return fail('HERO_SMOLDERING');
  const target = a.target ? pieceAt(s, a.target) : null;
  if (!target || !isEnemyOfSeat(s, a.seat, target)) return fail('INVALID_TARGET');
  const range = reg.rules.ringBellRange;
  if (footprintDistance(hero.pos, 1, target.pos, target.size) > range) return fail('OUT_OF_RANGE', { r: range });
  return OK;
}

export function applyFreeAction(ctx: Ctx, a: ActionOf<'free_action'>): void {
  const { s, reg } = ctx;
  if (a.kind === 'melt') {
    const piece = s.pieces[a.pieceId ?? ''];
    emit(ctx, { type: 'free_action_used', seat: a.seat, kind: 'melt', pieceId: piece.id });
    addLog(ctx, `${pieceAtText(reg, piece)} is dismissed.`, a.seat);
    dismissUnit(ctx, piece, 'melt');
    return;
  }
  const target = a.target ? pieceAt(s, a.target) : null;
  if (!target) return;
  s.players[a.seat].bellUsedThisNight = true;
  emit(ctx, { type: 'free_action_used', seat: a.seat, kind: 'ring_bell', target: a.target });
  addLog(ctx, `The Bell of Saint Tallow rings: ${pieceAtText(reg, target)} is Dazed.`, a.seat);
  applyDaze(ctx, target);
}
