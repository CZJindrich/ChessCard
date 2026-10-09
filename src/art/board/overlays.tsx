/**
 * Tile overlays and board tokens (§5.4, §9.4, §15.5, §16.5): Gloam fog, the Gloam
 * warning band, Smoke Plumes (violet spiral + ghost of the stored enemy + 1-HP drop)
 * and the Lit Shrine token. Each is a `<g>` in a 64×64 tile box plus an `<svg>` wrapper.
 */
import type { ReactElement, ReactNode } from 'react';
import { PALETTE } from '../palette';
import { PieceGraphic } from '../pieces/PieceArt';
import { fmt, spiralPath, teardropPath } from '../util/path';
import { animTiming, cssVars, cx, useSvgIds } from '../util/svg';
import '../art.css';

interface OverlayProps {
  x?: number;
  y?: number;
  seed?: string;
  animated?: boolean;
}

function at(x: number, y: number): string | undefined {
  return x || y ? `translate(${fmt(x)} ${fmt(y)})` : undefined;
}

/** Gloam: violet zone fog with drifting soft blobs (transform/opacity only). */
export function GloamFog({ x = 0, y = 0, seed = 'gloam', animated = true }: OverlayProps): ReactElement {
  const ids = useSvgIds('gloam');
  const blobs: Array<[number, number, number]> = [
    [18, 20, 18],
    [46, 30, 20],
    [26, 48, 16],
  ];
  return (
    <g transform={at(x, y)} className="ww-gloam">
      <defs>
        <radialGradient id={ids.id('blob')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.gloamBand} stopOpacity="0.55" />
          <stop offset="1" stopColor={PALETTE.gloamFog} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={64} height={64} fill={PALETTE.gloamFog} opacity={0.62} />
      {blobs.map(([bx, by, r], i) => {
        const t = animTiming(`${seed}fog${i}`, 7, 11);
        return (
          <g key={i} className={animated ? 'ww-fog-drift' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
            <circle cx={bx} cy={by} r={r} fill={ids.url('blob')} />
          </g>
        );
      })}
    </g>
  );
}

/** Gloam warning: a pulsing hatched band on the ring that closes at this round's Tally. */
export function GloamWarningBand({ x = 0, y = 0, animated = true }: OverlayProps): ReactElement {
  const ids = useSvgIds('gwarn');
  return (
    <g transform={at(x, y)} className="ww-gloam-warning">
      <defs>
        <pattern id={ids.id('hatch')} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width={8} height={8} fill="none" />
          <path d="M0,0V8" stroke={PALETTE.gloamBand} strokeWidth={3} />
        </pattern>
      </defs>
      <g className={animated ? 'ww-band-pulse' : undefined}>
        <rect x={1} y={1} width={62} height={62} fill={ids.url('hatch')} />
        <rect x={2} y={2} width={60} height={60} fill="none" stroke={PALETTE.gloamBand} strokeWidth={2} strokeDasharray="6 4" />
      </g>
    </g>
  );
}

interface PlumeProps extends OverlayProps {
  /** Enemy stored in the Plume (§9.4); its ghost floats in the smoke. */
  enemyId?: string;
}

/** Smoke Plume: a violet spiral with a ghost of the stored enemy and a 1-HP drop. */
export function SmokePlumeToken({ x = 0, y = 0, seed = 'plume', animated = true, enemyId = 'sootling' }: PlumeProps): ReactElement {
  const ids = useSvgIds('plume');
  const t = animTiming(`${seed}rise`, 2.6, 3.4);
  return (
    <g transform={at(x, y)} className="ww-plume">
      <defs>
        <radialGradient id={ids.id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.plumeViolet} stopOpacity="0.55" />
          <stop offset="1" stopColor={PALETTE.plumeViolet} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={32} cy={46} rx={28} ry={14} fill={ids.url('glow')} />
      <g transform="translate(0 46) scale(1 0.42) translate(0 -46)">
        <g className={animated ? 'ww-spin' : undefined} style={cssVars({ '--ww-dur': '5s' })}>
          <path d={spiralPath(32, 46, 2.2, 24, 56, 0)} stroke={PALETTE.plumeViolet} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <path d={spiralPath(32, 46, 2.2, 24, 56, Math.PI)} stroke="#C9A8FF" strokeOpacity={0.6} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </g>
      </g>
      <g className={animated ? 'ww-plume-rise' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
        <path d="M22,46C18,34 28,30 24,20C22,14 28,8 34,8C30,14 38,18 38,26C38,32 44,36 42,46Z" fill={PALETTE.plumeViolet} opacity={0.22} />
        <g opacity={0.5} transform="translate(32 46) scale(0.72) translate(-32 -50)">
          <PieceGraphic defId={enemyId} side="snuff" kind="enemy" bare animated={false} seed={`${seed}ghost`} />
        </g>
      </g>
      <g className="ww-plume-hp">
        <path d={teardropPath(9, 61, 10, 13)} fill="#E4DDF6" stroke="#2B1A10" strokeWidth={0.9} />
        <text className="ww-num" x={9} y={58.6} fontSize={8} textAnchor="middle" fill="#2B1A10">
          1
        </text>
      </g>
    </g>
  );
}

/** Lit Shrine token: a verdigris flame in a ring (Codex, tooltips, Last Flame Glory). */
export function LitShrineGlyph({ x = 0, y = 0 }: { x?: number; y?: number }): ReactElement {
  return (
    <g transform={at(x, y)}>
      <circle cx={32} cy={32} r={26} fill="#10241F" stroke={PALETTE.verdigris} strokeWidth={3} />
      <circle cx={32} cy={32} r={21} fill="none" stroke={PALETTE.verdigris} strokeOpacity={0.4} strokeWidth={1.4} strokeDasharray="3 3" />
      <path d={teardropPath(32, 42, 15, 24)} fill={PALETTE.verdigris} />
      <path d={teardropPath(32, 41, 8, 13)} fill="#CFFBEF" />
      <rect x={26} y={41} width={12} height={9} rx={2} fill="#F1E6CB" />
    </g>
  );
}

/** Wrap any 64×64 overlay in its own `<svg>`. */
export function TileOverlaySvg({ size = 64, children, title, className, animated = true }: { size?: number; children: ReactNode; title: string; className?: string; animated?: boolean }): ReactElement {
  return (
    <svg className={cx('ww-art ww-overlay', !animated && 'ww-still', className)} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      {children}
    </svg>
  );
}
