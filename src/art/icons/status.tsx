/**
 * Status glyphs (GDD §6.5, §16.2 colour-blind shapes): Ward = hexagon, Burn = flame,
 * Dazed = spiral. Glyphs are bare `<g>`s centred on (x, y); `StatusIcon` wraps one in an `<svg>`.
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt, polygonPath, regularPolygon, spiralPath, teardropPath } from '../util/path';
import { cx } from '../util/svg';
import '../art.css';

export const STATUS_IDS = ['ward', 'burn', 'dazed'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const STATUS_NAMES: Readonly<Record<StatusId, string>> = {
  ward: 'Ward',
  burn: 'Burn',
  dazed: 'Dazed',
};

interface GlyphProps {
  x: number;
  y: number;
  /** Badge radius. */
  r: number;
}

export function WardGlyph({ x, y, r }: GlyphProps): ReactElement {
  return (
    <g>
      <path d={polygonPath(regularPolygon(x, y, r, 6, 0))} fill={PALETTE.moonmoth} stroke="#EAFBFF" strokeWidth={r * 0.14} strokeLinejoin="round" />
      <path d={polygonPath(regularPolygon(x, y, r * 0.58, 6, 0))} fill="none" stroke="#2E6E80" strokeWidth={r * 0.13} strokeLinejoin="round" />
      <path d={polygonPath(regularPolygon(x - r * 0.18, y - r * 0.2, r * 0.22, 6, 0))} fill="#FFFFFF" opacity={0.75} />
    </g>
  );
}

export function BurnGlyph({ x, y, r, count }: GlyphProps & { count?: number }): ReactElement {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#3A1A10" stroke={PALETTE.ember} strokeWidth={r * 0.16} />
      <path d={teardropPath(x, y + r * 0.62, r * 0.95, r * 1.35)} fill={PALETTE.ember} />
      <path d={teardropPath(x, y + r * 0.6, r * 0.48, r * 0.72)} fill={PALETTE.flameCore} />
      {count !== undefined && (
        <text className="ww-num ww-halo-text" x={fmt(x + r * 0.78)} y={fmt(y + r * 0.95)} fontSize={fmt(r * 0.95)} textAnchor="middle" fill={PALETTE.flameCore} stroke="#3A1A10" strokeWidth={r * 0.28}>
          {count}
        </text>
      )}
    </g>
  );
}

export function DazedGlyph({ x, y, r }: GlyphProps): ReactElement {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#2A2238" stroke={PALETTE.mothSilver} strokeWidth={r * 0.14} />
      <path d={spiralPath(x, y, 2.2, r * 0.72, 32, 0)} fill="none" stroke={PALETTE.mothSilver} strokeWidth={r * 0.16} strokeLinecap="round" />
    </g>
  );
}

export function StatusGlyph({ id, x, y, r, count }: GlyphProps & { id: string; count?: number }): ReactElement {
  switch (id) {
    case 'ward':
      return <WardGlyph x={x} y={y} r={r} />;
    case 'burn':
      return <BurnGlyph x={x} y={y} r={r} count={count} />;
    case 'dazed':
      return <DazedGlyph x={x} y={y} r={r} />;
    default:
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill="#2A2238" stroke={PALETTE.ashText} strokeWidth={r * 0.14} />
          <circle cx={x} cy={y} r={r * 0.3} fill={PALETTE.ashText} />
        </g>
      );
  }
}

export interface StatusIconProps {
  id: string;
  size?: number;
  count?: number;
  title?: string;
  className?: string;
}

export function StatusIcon({ id, size = 24, count, title, className }: StatusIconProps): ReactElement {
  const label = title ?? (id in STATUS_NAMES ? STATUS_NAMES[id as StatusId] : id);
  return (
    <svg className={cx('ww-art ww-status-icon', className)} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      <StatusGlyph id={id} x={12} y={12} r={10.4} count={count} />
    </svg>
  );
}
