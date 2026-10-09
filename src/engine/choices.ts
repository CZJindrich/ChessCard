/**
 * Seat choices outside piece play: deploy / ready (night_setup), choose_toll, claim_turn and
 * end_turn, carry_over (dawn), and the Chandlery's draft_pick / skip_pick / boon_pick.
 * Retry and Concede votes live in votes.ts.
 */
import { checkTurn } from './actions';
import { makeCard } from './decks';
import { gainHeirloom } from './heirlooms';
import { sqName } from './geometry';
import { addLog, pieceName } from './log';
import { applyToll, claimTurn, endSeatTurn } from './phases';
import { canDeployTo } from './setup';
import { emit, getPiece, pieceAt, unitsOf } from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type { ActionOf, CardInstance, ContentRegistry, GameState, PlayerState, Validation } from './types';

function seatPlayer(s: GameState, seat: number): PlayerState | null {
  return s.players[seat] ?? null;
}

// =============================================================================================
// night_setup
// =============================================================================================

export function validateDeploy(s: GameState, a: ActionOf<'deploy'>): Validation {
  if (s.phase !== 'night_setup') return fail('WRONG_PHASE');
  const player = seatPlayer(s, a.seat);
  if (!player) return fail('INVALID_ACTION');
  if (player.ready) return fail('TURN_ENDED');
  const piece = getPiece(s, a.pieceId);
  if (!piece) return fail('UNKNOWN_PIECE');
  if (piece.owner !== a.seat) return fail('NOT_YOUR_PIECE');
  if (!canDeployTo(s, a.seat, a.to)) return fail('NOT_DEPLOY_ZONE');
  const occupant = pieceAt(s, a.to);
  if (occupant && occupant.id !== piece.id) return fail('TILE_BLOCKED');
  return OK;
}

export function applyDeploy(ctx: Ctx, a: ActionOf<'deploy'>): void {
  const piece = ctx.s.pieces[a.pieceId];
  const from = piece.pos;
  piece.pos = { ...a.to };
  // Vigil: the deploy tile becomes the default. Last Flame keeps the seat's start tile (deploys
  // stay within 1 of it; respawns and Plume quadrants use it).
  if (piece.kind === 'hero' && ctx.s.config.mode === 'vigil') ctx.s.players[a.seat].startTile = { ...a.to };
  emit(ctx, { type: 'piece_moved', pieceId: piece.id, from, to: piece.pos, kind: 'deploy' });
  addLog(ctx, `${pieceName(ctx.reg, piece)} deploys to ${sqName(piece.pos)}.`, a.seat);
}

export function validateReady(s: GameState, a: ActionOf<'ready'>): Validation {
  if (s.phase !== 'night_setup') return fail('WRONG_PHASE');
  const player = seatPlayer(s, a.seat);
  if (!player) return fail('INVALID_ACTION');
  return player.ready ? fail('TURN_ENDED') : OK;
}

export function applyReady(ctx: Ctx, a: ActionOf<'ready'>): void {
  ctx.s.players[a.seat].ready = true;
  emit(ctx, { type: 'seat_ready', seat: a.seat });
}

// =============================================================================================
// Toll
// =============================================================================================

export function validateChooseToll(s: GameState, a: ActionOf<'choose_toll'>): Validation {
  if (s.phase !== 'toll') return fail('WRONG_PHASE');
  if (s.toll.chooser !== a.seat) return fail('NOT_YOUR_TURN');
  if (s.toll.active !== null) return fail('TURN_ENDED');
  const offer = s.toll.offer;
  if (!offer || (a.tollId !== offer.blessing && a.tollId !== offer.curse)) return fail('NOT_OFFERED');
  return OK;
}

export function applyChooseToll(ctx: Ctx, a: ActionOf<'choose_toll'>): void {
  applyToll(ctx, a.seat, a.tollId);
}

// =============================================================================================
// Turn flow
// =============================================================================================

export function validateClaimTurn(s: GameState, a: ActionOf<'claim_turn'>): Validation {
  if (s.phase !== 'players') return fail('WRONG_PHASE');
  if (s.config.mode !== 'vigil') return fail('MODE_ONLY', { mode: 'Vigil' });
  const player = seatPlayer(s, a.seat);
  if (!player) return fail('INVALID_ACTION');
  if (player.turnEnded) return fail('TURN_ENDED');
  if (s.activeSeat === a.seat || s.claimQueue.includes(a.seat)) return fail('INVALID_ACTION');
  return OK;
}

export function applyClaimTurn(ctx: Ctx, a: ActionOf<'claim_turn'>): void {
  claimTurn(ctx, a.seat);
}

export function validateEndTurn(s: GameState, a: ActionOf<'end_turn'>): Validation {
  return checkTurn(s, a.seat);
}

export function applyEndTurn(ctx: Ctx, a: ActionOf<'end_turn'>): void {
  endSeatTurn(ctx, a.seat);
}

// =============================================================================================
// Dawn: carry-over
// =============================================================================================

export function validateCarryOver(s: GameState, reg: ContentRegistry, a: ActionOf<'carry_over'>): Validation {
  if (s.phase !== 'dawn') return fail('WRONG_PHASE');
  const player = seatPlayer(s, a.seat);
  if (!player || !player.carryOver) return fail('INVALID_ACTION');
  if (a.keep.length > reg.rules.carryOverMax) return fail('TOO_MANY', { max: reg.rules.carryOverMax });
  if (new Set(a.keep).size !== a.keep.length) return fail('INVALID_TARGET');
  const own = new Set(unitsOf(s, a.seat).map((p) => p.id));
  return a.keep.every((id) => own.has(id)) ? OK : fail('NOT_YOUR_PIECE');
}

export function applyCarryOver(ctx: Ctx, a: ActionOf<'carry_over'>): void {
  const carry = ctx.s.players[a.seat].carryOver;
  if (!carry) return;
  carry.chosen = a.keep.slice();
  addLog(ctx, `${ctx.s.players[a.seat].name} keeps ${a.keep.length} unit${a.keep.length === 1 ? '' : 's'}.`, a.seat);
}

// =============================================================================================
// Chandlery
// =============================================================================================

function chandleryOf(s: GameState, seat: number) {
  return s.phase === 'chandlery' ? (s.players[seat]?.chandlery ?? null) : null;
}

export function validateDraftPick(s: GameState, a: ActionOf<'draft_pick'>): Validation {
  if (s.phase !== 'chandlery') return fail('WRONG_PHASE');
  const ch = chandleryOf(s, a.seat);
  if (!ch) return fail('INVALID_ACTION');
  if (ch.picksLeft <= 0) return fail('NO_PICKS_LEFT');
  if (!ch.offer.includes(a.cardId) || ch.picked.includes(a.cardId)) return fail('NOT_OFFERED');
  return OK;
}

export function applyDraftPick(ctx: Ctx, a: ActionOf<'draft_pick'>): void {
  const player = ctx.s.players[a.seat];
  const ch = player.chandlery;
  if (!ch) return;
  ch.picked.push(a.cardId);
  ch.picksLeft -= 1;
  player.deck.push(makeCard(ctx.s, a.cardId));
  emit(ctx, { type: 'card_drafted', seat: a.seat, cardId: a.cardId });
  addLog(ctx, `${player.name} takes ${ctx.reg.cards.byId[a.cardId]?.name ?? a.cardId}.`, a.seat);
}

export function validateSkipPick(s: GameState, a: ActionOf<'skip_pick'>): Validation {
  if (s.phase !== 'chandlery') return fail('WRONG_PHASE');
  const ch = chandleryOf(s, a.seat);
  if (!ch) return fail('INVALID_ACTION');
  return ch.picksLeft > 0 ? OK : fail('NO_PICKS_LEFT');
}

export function applySkipPick(ctx: Ctx, a: ActionOf<'skip_pick'>): void {
  const ch = ctx.s.players[a.seat].chandlery;
  if (!ch) return;
  ch.picksLeft = 0;
  ch.skipped = true;
  emit(ctx, { type: 'card_drafted', seat: a.seat, cardId: null });
}

function ownedCards(p: PlayerState): CardInstance[] {
  return [...p.deck, ...p.discard, ...p.hand];
}

export function validateBoonPick(s: GameState, reg: ContentRegistry, a: ActionOf<'boon_pick'>): Validation {
  if (s.phase !== 'chandlery') return fail('WRONG_PHASE');
  if (!s.config.boons) return fail('NOT_ENABLED', { feature: 'Boons' });
  const player = seatPlayer(s, a.seat);
  const ch = chandleryOf(s, a.seat);
  if (!player || !ch) return fail('INVALID_ACTION');
  if (ch.boonDone) return fail('NO_PICKS_LEFT');
  const owned = ownedCards(player);
  switch (a.boon) {
    case null:
      return OK;
    case 'heirloom':
      return a.args.heirloomId && ch.heirloomOffer.includes(a.args.heirloomId) ? OK : fail('NOT_OFFERED');
    case 'temper': {
      const card = owned.find((c) => c.uid === a.args.cardUid);
      if (!card) return fail('NOT_OWNED');
      return card.tempered ? fail('ALREADY_TEMPERED') : OK;
    }
    case 'prune': {
      const uids = a.args.cardUids ?? [];
      const max = reg.boons.byId.prune?.amount ?? 2;
      if (uids.length > max) return fail('TOO_MANY', { max });
      if (new Set(uids).size !== uids.length || !uids.every((uid) => owned.some((c) => c.uid === uid))) return fail('NOT_OWNED');
      return owned.length - uids.length >= reg.rules.deckMin ? OK : fail('DECK_MIN');
    }
  }
}

/** Record the Boon: an Heirloom joins the hero, Temper marks a card, Prune removes cards. */
export function applyBoonPick(ctx: Ctx, a: ActionOf<'boon_pick'>): void {
  const { s } = ctx;
  const player = s.players[a.seat];
  const ch = player.chandlery;
  if (!ch) return;
  ch.boonDone = true;
  ch.boonPicked = a.boon;
  if (a.boon === 'heirloom' && a.args.heirloomId) {
    gainHeirloom(ctx, a.seat, a.args.heirloomId);
  } else if (a.boon === 'temper') {
    const card = ownedCards(player).find((c) => c.uid === a.args.cardUid);
    if (card) card.tempered = true;
  } else if (a.boon === 'prune') {
    const remove = new Set(a.args.cardUids ?? []);
    player.deck = player.deck.filter((c) => !remove.has(c.uid));
    player.discard = player.discard.filter((c) => !remove.has(c.uid));
    player.hand = player.hand.filter((c) => !remove.has(c.uid));
  }
  emit(ctx, { type: 'boon_picked', seat: a.seat, boon: a.boon, args: a.args });
}
