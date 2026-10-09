/**
 * Palette tokens (GDD §16.2) plus House and class-flame colours (§1.2, §16.2).
 *
 * The same values are mirrored as CSS custom properties in `art.css`
 * (`--ww-<kebab-name>`); a unit test keeps the two in sync.
 */
export const PALETTE = {
  nightInk: '#0D0B12',
  cryptPlum: '#191523',
  velvetDusk: '#2A2238',
  engraving: '#3B3550',
  flagstoneA: '#24202D',
  flagstoneB: '#2D2938',
  grout: '#15121B',
  tallowText: '#EDE3CC',
  ashText: '#A79FB8',
  candleGold: '#F4B942',
  flameCore: '#FFF3C4',
  ember: '#E8742C',
  bloodWax: '#E5383B',
  verdigris: '#3FA28C',
  moonmoth: '#9FD8E8',
  brass: '#B8913A',
  moonsilver: '#D9E2F2',
  snuffBodyTop: '#7E6EA0',
  snuffBodyBottom: '#5A4C78',
  snuffRim: '#B79CFF',
  snuffEye: '#FF3B2F',
  snuffUnderGlow: '#6A4C9C',
  plumeViolet: '#9A5CFF',
  gloamFog: '#4B3A66',
  gloamBand: '#7E5BC2',
  gutteredWaxTop: '#D9C7A3',
  gutteredWaxBottom: '#8C6B4A',
  moltenCore: '#FF9A3C',
  moonfire: '#7FC8FF',
  mothSilver: '#C9C3E6',
  tilePillar: '#3A3545',
  tilePillarTop: '#4A4458',
  tileRubble: '#4A3426',
  tileChimney: '#5A2E2A',
  tileHotWaxTop: '#F2A65A',
  tileHotWaxBottom: '#C9612B',
  matchbookRed: '#5A1E22',
  sunriseGold: '#FFD86B',
  /** Wickfolk eye ink (§16.6 layer 6). */
  eyeInk: '#2B1A10',
  vellumTop: '#E9DCC0',
  vellumBottom: '#D8C6A0',
  /** Sealing-wax red for card cost seals (not `bloodWax`, which is reserved for Snuff threats). */
  sealRed: '#8E2228',
} as const;

export type PaletteToken = keyof typeof PALETTE;

export type HouseId = 'house_beeswax' | 'house_tallow' | 'house_bayberry' | 'house_rushlight';
export type HouseGlyphId = 'bee' | 'drop' | 'berry' | 'reed';

export interface HouseStyle {
  id: HouseId;
  name: string;
  color: string;
  glyph: HouseGlyphId;
}

export const HOUSES: Readonly<Record<HouseId, HouseStyle>> = {
  house_beeswax: { id: 'house_beeswax', name: 'House Beeswax', color: '#E09A2D', glyph: 'bee' },
  house_tallow: { id: 'house_tallow', name: 'House Tallow', color: '#E6D9B8', glyph: 'drop' },
  house_bayberry: { id: 'house_bayberry', name: 'House Bayberry', color: '#7FAF5A', glyph: 'berry' },
  house_rushlight: { id: 'house_rushlight', name: 'House Rushlight', color: '#5B8DEF', glyph: 'reed' },
};

/** Houses in seat order (seat 1 → index 0). */
export const HOUSE_ORDER: readonly HouseId[] = [
  'house_beeswax',
  'house_tallow',
  'house_bayberry',
  'house_rushlight',
];

/** House colour for a 1-based seat number; falls back to Beeswax for out-of-range seats. */
export function houseColorForSeat(seat: number): string {
  const id = HOUSE_ORDER[seat - 1] ?? HOUSE_ORDER[0];
  return HOUSES[id].color;
}

/** Two-tone flame: `core` at the centre, `edge` at the rim of the teardrop. */
export interface FlameColors {
  core: string;
  edge: string;
}

/** Ordinary Wickfolk flame (units, structures). */
export const DEFAULT_FLAME: FlameColors = { core: PALETTE.flameCore, edge: PALETTE.candleGold };

/**
 * Class flames appear only on hero flames (§16.2). The Duelist is a white-hot cinder
 * so that red stays the Snuff's colour.
 */
export const CLASS_FLAMES: Readonly<Record<string, FlameColors>> = {
  sconce_paladin: { core: PALETTE.flameCore, edge: '#F4B942' },
  moth_witch: { core: PALETTE.flameCore, edge: '#F09AD0' },
  lampwright: { core: PALETTE.flameCore, edge: '#5FE0C8' },
  ember_duelist: { core: '#FFFFFF', edge: PALETTE.ember },
};

/** Moonfire-blue flame used by the Guttered King's wicks. */
export const MOONFIRE_FLAME: FlameColors = { core: '#EAF7FF', edge: PALETTE.moonfire };

/** Card-type frame colours (§7.1, §15.5). */
export const CARD_TYPE_COLORS = {
  summon: PALETTE.candleGold,
  rite: PALETTE.ember,
  charm: PALETTE.verdigris,
} as const;

/** Moth Die pairing colours for Chimney pair glyphs, cycled by pair index. */
export const CHIMNEY_PAIR_COLORS: readonly string[] = [
  PALETTE.moonfire,
  PALETTE.candleGold,
  PALETTE.verdigris,
  '#F09AD0',
];
