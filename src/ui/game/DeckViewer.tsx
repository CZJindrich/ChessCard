/**
 * The deck viewer (D, GDD §15.1, §11.5): your own cards only — the draw pile (sorted, never in
 * draw order), your hand, the discard pile and Charms attached in play — with copies grouped.
 * Hovering a card shows its full face.
 */
import { useState, type ReactElement } from 'react';
import { CardFace, CardMini } from '../../art';
import type { CardInstance, ContentRegistry, GameState } from '../../engine/types';
import { cardArtData } from '../model/describe';
import { useGameSnapshot, useRegistry } from './context';
import { GameDialog } from './GameDialog';
import { houseColorOf } from './pieceView';

export interface CardGroup {
  key: string;
  id: string;
  tempered: boolean;
  count: number;
}

/** Copies of the same card (and temper) grouped, sorted by cost then name. */
export function groupCards(cards: readonly CardInstance[], reg: ContentRegistry): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const card of cards) {
    const key = `${card.id}:${card.tempered ? 't' : ''}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { key, id: card.id, tempered: card.tempered, count: 1 });
  }
  const costOf = (g: CardGroup): number => reg.cards.byId[g.id]?.cost ?? 0;
  const nameOf = (g: CardGroup): string => reg.cards.byId[g.id]?.name ?? g.id;
  return [...groups.values()].sort((a, b) => costOf(a) - costOf(b) || nameOf(a).localeCompare(nameOf(b)));
}

/** The seat whose deck the viewer shows: the acting local seat, else the first local seat. */
export function viewerSeat(uiSeat: number | null, controlled: readonly number[]): number | null {
  return uiSeat ?? controlled[0] ?? null;
}

function charmsInPlay(state: GameState, seat: number): CardInstance[] {
  return Object.values(state.pieces).flatMap((p) => (p.charm && (p.charmSeat ?? p.owner) === seat ? [p.charm] : []));
}

function Pile({ title, cards, houseColor, onHover }: { title: string; cards: readonly CardInstance[]; houseColor: string | undefined; onHover: (g: CardGroup | null) => void }): ReactElement {
  const registry = useRegistry();
  const groups = groupCards(cards, registry);
  return (
    <section className="ww-deck__pile" aria-label={title}>
      <h3 className="ww-deck__title">
        {title} <span className="ww-num">{cards.length}</span>
      </h3>
      {groups.length === 0 ? (
        <p className="ww-deck__empty">Empty</p>
      ) : (
        <ul className="ww-deck__cards">
          {groups.map((g) => {
            const def = registry.cards.byId[g.id];
            if (!def) return null;
            return (
              <li key={g.key} className="ww-deck__card" onPointerEnter={() => onHover(g)} onPointerLeave={() => onHover(null)}>
                <CardMini card={{ ...cardArtData(def), cost: Math.max(0, def.cost - (g.tempered ? 1 : 0)), tempered: g.tempered }} width={86} houseColor={houseColor} animated={false} />
                {g.count > 1 && <span className="ww-deck__count ww-num">×{g.count}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function DeckViewer({ onClose }: { onClose: () => void }): ReactElement | null {
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const [hovered, setHovered] = useState<CardGroup | null>(null);
  const seat = viewerSeat(snap.uiSeat, snap.controlledSeats);
  const player = seat !== null ? snap.latest.players[seat] : undefined;
  if (!player || seat === null) return null;
  const houseColor = houseColorOf(snap.latest, seat);
  const charms = charmsInPlay(snap.latest, seat);
  const total = player.deck.length + player.hand.length + player.discard.length + charms.length;
  const def = hovered ? registry.cards.byId[hovered.id] : undefined;
  return (
    <GameDialog full eyebrow={`${player.name} · ${total} cards`} title="Your Deck" size="xl" className="ww-deck" onClose={onClose} testId="deck-viewer">
      <div className="ww-deck__layout">
        <div className="ww-deck__piles">
          <Pile title="Draw pile" cards={player.deck} houseColor={houseColor} onHover={setHovered} />
          <Pile title="In hand" cards={player.hand} houseColor={houseColor} onHover={setHovered} />
          <Pile title="Discard pile" cards={player.discard} houseColor={houseColor} onHover={setHovered} />
          {charms.length > 0 && <Pile title="Charms in play" cards={charms} houseColor={houseColor} onHover={setHovered} />}
        </div>
        <aside className="ww-deck__preview" aria-hidden="true">
          {def ? (
            <CardFace card={{ ...cardArtData(def), cost: Math.max(0, def.cost - (hovered?.tempered ? 1 : 0)), tempered: hovered?.tempered ?? false }} width={200} houseColor={houseColor} animated={false} />
          ) : (
            <p className="ww-deck__hint">Hover a card to read it. The draw pile is shown sorted, never in draw order.</p>
          )}
        </aside>
      </div>
    </GameDialog>
  );
}
