/**
 * The Moth Die (§13.5, §16.9): a CSS 3D cube with moth-velvet faces and eyespot pips that
 * tumbles for 900 ms and lands on its face glyph. Change `rollId` to roll again; with
 * `reducedMotion` the result shows at once.
 */
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt, polygonPath, spiralPath, starPoints, teardropPath } from '../util/path';
import { cssVars, cx } from '../util/svg';
import '../art.css';
import './die.css';

export const MOTH_DIE_FACES = ['eclipse', 'smoke', 'stillness', 'long_shadows', 'kindling', 'bright_wings'] as const;
export type MothDieFaceId = (typeof MOTH_DIE_FACES)[number];

/** Effect labels shown in the top bar (§13.5). */
export const MOTH_DIE_LABELS: Readonly<Record<MothDieFaceId, string>> = {
  eclipse: 'Snuff hit +1',
  smoke: 'Extra Plume',
  stillness: 'Calm',
  long_shadows: 'Slow Snuff',
  kindling: '+1 Flame',
  bright_wings: 'Draw +1',
};

/** Face id for a 1-based die value; out-of-range values clamp. */
export function mothDieFace(value: number): MothDieFaceId {
  const i = Math.min(6, Math.max(1, Math.round(value))) - 1;
  return MOTH_DIE_FACES[i];
}

export function mothDieValue(face: string): number {
  const i = (MOTH_DIE_FACES as readonly string[]).indexOf(face);
  return i < 0 ? 3 : i + 1;
}

/** Bad (1–2) violet, neutral (3–4) ash, good (5–6) gold. */
function faceTone(value: number): string {
  if (value <= 2) return PALETTE.snuffRim;
  if (value <= 4) return PALETTE.moonsilver;
  return PALETTE.sunriseGold;
}

const INK = '#120C18';

/** Face glyph in a 48×48 box (also usable in the top bar). */
export function MothFaceShape({ face }: { face: string }): ReactElement {
  const tone = faceTone(mothDieValue(face));
  switch (face) {
    case 'eclipse':
      return (
        <g>
          <path d={polygonPath(starPoints(24, 22, 17, 13, 16))} fill={tone} opacity={0.75} />
          <circle cx={24} cy={22} r={12} fill={INK} stroke={tone} strokeWidth={1.6} />
          <circle cx={28} cy={19} r={10} fill="#2A2238" />
        </g>
      );
    case 'smoke':
      return (
        <g>
          <path d="M18,34C12,26 22,22 18,14C16,10 21,6 26,6C23,11 30,14 30,20C30,26 36,28 32,34Z" fill={PALETTE.plumeViolet} opacity={0.55} />
          <g transform="translate(0 33) scale(1 0.45) translate(0 -33)">
            <path d={spiralPath(24, 33, 2, 14, 40, 0)} fill="none" stroke={tone} strokeWidth={3} strokeLinecap="round" />
          </g>
        </g>
      );
    case 'stillness':
      return (
        <g>
          <path d={teardropPath(24, 26, 11, 20)} fill={tone} stroke={INK} strokeWidth={1.2} />
          <path d={teardropPath(24, 25, 5, 9)} fill="#FFFFFF" />
          <path d="M10,31H38M14,36H34M18,41H30" stroke={tone} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'long_shadows':
      return (
        <g>
          <path d="M20,34L42,42L40,46L18,38Z" fill={INK} opacity={0.85} stroke={tone} strokeWidth={0.8} />
          <rect x={16} y={14} width={8} height={21} rx={2} fill={tone} stroke={INK} strokeWidth={1.2} />
          <path d={teardropPath(20, 13, 5, 8)} fill={PALETTE.candleGold} />
          <circle cx={8} cy={32} r={4} fill={tone} opacity={0.6} />
          <path d="M4,36H44" stroke={tone} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case 'kindling':
      return (
        <g>
          <path d="M12,40L36,32M12,32L36,40" stroke="#8C6B4A" strokeWidth={4} strokeLinecap="round" />
          <path d={teardropPath(24, 35, 16, 27)} fill={PALETTE.ember} stroke={INK} strokeWidth={1.2} />
          <path d={teardropPath(24, 34, 9, 16)} fill={tone} />
          <path d={teardropPath(24, 33, 4, 7)} fill={PALETTE.flameCore} />
        </g>
      );
    case 'bright_wings':
      return (
        <g>
          <path d={polygonPath(starPoints(24, 23, 21, 16, 12))} fill={tone} opacity={0.35} />
          <path d="M23,22C19,10 8,6 5,13C3,19 11,24 22,25Z" fill={tone} stroke={INK} strokeWidth={1.2} />
          <path d="M25,22C29,10 40,6 43,13C45,19 37,24 26,25Z" fill={tone} stroke={INK} strokeWidth={1.2} />
          <path d="M22.4,27C16,30 11,37 15,40C18,43 22,36 23.6,29ZM25.6,27C32,30 37,37 33,40C30,43 26,36 24.4,29Z" fill={PALETTE.candleGold} stroke={INK} strokeWidth={1.2} />
          <circle cx={12.6} cy={15} r={3.4} fill={INK} />
          <circle cx={35.4} cy={15} r={3.4} fill={INK} />
          <circle cx={12.6} cy={15} r={1.5} fill={PALETTE.ember} />
          <circle cx={35.4} cy={15} r={1.5} fill={PALETTE.ember} />
          <ellipse cx={24} cy={26} rx={2.6} ry={10} fill={INK} />
        </g>
      );
    default:
      return <circle cx={24} cy={24} r={10} fill={tone} />;
  }
}

/** Eyespot pips (the face value) along the bottom edge of a face. */
function EyespotPips({ count, tone }: { count: number; tone: string }): ReactElement {
  const gap = 6.4;
  const x0 = 24 - ((count - 1) * gap) / 2;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <g key={i}>
          <circle cx={fmt(x0 + i * gap)} cy={44.2} r={2.6} fill={tone} />
          <circle cx={fmt(x0 + i * gap)} cy={44.2} r={1.6} fill={INK} />
          <circle cx={fmt(x0 + i * gap - 0.5)} cy={43.7} r={0.5} fill="#FFFFFF" />
        </g>
      ))}
    </g>
  );
}

function DieFaceSvg({ face }: { face: MothDieFaceId }): ReactElement {
  const value = mothDieValue(face);
  return (
    <svg className="ww-art ww-die-face-art" viewBox="0 0 48 48" width="100%" height="100%" aria-hidden>
      <g transform="translate(24 21) scale(0.86) translate(-24 -24)">
        <MothFaceShape face={face} />
      </g>
      <EyespotPips count={value} tone={faceTone(value)} />
    </svg>
  );
}

/** Final cube rotation (deg) that brings each face to the front. */
const FACE_ROTATION: Readonly<Record<MothDieFaceId, { x: number; y: number }>> = {
  eclipse: { x: 0, y: 0 },
  bright_wings: { x: 0, y: 180 },
  smoke: { x: 0, y: -90 },
  kindling: { x: 0, y: 90 },
  stillness: { x: -90, y: 0 },
  long_shadows: { x: 90, y: 0 },
};

/* Face placement on the cube lives in die.css (opposite faces sum to 7). */

export interface MothDieProps {
  /** Face value 1–6 (or use `face`). */
  value?: number;
  face?: MothDieFaceId;
  /** Change to replay the tumble. */
  rollId?: string | number;
  reducedMotion?: boolean;
  /** Cube edge in px. */
  size?: number;
  onLanded?: () => void;
  className?: string;
}

export function MothDie({ value, face, rollId, reducedMotion = false, size = 64, onLanded, className }: MothDieProps): ReactElement {
  const shown = face ?? mothDieFace(value ?? 3);
  const rot = FACE_ROTATION[shown];
  const style: CSSProperties = cssVars({ '--ww-die-size': `${size}px`, '--ww-die-rx': `${rot.x}deg`, '--ww-die-ry': `${rot.y}deg` });
  const rolling = rollId !== undefined && !reducedMotion;
  // With reduced motion the result shows at once, so report the landing immediately.
  const landedRef = useRef(onLanded);
  useEffect(() => {
    landedRef.current = onLanded;
  });
  useEffect(() => {
    if (rollId !== undefined && reducedMotion) landedRef.current?.();
  }, [rollId, reducedMotion]);
  return (
    <div className={cx('ww-die', className)} style={style} role="img" aria-label={`Moth Die: ${MOTH_DIE_LABELS[shown]}`}>
      <div className="ww-die-tilt">
        <div key={String(rollId ?? 'still')} className={cx('ww-die-cube', rolling && 'ww-die-rolling')} onAnimationEnd={rolling ? onLanded : undefined}>
          {MOTH_DIE_FACES.map((f) => (
            <div key={f} className={`ww-die-face ww-die-face--${f}`}>
              <DieFaceSvg face={f} />
            </div>
          ))}
        </div>
      </div>
      <div className="ww-die-shadow" />
    </div>
  );
}

/** Flat face glyph for HUD use (top-bar Omen slot). */
export function MothDieFaceIcon({ face, size = 32, title }: { face: string; size?: number; title?: string }): ReactElement {
  const label = title ?? (face in MOTH_DIE_LABELS ? MOTH_DIE_LABELS[face as MothDieFaceId] : face);
  return (
    <svg className="ww-art ww-icon" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={1} y={1} width={46} height={46} rx={9} fill="#2A1F2C" stroke={PALETTE.brass} strokeWidth={1.6} />
      <g transform="translate(24 24) scale(0.8) translate(-24 -24)">
        <MothFaceShape face={face} />
      </g>
    </svg>
  );
}
