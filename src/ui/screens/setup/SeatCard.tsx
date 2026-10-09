/**
 * One seat on the Setup screen: House glyph and colour by seat (§1.2), name, seat type
 * (human, or an AI ally / bot with a level) and hero, with heroes held by other seats greyed.
 */
import type { CSSProperties, ReactElement } from 'react';
import { HOUSE_ORDER, HOUSES, HouseGlyph, PieceArt } from '../../../art';
import { reasonText } from '../../../engine/content';
import type { ContentRegistry, ModeId, SeatConfig, SeatKind } from '../../../engine/types';
import { IconButton } from '../../components/Button';
import { Segmented, type SegmentOption } from '../../components/Chip';
import { heroFirstName } from '../../model/describe';
import { NAME_MAX_LENGTH } from './setupModel';

const RANDOM = 'random';

export interface SeatCardProps {
  index: number;
  seat: SeatConfig;
  mode: ModeId;
  content: ContentRegistry;
  /** The other seat holding each hero (0-based), if any. */
  takenBy: (heroId: string) => number | null;
  removeReason: string | null;
  /** The Daily locks seat 1 to a human. */
  kindLockReason: string | null;
  onKind: (kind: SeatKind) => void;
  onHero: (hero: string | null) => void;
  onName: (name: string) => void;
  onRemove: () => void;
}

export function botWord(mode: ModeId): string {
  return mode === 'vigil' ? 'AI ally' : 'Bot';
}

function kindOptions(content: ContentRegistry): Array<SegmentOption<SeatKind>> {
  return [
    { value: 'human', label: 'Human' },
    ...content.bots.list.map((bot) => ({ value: bot.id, label: bot.label, hint: `${bot.flavour}: ${bot.text}` })),
  ];
}

function RandomHeroGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" className="ww-seat__random" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" />
      <text x="16" y="21.5" textAnchor="middle" fontSize="15" className="ww-num" fill="currentColor">
        ?
      </text>
    </svg>
  );
}

export function SeatCard(props: SeatCardProps): ReactElement {
  const { index, seat, mode, content, takenBy } = props;
  const houseId = HOUSE_ORDER[index] ?? HOUSE_ORDER[0];
  const house = HOUSES[houseId];
  const isBot = seat.kind !== 'human';
  const botLabel = isBot ? `${botWord(mode)} · ${content.bots.byId[seat.kind]?.label ?? seat.kind}` : 'Human';

  const heroOptions: Array<SegmentOption<string>> = [
    { value: RANDOM, label: <RandomHeroGlyph />, ariaLabel: 'Random hero', hint: isBot ? 'The bot takes a hero nobody picked' : 'A hero nobody picked' },
    ...content.heroes.list.map((hero) => {
      const holder = takenBy(hero.id);
      return {
        value: hero.id,
        ariaLabel: hero.displayName,
        hint: hero.displayName,
        disabledReason: holder === null ? null : `${reasonText('CFG_DUPLICATE_HERO', { hero: hero.name }, content)} (seat ${holder + 1})`,
        label: <PieceArt defId={hero.id} kind="hero" houseColor={house.color} size={34} showStats={false} showPips={false} animated={false} />,
      };
    }),
  ];

  return (
    <article className="ww-seat" style={{ '--ww-house': house.color } as CSSProperties} aria-label={`Seat ${index + 1}, ${house.name}`}>
      <div className="ww-seat__house">
        <HouseGlyph house={houseId} disc size={40} />
        <span className="ww-seat__num ww-num">{index + 1}</span>
      </div>
      <div className="ww-seat__main">
        <div className="ww-seat__row">
          <input
            className="ww-input ww-seat__name"
            value={seat.name}
            maxLength={NAME_MAX_LENGTH}
            aria-label={`Seat ${index + 1} name`}
            onChange={(event) => props.onName(event.currentTarget.value)}
          />
          <span className="ww-seat__meta">
            <span className="ww-seat__house-name">{house.name}</span>
            <span className="ww-seat__kind">{botLabel}</span>
          </span>
          {props.removeReason === null ? (
            <IconButton icon="close" label={`Remove seat ${index + 1}`} sound="back" onClick={props.onRemove} />
          ) : (
            <span className="ww-seat__remove-spacer" />
          )}
        </div>
        <div className="ww-seat__row ww-seat__row--controls">
          <Segmented
            label={`Seat ${index + 1} player`}
            options={kindOptions(content)}
            value={seat.kind}
            onChange={props.onKind}
            disabledReason={props.kindLockReason}
            className="ww-seat__kinds"
          />
          <Segmented
            label={`Seat ${index + 1} hero`}
            options={heroOptions}
            value={seat.hero ?? RANDOM}
            onChange={(value) => props.onHero(value === RANDOM ? null : value)}
            className="ww-seat__heroes"
          />
        </div>
        <p className="ww-seat__hero-name">{seat.hero ? (content.heroes.byId[seat.hero]?.displayName ?? seat.hero) : heroFirstName(content, null)}</p>
      </div>
    </article>
  );
}
