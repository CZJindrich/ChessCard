/** House glyphs (§1.2): Bee (Beeswax), Drop (Tallow), Berry sprig (Bayberry), Reed (Rushlight). */
import type { ReactElement } from 'react';
import { HOUSES, PALETTE, type HouseGlyphId, type HouseId } from '../palette';
import { darken } from '../util/color';
import { IconSvg, type IconProps } from './IconSvg';

const INK = '#1A1222';

/** Bare glyph in a 32×32 box, drawn in `color`. */
export function HouseGlyphShape({ glyph, color }: { glyph: string; color: string }): ReactElement {
  const dark = darken(color, 0.55);
  switch (glyph) {
    case 'bee':
      return (
        <g>
          <ellipse cx={11} cy={11} rx={6} ry={4} fill={PALETTE.moonsilver} opacity={0.85} stroke={dark} strokeWidth={1} transform="rotate(-25 11 11)" />
          <ellipse cx={21} cy={11} rx={6} ry={4} fill={PALETTE.moonsilver} opacity={0.85} stroke={dark} strokeWidth={1} transform="rotate(25 21 11)" />
          <ellipse cx={16} cy={19} rx={6.4} ry={8.4} fill={color} stroke={INK} strokeWidth={1.2} />
          <path d="M10.2,17H21.8M10.4,21.4H21.6" stroke={INK} strokeWidth={2.2} />
          <path d="M16,27.4V30" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={16} cy={9.6} r={3.2} fill={INK} />
          <path d="M14.6,7.4L12.6,3.6M17.4,7.4L19.4,3.6" stroke={INK} strokeWidth={1} strokeLinecap="round" />
        </g>
      );
    case 'drop':
      return (
        <g>
          <path d="M16,3C20,10 25,15 25,20.4A9,9 0 0 1 7,20.4C7,15 12,10 16,3Z" fill={color} stroke={INK} strokeWidth={1.3} />
          <path d="M11.6,19.6A4.6,4.6 0 0 0 14.6,25" stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.75} />
        </g>
      );
    case 'berry':
      return (
        <g>
          <path d="M6,27C11,22 15,14 25,5" stroke={dark} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M19,10C23,6 27,6 29,7C27,11 23,13 19,11Z" fill={color} stroke={INK} strokeWidth={1} />
          <path d="M13,16C11,11 7,9 4,9.4C4.6,13.4 8,16.6 13,16.6Z" fill={color} stroke={INK} strokeWidth={1} />
          <circle cx={12} cy={23} r={3.6} fill={darken(color, 0.15)} stroke={INK} strokeWidth={1} />
          <circle cx={18.6} cy={21} r={3.6} fill={darken(color, 0.15)} stroke={INK} strokeWidth={1} />
          <circle cx={15.2} cy={27.4} r={3.4} fill={darken(color, 0.15)} stroke={INK} strokeWidth={1} />
          <circle cx={11} cy={22} r={1} fill="#FFFFFF" opacity={0.75} />
          <circle cx={17.6} cy={20} r={1} fill="#FFFFFF" opacity={0.75} />
        </g>
      );
    case 'reed':
      return (
        <g>
          <path d="M16,30V4" stroke={dark} strokeWidth={1.8} strokeLinecap="round" />
          <rect x={13} y={8} width={6} height={12} rx={3} fill={color} stroke={INK} strokeWidth={1.2} />
          <path d="M16,28C12,24 9,18 6,14M16,26C20,22 24,19 27,17" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <path d="M16,8V3" stroke={INK} strokeWidth={1} strokeLinecap="round" />
        </g>
      );
    default:
      return <circle cx={16} cy={16} r={9} fill={color} stroke={INK} strokeWidth={1.2} />;
  }
}

function resolve(house: string): { glyph: HouseGlyphId | string; color: string; name: string } {
  if (house in HOUSES) {
    const h = HOUSES[house as HouseId];
    return { glyph: h.glyph, color: h.color, name: h.name };
  }
  const byGlyph = Object.values(HOUSES).find((h) => h.glyph === house);
  if (byGlyph) return { glyph: byGlyph.glyph, color: byGlyph.color, name: byGlyph.name };
  return { glyph: house, color: PALETTE.ashText, name: house };
}

export interface HouseGlyphProps extends IconProps {
  /** House id (`house_beeswax`) or glyph id (`bee`). */
  house: string;
  /** Override the House colour (e.g. monochrome UI). */
  color?: string;
  /** Draw on a wax-seal disc. */
  disc?: boolean;
}

export function HouseGlyph({ house, color, disc = false, size = 32, title, className }: HouseGlyphProps): ReactElement {
  const h = resolve(house);
  return (
    <IconSvg size={size} title={title ?? h.name} className={className}>
      {disc && <circle cx={16} cy={16} r={15} fill={PALETTE.velvetDusk} stroke={color ?? h.color} strokeWidth={1.4} />}
      <g transform={disc ? 'translate(16 16) scale(0.78) translate(-16 -16)' : undefined}>
        <HouseGlyphShape glyph={h.glyph} color={color ?? h.color} />
      </g>
    </IconSvg>
  );
}
