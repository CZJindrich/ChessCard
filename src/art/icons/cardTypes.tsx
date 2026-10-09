/**
 * Card-type glyphs (§16.7): Summon = chess silhouette, Rite = flame rune, Charm = ring and key.
 * Colours follow the type frames (Summon gold, Rite ember, Charm verdigris).
 */
import type { ReactElement } from 'react';
import { CARD_TYPE_COLORS, PALETTE } from '../palette';
import { teardropPath } from '../util/path';
import { IconSvg, type IconProps } from './IconSvg';

export type CardTypeId = 'summon' | 'rite' | 'charm';

export function cardTypeColor(type: string): string {
  return type in CARD_TYPE_COLORS ? CARD_TYPE_COLORS[type as CardTypeId] : PALETTE.ashText;
}

/** Bare glyph in a 32×32 box. */
export function CardTypeShape({ type, color = cardTypeColor(type), ink = '#1A1222' }: { type: string; color?: string; ink?: string }): ReactElement {
  switch (type) {
    case 'summon':
      return (
        <g>
          <path
            d="M9,28H24V19C24,11 20,5.6 14.4,5.4L13,3L11.4,6.4C8.6,7.8 6.6,10.8 6.4,14L9,15.6L13,13.6L14.2,15.2C11.4,18 9,21.6 9,28Z"
            fill={color}
            stroke={ink}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <circle cx={11.6} cy={10.4} r={1.1} fill={ink} />
          <path d="M7,28.6H26" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case 'rite':
      return (
        <g>
          <path d="M16,2.6L28.4,16L16,29.4L3.6,16Z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M16,6L25,16L16,26L7,16Z" fill="#2A140C" opacity={0.65} />
          <path d={teardropPath(16, 23, 10.4, 15)} fill={color} stroke={ink} strokeWidth={1} />
          <path d={teardropPath(16, 22.4, 5, 8)} fill={PALETTE.flameCore} />
        </g>
      );
    case 'charm':
      return (
        <g>
          <circle cx={12.6} cy={13} r={8} fill="none" stroke={ink} strokeWidth={4.2} />
          <circle cx={12.6} cy={13} r={8} fill="none" stroke={color} strokeWidth={2.4} />
          <path d="M8.6,6.6l2.2,-3.4h3.6l2.2,3.4" fill={PALETTE.moonmoth} stroke={ink} strokeWidth={0.9} strokeLinejoin="round" />
          {/* key threaded through the ring */}
          <circle cx={21} cy={18} r={4} fill={PALETTE.brass} stroke={ink} strokeWidth={1.1} />
          <circle cx={21} cy={18} r={1.5} fill={ink} />
          <path d="M23.4,21L28.6,28.6M26.4,25.4l-2,1.4M27.8,27.4l-2,1.4" stroke={ink} strokeWidth={3.6} strokeLinecap="round" />
          <path d="M23.4,21L28.6,28.6M26.4,25.4l-2,1.4M27.8,27.4l-2,1.4" stroke={PALETTE.brass} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    default:
      return <circle cx={16} cy={16} r={8} fill={color} stroke={ink} strokeWidth={1.2} />;
  }
}

export function CardTypeGlyph({ type, size = 32, title, className }: IconProps & { type: string }): ReactElement {
  return (
    <IconSvg size={size} title={title ?? type} className={className}>
      <CardTypeShape type={type} />
    </IconSvg>
  );
}
