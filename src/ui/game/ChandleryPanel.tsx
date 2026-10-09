/**
 * The Chandlery between Nights (GDD §13.6, §15.1.8): a Night summary (kills, Dread or Glory
 * change, Candles standing, the next site), then the draft — three cards rise from a wax tray on
 * velvet; hovering one shows its synergy tags; take one (two after a Curse) or skip — then the
 * Boon: an Heirloom (1 of 2), Temper a card, or Prune up to 2 cards. The deck viewer is a click
 * (or D) away. Hot-seat players visit one after another.
 */
import { useState, type CSSProperties, type ReactElement } from 'react';
import { CardFace, CardMini, SigilIcon } from '../../art';
import type { BoonDef, CardInstance, PlayerState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { Button } from '../components/Button';
import { cardArtData } from '../model/describe';
import { BOON_SIGILS, HEIRLOOM_SIGILS, nightSummary, ownedCards, synergy, type NightSummary } from './chandleryModel';
import { useController, useGameSnapshot, useRegistry } from './context';
import { houseColorOf } from './pieceView';
import { useGameUi } from './uiStore';

type BoonId = BoonDef['id'];

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
}

function SummaryStrip({ summary }: { summary: NightSummary }): ReactElement {
  return (
    <dl className="ww-chandlery__summary" aria-label={`Night ${summary.night} summary`}>
      <div>
        <dt>Snuff slain</dt>
        <dd className="ww-num">{summary.kills}</dd>
      </div>
      {summary.dreadChange !== null && (
        <div className={summary.dreadChange > 0 ? 'ww-chandlery__stat--bad' : 'ww-chandlery__stat--good'}>
          <dt>Dread</dt>
          <dd className="ww-num">
            {signed(summary.dreadChange)}
            <small>
              {' '}
              ({summary.dread}/{summary.dreadMax})
            </small>
          </dd>
        </div>
      )}
      {summary.gloryChange !== null && (
        <div className="ww-chandlery__stat--good">
          <dt>Glory</dt>
          <dd className="ww-num">{signed(summary.gloryChange)}</dd>
        </div>
      )}
      {summary.candlesStanding !== null && (
        <div>
          <dt>Candles standing</dt>
          <dd className="ww-num">{summary.candlesStanding}/3</dd>
        </div>
      )}
      <div className="ww-chandlery__next">
        <dt>Next</dt>
        <dd>{summary.nextSite ?? 'The Night ahead'}</dd>
      </div>
    </dl>
  );
}

function DraftCard({ id, index, taken, deck, seat }: { id: string; index: number; taken: boolean; deck: readonly CardInstance[]; seat: number }): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const presentation = usePresentation();
  const def = registry.cards.byId[id];
  if (!def) return null;
  const tags = synergy(def, deck, registry);
  return (
    <div className={`ww-draft__slot${taken ? ' ww-draft__slot--taken' : ''}`} style={{ '--ww-rise-delay': `${160 + index * 140}ms` } as CSSProperties}>
      <button
        type="button"
        className="ww-draft__card"
        disabled={taken}
        data-card-id={id}
        aria-label={`Take ${def.name}: ${def.text}`}
        onClick={() => controller.dispatch({ type: 'draft_pick', seat, cardId: id })}
      >
        <CardFace card={cardArtData(def)} width={172} houseColor={houseColorOf(snap.latest, seat)} animated={!presentation.reduced_motion} />
        <span className="ww-draft__take">{taken ? 'Taken' : 'Take'}</span>
      </button>
      <ul className="ww-draft__tags" aria-label="Synergy">
        {tags.map((t) => (
          <li key={t.tag} className={t.inDeck > 0 ? 'ww-draft__tag ww-draft__tag--hit' : 'ww-draft__tag'}>
            {t.tag}
            {t.inDeck > 0 && <span className="ww-draft__tag-count"> · {t.inDeck} in deck</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftStep({ player, seat }: { player: PlayerState; seat: number }): ReactElement | null {
  const controller = useController();
  const ch = player.chandlery;
  if (!ch) return null;
  const deck = ownedCards(player);
  return (
    <section className="ww-chandlery__draft" aria-label="Draft">
      <p className="ww-chandlery__lead">
        {ch.picksLeft > 1 ? (
          <>
            The Curse's reward: take <strong>{ch.picksLeft} cards</strong> for your deck.
          </>
        ) : (
          <>Take one card for your deck, or skip.</>
        )}
      </p>
      <div className="ww-draft__velvet">
        <div className="ww-draft__cards">
          {ch.offer.map((id, i) => (
            <DraftCard key={id} id={id} index={i} taken={ch.picked.includes(id)} deck={deck} seat={seat} />
          ))}
        </div>
        <div className="ww-draft__tray" aria-hidden="true" />
      </div>
      <div className="ww-dialog__actions">
        <Button variant="ghost" onClick={() => controller.dispatch({ type: 'skip_pick', seat })}>
          {ch.picked.length > 0 ? 'Done' : 'Skip the draft'}
        </Button>
      </div>
    </section>
  );
}

function HeirloomPicker({ offer, chosen, onChoose }: { offer: readonly string[]; chosen: string | null; onChoose: (id: string) => void }): ReactElement {
  const registry = useRegistry();
  return (
    <div className="ww-boon-pick ww-boon-pick--heirlooms" role="radiogroup" aria-label="Heirlooms">
      {offer.map((id) => {
        const def = registry.heirlooms.byId[id];
        return (
          <button key={id} type="button" role="radio" aria-checked={chosen === id} className={`ww-heirloom${chosen === id ? ' ww-heirloom--on' : ''}`} onClick={() => onChoose(id)}>
            <SigilIcon sigil={HEIRLOOM_SIGILS[id] ?? ['star']} accent="#B8913A" size={56} />
            <span className="ww-heirloom__name">{def?.name ?? id}</span>
            <span className="ww-heirloom__text">{def?.text}</span>
            {def?.flavor && <span className="ww-heirloom__flavor">{def.flavor}</span>}
          </button>
        );
      })}
    </div>
  );
}

function CardPicker({ cards, chosen, max, disabledUid, onToggle, houseColor }: { cards: readonly CardInstance[]; chosen: readonly string[]; max: number; disabledUid: (card: CardInstance) => string | null; onToggle: (uid: string) => void; houseColor: string | undefined }): ReactElement {
  const registry = useRegistry();
  const sorted = [...cards].sort((a, b) => (registry.cards.byId[a.id]?.name ?? a.id).localeCompare(registry.cards.byId[b.id]?.name ?? b.id));
  // Keep a typical deck on one row.
  const width = sorted.length > 10 ? 56 : 66;
  return (
    <ul className="ww-boon-pick ww-boon-pick--cards" aria-label={`Choose up to ${max}`}>
      {sorted.map((card) => {
        const def = registry.cards.byId[card.id];
        if (!def) return null;
        const on = chosen.includes(card.uid);
        const reason = on ? null : disabledUid(card);
        return (
          <li key={card.uid}>
            <button type="button" className={`ww-boon-card${on ? ' ww-boon-card--on' : ''}`} aria-pressed={on} disabled={reason !== null} title={reason ?? undefined} onClick={() => onToggle(card.uid)}>
              <CardMini card={{ ...cardArtData(def), cost: Math.max(0, def.cost - (card.tempered ? 1 : 0)), tempered: card.tempered }} width={width} houseColor={houseColor} animated={false} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BoonStep({ player, seat }: { player: PlayerState; seat: number }): ReactElement | null {
  const controller = useController();
  const registry = useRegistry();
  const snap = useGameSnapshot();
  const [boon, setBoon] = useState<BoonId | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const ch = player.chandlery;
  if (!ch) return null;
  const cards = ownedCards(player);
  const pruneMax = registry.boons.byId.prune?.amount ?? 2;
  const deckMin = registry.rules.deckMin;
  const roomToPrune = Math.max(0, cards.length - deckMin);
  const confirm = (): void => {
    if (boon === 'heirloom') controller.dispatch({ type: 'boon_pick', seat, boon, args: { heirloomId: chosen[0] } });
    else if (boon === 'temper') controller.dispatch({ type: 'boon_pick', seat, boon, args: { cardUid: chosen[0] } });
    else if (boon === 'prune') controller.dispatch({ type: 'boon_pick', seat, boon, args: { cardUids: chosen } });
  };
  const toggle = (id: string, max: number): void => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : max === 1 ? [id] : prev.length < max ? [...prev, id] : prev));
  const ready = boon !== null && (boon === 'prune' ? chosen.length > 0 : chosen.length === 1);
  const houseColor = houseColorOf(snap.latest, seat);
  return (
    <section className="ww-chandlery__boon" aria-label="Boon">
      <p className="ww-chandlery__lead">Choose a Boon.</p>
      <div className="ww-boons" role="radiogroup" aria-label="Boons">
        {registry.boons.list.map((b) => {
          const noOffer = b.id === 'heirloom' && ch.heirloomOffer.length === 0;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={boon === b.id}
              disabled={noOffer}
              className={`ww-boon${boon === b.id ? ' ww-boon--on' : ''}`}
              onClick={() => {
                setBoon(b.id);
                setChosen([]);
              }}
            >
              <SigilIcon sigil={BOON_SIGILS[b.id]} accent="#F4B942" size={44} />
              <span className="ww-boon__name">{b.name}</span>
              <span className="ww-boon__text">{noOffer ? 'You own every Heirloom.' : b.text}</span>
            </button>
          );
        })}
      </div>
      {boon === 'heirloom' && <HeirloomPicker offer={ch.heirloomOffer} chosen={chosen[0] ?? null} onChoose={(id) => setChosen([id])} />}
      {boon === 'temper' && <CardPicker cards={cards} chosen={chosen} max={1} houseColor={houseColor} disabledUid={(c) => (c.tempered ? 'Already tempered' : null)} onToggle={(uid) => toggle(uid, 1)} />}
      {boon === 'prune' && (
        <>
          <p className="ww-chandlery__note">{roomToPrune === 0 ? `Your deck is at the minimum of ${deckMin} cards.` : `Remove up to ${Math.min(pruneMax, roomToPrune)} — the deck can't go below ${deckMin}.`}</p>
          <CardPicker
            cards={cards}
            chosen={chosen}
            max={Math.min(pruneMax, roomToPrune)}
            houseColor={houseColor}
            disabledUid={() => (chosen.length >= Math.min(pruneMax, roomToPrune) ? `Deck can't go below ${deckMin} cards` : null)}
            onToggle={(uid) => toggle(uid, Math.min(pruneMax, roomToPrune))}
          />
        </>
      )}
      <div className="ww-dialog__actions">
        <Button variant="primary" seal="check" disabled={!ready} onClick={confirm}>
          Take the Boon
        </Button>
        <Button variant="ghost" onClick={() => controller.dispatch({ type: 'boon_pick', seat, boon: null, args: {} })}>
          No Boon
        </Button>
      </div>
    </section>
  );
}

function ChandleryScene({ player, seat, hotSeat }: { player: PlayerState; seat: number; hotSeat: boolean }): ReactElement {
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const ui = useGameUi();
  const [summary] = useState(() => nightSummary(snap.latest, registry, seat));
  const ch = player.chandlery;
  const drafting = (ch?.picksLeft ?? 0) > 0;
  return (
    <div className="ww-chandlery-layer" data-testid="chandlery">
      <div className="ww-chandlery ww-panel ww-panel--night ww-filigree" role="dialog" aria-label="The Chandlery">
        <header className="ww-chandlery__head">
          <span className="ww-dialog__eyebrow">Dawn · after Night {snap.latest.night}</span>
          <h2 className="ww-chandlery__title">{hotSeat ? `${player.name}, visit the Chandlery` : 'The Chandlery'}</h2>
          <ol className="ww-chandlery__steps" aria-label="Steps">
            <li className={drafting ? 'ww-chandlery__step--on' : 'ww-chandlery__step--done'}>Draft</li>
            {snap.latest.config.boons && <li className={drafting ? '' : 'ww-chandlery__step--on'}>Boon</li>}
          </ol>
        </header>
        <SummaryStrip summary={summary} />
        {drafting ? <DraftStep player={player} seat={seat} /> : <BoonStep key={`boon${seat}`} player={player} seat={seat} />}
        <footer className="ww-chandlery__foot">
          <Button variant="ghost" size="sm" icon="book" onClick={() => ui.open('deck')}>
            View deck (D) · {ownedCards(player).length} cards
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function ChandleryPanel(): ReactElement | null {
  const snap = useGameSnapshot();
  const seat = snap.uiSeat;
  const { latest } = snap;
  if (latest.phase !== 'chandlery' || seat === null || snap.animating) return null;
  const player = latest.players[seat];
  if (!player?.chandlery) return null;
  return <ChandleryScene key={`${latest.night}:${seat}`} player={player} seat={seat} hotSeat={snap.controlledSeats.length > 1} />;
}
