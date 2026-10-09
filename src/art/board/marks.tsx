/**
 * Board highlight marks (§15.5, §16.2 colour-blind shapes). All are `<g>`s in a 64×64
 * tile box: intents (red fill + hatching + ✕), push arrows, move dots, strike rings with a
 * sword tick, damage badges and the lethal skull. Red (`blood_wax`) is used only for
 * Snuff threats and incoming damage.
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt, spiralPath, teardropPath } from '../util/path';
import { cx, useSvgIds } from '../util/svg';
import '../art.css';

interface At {
  x?: number;
  y?: number;
}

function at(x = 0, y = 0): string | undefined {
  return x || y ? `translate(${fmt(x)} ${fmt(y)})` : undefined;
}

export type Dir = { dx: number; dy: number };

/** White push arrow from the tile centre toward `dir`, with an optional "bump 1" badge. */
export function PushArrow({ x, y, dir, bump = false }: At & { dir: Dir; bump?: boolean }): ReactElement {
  const len = Math.hypot(dir.dx, dir.dy) || 1;
  const ux = dir.dx / len;
  const uy = dir.dy / len;
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  return (
    <g transform={at(x, y)} className="ww-push">
      <g transform={`rotate(${fmt(angle)} 32 32)`}>
        <path d="M30,28H48V22L60,32L48,42V36H30Z" fill="#FFFFFF" stroke="#0D0B12" strokeWidth={1.6} strokeLinejoin="round" />
      </g>
      {bump && (
        <g>
          <rect x={14} y={46} width={36} height={13} rx={6.5} fill="#FFFFFF" stroke="#0D0B12" strokeWidth={1.2} />
          <text className="ww-num" x={32} y={56} fontSize={9} textAnchor="middle" fill="#0D0B12">
            bump 1
          </text>
        </g>
      )}
    </g>
  );
}

export interface IntentTileProps extends At {
  /** Damage this tile will take. */
  damage?: number;
  /** Queue position (1, 2, 3 …) shown in Cinzel. */
  queue?: number;
  /** Push direction for push arrows. */
  push?: Dir;
  animated?: boolean;
}

/** Locked Snuff intent: red 40 % fill, diagonal hatching, ✕, damage number (§15.5). */
export function IntentTile({ x, y, damage, queue, push, animated = true }: IntentTileProps): ReactElement {
  const ids = useSvgIds('intent');
  return (
    <g transform={at(x, y)} className="ww-intent">
      <defs>
        <pattern id={ids.id('hatch')} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0,0V7" stroke={PALETTE.bloodWax} strokeWidth={2} />
        </pattern>
      </defs>
      <g className={animated ? 'ww-intent-pulse' : undefined}>
        <rect x={1} y={1} width={62} height={62} fill={PALETTE.bloodWax} opacity={0.4} />
        <rect x={1} y={1} width={62} height={62} fill={ids.url('hatch')} opacity={0.75} />
        <rect x={2} y={2} width={60} height={60} fill="none" stroke={PALETTE.bloodWax} strokeWidth={2.4} />
      </g>
      <path d="M22,22L42,42M42,22L22,42" stroke="#0D0B12" strokeWidth={7} strokeLinecap="round" />
      <path d="M22,22L42,42M42,22L22,42" stroke={PALETTE.bloodWax} strokeWidth={4} strokeLinecap="round" />
      {damage !== undefined && (
        <text className="ww-num ww-halo-text" x={54} y={60} fontSize={15} textAnchor="middle" fill="#FFFFFF" stroke="#5A0E10" strokeWidth={3.4}>
          {damage}
        </text>
      )}
      {queue !== undefined && (
        <g>
          <circle cx={11} cy={11} r={8} fill="#0D0B12" stroke={PALETTE.bloodWax} strokeWidth={1.6} />
          <text className="ww-num" x={11} y={15} fontSize={11} textAnchor="middle" fill={PALETTE.tallowText}>
            {queue}
          </text>
        </g>
      )}
      {push && <PushArrow dir={push} />}
    </g>
  );
}

export interface MoveDotProps extends At {
  /** Incoming damage if the piece ends here (adds a "!" badge). */
  danger?: number;
  chimney?: boolean;
  hotWax?: boolean;
}

/** Gold move dot (§15.5) with its danger / Chimney / Hot Wax variants. */
export function MoveDot({ x, y, danger, chimney = false, hotWax = false }: MoveDotProps): ReactElement {
  return (
    <g transform={at(x, y)} className="ww-move-dot">
      <circle cx={32} cy={32} r={9} fill={PALETTE.candleGold} opacity={0.22} />
      <circle cx={32} cy={32} r={6} fill={PALETTE.candleGold} stroke="#5E4314" strokeWidth={1.2} />
      <circle cx={30.4} cy={30.4} r={1.8} fill={PALETTE.flameCore} />
      {chimney && <path d={spiralPath(32, 32, 1.6, 13, 32, 0)} stroke={PALETTE.candleGold} strokeWidth={1.6} fill="none" strokeLinecap="round" />}
      {danger !== undefined && (
        <g>
          <path d="M50,4L61,23H39Z" fill={PALETTE.bloodWax} stroke="#0D0B12" strokeWidth={1.4} strokeLinejoin="round" />
          <text className="ww-num" x={50} y={20.6} fontSize={12} textAnchor="middle" fill="#FFFFFF">
            !
          </text>
        </g>
      )}
      {hotWax && (
        <g>
          <path d={teardropPath(13, 60, 13, 16)} fill={PALETTE.tileHotWaxTop} stroke="#0D0B12" strokeWidth={1.2} />
          <text className="ww-num" x={13} y={57.4} fontSize={8} textAnchor="middle" fill="#2B1A10">
            −1
          </text>
        </g>
      )}
    </g>
  );
}

/** Player damage badge in `flame_core` ("−2"). */
export function DamageBadge({ x = 0, y = 0, amount }: { x?: number; y?: number; amount: number }): ReactElement {
  return (
    <g transform={at(x, y)} className="ww-damage-badge">
      <rect x={38} y={2} width={24} height={15} rx={7.5} fill={PALETTE.flameCore} stroke="#5E4314" strokeWidth={1.2} />
      <text className="ww-num" x={50} y={13.6} fontSize={11} textAnchor="middle" fill="#2B1A10">
        −{amount}
      </text>
    </g>
  );
}

/** Skull lethal badge (a strike would kill). */
export function SkullBadge({ x = 0, y = 0, cxp = 12, cyp = 12, r = 9 }: { x?: number; y?: number; cxp?: number; cyp?: number; r?: number }): ReactElement {
  const k = r / 9;
  const T = (px: number, py: number): string => `${fmt(cxp + px * k)},${fmt(cyp + py * k)}`;
  return (
    <g transform={at(x, y)} className="ww-skull">
      <circle cx={cxp} cy={cyp} r={r} fill="#0D0B12" stroke={PALETTE.flameCore} strokeWidth={1.2 * k} />
      <path d={`M${T(-5, 1)}C${T(-5, -6)} ${T(5, -6)} ${T(5, 1)}C${T(5, 3)} ${T(3.4, 3.6)} ${T(3, 4.2)}V${T(3, 5.8)}H${T(-3, 5.8)}V${T(-3, 4.2)}C${T(-3.4, 3.6)} ${T(-5, 3)} ${T(-5, 1)}Z`} fill={PALETTE.flameCore} />
      <circle cx={cxp - 2.1 * k} cy={cyp + 0.4 * k} r={1.5 * k} fill="#0D0B12" />
      <circle cx={cxp + 2.1 * k} cy={cyp + 0.4 * k} r={1.5 * k} fill="#0D0B12" />
      <path d={`M${T(-1.2, 5.8)}V${T(-1.2, 4.6)}M${T(1.2, 5.8)}V${T(1.2, 4.6)}`} stroke="#0D0B12" strokeWidth={0.8 * k} />
    </g>
  );
}

export interface StrikeRingProps extends At {
  damage?: number;
  lethal?: boolean;
}

/** Gold strike ring with a sword tick (§15.5), damage badge and lethal skull. */
export function StrikeRing({ x, y, damage, lethal = false }: StrikeRingProps): ReactElement {
  return (
    <g transform={at(x, y)} className={cx('ww-strike-ring', lethal && 'ww-lethal')}>
      <circle cx={32} cy={34} r={25} fill="none" stroke="#0D0B12" strokeWidth={5} opacity={0.6} />
      <circle cx={32} cy={34} r={25} fill="none" stroke={PALETTE.candleGold} strokeWidth={3} />
      {/* sword tick at the top of the ring */}
      <g transform="translate(32 8)">
        <path d="M-1.6,4L0,-6L1.6,4Z" fill={PALETTE.flameCore} stroke="#5E4314" strokeWidth={0.8} />
        <rect x={-4.6} y={3.6} width={9.2} height={2.2} rx={1} fill={PALETTE.candleGold} stroke="#5E4314" strokeWidth={0.6} />
        <rect x={-1} y={5.8} width={2} height={4} fill="#5E4314" />
      </g>
      {damage !== undefined && <DamageBadge amount={damage} />}
      {lethal && <SkullBadge cxp={12} cyp={12} r={9} />}
    </g>
  );
}
