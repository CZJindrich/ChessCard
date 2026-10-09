/** Shared boss-art plumbing: the 3×3-tile art box over a 2×2 footprint (GDD §16.8). */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt } from '../util/path';
import type { SvgIds } from '../util/svg';

/**
 * Boss art lives in a 192×192 box (3 tiles at 64) whose user space puts the 2×2
 * footprint at x 0..128, y 0..128. The art box therefore starts half a tile left of
 * the footprint and one tile above it.
 */
export const BOSS_VIEWBOX = '-32 -64 192 192';
export const BOSS_BOX = { x: -32, y: -64, size: 192 } as const;

/**
 * Where to place the boss `<svg>` relative to the footprint's top-left corner, for a
 * given tile size in px: `left = footprintLeft + offsetX`, `top = footprintTop + offsetY`.
 */
export function bossArtPlacement(tileSize: number): { offsetX: number; offsetY: number; size: number } {
  return { offsetX: -tileSize / 2, offsetY: -tileSize, size: tileSize * 3 };
}

export interface BossKit {
  ids: SvgIds;
  animated: boolean;
  seed: string;
  phase: 1 | 2 | 3;
}

export function GroundShadow({ ids, rx = 78 }: { ids: SvgIds; rx?: number }): ReactElement {
  return <ellipse cx={64} cy={118} rx={rx} ry={rx * 0.2} fill={ids.url('shadow')} />;
}

export function BossDefs({ ids }: { ids: SvgIds }): ReactElement {
  return (
    <>
      <radialGradient id={ids.id('shadow')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#000" stopOpacity="0.65" />
        <stop offset="0.7" stopColor="#000" stopOpacity="0.3" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.id('snuff')} x1="0.3" y1="0" x2="0.5" y2="1">
        <stop offset="0" stopColor={PALETTE.snuffBodyTop} />
        <stop offset="1" stopColor={PALETTE.snuffBodyBottom} />
      </linearGradient>
      <radialGradient id={ids.id('ember')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={PALETTE.snuffEye} stopOpacity="0.9" />
        <stop offset="1" stopColor={PALETTE.snuffEye} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.id('brass')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F1D58A" />
        <stop offset="0.45" stopColor={PALETTE.brass} />
        <stop offset="1" stopColor="#6E5320" />
      </linearGradient>
    </>
  );
}

/** Large ember eye: red bloom plus an almond slit. */
export function BossEye({ ids, x, y, w, tilt, lid = 0 }: { ids: SvgIds; x: number; y: number; w: number; tilt: number; lid?: number }): ReactElement {
  const h = w * 0.42 * (1 - lid);
  return (
    <g>
      <circle cx={x} cy={y} r={w * 1.2} fill={ids.url('ember')} opacity={0.55} />
      <g transform={`rotate(${fmt(tilt)} ${fmt(x)} ${fmt(y)})`}>
        <path d={`M${fmt(x - w)},${fmt(y)}Q${fmt(x)},${fmt(y - h * 2)} ${fmt(x + w)},${fmt(y)}Q${fmt(x)},${fmt(y + h * 1.4)} ${fmt(x - w)},${fmt(y)}Z`} fill={PALETTE.snuffEye} />
        <ellipse cx={x} cy={y - h * 0.15} rx={w * 0.35} ry={Math.max(0.6, h * 0.45)} fill="#FFD7A8" />
      </g>
    </g>
  );
}
