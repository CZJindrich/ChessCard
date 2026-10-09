/**
 * Sigil art window content: a dim stained-glass backdrop (seeded Voronoi cells), an
 * accent glow and rosette, then the card's glyphs composed by count:
 *   1 glyph → centred; 2 → second as a medallion over the first; 3+ → extra satellites.
 */
import { useMemo, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { mix } from '../util/color';
import { fmt, polygonPath, type Pt } from '../util/path';
import { seededRandom } from '../util/random';
import { cx, useSvgIds, type SvgIds } from '../util/svg';
import { scatterSites, voronoiCells } from '../util/voronoi';
import { rosettePath, SigilGlyph, sigilColors } from './sigils';
import '../art.css';

export interface SigilBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeSigil(sigil: readonly string[] | string | undefined): string[] {
  if (!sigil) return [];
  return (Array.isArray(sigil) ? sigil : [sigil]).filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/** Dark stained-glass backdrop for an art window. */
export function GlassBackdrop({ box, accent, seed, ids, cells = 22 }: { box: SigilBox; accent: string; seed: string; ids: SvgIds; cells?: number }): ReactElement {
  const glass = useMemo(() => {
    const bounds: Pt[] = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ];
    const rand = seededRandom(`${seed}glass`);
    const sites = scatterSites(bounds, cells, rand, Math.min(box.w, box.h) / 6);
    return voronoiCells(bounds, sites).map((cell, i) => ({
      d: polygonPath(cell),
      fill: mix(PALETTE.cryptPlum, i % 3 === 0 ? accent : PALETTE.velvetDusk, 0.12 + rand() * 0.22),
    }));
  }, [box.x, box.y, box.w, box.h, accent, seed, cells]);
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.6" />
          <stop offset="0.55" stopColor={accent} stopOpacity="0.16" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PALETTE.nightInk} />
      {glass.map((c, i) => (
        <path key={i} d={c.d} fill={c.fill} stroke="#0B0910" strokeWidth={1.6} strokeLinejoin="round" />
      ))}
      <ellipse cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w * 0.55} ry={box.h * 0.6} fill={ids.url('glow')} />
    </g>
  );
}

/** Compose sigil glyphs into `box`. */
export function SigilGlyphs({ sigil, accent, box }: { sigil: readonly string[]; accent: string; box: SigilBox }): ReactElement {
  const colors = sigilColors(accent);
  const size = Math.min(box.w, box.h) * 0.86;
  const cxp = box.x + box.w / 2;
  const cyp = box.y + box.h / 2;
  const place = (name: string, x: number, y: number, s: number, key: string): ReactElement => (
    <g key={key} transform={`translate(${fmt(x - s / 2)} ${fmt(y - s / 2)}) scale(${fmt(s / 100)})`}>
      <SigilGlyph name={name} colors={colors} />
    </g>
  );
  const names = sigil.length > 0 ? sigil : ['unknown'];
  const out: ReactElement[] = [];
  out.push(
    <path key="rosette" d={rosettePath(cxp, cyp, size * 0.52, 12)} fill="none" stroke={accent} strokeOpacity={0.35} strokeWidth={1.4} />,
  );
  out.push(place(names[0], cxp, cyp, size, 'main'));
  if (names.length >= 2) {
    const ms = size * 0.5;
    const mx = cxp + size * 0.28;
    const my = cyp + size * 0.22;
    out.push(<circle key="medal" cx={fmt(mx)} cy={fmt(my)} r={fmt(ms * 0.52)} fill={PALETTE.nightInk} stroke={accent} strokeWidth={1.8} />);
    out.push(place(names[1], mx, my, ms * 0.82, 'second'));
  }
  names.slice(2, 4).forEach((name, i) => {
    const s = size * 0.3;
    const sx = cxp + (i === 0 ? -1 : 1) * box.w * 0.36;
    const sy = box.y + s * 0.62;
    out.push(<circle key={`sd${i}`} cx={fmt(sx)} cy={fmt(sy)} r={fmt(s * 0.55)} fill={PALETTE.nightInk} stroke={accent} strokeOpacity={0.7} strokeWidth={1.2} />);
    out.push(place(name, sx, sy, s * 0.85, `sat${i}`));
  });
  return <g className="ww-sigil">{out}</g>;
}

export interface SigilIconProps {
  sigil: readonly string[] | string;
  accent?: string;
  size?: number;
  /** Include the stained-glass backdrop. */
  backdrop?: boolean;
  seed?: string;
  title?: string;
  className?: string;
}

/** Standalone sigil (Codex, toasts, Toll cards). */
export function SigilIcon({ sigil, accent = PALETTE.candleGold, size = 64, backdrop = true, seed, title, className }: SigilIconProps): ReactElement {
  const ids = useSvgIds('sig');
  const names = normalizeSigil(sigil);
  const box = { x: 0, y: 0, w: 100, h: 100 };
  return (
    <svg className={cx('ww-art ww-sigil-icon', className)} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? names.join(' ')}>
      {backdrop && (
        <>
          <clipPath id={ids.id('clip')}>
            <circle cx={50} cy={50} r={48} />
          </clipPath>
          <g clipPath={ids.url('clip')}>
            <GlassBackdrop box={box} accent={accent} seed={seed ?? names.join('-')} ids={ids} cells={14} />
          </g>
          <circle cx={50} cy={50} r={48} fill="none" stroke={PALETTE.brass} strokeWidth={2.4} />
        </>
      )}
      <SigilGlyphs sigil={names} accent={accent} box={{ x: 10, y: 10, w: 80, h: 80 }} />
    </svg>
  );
}
