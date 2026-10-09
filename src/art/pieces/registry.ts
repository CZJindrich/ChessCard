/**
 * Art registry for every piece id in the GDD (heroes §8.1, units §8.2, enemies §9.2,
 * structures §5.4). Ids are plain strings so the art never depends on engine types;
 * unknown ids fall back to a generic candle / smoke wisp.
 */
import type { ComponentType } from 'react';
import type { RuneId } from '../icons/runes';
import type { Pt } from '../util/path';
import * as S from './snuff';
import * as W from './wickfolk';
import type { FigureProps } from './wickfolk';

export type PieceFaction = 'wick' | 'snuff';
export type PieceRole = 'hero' | 'unit' | 'enemy' | 'structure';

export interface PieceSpec {
  id: string;
  name: string;
  faction: PieceFaction;
  role: PieceRole;
  /** Movement rune engraved on the left of the base. */
  rune: RuneId | null;
  /** Range pips for slides (rook 3 → 3). */
  pips?: number;
  /** Strike glyph engraved on the right, when the strike is not "as move". */
  strike?: RuneId;
  flying?: boolean;
  Figure: ComponentType<FigureProps>;
  /** Flame base, used for the spent smoke wisp and the hero halo. */
  flame: Pt;
}

type SpecInput = Omit<PieceSpec, 'id'>;

const SPECS: Readonly<Record<string, SpecInput>> = {
  // Heroes
  sconce_paladin: { name: 'Brannoc', faction: 'wick', role: 'hero', rune: 'rune_crown', Figure: W.SconcePaladinFigure, flame: { x: 32, y: 17 } },
  moth_witch: { name: 'Velveteen', faction: 'wick', role: 'hero', rune: 'rune_horse', Figure: W.MothWitchFigure, flame: { x: 38.6, y: 8 } },
  lampwright: { name: 'Wicklow', faction: 'wick', role: 'hero', rune: 'rune_tower', pips: 3, strike: 'rune_bolt', Figure: W.LampwrightFigure, flame: { x: 30, y: 27 } },
  ember_duelist: { name: 'Vey', faction: 'wick', role: 'hero', rune: 'rune_mitre', pips: 3, Figure: W.EmberDuelistFigure, flame: { x: 31, y: 17 } },
  // Units
  taper: { name: 'Taper', faction: 'wick', role: 'unit', rune: 'rune_pawn', Figure: W.TaperFigure, flame: { x: 32, y: 20 } },
  taper_captain: { name: 'Taper Captain', faction: 'wick', role: 'unit', rune: 'rune_crown', Figure: W.TaperCaptainFigure, flame: { x: 32, y: 15.4 } },
  wickhorse: { name: 'Wickhorse', faction: 'wick', role: 'unit', rune: 'rune_horse', Figure: W.WickhorseFigure, flame: { x: 34.6, y: 18 } },
  incense_acolyte: { name: 'Incense Acolyte', faction: 'wick', role: 'unit', rune: 'rune_mitre', pips: 2, Figure: W.IncenseAcolyteFigure, flame: { x: 32, y: 13 } },
  sconce_squire: { name: 'Sconce Squire', faction: 'wick', role: 'unit', rune: 'rune_crown', Figure: W.SconceSquireFigure, flame: { x: 30, y: 21 } },
  brass_ram: { name: 'Brass Ram', faction: 'wick', role: 'unit', rune: 'rune_tower', pips: 2, Figure: W.BrassRamFigure, flame: { x: 32, y: 17.6 } },
  velvet_moth: { name: 'Velvet Moth', faction: 'wick', role: 'unit', rune: 'rune_star', pips: 2, flying: true, Figure: W.VelvetMothFigure, flame: { x: 32, y: 23.4 } },
  silkspinner: { name: 'Silkspinner', faction: 'wick', role: 'unit', rune: 'rune_crown', strike: 'rune_bolt', Figure: W.SilkspinnerFigure, flame: { x: 32, y: 22.6 } },
  lantern: { name: 'Lantern', faction: 'wick', role: 'unit', rune: 'rune_anchor', strike: 'rune_bolt', Figure: W.LanternFigure, flame: { x: 32, y: 30 } },
  wick_mortar: { name: 'Wick Mortar', faction: 'wick', role: 'unit', rune: 'rune_anchor', strike: 'rune_arc', Figure: W.WickMortarFigure, flame: { x: 19.4, y: 25 } },
  bellows_golem: { name: 'Bellows Golem', faction: 'wick', role: 'unit', rune: 'rune_tower', pips: 1, Figure: W.BellowsGolemFigure, flame: { x: 32, y: 14.8 } },
  cinderling: { name: 'Cinderling', faction: 'wick', role: 'unit', rune: 'rune_star', pips: 2, Figure: W.CinderlingFigure, flame: { x: 32, y: 14 } },
  twinwick: { name: 'Twinwick', faction: 'wick', role: 'unit', rune: 'rune_mitre', pips: 2, Figure: W.TwinwickFigure, flame: { x: 32, y: 22 } },
  // Enemies
  sootling: { name: 'Sootling', faction: 'snuff', role: 'enemy', rune: 'rune_crown', Figure: S.SootlingFigure, flame: { x: 36, y: 16 } },
  gnawmoth: { name: 'Gnawmoth', faction: 'snuff', role: 'enemy', rune: 'rune_star', pips: 3, flying: true, Figure: S.GnawmothFigure, flame: { x: 32, y: 20 } },
  smokehound: { name: 'Smokehound', faction: 'snuff', role: 'enemy', rune: 'rune_star', pips: 2, Figure: S.SmokehoundFigure, flame: { x: 22, y: 17 } },
  ink_wretch: { name: 'Ink Wretch', faction: 'snuff', role: 'enemy', rune: 'rune_tower', pips: 2, strike: 'rune_bolt', Figure: S.InkWretchFigure, flame: { x: 31, y: 14 } },
  hush_monk: { name: 'Hush Monk', faction: 'snuff', role: 'enemy', rune: 'rune_tower', pips: 1, strike: 'rune_crown', Figure: S.HushMonkFigure, flame: { x: 32, y: 11 } },
  ash_deacon: { name: 'Ash Deacon', faction: 'snuff', role: 'enemy', rune: 'rune_crown', strike: 'rune_arc', Figure: S.AshDeaconFigure, flame: { x: 32, y: 6 } },
  knell_banshee: { name: 'Knell Banshee', faction: 'snuff', role: 'enemy', rune: 'rune_mitre', pips: 3, strike: 'rune_bolt', flying: true, Figure: S.KnellBansheeFigure, flame: { x: 32, y: 9 } },
  gutter_pawn: { name: 'Gutter Pawn', faction: 'snuff', role: 'enemy', rune: 'rune_pawn', Figure: S.GutterPawnFigure, flame: { x: 34.6, y: 20 } },
  drip_hulk: { name: 'Drip Hulk', faction: 'snuff', role: 'enemy', rune: 'rune_tower', pips: 1, Figure: S.DripHulkFigure, flame: { x: 32, y: 18 } },
  snuffer_knight: { name: 'Snuffer Knight', faction: 'snuff', role: 'enemy', rune: 'rune_horse', Figure: S.SnufferKnightFigure, flame: { x: 37, y: 6 } },
  hollow_lamplighter: { name: 'Hollow Lamplighter', faction: 'snuff', role: 'enemy', rune: 'rune_tower', pips: 2, strike: 'rune_bolt', Figure: S.HollowLamplighterFigure, flame: { x: 32, y: 6 } },
  smokestack: { name: 'Smokestack', faction: 'snuff', role: 'structure', rune: 'rune_anchor', Figure: S.SmokestackFigure, flame: { x: 34, y: 8 } },
  clapper: { name: 'The Clapper', faction: 'snuff', role: 'enemy', rune: 'rune_crown', strike: 'rune_crown', Figure: S.ClapperFigure, flame: { x: 32, y: 7 } },
  // Structures
  vigil_candle: { name: 'Vigil Candle', faction: 'wick', role: 'structure', rune: 'rune_anchor', Figure: W.VigilCandleFigure, flame: { x: 32, y: 13 } },
  smoldering_wick: { name: 'Smoldering Wick', faction: 'wick', role: 'structure', rune: null, Figure: W.SmolderingWickFigure, flame: { x: 32, y: 37 } },
};

export const HERO_IDS = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'] as const;
export const UNIT_IDS = [
  'taper',
  'taper_captain',
  'wickhorse',
  'incense_acolyte',
  'sconce_squire',
  'brass_ram',
  'velvet_moth',
  'silkspinner',
  'lantern',
  'wick_mortar',
  'bellows_golem',
  'cinderling',
  'twinwick',
] as const;
export const ENEMY_IDS = [
  'sootling',
  'gnawmoth',
  'smokehound',
  'ink_wretch',
  'hush_monk',
  'ash_deacon',
  'knell_banshee',
  'gutter_pawn',
  'drip_hulk',
  'snuffer_knight',
  'hollow_lamplighter',
  'smokestack',
  'clapper',
] as const;
export const STRUCTURE_IDS = ['vigil_candle', 'smoldering_wick'] as const;

export const ALL_PIECE_IDS: readonly string[] = [...HERO_IDS, ...UNIT_IDS, ...ENEMY_IDS, ...STRUCTURE_IDS];

export function hasPieceArt(defId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPECS, defId);
}

const GENERIC_WICK: SpecInput = { name: 'Wickfolk', faction: 'wick', role: 'unit', rune: null, Figure: W.GenericCandleFigure, flame: { x: 32, y: 23.6 } };
const GENERIC_SNUFF: SpecInput = { name: 'Snuff', faction: 'snuff', role: 'enemy', rune: null, Figure: S.GenericSnuffFigure, flame: { x: 29, y: 19 } };

/**
 * Look up the art spec for a piece. `factionHint` picks the fallback for unknown ids
 * (mods): Snuff ids get a smoke wisp, everything else a plain candle.
 */
export function getPieceSpec(defId: string, factionHint: PieceFaction = 'wick'): PieceSpec {
  const known = hasPieceArt(defId) ? SPECS[defId] : undefined;
  const spec = known ?? (factionHint === 'snuff' ? GENERIC_SNUFF : GENERIC_WICK);
  return { id: defId, ...spec };
}
