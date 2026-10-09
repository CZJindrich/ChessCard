/**
 * The 10 movement / strike runes (GDD §5.2), drawn as stained-glass line glyphs in a
 * 24×24 box. `RuneGlyph` is a bare `<g>` for embedding (piece bases, cards, How to Play);
 * `RuneIcon` is a standalone `<svg>`.
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt, polygonPath, starPoints } from '../util/path';
import { cx } from '../util/svg';
import '../art.css';

export const RUNE_IDS = [
  'rune_crown',
  'rune_horse',
  'rune_tower',
  'rune_mitre',
  'rune_star',
  'rune_pawn',
  'rune_wing',
  'rune_arc',
  'rune_bolt',
  'rune_anchor',
] as const;
export type RuneId = (typeof RUNE_IDS)[number];

export const RUNE_NAMES: Readonly<Record<RuneId, string>> = {
  rune_crown: 'King step',
  rune_horse: 'Knight leap',
  rune_tower: 'Rook slide',
  rune_mitre: 'Bishop slide',
  rune_star: 'Queen slide',
  rune_pawn: 'Pawn',
  rune_wing: 'Flying',
  rune_arc: 'Artillery',
  rune_bolt: 'Ranged line',
  rune_anchor: 'Immobile',
};

export function isRuneId(id: string): id is RuneId {
  return (RUNE_IDS as readonly string[]).includes(id);
}

/** One stroke of a rune. `solid` shapes are filled as well as outlined. */
interface RuneStroke {
  d: string;
  solid?: boolean;
}

const STAR8 = polygonPath(starPoints(12, 12, 9.5, 3.6, 8, -Math.PI / 2));

const RUNE_STROKES: Readonly<Record<RuneId, readonly RuneStroke[]>> = {
  rune_crown: [
    { d: 'M4.5 17.5L3.5 7.5L8.5 11.5L12 4.5L15.5 11.5L20.5 7.5L19.5 17.5Z', solid: true },
    { d: 'M4.5 20.5H19.5' },
  ],
  rune_horse: [
    {
      d: 'M7.5 20.5H17.5V13.5C17.5 8.2 14.6 4.6 10.6 4.4L9.6 2.6L8.4 5.2C6.2 6.4 4.6 8.8 4.4 11.4L6.4 12.8L9.6 11.2L10.6 12.4C8.6 14.6 7.5 17 7.5 20.5Z',
      solid: true,
    },
  ],
  rune_tower: [
    {
      d: 'M6.5 20.5V9.5H4.5V4H8V6.2H10.4V4H13.6V6.2H16V4H19.5V9.5H17.5V20.5Z',
      solid: true,
    },
  ],
  rune_mitre: [
    { d: 'M12 2.8C16.4 5.8 18.6 10 17.4 14.5H6.6C5.4 10 7.6 5.8 12 2.8Z', solid: true },
    { d: 'M14.8 6.2L10.6 11.4' },
    { d: 'M7 17.2H17M8.5 20.5H15.5' },
  ],
  rune_star: [{ d: STAR8, solid: true }],
  rune_pawn: [
    { d: 'M12 3.6A3.6 3.6 0 1 1 11.99 3.6Z', solid: true },
    { d: 'M8.4 12.2H15.6M9.8 12.2C9.8 15 8.6 17 6.5 18.5H17.5C15.4 17 14.2 15 14.2 12.2', solid: true },
    { d: 'M5.5 20.8H18.5' },
  ],
  rune_wing: [
    { d: 'M3.5 17C6 9.5 11.5 5 20.5 4C19.5 9 17 12.5 13 14.5C15 15 16.5 15 18 14.5C15.5 18.5 9.5 20 3.5 17Z', solid: true },
    { d: 'M7.5 15.5C10 13.5 12.5 11.5 15.5 9' },
  ],
  rune_arc: [
    { d: 'M3.5 19.5C5.5 7 15 3.5 19 15' },
    { d: 'M19 19.8A3.2 3.2 0 1 1 18.99 19.8M19 18.2V18.21' },
    { d: 'M2.5 20.5H7' },
  ],
  rune_bolt: [
    { d: 'M4 20L17.5 6.5' },
    { d: 'M20.5 3.5L18.6 11L13 5.4Z', solid: true },
    { d: 'M4 20L3.5 15.5M4 20L8.5 20.5M6.8 17.2L6.2 13.6M6.8 17.2L10.4 17.8' },
  ],
  rune_anchor: [
    { d: 'M12 3.2A2.2 2.2 0 1 1 11.99 3.2' },
    { d: 'M12 7.6V20.5M7.5 10.5H16.5' },
    { d: 'M4 14C4.5 18 8 20.5 12 20.5C16 20.5 19.5 18 20 14M4 14L2.6 16.2M4 14L6.4 15.2M20 14L21.4 16.2M20 14L17.6 15.2' },
  ],
};

/** Fallback for unknown rune ids: a plain diamond so mods never crash rendering. */
const UNKNOWN_RUNE: readonly RuneStroke[] = [{ d: 'M12 3L21 12L12 21L3 12Z', solid: true }];

export interface RuneGlyphProps {
  id: string;
  /** Centre of the glyph in the parent's user space. */
  x: number;
  y: number;
  /** Rendered width/height in the parent's user space. */
  size: number;
  color?: string;
  /** Optional fill for solid strokes (defaults to a translucent tint of `color`). */
  fill?: string;
  strokeWidth?: number;
  /** Range pips under the glyph (rook/bishop/queen slide distance). */
  pips?: number;
  className?: string;
}

export function RuneGlyph({
  id,
  x,
  y,
  size,
  color = PALETTE.candleGold,
  fill,
  strokeWidth = 2,
  pips = 0,
  className,
}: RuneGlyphProps): ReactElement {
  const strokes = isRuneId(id) ? RUNE_STROKES[id] : UNKNOWN_RUNE;
  const scale = size / 24;
  const solidFill = fill ?? color;
  const pipDots: ReactElement[] = [];
  const pipCount = Math.min(Math.max(0, Math.floor(pips)), 6);
  for (let i = 0; i < pipCount; i++) {
    const px = 12 + (i - (pipCount - 1) / 2) * 3.6;
    pipDots.push(<circle key={i} cx={fmt(px)} cy={25.4} r={1.25} fill={color} />);
  }
  return (
    <g
      className={cx('ww-rune', className)}
      transform={`translate(${fmt(x - size / 2)} ${fmt(y - size / 2)}) scale(${fmt(scale)})`}
    >
      {strokes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.solid ? solidFill : 'none'}
          fillOpacity={s.solid ? (fill ? 1 : 0.28) : undefined}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {pipDots}
    </g>
  );
}

export interface RuneIconProps {
  id: string;
  size?: number;
  color?: string;
  pips?: number;
  /** Draw the stained-glass disc behind the rune. */
  disc?: boolean;
  title?: string;
  className?: string;
}

/** Standalone rune sigil (How to Play captions, hero picker, Codex). */
export function RuneIcon({ id, size = 32, color = PALETTE.candleGold, pips = 0, disc = true, title, className }: RuneIconProps): ReactElement {
  const label = title ?? (isRuneId(id) ? RUNE_NAMES[id] : id);
  return (
    <svg className={cx('ww-art ww-rune-icon', className)} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={label}>
      <title>{label}</title>
      {disc && (
        <>
          <circle cx={16} cy={16} r={15} fill={PALETTE.velvetDusk} stroke={PALETTE.brass} strokeWidth={1.2} />
          <circle cx={16} cy={16} r={12.6} fill="none" stroke={PALETTE.engraving} strokeWidth={0.8} />
        </>
      )}
      <RuneGlyph id={id} x={16} y={pips > 0 ? 15 : 16} size={disc ? 19 : 28} color={color} pips={pips} strokeWidth={disc ? 1.9 : 1.6} />
    </svg>
  );
}
