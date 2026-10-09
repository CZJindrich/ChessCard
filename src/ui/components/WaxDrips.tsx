/**
 * Wax drips along the top edge of a panel (GDD §16.4). One drip tile (a wavy band of wax
 * with drips of different lengths, each ending in a bead) repeats as an SVG pattern, so drips
 * keep their shape at any width; `offset` shifts the tile so neighbouring panels differ.
 */
import { useId, type ReactElement } from 'react';

const TILE_W = 240;
const TILE_H = 24;

/** Band thickness at x: a gentle wave that repeats exactly once per tile. */
function bandAt(x: number): number {
  const t = (x / TILE_W) * Math.PI * 2;
  return 3.4 + 0.9 * Math.sin(3 * t) + 0.5 * Math.sin(7 * t + 1);
}

/** [x, length, width] of each drip in one tile. */
const DRIPS: ReadonlyArray<readonly [number, number, number]> = [
  [12, 9, 5],
  [31, 4, 3.6],
  [52, 15, 6.4],
  [78, 6, 4.4],
  [101, 18, 7],
  [129, 5, 4],
  [151, 11, 5.6],
  [181, 7, 4.6],
  [212, 14, 6],
];

const f = (n: number): string => n.toFixed(2);

function bandPath(): string {
  let d = `M0,0H${TILE_W}V${f(bandAt(TILE_W))}`;
  for (let x = TILE_W - 8; x >= 0; x -= 8) d += `L${x},${f(bandAt(x))}`;
  return `${d}Z`;
}

/** A drip: shoulders that melt out of the band, a neck, and a round bead at the end. */
function dripPath(x: number, length: number, width: number): string {
  const top = bandAt(x) - 0.8;
  const neck = width * 0.36;
  const bead = width * 0.5;
  const end = top + length;
  return (
    `M${f(x - width - 1.5)},${f(top)}` +
    `C${f(x - neck)},${f(top)} ${f(x - neck)},${f(top + 2)} ${f(x - neck)},${f(top + 4)}` +
    `L${f(x - neck)},${f(end - bead * 1.4)}` +
    `C${f(x - bead)},${f(end - bead)} ${f(x - bead)},${f(end)} ${f(x)},${f(end)}` +
    `C${f(x + bead)},${f(end)} ${f(x + bead)},${f(end - bead)} ${f(x + neck)},${f(end - bead * 1.4)}` +
    `L${f(x + neck)},${f(top + 4)}` +
    `C${f(x + neck)},${f(top + 2)} ${f(x + neck)},${f(top)} ${f(x + width + 1.5)},${f(top)}Z`
  );
}

const DRIPS_PATH = [bandPath(), ...DRIPS.map(([x, l, w]) => dripPath(x, l, w))].join('');

/** Small glints on the beads (wax catches the candlelight). */
const GLINTS = DRIPS.filter(([, l]) => l >= 9).map(([x, l, w]) => ({ cx: x - w * 0.14, cy: bandAt(x) - 0.8 + l - w * 0.3, r: Math.max(0.8, w * 0.13) }));

export type DripTone = 'tallow' | 'gold' | 'plum' | 'seal';

const TONES: Readonly<Record<DripTone, readonly [string, string, string]>> = {
  tallow: ['#F6EEDA', '#DCCDA8', '#A99872'],
  gold: ['#FFE08A', '#F4B942', '#B07818'],
  plum: ['#554B6E', '#3E3754', '#2A2238'],
  seal: ['#B83A3F', '#8E2228', '#5A1418'],
};

export interface WaxDripsProps {
  tone?: DripTone;
  /** Horizontal shift of the drip tile in px. */
  offset?: number;
  className?: string;
}

export function WaxDrips({ tone = 'tallow', offset = 0, className }: WaxDripsProps): ReactElement {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [top, mid, bottom] = TONES[tone];
  return (
    <svg className={className ? `ww-drips ${className}` : 'ww-drips'} height={TILE_H} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2={TILE_H} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={top} />
          <stop offset="0.28" stopColor={mid} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <pattern id={`p${id}`} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse" x={offset % TILE_W}>
          <path d={DRIPS_PATH} fill="#000" opacity={0.35} transform="translate(0.6 1.3)" />
          <path d={DRIPS_PATH} fill={`url(#g${id})`} />
          {GLINTS.map((g) => (
            <circle key={g.cx} cx={f(g.cx)} cy={f(g.cy)} r={f(g.r)} fill="#FFFFFF" opacity={0.45} />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height={TILE_H} fill={`url(#p${id})`} />
    </svg>
  );
}
