/**
 * Per-seat views (ARCHITECTURE §7, GDD B.4, §11.5, §13.6): what a client may see.
 *
 * - Every seat: deck orders are hidden (decks are sorted); RNG stream positions, undo frames and
 *   the Retry snapshot never leave the server.
 * - Last Flame, other seats: hands and decks become anonymous cards (`id: 'hidden'` with masked
 *   uids, so the starter-deck uid order cannot reveal them), and their Chandlery offers, Heirloom
 *   offers and picks are hidden. Discard piles, Charms and Heirlooms stay public.
 *
 * `eventsForSeat` filters an event list the same way (rivals' draws, offers, picks and Boon
 * arguments).
 */
import { cloneState } from './state';
import type { CardInstance, ChandleryState, GameEvent, GameState, ModeId, PlayerState } from './types';

export const HIDDEN_CARD = 'hidden';

function hideOrder(cards: CardInstance[]): CardInstance[] {
  return cards.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.uid < b.uid ? -1 : 1));
}

function anonymous(cards: CardInstance[], seat: number, pile: 'hand' | 'deck'): CardInstance[] {
  return cards.map((_, i) => ({ uid: `${pile}-${seat}-${i}`, id: HIDDEN_CARD, tempered: false }));
}

function hiddenChandlery(ch: ChandleryState): ChandleryState {
  return { ...ch, offer: [], heirloomOffer: [], picked: ch.picked.map(() => HIDDEN_CARD) };
}

function hideRival(player: PlayerState): void {
  player.hand = anonymous(player.hand, player.seat, 'hand');
  player.deck = anonymous(player.deck, player.seat, 'deck');
  if (player.chandlery) player.chandlery = hiddenChandlery(player.chandlery);
}

export function viewFor(s: GameState, seat: number): GameState {
  const view = cloneState(s);
  view.rng = {};
  view.undo = { frames: [], depth: s.undo.depth };
  view.nightSnapshot = null;
  for (const player of view.players) {
    if (s.config.mode === 'last_flame' && player.seat !== seat) hideRival(player);
    else player.deck = hideOrder(player.deck);
  }
  return view;
}

/** An event as `seat` may see it, or the event itself when nothing in it is hidden. */
function eventForSeat(event: GameEvent, seat: number): GameEvent {
  switch (event.type) {
    case 'cards_drawn':
      return event.seat === seat ? event : { ...event, cards: [] };
    case 'chandlery_opened':
      return { ...event, offers: event.offers.filter((offer) => offer.seat === seat) };
    case 'card_drafted':
      return event.seat === seat || event.cardId === null ? event : { ...event, cardId: HIDDEN_CARD };
    case 'boon_picked':
      return event.seat === seat ? event : { ...event, args: {} };
    default:
      return event;
  }
}

/** Events as `seat` may see them (B.4). Vigil hands and drafts are shared information. */
export function eventsForSeat(events: readonly GameEvent[], seat: number, mode: ModeId): GameEvent[] {
  if (mode !== 'last_flame') return events.slice();
  return events.map((event) => eventForSeat(event, seat));
}
