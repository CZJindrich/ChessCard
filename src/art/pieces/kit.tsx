/**
 * Shared drawing kit for pieces: per-instance gradients and the small parts every
 * silhouette is built from (wax shapes, drips, flames, eyes, smoke bodies).
 * Coordinates are in the 64×64 tile box (§16.6).
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { PALETTE, type FlameColors } from '../palette';
import { darken, lighten, mix } from '../util/color';
import { fmt, smoothClosedPath, spiralPath, teardropPath, wobbleOutline, type Pt } from '../util/path';
import { seededRandom } from '../util/random';
import { animTiming, cssVars, type SvgIds } from '../util/svg';

export type Side = 'wick' | 'snuff';
export type EyeMood = 'open' | 'sleepy' | 'dazed' | 'happy' | 'closed';

export interface WaxPalette {
  base: string;
  dark: string;
  deep: string;
  light: string;
}

export interface PieceKit {
  ids: SvgIds;
  side: Side;
  wax: WaxPalette;
  flame: FlameColors;
  animated: boolean;
  /** Stable seed for this piece instance (pre-baked smoke, animation phases). */
  seed: string;
  eyes: EyeMood;
  /** Eye glance offset in user units (already clamped to ±1.5). */
  look: Pt;
}

export function waxPalette(color: string): WaxPalette {
  return {
    base: color,
    dark: darken(color, 0.3),
    deep: darken(color, 0.62),
    light: mix(color, PALETTE.flameCore, 0.42),
  };
}

export const SNUFF_WAX: WaxPalette = {
  base: PALETTE.snuffBodyTop,
  dark: PALETTE.snuffBodyBottom,
  deep: darken(PALETTE.snuffBodyBottom, 0.55),
  light: mix(PALETTE.snuffBodyTop, PALETTE.moonsilver, 0.45),
};

/** Gradients every piece needs; rendered once per piece inside its `<defs>`. */
export function PieceDefs({ kit }: { kit: PieceKit }): ReactElement {
  const { ids, wax, flame } = kit;
  return (
    <defs>
      <linearGradient id={ids.id('body')} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor={lighten(wax.base, 0.08)} />
        <stop offset="0.55" stopColor={wax.base} />
        <stop offset="1" stopColor={wax.dark} />
      </linearGradient>
      <radialGradient id={ids.id('glow')} cx="0.5" cy="0.02" r="0.8">
        <stop offset="0" stopColor={PALETTE.flameCore} stopOpacity="0.62" />
        <stop offset="0.45" stopColor={PALETTE.flameCore} stopOpacity="0.16" />
        <stop offset="1" stopColor={PALETTE.flameCore} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.id('rim')} x1="0" y1="0" x2="1" y2="0.8">
        <stop offset="0" stopColor={PALETTE.flameCore} stopOpacity="0.95" />
        <stop offset="0.32" stopColor={PALETTE.flameCore} stopOpacity="0.3" />
        <stop offset="0.5" stopColor={PALETTE.flameCore} stopOpacity="0" />
      </linearGradient>
      <radialGradient id={ids.id('flame')} cx="0.5" cy="0.78" r="0.75">
        <stop offset="0" stopColor={flame.core} />
        <stop offset="0.45" stopColor={mix(flame.core, flame.edge, 0.45)} />
        <stop offset="1" stopColor={flame.edge} />
      </radialGradient>
      <radialGradient id={ids.id('flameHalo')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={flame.edge} stopOpacity="0.55" />
        <stop offset="1" stopColor={flame.edge} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.id('snuff')} x1="0.2" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor={mix(PALETTE.snuffBodyTop, PALETTE.moonsilver, 0.18)} />
        <stop offset="0.45" stopColor={PALETTE.snuffBodyTop} />
        <stop offset="1" stopColor={PALETTE.snuffBodyBottom} />
      </linearGradient>
      <radialGradient id={ids.id('snuffSheen')} cx="0.32" cy="0.2" r="0.6">
        <stop offset="0" stopColor={PALETTE.moonsilver} stopOpacity="0.45" />
        <stop offset="1" stopColor={PALETTE.moonsilver} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ids.id('underglow')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={PALETTE.snuffUnderGlow} stopOpacity="0.9" />
        <stop offset="1" stopColor={PALETTE.snuffUnderGlow} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ids.id('ember')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={PALETTE.snuffEye} stopOpacity="0.85" />
        <stop offset="1" stopColor={PALETTE.snuffEye} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ids.id('shadow')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#000" stopOpacity="0.6" />
        <stop offset="0.7" stopColor="#000" stopOpacity="0.25" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ids.id('seal')} cx="0.38" cy="0.25" r="0.8">
        <stop offset="0" stopColor={lighten(wax.base, 0.25)} />
        <stop offset="0.5" stopColor={wax.base} />
        <stop offset="1" stopColor={wax.dark} />
      </radialGradient>
      <linearGradient id={ids.id('brass')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F1D58A" />
        <stop offset="0.45" stopColor={PALETTE.brass} />
        <stop offset="1" stopColor="#6E5320" />
      </linearGradient>
      <linearGradient id={ids.id('steel')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F2F4FA" />
        <stop offset="0.5" stopColor="#B7BDD0" />
        <stop offset="1" stopColor="#6C7088" />
      </linearGradient>
    </defs>
  );
}

/* ------------------------------------------------------------------ wax */

interface WaxShapeProps {
  kit: PieceKit;
  d: string;
  /** Override fill (e.g. brass parts); glow/rim still apply unless `plain`. */
  fill?: string;
  plain?: boolean;
  outline?: boolean;
}

/** A wax body part: gradient fill, translucent top glow, upper-left rim light, crisp outline. */
export function WaxShape({ kit, d, fill, plain = false, outline = true }: WaxShapeProps): ReactElement {
  const { ids, wax } = kit;
  return (
    <g>
      <path d={d} fill={fill ?? ids.url('body')} />
      {!plain && <path d={d} fill={ids.url('glow')} />}
      {!plain && <path d={d} fill="none" stroke={ids.url('rim')} strokeWidth={1.6} />}
      {outline && (
        <path className="ww-outline" d={d} fill="none" stroke={wax.deep} strokeOpacity={0.75} strokeWidth={0.9} strokeLinejoin="round" />
      )}
    </g>
  );
}

export interface DripSpec {
  x: number;
  y: number;
  len: number;
  w?: number;
}

/** 3–5 wax drips hanging from a rim (§16.6 layer 4). */
export function Drips({ kit, drips, color = kit.wax.light, gleam = true }: { kit: PieceKit; drips: readonly DripSpec[]; color?: string; gleam?: boolean }): ReactElement {
  return (
    <g className="ww-drips">
      {drips.map((dr, i) => {
        const w = dr.w ?? 2.6;
        const r = w / 2;
        const d =
          `M${fmt(dr.x - r)},${fmt(dr.y)}` +
          `L${fmt(dr.x - r * 0.8)},${fmt(dr.y + dr.len - r)}` +
          `A${fmt(r * 1.05)},${fmt(r * 1.1)} 0 1 0 ${fmt(dr.x + r * 0.8)},${fmt(dr.y + dr.len - r)}` +
          `L${fmt(dr.x + r)},${fmt(dr.y)}Z`;
        return (
          <g key={i}>
            <path d={d} fill={color} />
            {gleam && <circle cx={fmt(dr.x - r * 0.25)} cy={fmt(dr.y + dr.len - r * 1.1)} r={fmt(r * 0.35)} fill={PALETTE.flameCore} opacity={0.75} />}
          </g>
        );
      })}
    </g>
  );
}

/* ---------------------------------------------------------------- flame */

interface FlameProps {
  kit: PieceKit;
  /** Wick tip (flame base). */
  x: number;
  y: number;
  /** Flame height in user units. */
  size?: number;
  /** Lean in degrees (e.g. Vey's ponytail). */
  lean?: number;
  /** Show the dark wick stub below the flame. */
  wick?: boolean;
  /** Extra seed salt so multiple flames on one piece flicker out of phase. */
  salt?: string;
  colors?: FlameColors;
  halo?: boolean;
}

/** Teardrop flame: two radial-gradient teardrops flickering via CSS transforms (§16.6 layer 5). */
export function Flame({ kit, x, y, size = 12, lean = 0, wick = true, salt = '', colors, halo = true }: FlameProps): ReactElement {
  const timing = animTiming(`${kit.seed}flame${salt}`, 1.6, 2.4);
  const w = size * 0.62;
  const fillOuter = colors ? colors.edge : kit.ids.url('flame');
  const fillInner = colors ? colors.core : PALETTE.flameCore;
  return (
    <g className="ww-flame-group">
      {wick && <path d={`M${fmt(x)},${fmt(y + 2.6)}q0.4,-1.4 0,-2.8`} stroke={PALETTE.eyeInk} strokeWidth={1.1} fill="none" strokeLinecap="round" />}
      {halo && <circle cx={fmt(x)} cy={fmt(y - size * 0.45)} r={fmt(size * 0.95)} fill={kit.ids.url('flameHalo')} />}
      <g transform={lean ? `rotate(${fmt(lean)} ${fmt(x)} ${fmt(y)})` : undefined}>
        <g className={kit.animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': timing.duration, '--ww-delay': timing.delay })}>
          <path d={teardropPath(x, y, w, size)} fill={fillOuter} />
          <path d={teardropPath(x, y - size * 0.04, w * 0.5, size * 0.6)} fill={fillInner} opacity={0.95} />
        </g>
      </g>
    </g>
  );
}

/** Smoking wick stub (spent flame, smoldering). */
export function WickSmoke({ kit, x, y, salt = '' }: { kit: PieceKit; x: number; y: number; salt?: string }): ReactElement {
  const timing = animTiming(`${kit.seed}smoke${salt}`, 2.4, 3.4);
  return (
    <g>
      <g className={kit.animated ? 'ww-wisp' : undefined} style={cssVars({ '--ww-dur': timing.duration, '--ww-delay': timing.delay, '--ww-drift': '2px' })}>
        <path d={`M${fmt(x)},${fmt(y)}c-2,-2 2,-4 0,-6s2,-4 0,-6`} stroke={PALETTE.ashText} strokeOpacity={0.75} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

/* ----------------------------------------------------------------- eyes */

interface EyesProps {
  kit: PieceKit;
  x: number;
  y: number;
  gap?: number;
  size?: number;
  /** Draw one eye only (profile pieces). */
  single?: boolean;
  color?: string;
}

/** Two dark ovals that blink every 4–7 s and glance toward `kit.look` (§16.6 layer 6). */
export function Eyes({ kit, x, y, gap = 6, size = 1, single = false, color = PALETTE.eyeInk }: EyesProps): ReactElement {
  const timing = animTiming(`${kit.seed}blink`, 4, 7);
  const positions = single ? [x] : [x - gap / 2, x + gap / 2];
  const rx = 1.45 * size;
  const ry = 2.05 * size;
  const glance = `translate(${fmt(kit.look.x)}px, ${fmt(kit.look.y)}px)`;
  let content: ReactNode;
  switch (kit.eyes) {
    case 'happy':
      content = positions.map((ex, i) => (
        <path key={i} d={`M${fmt(ex - rx * 1.1)},${fmt(y + ry * 0.2)}q${fmt(rx * 1.1)},${fmt(-ry * 1.3)} ${fmt(rx * 2.2)},0`} stroke={color} strokeWidth={1.2 * size} fill="none" strokeLinecap="round" />
      ));
      break;
    case 'closed':
      content = positions.map((ex, i) => (
        <path key={i} d={`M${fmt(ex - rx * 1.1)},${fmt(y)}q${fmt(rx * 1.1)},${fmt(ry * 0.9)} ${fmt(rx * 2.2)},0`} stroke={color} strokeWidth={1.1 * size} fill="none" strokeLinecap="round" />
      ));
      break;
    case 'sleepy':
      content = positions.map((ex, i) => (
        <g key={i}>
          <path d={`M${fmt(ex - rx)},${fmt(y)}a${fmt(rx)},${fmt(ry * 0.75)} 0 0 0 ${fmt(rx * 2)},0Z`} fill={color} />
          <path d={`M${fmt(ex - rx * 1.25)},${fmt(y - 0.1)}h${fmt(rx * 2.5)}`} stroke={color} strokeWidth={0.9 * size} strokeLinecap="round" />
        </g>
      ));
      break;
    case 'dazed':
      content = positions.map((ex, i) => (
        <path key={i} d={spiralPath(ex, y, 1.6, rx * 1.35, 20, i * 2)} stroke={color} strokeWidth={0.85 * size} fill="none" strokeLinecap="round" />
      ));
      break;
    default:
      content = (
        <g className={kit.animated ? 'ww-blink' : undefined} style={cssVars({ '--ww-blink-dur': timing.duration, '--ww-blink-delay': timing.delay })}>
          {positions.map((ex, i) => (
            <g key={i}>
              <ellipse cx={fmt(ex)} cy={fmt(y)} rx={fmt(rx)} ry={fmt(ry)} fill={color} />
              <circle cx={fmt(ex - rx * 0.35)} cy={fmt(y - ry * 0.4)} r={fmt(rx * 0.42)} fill="#FFFFFF" opacity={0.85} />
            </g>
          ))}
        </g>
      );
  }
  return (
    <g className="ww-glance" style={{ transform: glance }}>
      {content}
    </g>
  );
}

/** Soft cheeks — a tiny touch of warmth on Wickfolk faces. */
export function Blush({ x, y, gap, color = '#FF9E7A' }: { x: number; y: number; gap: number; color?: string }): ReactElement {
  return (
    <g opacity={0.38}>
      <ellipse cx={fmt(x - gap / 2)} cy={fmt(y)} rx={1.9} ry={1.1} fill={color} />
      <ellipse cx={fmt(x + gap / 2)} cy={fmt(y)} rx={1.9} ry={1.1} fill={color} />
    </g>
  );
}

/** Snuff ember eyes: a soft red bloom with a hot core. `slant` tilts them into a scowl. */
export function EmberEyes({ kit, x, y, gap = 6, size = 1, slant = 12, single = false }: { kit: PieceKit; x: number; y: number; gap?: number; size?: number; slant?: number; single?: boolean }): ReactElement {
  const timing = animTiming(`${kit.seed}blink`, 4, 7);
  const positions = single ? [x] : [x - gap / 2, x + gap / 2];
  const dazed = kit.eyes === 'dazed';
  return (
    <g className="ww-glance" style={{ transform: `translate(${fmt(kit.look.x)}px, ${fmt(kit.look.y)}px)` }}>
      {positions.map((ex, i) => (
        <circle key={`g${i}`} cx={fmt(ex)} cy={fmt(y)} r={fmt(3.6 * size)} fill={kit.ids.url('ember')} />
      ))}
      <g className={kit.animated && !dazed ? 'ww-blink' : undefined} style={cssVars({ '--ww-blink-dur': timing.duration, '--ww-blink-delay': timing.delay })}>
        {positions.map((ex, i) => {
          const dir = single ? 0 : i === 0 ? 1 : -1;
          if (dazed) {
            return <path key={i} d={spiralPath(ex, y, 1.5, 2 * size, 18, i * 2)} stroke={PALETTE.snuffEye} strokeWidth={0.9} fill="none" />;
          }
          return (
            <g key={i} transform={`rotate(${fmt(dir * slant)} ${fmt(ex)} ${fmt(y)})`}>
              <ellipse cx={fmt(ex)} cy={fmt(y)} rx={fmt(1.9 * size)} ry={fmt(1.25 * size)} fill={PALETTE.snuffEye} />
              <ellipse cx={fmt(ex)} cy={fmt(y)} rx={fmt(0.9 * size)} ry={fmt(0.55 * size)} fill="#FFD7A8" />
            </g>
          );
        })}
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- smoke */

interface SmokeBodyProps {
  kit: PieceKit;
  /** Outline polygon (clockwise or counter-clockwise). */
  points: readonly Pt[];
  amplitude?: number;
  /** Salt for multi-part bodies so each part wobbles differently. */
  salt?: string;
  parts?: number;
  fill?: string;
  rim?: boolean;
}

/**
 * Snuff body: an outline wobbled by seeded noise once (pre-baked), filled with the
 * `snuff_body` gradient and a 2 px `snuff_rim` stroke (§16.6 layer 3).
 */
export function SmokeBody({ kit, points, amplitude = 1.7, salt = '', parts = 3, fill, rim = true }: SmokeBodyProps): ReactElement {
  const d = useMemo(
    () => smoothClosedPath(wobbleOutline(points, seededRandom(`${kit.seed}:${salt}`), amplitude, parts), 0.9),
    [kit.seed, salt, points, amplitude, parts],
  );
  return (
    <g>
      <path d={d} fill={fill ?? kit.ids.url('snuff')} />
      <path d={d} fill={kit.ids.url('snuffSheen')} />
      {rim && <path className="ww-outline" d={d} fill="none" stroke={PALETTE.snuffRim} strokeWidth={2} strokeLinejoin="round" strokeOpacity={0.95} />}
    </g>
  );
}

/** Cold under-glow ellipse beneath a Snuff (50 % `#6A4C9C`). */
export function UnderGlow({ kit, cx = 32, cy = 50, rx = 20, ry = 7 }: { kit: PieceKit; cx?: number; cy?: number; rx?: number; ry?: number }): ReactElement {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={kit.ids.url('underglow')} opacity={0.5} />;
}

/** Little smoke curls rising off a Snuff. Motion is transform/opacity only. */
export function Wisps({ kit, at }: { kit: PieceKit; at: readonly Pt[] }): ReactElement {
  return (
    <g className="ww-wisps">
      {at.map((p, i) => {
        const t = animTiming(`${kit.seed}wisp${i}`, 2.2, 3.6);
        const drift = (i % 2 === 0 ? 1 : -1) * (1.5 + (i % 3));
        return (
          <g key={i} className={kit.animated ? 'ww-wisp' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay, '--ww-drift': `${drift}px` })} opacity={kit.animated ? undefined : 0.5}>
            <path d={`M${fmt(p.x)},${fmt(p.y)}c-1.6,-1.2 -0.6,-3 0.8,-3.2c1.6,-0.2 1.8,-2 0.6,-2.6`} fill="none" stroke={PALETTE.moonsilver} strokeOpacity={0.55} strokeWidth={1.1} strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

/** Sparks that twinkle (Cinderling, embers). */
export function Sparks({ kit, at, color = PALETTE.candleGold }: { kit: PieceKit; at: readonly Pt[]; color?: string }): ReactElement {
  return (
    <g>
      {at.map((p, i) => {
        const t = animTiming(`${kit.seed}spark${i}`, 0.9, 1.7);
        return (
          <g key={i} className={kit.animated ? 'ww-twinkle' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
            <path d={`M${fmt(p.x)},${fmt(p.y - 1.8)}L${fmt(p.x + 0.5)},${fmt(p.y - 0.5)}L${fmt(p.x + 1.8)},${fmt(p.y)}L${fmt(p.x + 0.5)},${fmt(p.y + 0.5)}L${fmt(p.x)},${fmt(p.y + 1.8)}L${fmt(p.x - 0.5)},${fmt(p.y + 0.5)}L${fmt(p.x - 1.8)},${fmt(p.y)}L${fmt(p.x - 0.5)},${fmt(p.y - 0.5)}Z`} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

