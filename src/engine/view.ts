/**
 * Per-seat views (ARCHITECTURE §7, GDD B.4): what a client may see. Deck orders are hidden for
 * everyone (decks are sorted by card id); in Last Flame other seats' hands and Chandlery offers
 * are hidden too. RNG stream positions, undo frames and the Retry snapshot never leave the server.
 */
import { cloneState } from './state';
import type { CardInstance, GameState } from './types';

const HIDDEN_CARD = 'hidden';

function hideOrder(cards: CardInstance[]): CardInstance[] {
  return cards.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.uid < b.uid ? -1 : 1));
}

export function viewFor(s: GameState, seat: number): GameState {
  const view = cloneState(s);
  view.rng = {};
  view.undo = { frames: [], depth: s.undo.depth };
  view.nightSnapshot = null;
  for (const player of view.players) {
    player.deck = hideOrder(player.deck);
    if (s.config.mode !== 'last_flame' || player.seat === seat) continue;
    player.hand = player.hand.map((c) => ({ uid: c.uid, id: HIDDEN_CARD, tempered: false }));
    if (player.chandlery) player.chandlery = { ...player.chandlery, offer: [], heirloomOffer: [] };
  }
  return view;
}
