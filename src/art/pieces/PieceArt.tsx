/**
 * PieceArt — one board piece drawn in a 64×64 tile box (GDD §16.6):
 * shadow → wax-seal base (runes, pips) → silhouette (+ drips, flame, eyes) → stats & statuses.
 *
 * `PieceGraphic` is the same drawing as a bare `<g>` for embedding in other SVGs
 * (card art windows, Smoke Plume ghosts, codex tiles).
 */
import { useMemo, type ReactElement } from 'react';
import { CLASS_FLAMES, DEFAULT_FLAME, HOUSES, PALETTE, type FlameColors } from '../palette';
import { mix } from '../util/color';
import type { Pt } from '../util/path';
import { cx, useSvgIds } from '../util/svg';
import { ActionPips, AtkBlade, CandleHpBand, CharmSocket, HeroHalo, HpDrop, ReadyHalo, SealBase, Shadow, StatusBadges, WardShell } from './badges';
import { PieceDefs, SNUFF_WAX, WickSmoke, waxPalette, type EyeMood, type PieceKit, type Side } from './kit';
import { getPieceSpec, type PieceSpec } from './registry';
import '../art.css';

export type PieceKind = 'hero' | 'unit' | 'enemy' | 'candle' | 'wick';

export interface PieceLook {
  /** Screen-space direction toward the hovered tile (x right, y down); any length. */
  dx: number;
  dy: number;
}

export interface PieceArtProps {
  defId: string;
  side?: Side;
  /** Defaults from the art registry (hero / unit / enemy / candle / wick). */
  kind?: PieceKind;
  /** House colour for Wickfolk bases and bodies. Defaults to House Beeswax. */
  houseColor?: string;
  /** Hero flame colour: a hex edge colour or full core/edge pair. Defaults by hero id. */
  classFlame?: string | FlameColors;
  hp?: number;
  maxHp?: number;
  atk?: number;
  ward?: boolean;
  /** `true` or the remaining Burn tallies (shown as a small number). */
  burn?: boolean | number;
  dazed?: boolean;
  /** Attached Charm id (any non-empty value shows the socket gem). */
  charm?: string | null;
  movesLeft?: number;
  strikesLeft?: number;
  spent?: boolean;
  exhausted?: boolean;
  /** Override the engraved movement rune (mods / unknown ids). */
  rune?: string | null;
  /** Override the engraved strike glyph. */
  strikeRune?: string | null;
  runePips?: number;
  showStats?: boolean;
  /** Show boot/sword pips (defaults to Wickfolk heroes and units). */
  showPips?: boolean;
  /** Pulsing House-colour halo (Ready piece). */
  ready?: boolean;
  /** Eye expression override, e.g. 'happy' on the victory screen. */
  mood?: EyeMood;
  /** Rendered size in px (the tile size). */
  size?: number;
  lookAt?: PieceLook | null;
  animated?: boolean;
  /** Stable per-instance seed (runtime piece id) for pre-baked smoke and flicker phase. */
  seed?: string;
  className?: string;
  title?: string;
}

const DEFAULT_HOUSE = HOUSES.house_beeswax.color;
const GLANCE = 1.5;

function resolveKind(spec: PieceSpec, kind: PieceKind | undefined): PieceKind {
  if (kind) return kind;
  if (spec.id === 'vigil_candle') return 'candle';
  if (spec.id === 'smoldering_wick') return 'wick';
  if (spec.role === 'hero') return 'hero';
  return spec.faction === 'snuff' ? 'enemy' : 'unit';
}

/** Content gives the Duelist's flame as `#FFF3C4`: a white-hot cinder with an ember edge (§16.2). */
const WHITE_HOT: FlameColors = { core: '#FFFFFF', edge: PALETTE.ember };

function resolveFlame(defId: string, kind: PieceKind, classFlame: PieceArtProps['classFlame']): FlameColors {
  if (typeof classFlame === 'string') {
    return classFlame.toUpperCase() === PALETTE.flameCore ? WHITE_HOT : { core: PALETTE.flameCore, edge: classFlame };
  }
  if (classFlame) return classFlame;
  if (kind === 'hero') return CLASS_FLAMES[defId] ?? DEFAULT_FLAME;
  return DEFAULT_FLAME;
}

function glance(look: PieceLook | null | undefined): Pt {
  if (!look) return { x: 0, y: 0 };
  const len = Math.hypot(look.dx, look.dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: (look.dx / len) * GLANCE, y: (look.dy / len) * GLANCE };
}

function eyeMood(props: PieceArtProps): EyeMood {
  if (props.mood) return props.mood;
  if (props.dazed) return 'dazed';
  if (props.exhausted) return 'sleepy';
  return 'open';
}

function burnCount(burn: PieceArtProps['burn']): number | null {
  if (burn === undefined || burn === false) return null;
  return burn === true ? 0 : burn;
}

export interface PieceGraphicProps extends PieceArtProps {
  /** Unique id prefix (one per rendered graphic). */
  idPrefix?: string;
  /** Figure only: no shadow, base, halo, stats or badges (Plume ghosts, card art). */
  bare?: boolean;
}

/** The piece drawing as a `<g>` in 64×64 space. */
export function PieceGraphic(props: PieceGraphicProps): ReactElement {
  const ids = useSvgIds(props.idPrefix ?? 'pc');
  const factionHint = props.side === 'snuff' || props.kind === 'enemy' ? 'snuff' : 'wick';
  const spec = getPieceSpec(props.defId, factionHint);
  const kind = resolveKind(spec, props.kind);
  const side: Side = props.side ?? (spec.faction === 'snuff' ? 'snuff' : 'wick');
  const houseColor = props.houseColor ?? DEFAULT_HOUSE;
  const animated = props.animated ?? true;
  const seed = props.seed ?? ids.seed;
  const look = glance(props.lookAt);
  const mood = eyeMood(props);
  const flame = resolveFlame(props.defId, kind, props.classFlame);

  const kit: PieceKit = useMemo(
    () => ({
      ids,
      side,
      wax: side === 'snuff' ? SNUFF_WAX : waxPalette(houseColor),
      flame,
      animated,
      seed,
      eyes: mood,
      look,
    }),
    // `flame` and `look` are rebuilt each render, so depend on their values.
    [ids, side, houseColor, flame.core, flame.edge, animated, seed, mood, look.x, look.y],
  );

  const isHero = kind === 'hero';
  const isCandle = kind === 'candle';
  const isWick = kind === 'wick';
  const scale = isHero ? 1.2 : 1;
  const heroScale = isHero ? 'translate(32 53) scale(1.2) translate(-32 -53)' : undefined;
  const Figure = isCandle ? getPieceSpec('vigil_candle').Figure : isWick ? getPieceSpec('smoldering_wick').Figure : spec.Figure;

  const rune = props.rune !== undefined ? props.rune : isCandle || isWick ? null : spec.rune;
  const strike = props.strikeRune !== undefined ? props.strikeRune ?? undefined : isCandle || isWick ? undefined : spec.strike;
  const pips = props.runePips ?? spec.pips ?? 0;

  const showStats = props.showStats ?? true;
  const hp = props.hp;
  const maxHp = props.maxHp ?? hp ?? 0;
  const showPips = props.showPips ?? (side === 'wick' && (kind === 'hero' || kind === 'unit'));
  const moves = props.movesLeft ?? (props.spent || props.exhausted ? 0 : 1);
  const strikes = props.strikesLeft ?? (props.spent || props.exhausted ? 0 : 1);
  const burn = burnCount(props.burn);
  const spentDim = props.spent ? 0.6 : 1;
  const flying = spec.flying === true && !isCandle && !isWick;
  const haloColor = mix(flame.edge, PALETTE.flameCore, 0.15);

  const figure = <Figure kit={kit} />;

  if (props.bare) {
    return (
      <g className="ww-piece-graphic ww-piece-bare">
        <PieceDefs kit={kit} />
        {flying ? <g className={animated ? 'ww-bob' : undefined}>{figure}</g> : figure}
      </g>
    );
  }

  return (
    <g className={cx('ww-piece-graphic', props.spent && 'ww-spent')}>
      <PieceDefs kit={kit} />
      {props.ready && <ReadyHalo color={side === 'snuff' ? PALETTE.snuffRim : houseColor} />}
      <g transform={heroScale}>
        <Shadow kit={kit} rx={flying ? 17 : isCandle ? 20 : 24} opacity={flying ? 0.7 : 1} />
        {!isCandle && <SealBase kit={kit} rune={rune} strike={strike} pips={pips} />}
        {isHero && <HeroHalo x={spec.flame.x} y={spec.flame.y - 1} color={haloColor} />}
        <g opacity={spentDim}>{flying ? <g className={animated ? 'ww-bob' : undefined}>{figure}</g> : figure}</g>
        {props.spent && <WickSmoke kit={kit} x={spec.flame.x} y={spec.flame.y - 10} />}
      </g>
      {props.ward && <WardShell scale={scale} />}
      {showPips && !isCandle && !isWick && (
        <ActionPips moves={moves} strikes={strikes} maxMoves={Math.max(1, moves)} maxStrikes={Math.max(1, strikes)} />
      )}
      {showStats && isCandle && hp !== undefined && <CandleHpBand hp={hp} maxHp={Math.max(maxHp, 3)} />}
      {showStats && !isCandle && hp !== undefined && <HpDrop kit={kit} hp={hp} maxHp={maxHp} />}
      {showStats && !isCandle && props.atk !== undefined && <AtkBlade kit={kit} atk={props.atk} />}
      <StatusBadges ward={props.ward === true} burn={burn} dazed={props.dazed === true} />
      {props.charm && <CharmSocket y={props.ward ? 21.4 : 8.6} />}
    </g>
  );
}

/** Standalone piece `<svg>` sized to one tile. */
export function PieceArt(props: PieceArtProps): ReactElement {
  const size = props.size ?? 64;
  const spec = getPieceSpec(props.defId, props.side === 'snuff' || props.kind === 'enemy' ? 'snuff' : 'wick');
  const label = props.title ?? spec.name;
  const animated = props.animated ?? true;
  return (
    <svg
      className={cx('ww-art ww-piece', !animated && 'ww-still', props.className)}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
    >
      <PieceGraphic {...props} />
    </svg>
  );
}
