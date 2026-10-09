/**
 * Piece actions in the players phase (GDD §6.1, §6.6): move, strike, relight, light_shrine and
 * the free action `melt` / `ring_bell`. Each has a validator returning a reason code (§15.6) and an
 * apply function that mutates the cloned state through a Ctx.
 */
import { afterMoveEnd, dismissUnit } from './combat';
import { baseEnv, runEffects } from './effects';
import { chebyshev, footprintDistance, samePos, sqName } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { awardGlory, isTruceActive } from './modes/lastFlame';
import { previewFromEvents } from './previewEvents';
import { findPlan, moveDestinations, performStrike, pieceProfile, strikeOption, strikePlans } from './strike';
import { cloneState, emit, getPiece, heroOf, isRivalOf, makeCtx, pieceAt, tileAt, unitsOf } from './state';
import type { Ctx } from './state';
import { checkPicks, pickPlan, picksToTargets } from './targeting';
import type { PickEnv } from './targeting';
import { stepInfo } from './targetInfo';
import { fail, OK } from './validation';
import type { ActionOf, CardTargetChoice, CardTargetInfo, ContentRegistry, EffectPreview, FreeActionKind, GameState, HeirloomDef, Piece, Pos, StrikeOption, Validation } from './types';

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
  if (findPlan(s, plans, a.target)) return OK;
  const occupant = pieceAt(s, a.target);
  if (occupant && isTruceActive(s) && isRivalOf(s, a.seat, occupant)) return fail('TRUCE');
  return fail(plans.length === 0 ? 'NO_TARGET' : 'INVALID_TARGET');
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
// Free actions: melt and ring_bell
// =============================================================================================

/** The Bell of Saint Tallow, when the seat's hero owns it. */
function bellOf(s: GameState, reg: ContentRegistry, seat: number): HeirloomDef | null {
  const id = s.players[seat]?.heirlooms.find((h) => reg.heirlooms.byId[h]?.freeAction === 'ring_bell');
  return id ? (reg.heirlooms.byId[id] ?? null) : null;
}

function bellEnv(seat: number, def: HeirloomDef): PickEnv | null {
  return def.target ? { seat, kind: 'free', plan: pickPlan(def.target, null, def.effects) } : null;
}

/** Everything except the target: owned, once per Night, hero standing. */
function bellReady(s: GameState, reg: ContentRegistry, seat: number): Validation & { def?: HeirloomDef } {
  const def = bellOf(s, reg, seat);
  if (!def) return fail('NOT_OWNED');
  if (s.players[seat].bellUsedThisNight) return fail('ONCE_PER_NIGHT');
  const hero = heroOf(s, seat);
  if (!hero || hero.smoldering) return fail('HERO_SMOLDERING');
  return { ok: true, def };
}

function bellChoices(a: ActionOf<'free_action'>): CardTargetChoice[] {
  if (a.pieceId) return [{ kind: 'piece', pieceId: a.pieceId }];
  return a.target ? [{ kind: 'tile', pos: a.target }] : [];
}

function validateMelt(s: GameState, a: ActionOf<'free_action'>): Validation {
  const piece = getPiece(s, a.pieceId);
  if (!piece) return fail('UNKNOWN_PIECE');
  if (piece.owner !== a.seat) return fail('NOT_YOUR_PIECE');
  return piece.kind === 'unit' ? OK : fail('INVALID_TARGET');
}

export function validateFreeAction(s: GameState, reg: ContentRegistry, a: ActionOf<'free_action'>): Validation {
  const turn = checkTurn(s, a.seat);
  if (!turn.ok) return turn;
  if (a.kind === 'melt') return validateMelt(s, a);
  const ready = bellReady(s, reg, a.seat);
  if (!ready.ok || !ready.def) return ready;
  const env = bellEnv(a.seat, ready.def);
  return env ? checkPicks(s, reg, env, bellChoices(a)) : fail('INVALID_ACTION');
}

function ringBell(ctx: Ctx, a: ActionOf<'free_action'>): void {
  const { s, reg } = ctx;
  const def = bellOf(s, reg, a.seat);
  const env = def ? bellEnv(a.seat, def) : null;
  if (!def || !env) return;
  const targets = picksToTargets(s, reg, env, bellChoices(a));
  const target = getPiece(s, targets[0]?.pieceId);
  s.players[a.seat].bellUsedThisNight = true;
  emit(ctx, { type: 'free_action_used', seat: a.seat, kind: 'ring_bell', ...(target ? { pieceId: target.id, target: { ...target.pos } } : {}) });
  addLog(ctx, `The ${def.name} rings${target ? ` over ${pieceAtText(reg, target)}` : ''}.`, a.seat);
  const hero = heroOf(s, a.seat);
  runEffects(ctx, def.effects, baseEnv({ seat: a.seat, self: hero, targets, ruleSource: { kind: 'heirloom', id: def.id } }));
}

export function applyFreeAction(ctx: Ctx, a: ActionOf<'free_action'>): void {
  const { s, reg } = ctx;
  if (a.kind === 'ring_bell') {
    ringBell(ctx, a);
    return;
  }
  const piece = s.pieces[a.pieceId ?? ''];
  if (!piece) return;
  emit(ctx, { type: 'free_action_used', seat: a.seat, kind: 'melt', pieceId: piece.id });
  addLog(ctx, `${pieceAtText(reg, piece)} is dismissed.`, a.seat);
  dismissUnit(ctx, piece, 'melt');
}

function simulateFree(s: GameState, reg: ContentRegistry, a: ActionOf<'free_action'>): EffectPreview {
  const ctx = makeCtx(cloneState(s), reg);
  applyFreeAction(ctx, a);
  return previewFromEvents(ctx.events, ctx.s);
}

function meltInfo(s: GameState, reg: ContentRegistry, seat: number, base: CardTargetInfo): CardTargetInfo {
  const units = unitsOf(s, seat);
  if (units.length === 0) return { ...base, reason: 'NO_TARGET' };
  const targets = units.map((p: Piece) => ({
    choice: { kind: 'piece', pieceId: p.id } as CardTargetChoice,
    pos: { ...p.pos },
    preview: simulateFree(s, reg, { type: 'free_action', seat, kind: 'melt', pieceId: p.id }),
  }));
  return { ...base, playable: true, targets };
}

/**
 * Valid targets of a free action: `melt` lists the seat's units (send `pieceId`); `ring_bell`
 * lists the enemies the Bell can Daze (send `pieceId` or the tile as `target`).
 */
export function freeActionTargetInfo(s: GameState, reg: ContentRegistry, seat: number, kind: FreeActionKind): CardTargetInfo {
  const base: CardTargetInfo = { playable: false, cost: 0, modes: null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null };
  const turn = checkTurn(s, seat);
  if (!turn.ok) return { ...base, reason: turn.reason, ...(turn.params ? { params: turn.params } : {}) };
  if (kind === 'melt') return meltInfo(s, reg, seat, base);
  const ready = bellReady(s, reg, seat);
  if (!ready.ok || !ready.def) return { ...base, ...(ready.ok ? {} : { reason: ready.reason }) };
  const env = bellEnv(seat, ready.def);
  if (!env) return { ...base, reason: 'INVALID_ACTION' };
  const preview = (choices: CardTargetChoice[]) => {
    const first = choices[0];
    return simulateFree(s, reg, { type: 'free_action', seat, kind, ...(first?.kind === 'piece' ? { pieceId: first.pieceId } : {}) });
  };
  return stepInfo(s, reg, env, [], preview, base);
}
