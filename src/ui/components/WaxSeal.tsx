/**
 * A pressed wax seal: an irregular scalloped disc with a raised inner ring, used as the
 * medallion on menu buttons and as House markers on seat cards.
 */
import { useId, type ReactElement, type ReactNode } from 'react';
import { darken, lighten } from '../../art';

const SIZE = 40;
const CENTRE = SIZE / 2;

/** A stable 0..1 sequence from a string (no Math.random: seals must not change per render). */
function wobble(seed: string, i: number): number {
  let h = 2166136261;
  for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Closed, smoothed outline: `bumps` scallops with a little seeded irregularity. */
function sealOutline(radius: number, bumps: number, seed: string): string {
  const points: Array<[number, number]> = [];
  const steps = bumps * 2;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const scallop = i % 2 === 0 ? 1 : 0.9;
    const r = radius * scallop * (0.97 + wobble(seed, i) * 0.06);
    points.push([CENTRE + Math.cos(angle) * r, CENTRE + Math.sin(angle) * r]);
  }
  const mid = (a: [number, number], b: [number, number]): string => `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;
  let d = `M${mid(points[steps - 1], points[0])}`;
  for (let i = 0; i < steps; i++) {
    const p = points[i];
    d += `Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${mid(p, points[(i + 1) % steps])}`;
  }
  return `${d}Z`;
}

export interface WaxSealProps {
  /** Wax colour (hex). */
  color: string;
  /** Glyph drawn into the wax (inherits `ink` as currentColor). */
  children?: ReactNode;
  ink?: string;
  seed?: string;
  className?: string;
}

export function WaxSeal({ color, children, ink, seed = 'seal', className }: WaxSealProps): ReactElement {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradient = `ww-seal-${id}`;
  const outline = sealOutline(18.5, 9, seed);
  return (
    <span className={className ? `ww-seal ${className}` : 'ww-seal'} aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ww-seal__wax">
        <defs>
          <radialGradient id={gradient} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor={lighten(color, 0.28)} />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={darken(color, 0.38)} />
          </radialGradient>
        </defs>
        <path d={outline} transform="translate(0.8 1.4)" fill="#000" opacity={0.4} />
        <path d={outline} fill={`url(#${gradient})`} />
        <circle cx={CENTRE} cy={CENTRE} r={12.4} fill="none" stroke={darken(color, 0.3)} strokeWidth={1.6} opacity={0.75} />
        <circle cx={CENTRE} cy={CENTRE} r={11.2} fill="none" stroke={lighten(color, 0.35)} strokeWidth={0.7} opacity={0.6} />
        <ellipse cx={14} cy={11.5} rx={5} ry={2.4} fill="#FFFFFF" opacity={0.22} transform="rotate(-28 14 11.5)" />
      </svg>
      {children && (
        <span className="ww-seal__glyph" style={ink ? { color: ink } : undefined}>
          {children}
        </span>
      )}
    </span>
  );
}
