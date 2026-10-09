/**
 * The Chandlery between Nights (GDD §13.6), minimal and functional: take 1 of 3 offered cards
 * (2 after a Curse) or skip, then choose a Boon (an Heirloom, Temper a card, Prune up to 2
 * cards) or none. Hot-seat players draft one after another. The polished scene replaces this
 * component; it only needs the controller and the engine state.
 */
import { useState, type ReactElement } from 'react';
import { CardFace } from '../../art';
import type { BoonDef, CardInstance, ContentRegistry, PlayerState } from '../../engine/types';
import { Button } from '../components/Button';
import { cardArtData } from '../model/describe';
import { useController, useGameSnapshot, useRegistry } from './context';
import { GameDialog } from './GameDialog';
import { houseColorOf } from './pieceView';

type BoonId = BoonDef['id'];

function ownedCards(p: PlayerState): CardInstance[] {
  return [...p.deck, ...p.discard, ...p.hand].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function cardName(reg: ContentRegistry, card: CardInstance): string {
  const name = reg.cards.byId[card.id]?.name ?? card.id;
  return card.tempered ? `${name}+` : name;
}

function DraftStep({ player, seat }: { player: PlayerState; seat: number }): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const ch = player.chandlery;
  if (!ch) return null;
  return (
    <>
      <p className="ww-dialog__lead">
        Take {ch.picksLeft === 1 ? 'one card' : `${ch.picksLeft} cards`} for your deck, or skip.
      </p>
      <div className="ww-draft">
        {ch.offer.map((id) => {
          const def = registry.cards.byId[id];
          const taken = ch.picked.includes(id);
          if (!def) return null;
          return (
            <button
              key={id}
              type="button"
              className={`ww-draft__card${taken ? ' ww-draft__card--taken' : ''}`}
              disabled={taken}
              data-card-id={id}
              onClick={() => controller.dispatch({ type: 'draft_pick', seat, cardId: id })}
            >
              <CardFace card={cardArtData(def)} width={168} houseColor={houseColorOf(snap.latest, seat)} />
              {taken && <span className="ww-draft__taken">Taken</span>}
            </button>
          );
        })}
      </div>
      <div className="ww-dialog__actions">
        <Button variant="ghost" onClick={() => controller.dispatch({ type: 'skip_pick', seat })}>
          Skip the draft
        </Button>
      </div>
    </>
  );
}

function BoonStep({ player, seat }: { player: PlayerState; seat: number }): ReactElement | null {
  const controller = useController();
  const registry = useRegistry();
  const [boon, setBoon] = useState<BoonId | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const ch = player.chandlery;
  if (!ch) return null;
  const cards = ownedCards(player);
  const pruneMax = registry.boons.byId.prune?.amount ?? 2;
  const confirm = (): void => {
    if (boon === 'heirloom') controller.dispatch({ type: 'boon_pick', seat, boon, args: { heirloomId: chosen[0] } });
    else if (boon === 'temper') controller.dispatch({ type: 'boon_pick', seat, boon, args: { cardUid: chosen[0] } });
    else if (boon === 'prune') controller.dispatch({ type: 'boon_pick', seat, boon, args: { cardUids: chosen } });
  };
  const toggle = (id: string, max: number): void => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : max === 1 ? [id] : prev.length < max ? [...prev, id] : prev));
  return (
    <>
      <p className="ww-dialog__lead">Choose a Boon.</p>
      <div className="ww-boons" role="radiogroup" aria-label="Boons">
        {registry.boons.list.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={boon === b.id}
            className={`ww-boon${boon === b.id ? ' ww-boon--on' : ''}`}
            onClick={() => {
              setBoon(b.id);
              setChosen([]);
            }}
          >
            <span className="ww-boon__name">{b.name}</span>
            <span className="ww-boon__text">{b.text}</span>
          </button>
        ))}
      </div>
      {boon === 'heirloom' && (
        <ul className="ww-boon-options">
          {ch.heirloomOffer.map((id) => {
            const def = registry.heirlooms.byId[id];
            return (
              <li key={id}>
                <button type="button" className={`ww-boon-option${chosen.includes(id) ? ' ww-boon-option--on' : ''}`} onClick={() => toggle(id, 1)}>
                  <strong>{def?.name ?? id}</strong> {def?.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(boon === 'temper' || boon === 'prune') && (
        <ul className="ww-boon-options ww-boon-options--cards">
          {cards.map((card) => (
            <li key={card.uid}>
              <button
                type="button"
                className={`ww-boon-option${chosen.includes(card.uid) ? ' ww-boon-option--on' : ''}`}
                disabled={boon === 'temper' && card.tempered}
                onClick={() => toggle(card.uid, boon === 'temper' ? 1 : pruneMax)}
              >
                {cardName(registry, card)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ww-dialog__actions">
        <Button variant="primary" seal="check" disabled={boon === null || (boon !== 'prune' && chosen.length === 0)} onClick={confirm}>
          Take the Boon
        </Button>
        <Button variant="ghost" onClick={() => controller.dispatch({ type: 'boon_pick', seat, boon: null, args: {} })}>
          No Boon
        </Button>
      </div>
    </>
  );
}

export function ChandleryPanel(): ReactElement | null {
  const snap = useGameSnapshot();
  const seat = snap.uiSeat;
  const { latest } = snap;
  if (latest.phase !== 'chandlery' || seat === null || snap.animating) return null;
  const player = latest.players[seat];
  const ch = player?.chandlery;
  if (!player || !ch) return null;
  const drafting = ch.picksLeft > 0;
  return (
    <GameDialog eyebrow={`The Chandlery · after Night ${latest.night}`} title={snap.controlledSeats.length > 1 ? `${player.name}, visit the Chandlery` : 'The Chandlery'} size="lg" className="ww-chandlery">
      {drafting ? <DraftStep player={player} seat={seat} /> : <BoonStep key={`boon${seat}`} player={player} seat={seat} />}
    </GameDialog>
  );
}
