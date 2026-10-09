/**
 * Board tiles (§16.5) in a 64×64 box. Tiles render in two layers so the game can follow
 * the render order of §15.5: `floor` (checker stone, Pillars, Rubble) under the darkness
 * canvas, and `glyph` (Hot Wax, Chimney, Votive Shrine) above it. `all` draws both.
 */
import { useMemo, type ReactElement } from 'react';
import { CHIMNEY_PAIR_COLORS, PALETTE } from '../palette';
import { darken, lighten, mix } from '../util/color';
import { ellipsePoints, fmt, polygonPath, smoothClosedPath, spiralPath, teardropPath, wobbleOutline, type Pt } from '../util/path';
import { seededRandom } from '../util/random';
import { animTiming, cssVars, cx, useSvgIds, type SvgIds } from '../util/svg';
import { GRAIN_OPACITY, GRAIN_TILE, useStoneGrain } from './stoneGrain';
import '../art.css';

export const TILE_IDS = ['flagstone', 'pillar', 'rubble', 'votive_shrine', 'chimney', 'hot_wax'] as const;
export type TileLayer = 'floor' | 'glyph' | 'all';
export type CheckerVariant = 'a' | 'b';

export interface TileGraphicProps {
  tileId: string;
  variant?: CheckerVariant;
  /** Votive Shrine lit state. */
  lit?: boolean;
  /** Chimney pair index (selects the pairing glyph and colour). */
  pairIndex?: number;
  layer?: TileLayer;
  /** Top-left corner in the parent's user space. */
  x?: number;
  y?: number;
  seed?: string;
  animated?: boolean;
  /** Grain pattern id (from `<GrainPatternDef>`) — omitted when the texture is not ready. */
  grainUrl?: string | null;
}

/* ---------------------------------------------------------------- floor */

function engravingFor(seed: string): string | null {
  const rand = seededRandom(seed);
  const roll = rand();
  if (roll < 0.55) return null;
  if (roll < 0.8) {
    // a hairline crack
    const x0 = 8 + rand() * 48;
    const y0 = 8 + rand() * 20;
    const pts: string[] = [`M${fmt(x0)},${fmt(y0)}`];
    let x = x0;
    let y = y0;
    for (let i = 0; i < 4; i++) {
      x += (rand() - 0.5) * 14;
      y += 5 + rand() * 7;
      pts.push(`L${fmt(Math.min(60, Math.max(4, x)))},${fmt(Math.min(60, y))}`);
    }
    return pts.join('');
  }
  // a worn carved rune ring in the corner
  const cxp = rand() < 0.5 ? 14 : 50;
  const cyp = rand() < 0.5 ? 14 : 50;
  return `M${cxp - 5},${cyp}a5,5 0 1 0 10,0a5,5 0 1 0 -10,0M${cxp},${cyp - 3}v6M${cxp - 3},${cyp}h6`;
}

/** Two-tone engraved flagstone with a 1 px engraving inner line and stone grain. */
export function Flagstone({ variant, seed, grainUrl }: { variant: CheckerVariant; seed: string; grainUrl?: string | null }): ReactElement {
  const base = variant === 'a' ? PALETTE.flagstoneA : PALETTE.flagstoneB;
  const mark = useMemo(() => engravingFor(seed), [seed]);
  return (
    <g>
      <rect x={0} y={0} width={64} height={64} fill={PALETTE.grout} />
      <rect x={1} y={1} width={62} height={62} rx={1.5} fill={base} />
      {grainUrl && <rect x={1} y={1} width={62} height={62} fill={grainUrl} opacity={GRAIN_OPACITY} />}
      <rect x={3.5} y={3.5} width={57} height={57} rx={1} fill="none" stroke={PALETTE.engraving} strokeWidth={1} />
      <path d="M2,2H62" stroke={lighten(base, 0.08)} strokeWidth={0.8} opacity={0.6} />
      {mark && <path d={mark} fill="none" stroke={PALETTE.engraving} strokeWidth={0.8} opacity={0.75} strokeLinecap="round" />}
    </g>
  );
}

/** Long shadow cast to the lower right; drawn in its own pass so it falls across neighbours. */
export function PillarShadow(): ReactElement {
  const ids = useSvgIds('pshadow');
  return (
    <g>
      <defs>
        <linearGradient id={ids.id('fade')} x1="0.2" y1="0.2" x2="1" y2="1">
          <stop offset="0" stopColor="#05040A" stopOpacity="0.6" />
          <stop offset="1" stopColor="#05040A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M14.6,47.6L49.4,12.8L92,55.4L57.2,90.2Z" fill={ids.url('fade')} />
    </g>
  );
}

/** Carved column top seen from above: fluted drum edge, moulded rings, a rosette boss. */
export function PillarColumn(): ReactElement {
  const ids = useSvgIds('pcol');
  const flutes: string[] = [];
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = 32 + Math.cos(a) * 23.2;
    const y = 30 + Math.sin(a) * 21.2;
    flutes.push(`M${fmt(x)},${fmt(y)}m-1.4,0a1.4,1.4 0 1 0 2.8,0a1.4,1.4 0 1 0 -2.8,0`);
  }
  const petals: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = 32 + Math.cos(a) * 5.4;
    const py = 29 + Math.sin(a) * 5;
    petals.push(`M32,29Q${fmt(px + Math.cos(a + 1.2) * 4)},${fmt(py + Math.sin(a + 1.2) * 4)} ${fmt(px + Math.cos(a) * 2)},${fmt(py + Math.sin(a) * 2)}Q${fmt(px + Math.cos(a - 1.2) * 4)},${fmt(py + Math.sin(a - 1.2) * 4)} 32,29Z`);
  }
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('top')} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor={lighten(PALETTE.tilePillarTop, 0.22)} />
          <stop offset="0.55" stopColor={PALETTE.tilePillarTop} />
          <stop offset="1" stopColor={PALETTE.tilePillar} />
        </radialGradient>
      </defs>
      {/* the drum's side shows below the top face */}
      <ellipse cx={32} cy={35} rx={26} ry={23.4} fill={darken(PALETTE.tilePillar, 0.25)} />
      <ellipse cx={32} cy={30} rx={26} ry={23.4} fill={ids.url('top')} stroke="#1E1A26" strokeWidth={1.2} />
      <path d={flutes.join('')} fill={darken(PALETTE.tilePillar, 0.2)} />
      <ellipse cx={32} cy={30} rx={19.4} ry={17.6} fill="none" stroke="#1E1A26" strokeWidth={1.4} />
      <ellipse cx={32} cy={29.4} rx={19.4} ry={17.6} fill="none" stroke={lighten(PALETTE.tilePillarTop, 0.3)} strokeOpacity={0.6} strokeWidth={0.8} />
      <ellipse cx={32} cy={29.6} rx={13.4} ry={12.2} fill={darken(PALETTE.tilePillarTop, 0.08)} stroke="#1E1A26" strokeWidth={1} />
      <path d={petals.join('')} fill={lighten(PALETTE.tilePillarTop, 0.18)} stroke="#1E1A26" strokeWidth={0.8} />
      <circle cx={32} cy={29} r={2.2} fill={PALETTE.tilePillar} stroke="#1E1A26" strokeWidth={0.8} />
    </g>
  );
}

export function RubbleFloor({ seed }: { seed: string }): ReactElement {
  const rand = useMemo(() => seededRandom(`${seed}rubble`), [seed]);
  const wood = PALETTE.tileRubble;
  const chunks = useMemo(
    () =>
      [
        [12, 48, 5],
        [50, 16, 4],
        [46, 52, 3.4],
      ].map(([x, y, r]) => smoothClosedPath(wobbleOutline(ellipsePoints(x, y, r, r * 0.8, 6), rand, r * 0.35, 1), 0.4)),
    [rand],
  );
  const plank = (x: number, y: number, w: number, h: number, angle: number, key: string): ReactElement => (
    <g key={key} transform={`rotate(${angle} ${x + w / 2} ${y + h / 2})`}>
      <path d={`M${x},${y + h}L${x},${y}H${x + w - 4}l2,${h * 0.3}l2,-${h * 0.15}l-1,${h * 0.45}l1,${h * 0.4}Z`} fill={wood} stroke="#2A1C12" strokeWidth={1} strokeLinejoin="round" />
      <path d={`M${x + 1},${y + 1.5}H${x + w - 6}`} stroke={lighten(wood, 0.25)} strokeWidth={1} />
      <path d={`M${x + 4},${y + h * 0.6}H${x + w * 0.6}`} stroke="#2A1C12" strokeWidth={0.6} opacity={0.6} />
    </g>
  );
  return (
    <g>
      <ellipse cx={34} cy={40} rx={26} ry={16} fill="#05040A" opacity={0.35} />
      {chunks.map((d, i) => (
        <path key={i} d={d} fill={PALETTE.tilePillar} stroke="#1E1A26" strokeWidth={0.8} />
      ))}
      {plank(6, 26, 40, 9, -18, 'p1')}
      {plank(18, 36, 38, 8, 12, 'p2')}
      {/* pew end with a carved quatrefoil */}
      <g transform="rotate(-8 22 24)">
        <path d="M12,34V16Q12,10 18,10H26Q32,10 32,16V34Z" fill={lighten(wood, 0.08)} stroke="#2A1C12" strokeWidth={1.2} />
        <path d="M22,17a2.4,2.4 0 1 1 0.01,0M22,26a2.4,2.4 0 1 1 0.01,0M17.6,21.6a2.4,2.4 0 1 1 0.01,0M26.4,21.6a2.4,2.4 0 1 1 0.01,0" stroke="#2A1C12" strokeWidth={1} fill="none" />
      </g>
      {plank(30, 18, 26, 7, 54, 'p3')}
      {/* splinters */}
      <path d="M44,46l6,-2M47,48l5,1M8,30l-3,-3" stroke={lighten(wood, 0.3)} strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

/* ---------------------------------------------------------------- glyphs */

export function ShrineGlyph({ lit, seed, animated, ids }: { lit: boolean; seed: string; animated: boolean; ids: SvgIds }): ReactElement {
  const candles: Array<[number, number, number]> = [
    [20, 34, 5],
    [28, 33, 6],
    [36, 33, 5.4],
    [44, 34, 6.4],
    [24, 44, 5.6],
    [32, 44, 6.6],
    [40, 44, 5],
  ];
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('shrineGlow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.verdigris} stopOpacity={lit ? 0.75 : 0.28} />
          <stop offset="1" stopColor={PALETTE.verdigris} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={32} cy={38} r={lit ? 34 : 24} fill={ids.url('shrineGlow')} />
      {/* two-tier iron rack */}
      <path d="M14,38H50L48,41H16Z" fill="#2A2535" stroke="#0D0B12" strokeWidth={0.8} />
      <path d="M18,48H46L44,51H20Z" fill="#2A2535" stroke="#0D0B12" strokeWidth={0.8} />
      <path d="M16,41V54M48,41V54M32,51V55" stroke="#2A2535" strokeWidth={1.6} />
      {candles.map(([x, y, h], i) => {
        const t = animTiming(`${seed}shrine${i}`, 1.6, 2.4);
        return (
          <g key={i}>
            <rect x={x - 2.1} y={y - h + 4} width={4.2} height={h} rx={1} fill={lit ? '#F1E6CB' : '#B9AF98'} stroke="#5E5240" strokeWidth={0.5} />
            <path d={`M${x},${y - h + 4}v-1.6`} stroke="#15121B" strokeWidth={0.8} />
            {lit && (
              <g className={animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
                <path d={teardropPath(x, y - h + 2.6, 2.8, 5.4)} fill={PALETTE.candleGold} />
                <path d={teardropPath(x, y - h + 2.4, 1.3, 2.8)} fill={PALETTE.flameCore} />
              </g>
            )}
          </g>
        );
      })}
      {!lit && <path d="M30,22c-1.2,-2 1.2,-3 0,-5" stroke={PALETTE.verdigris} strokeOpacity={0.6} strokeWidth={0.8} fill="none" />}
    </g>
  );
}

/** Small pairing glyphs for Chimneys, cycled by pair index. */
export function pairGlyphPath(index: number, x: number, y: number, r: number): string {
  switch (((index % 4) + 4) % 4) {
    case 0: // crescent moon
      return `M${fmt(x + r * 0.3)},${fmt(y - r)}A${fmt(r)},${fmt(r)} 0 1 0 ${fmt(x + r * 0.3)},${fmt(y + r)}A${fmt(r * 0.75)},${fmt(r * 0.75)} 0 1 1 ${fmt(x + r * 0.3)},${fmt(y - r)}Z`;
    case 1: // four-point sun
      return polygonPath(
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.42;
          return { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr };
        }),
      );
    case 2: // leaf / drop
      return `M${fmt(x)},${fmt(y - r)}Q${fmt(x + r)},${fmt(y)} ${fmt(x)},${fmt(y + r)}Q${fmt(x - r)},${fmt(y)} ${fmt(x)},${fmt(y - r)}Z`;
    default: // eye
      return `M${fmt(x - r)},${fmt(y)}Q${fmt(x)},${fmt(y - r * 1.1)} ${fmt(x + r)},${fmt(y)}Q${fmt(x)},${fmt(y + r * 1.1)} ${fmt(x - r)},${fmt(y)}ZM${fmt(x - r * 0.3)},${fmt(y)}a${fmt(r * 0.3)},${fmt(r * 0.3)} 0 1 0 ${fmt(r * 0.6)},0a${fmt(r * 0.3)},${fmt(r * 0.3)} 0 1 0 ${fmt(-r * 0.6)},0Z`;
  }
}

export function ChimneyGlyph({ pairIndex, animated, ids }: { pairIndex: number; animated: boolean; ids: SvgIds }): ReactElement {
  const color = CHIMNEY_PAIR_COLORS[((pairIndex % CHIMNEY_PAIR_COLORS.length) + CHIMNEY_PAIR_COLORS.length) % CHIMNEY_PAIR_COLORS.length];
  const bricks: ReactElement[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.86) / n) * Math.PI * 2;
    const outer = (a: number, r: number): Pt => ({ x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r });
    const p = [outer(a0, 28), outer(a1, 28), outer(a1, 20), outer(a0, 20)];
    bricks.push(<path key={i} d={polygonPath(p)} fill={i % 2 === 0 ? PALETTE.tileChimney : lighten(PALETTE.tileChimney, 0.08)} stroke="#2A1210" strokeWidth={0.8} strokeLinejoin="round" />);
  }
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('pit')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" />
          <stop offset="1" stopColor="#2A1F2C" />
        </radialGradient>
      </defs>
      <circle cx={32} cy={34} r={29} fill="#05040A" opacity={0.4} />
      <circle cx={32} cy={32} r={21} fill={ids.url('pit')} />
      <g className={animated ? 'ww-spin' : undefined} style={cssVars({ '--ww-dur': '7s' })}>
        <path d={spiralPath(32, 32, 1.4, 19, 40, 0)} stroke={PALETTE.ashText} strokeOpacity={0.45} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <path d={spiralPath(32, 32, 1.4, 19, 40, Math.PI)} stroke={PALETTE.ashText} strokeOpacity={0.3} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </g>
      {bricks}
      <circle cx={32} cy={32} r={28} fill="none" stroke="#2A1210" strokeWidth={1} />
      <circle cx={32} cy={32} r={7.4} fill="#15121B" stroke={color} strokeWidth={1.2} />
      <path d={pairGlyphPath(pairIndex, 32, 32, 4.6)} fill={color} fillRule="evenodd" />
    </g>
  );
}

export function HotWaxGlyph({ seed, animated, ids }: { seed: string; animated: boolean; ids: SvgIds }): ReactElement {
  const pool = useMemo(() => smoothClosedPath(wobbleOutline(ellipsePoints(31, 34, 24, 17, 14), seededRandom(`${seed}wax`), 3.4, 2), 0.95), [seed]);
  const bubbles: Array<[number, number, number]> = [
    [22, 30, 2.6],
    [40, 38, 2],
    [34, 24, 1.6],
    [26, 42, 1.8],
  ];
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('wax')} cx="0.42" cy="0.35" r="0.75">
          <stop offset="0" stopColor={lighten(PALETTE.tileHotWaxTop, 0.25)} />
          <stop offset="0.45" stopColor={PALETTE.tileHotWaxTop} />
          <stop offset="1" stopColor={PALETTE.tileHotWaxBottom} />
        </radialGradient>
      </defs>
      <path d={pool} fill="#05040A" opacity={0.45} transform="translate(1.5 2.5)" />
      <path d={pool} fill={ids.url('wax')} stroke={darken(PALETTE.tileHotWaxBottom, 0.35)} strokeWidth={1.2} />
      <path d={pool} fill="none" stroke={lighten(PALETTE.tileHotWaxTop, 0.4)} strokeOpacity={0.5} strokeWidth={1} transform="translate(32 34) scale(0.86) translate(-32 -34)" />
      <ellipse cx={54} cy={52} rx={4} ry={2.8} fill={ids.url('wax')} stroke={darken(PALETTE.tileHotWaxBottom, 0.35)} strokeWidth={0.9} />
      <ellipse cx={9} cy={18} rx={2.6} ry={1.9} fill={ids.url('wax')} stroke={darken(PALETTE.tileHotWaxBottom, 0.35)} strokeWidth={0.8} />
      <path d="M16,28Q22,19.6 34,19.4" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M38,20.2q3,0.4 5,1.6" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <ellipse cx={42} cy={42} rx={6} ry={2} fill="#FFFFFF" opacity={0.18} />
      {bubbles.map(([x, y, r], i) => {
        const t = animTiming(`${seed}bub${i}`, 2, 3.4);
        return (
          <g key={i} className={animated ? 'ww-bubble' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })} opacity={animated ? undefined : 0.8}>
            <circle cx={x} cy={y} r={r} fill={mix(PALETTE.tileHotWaxTop, '#FFFFFF', 0.3)} stroke={PALETTE.tileHotWaxBottom} strokeWidth={0.6} />
            <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.3} fill="#FFFFFF" />
          </g>
        );
      })}

    </g>
  );
}

/* ----------------------------------------------------------------- tile */

/** One tile as a `<g>` (64×64), for boards and codex grids. */
export function TileGraphic({ tileId, variant = 'a', lit = false, pairIndex = 0, layer = 'all', x = 0, y = 0, seed, animated = true, grainUrl }: TileGraphicProps): ReactElement {
  const ids = useSvgIds('tile');
  const s = seed ?? ids.seed;
  const floor = layer !== 'glyph';
  const glyph = layer !== 'floor';
  return (
    <g transform={x || y ? `translate(${fmt(x)} ${fmt(y)})` : undefined} className={cx('ww-tile', `ww-tile-${tileId}`)}>
      {floor && <Flagstone variant={variant} seed={s} grainUrl={grainUrl} />}
      {floor && tileId === 'pillar' && <PillarShadow />}
      {floor && tileId === 'pillar' && <PillarColumn />}
      {floor && tileId === 'rubble' && <RubbleFloor seed={s} />}
      {glyph && tileId === 'votive_shrine' && <ShrineGlyph lit={lit} seed={s} animated={animated} ids={ids} />}
      {glyph && tileId === 'chimney' && <ChimneyGlyph pairIndex={pairIndex} animated={animated} ids={ids} />}
      {glyph && tileId === 'hot_wax' && <HotWaxGlyph seed={s} animated={animated} ids={ids} />}
    </g>
  );
}

/** `<pattern>` definition for the shared grain texture; returns its `url(#…)` or null. */
export function useGrainPattern(ids: SvgIds): { def: ReactElement | null; url: string | null } {
  const image = useStoneGrain();
  if (!image) return { def: null, url: null };
  return {
    def: (
      <pattern id={ids.id('grain')} width={GRAIN_TILE} height={GRAIN_TILE} patternUnits="userSpaceOnUse">
        <image href={image} width={GRAIN_TILE} height={GRAIN_TILE} />
      </pattern>
    ),
    url: ids.url('grain'),
  };
}

export interface TileArtProps extends Omit<TileGraphicProps, 'x' | 'y' | 'grainUrl'> {
  size?: number;
  className?: string;
  title?: string;
}

/** Standalone tile `<svg>` (Codex, tooltips, gallery). */
export function TileArt({ size = 64, className, title, animated = true, ...rest }: TileArtProps): ReactElement {
  const ids = useSvgIds('tart');
  const grain = useGrainPattern(ids);
  return (
    <svg className={cx('ww-art ww-tile-art', !animated && 'ww-still', className)} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? rest.tileId}>
      {grain.def && <defs>{grain.def}</defs>}
      <TileGraphic {...rest} animated={animated} grainUrl={grain.url} />
    </svg>
  );
}
