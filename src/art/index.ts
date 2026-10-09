/**
 * Wickwatch procedural art library (GDD §16). Pure presentation: every asset is SVG + CSS,
 * ids are plain strings, unknown ids render a generic fallback.
 *
 *   import './art/fonts';            // once, at app start (self-hosted typefaces)
 *   import { PieceArt, CardFace } from './art';
 *
 * Accessibility switches are ancestor classes: `.ww-reduced-motion`, `.ww-readable-font`,
 * `.ww-bold-outlines` (see art.css). Most components also take `animated` / `reducedMotion`.
 */
import './art.css';

// Palette & tokens
export {
  PALETTE,
  HOUSES,
  HOUSE_ORDER,
  houseColorForSeat,
  CLASS_FLAMES,
  DEFAULT_FLAME,
  MOONFIRE_FLAME,
  CARD_TYPE_COLORS,
  CHIMNEY_PAIR_COLORS,
  type PaletteToken,
  type HouseId,
  type HouseGlyphId,
  type HouseStyle,
  type FlameColors,
} from './palette';
export { mix, darken, lighten, rgba, contrastRatio } from './util/color';

// Pieces
export { PieceArt, PieceGraphic, type PieceArtProps, type PieceGraphicProps, type PieceKind, type PieceLook } from './pieces/PieceArt';
export type { EyeMood, Side } from './pieces/kit';
export {
  getPieceSpec,
  hasPieceArt,
  HERO_IDS,
  UNIT_IDS,
  ENEMY_IDS,
  STRUCTURE_IDS,
  ALL_PIECE_IDS,
  type PieceSpec,
  type PieceFaction,
  type PieceRole,
} from './pieces/registry';

// Bosses
export { BossArt, BOSS_IDS, BOSS_NAMES, type BossArtProps } from './bosses/BossArt';
export { BossHpBar, phaseNotches, type BossHpBarProps } from './bosses/BossHpBar';
export { bossArtPlacement, BOSS_VIEWBOX, BOSS_BOX } from './bosses/common';

// Board, tiles, overlays, marks
export { BoardArt, tileOrigin, TILE, FRAME, type BoardArtProps, type BoardTileSpec, type BoardPos } from './board/BoardArt';
export { TileArt, TileGraphic, TILE_IDS, pairGlyphPath, type TileArtProps, type TileGraphicProps, type TileLayer, type CheckerVariant } from './board/tiles';
export { GloamFog, GloamWarningBand, SmokePlumeToken, LitShrineGlyph, TileOverlaySvg } from './board/overlays';
export { IntentTile, MoveDot, StrikeRing, PushArrow, DamageBadge, SkullBadge, type Dir, type IntentTileProps, type MoveDotProps, type StrikeRingProps } from './board/marks';
export { stoneGrainUrl, useStoneGrain, GRAIN_OPACITY } from './board/stoneGrain';

// Icons & glyphs
export { RuneIcon, RuneGlyph, RUNE_IDS, RUNE_NAMES, isRuneId, type RuneId, type RuneIconProps, type RuneGlyphProps } from './icons/runes';
export { StatusIcon, StatusGlyph, WardGlyph, BurnGlyph, DazedGlyph, STATUS_IDS, STATUS_NAMES, type StatusId } from './icons/status';
export {
  FlameIcon,
  HourCandle,
  dreadThresholds,
  GloamBellIcon,
  PealBellIcon,
  GloryIcon,
  CrownSocketIcon,
  FirstLightToken,
  WantedSeal,
  EndTurnSeal,
  UndoIcon,
  HintIcon,
  DeckIcon,
  DiscardIcon,
  HeroPowerIcon,
  type FlameIconProps,
  type HourCandleProps,
  type EndTurnSealProps,
  type HeroPowerIconProps,
} from './icons/hud';
export { HouseGlyph, HouseGlyphShape, type HouseGlyphProps } from './icons/houses';
export { CardTypeGlyph, CardTypeShape, cardTypeColor, type CardTypeId } from './icons/cardTypes';
export type { IconProps } from './icons/IconSvg';

// Cards
export { CardFace, CardMini, CardBack, rulesFontSize, type CardArtData, type CardFaceProps, type CardRarity, type CardTypeName } from './cards/CardFace';
export { SigilIcon, normalizeSigil, type SigilIconProps } from './cards/SigilArt';
export { SIGIL_GLYPH_IDS, resolveGlyphId } from './cards/sigils';

// Moth Die
export { MothDie, MothDieFaceIcon, MOTH_DIE_FACES, MOTH_DIE_LABELS, mothDieFace, mothDieValue, type MothDieFaceId, type MothDieProps } from './dice/MothDie';

// Scenery
export { TitleScene, type TitleSceneProps } from './scenes/TitleScene';
export { SkyBackdrop, VictorySunrise, DefeatEyespots, BossIntroBackdrop } from './scenes/Backdrops';
