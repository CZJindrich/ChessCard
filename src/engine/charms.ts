/**
 * Charms (GDD §7.1): a Charm card attaches to a piece until Dawn or until the piece leaves play.
 * Each piece holds at most one; a new Charm replaces the old one. A Charm that leaves play goes
 * to the discard pile of the seat that played it. While attached, its `atk` / `maxHp` bonuses
 * are part of the piece's stats (its `range` bonus is read by strike ranges) and its triggered
 * effects run through `runCharmTrigger` (effects.ts).
 */
import { addLog, pieceAtText } from './log';
import { emit } from './state';
import type { Ctx } from './state';
import type { CardInstance, Piece } from './types';

/** The seat whose discard pile an attached Charm returns to. */
export function charmOwnerSeat(p: Piece): number | null {
  return p.charmSeat ?? p.owner;
}

/** Detach a piece's Charm: its bonuses end and the card goes to its seat's discard pile. */
export function returnCharm(ctx: Ctx, p: Piece): void {
  if (!p.charm) return;
  const seat = charmOwnerSeat(p);
  const owner = seat !== null ? ctx.s.players[seat] : undefined;
  const def = ctx.reg.cards.byId[p.charm.id]?.charm;
  if (def) {
    p.maxHp = Math.max(1, p.maxHp - def.maxHp);
    p.hp = Math.min(p.hp, p.maxHp);
    p.atk = Math.max(0, p.atk - def.atk);
  }
  if (owner) owner.discard.push(p.charm);
  p.charm = null;
  p.charmSeat = null;
  emit(ctx, { type: 'charm_changed', pieceId: p.id, cardId: null });
}

/** Attach `card` (played by `seat`) to a piece, replacing any Charm it already holds. */
export function attachCharm(ctx: Ctx, p: Piece, card: CardInstance, seat: number): void {
  const def = ctx.reg.cards.byId[card.id]?.charm;
  if (!def) return;
  if (p.charm) returnCharm(ctx, p);
  p.charm = { ...card };
  p.charmSeat = seat;
  p.maxHp += def.maxHp;
  p.atk += def.atk;
  emit(ctx, { type: 'charm_changed', pieceId: p.id, cardId: card.id });
  addLog(ctx, `${ctx.reg.cards.byId[card.id]?.name ?? card.id} is bound to ${pieceAtText(ctx.reg, p)}.`, seat);
}

/** Every Charm attached anywhere, with the piece holding it (card conservation checks, Dawn). */
export function attachedCharms(pieces: Record<string, Piece>): Array<{ piece: Piece; card: CardInstance }> {
  const out: Array<{ piece: Piece; card: CardInstance }> = [];
  for (const piece of Object.values(pieces)) if (piece.charm) out.push({ piece, card: piece.charm });
  return out;
}

