/**
 * Decks, hands and discard piles (GDD §7.1-7.2). Shuffles use the seat's `decks:<seat>` stream.
 */
import { starterDeckIds } from './content';
import { seatStream, streamShuffle } from './rng';
import { emit, newId } from './state';
import type { Ctx } from './state';
import type { CardInstance, ContentRegistry, GameState } from './types';

export function makeCard(s: GameState, id: string, tempered = false): CardInstance {
  return { uid: newId(s, 'c'), id, tempered };
}

/** The 10-card starting deck of a hero (§7.2), unshuffled. */
export function starterDeck(s: GameState, reg: ContentRegistry, heroId: string): CardInstance[] {
  return starterDeckIds(heroId, reg).map((id) => makeCard(s, id));
}

/** Night setup: every card the seat owns (deck, discard, hand) goes back and is shuffled in full. */
export function shuffleInFull(ctx: Ctx, seat: number): void {
  const player = ctx.s.players[seat];
  const all = [...player.deck, ...player.discard, ...player.hand];
  player.deck = streamShuffle(ctx.s, seatStream('decks', seat), all);
  player.discard = [];
  player.hand = [];
  emit(ctx, { type: 'deck_shuffled', seat, size: player.deck.length });
}

/**
 * Draw up to `count` cards (§7.1): at the hand limit the draw is skipped and the card stays on
 * the deck; an empty deck reshuffles the discard pile; with both empty the draw fizzles.
 */
export function drawCards(ctx: Ctx, seat: number, count: number): number {
  const player = ctx.s.players[seat];
  const drawn: CardInstance[] = [];
  for (let i = 0; i < count; i++) {
    if (player.hand.length >= ctx.reg.rules.handLimit) break;
    if (player.deck.length === 0) {
      if (player.discard.length === 0) break;
      player.deck = streamShuffle(ctx.s, seatStream('decks', seat), player.discard);
      player.discard = [];
      emit(ctx, { type: 'deck_shuffled', seat, size: player.deck.length });
    }
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
    drawn.push(card);
  }
  if (drawn.length > 0) emit(ctx, { type: 'cards_drawn', seat, count: drawn.length, cards: drawn.map((c) => ({ ...c })) });
  return drawn.length;
}

/** Draw until the hand holds `size` cards. */
export function drawUpTo(ctx: Ctx, seat: number, size: number): number {
  const missing = size - ctx.s.players[seat].hand.length;
  return missing > 0 ? drawCards(ctx, seat, missing) : 0;
}

export function discardHand(ctx: Ctx, seat: number): void {
  const player = ctx.s.players[seat];
  if (player.hand.length === 0) return;
  const count = player.hand.length;
  player.discard.push(...player.hand);
  player.hand = [];
  emit(ctx, { type: 'cards_discarded', seat, count });
}
