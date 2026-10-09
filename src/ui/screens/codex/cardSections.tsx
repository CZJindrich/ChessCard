/** Codex: the cards, drawn with CardFace, filterable by class, type and rarity. */
import { useState, type ReactElement } from 'react';
import { CardFace, HOUSES } from '../../../art';
import { CARD_TYPES, RARITIES } from '../../../engine/types';
import type { CardType, Rarity } from '../../../engine/types';
import { Chip } from '../../components/Chip';
import { cardArtData, matchesQuery } from '../../model/describe';
import { EmptyResult } from './CodexEntry';
import type { SectionProps } from './pieceSections';

const NEUTRAL = 'neutral';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CardsSection({ content, query, animated }: SectionProps): ReactElement {
  const [owner, setOwner] = useState<string>('all');
  const [type, setType] = useState<CardType | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');

  const cards = content.cards.list.filter(
    (c) =>
      (owner === 'all' || (c.class ?? NEUTRAL) === owner) &&
      (type === 'all' || c.type === type) &&
      (rarity === 'all' || c.rarity === rarity) &&
      matchesQuery(query, [c.name, c.text, c.flavor, c.type, c.rarity, c.class ? content.heroes.byId[c.class]?.name : 'neutral']),
  );

  return (
    <>
      <div className="ww-codex__filters">
        <div className="ww-chip-row" role="group" aria-label="Filter by class">
          <Chip selected={owner === 'all'} onSelect={() => setOwner('all')}>
            All
          </Chip>
          <Chip selected={owner === NEUTRAL} onSelect={() => setOwner(NEUTRAL)}>
            Neutral
          </Chip>
          {content.heroes.list.map((h) => (
            <Chip key={h.id} selected={owner === h.id} onSelect={() => setOwner(h.id)}>
              {h.className}
            </Chip>
          ))}
        </div>
        <div className="ww-chip-row" role="group" aria-label="Filter by type and rarity">
          {(['all', ...CARD_TYPES] as const).map((t) => (
            <Chip key={t} selected={type === t} onSelect={() => setType(t)}>
              {t === 'all' ? 'Any type' : titleCase(t)}
            </Chip>
          ))}
          <span className="ww-presets__divider" aria-hidden="true" />
          {(['all', ...RARITIES] as const).map((r) => (
            <Chip key={r} selected={rarity === r} onSelect={() => setRarity(r)}>
              {r === 'all' ? 'Any rarity' : titleCase(r)}
            </Chip>
          ))}
        </div>
      </div>
      {cards.length === 0 ? (
        <EmptyResult query={query || 'these filters'} />
      ) : (
        <ul className="ww-codex__cards">
          {cards.map((card) => {
            const hero = card.class ? content.heroes.byId[card.class] : undefined;
            return (
              <li key={card.id} className="ww-codex__card">
                <CardFace card={cardArtData(card)} width={200} houseColor={HOUSES.house_beeswax.color} animated={animated} />
                <p className="ww-codex__card-meta">
                  {hero ? hero.className : 'Neutral'}
                  {card.starter && card.starterCopies > 0 && <span className="ww-badge">Starter ×{card.starterCopies}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
