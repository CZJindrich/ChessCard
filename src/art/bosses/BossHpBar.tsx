/**
 * Per-boss HP bars (§16.8) with phase notches at ⌊2/3⌋ and ⌊1/3⌋ of max HP:
 * a bell rope (Hierophant), a crown band with 3 sockets (King), a wing-vein bar (Nocturna).
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt } from '../util/path';
import { cx, useSvgIds } from '../util/svg';
import '../art.css';

export interface BossHpBarProps {
  bossId: string;
  hp: number;
  maxHp: number;
  /** Guttered King crown sockets filled (0–3). */
  crowns?: number;
  width?: number;
  className?: string;
}

/** Phase thresholds as fractions of max HP (GDD §10.1). */
export function phaseNotches(maxHp: number): number[] {
  if (maxHp <= 0) return [];
  return [Math.floor((maxHp * 2) / 3) / maxHp, Math.floor(maxHp / 3) / maxHp];
}

const W = 400;
const H = 36;
const BAR = { x: 14, y: 10, w: 372, h: 16 };

interface Style {
  fill: string;
  fillHi: string;
  track: string;
  rim: string;
}

const STYLES: Record<string, Style> = {
  hush_hierophant: { fill: '#C2321F', fillHi: '#FF9A4A', track: '#1E1A26', rim: '#5A5468' },
  guttered_king: { fill: PALETTE.moonfire, fillHi: '#EAF7FF', track: '#2A1E10', rim: PALETTE.brass },
  nocturna: { fill: PALETTE.moonsilver, fillHi: '#FFFFFF', track: '#1A1424', rim: PALETTE.mothSilver },
};

export function BossHpBar({ bossId, hp, maxHp, crowns = 0, width = 400, className }: BossHpBarProps): ReactElement {
  const ids = useSvgIds('bhp');
  const style = STYLES[bossId] ?? { fill: PALETTE.snuffRim, fillHi: PALETTE.moonsilver, track: '#1A1424', rim: PALETTE.snuffBodyTop };
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const fillW = BAR.w * ratio;
  const height = (width / W) * H;
  return (
    <svg className={cx('ww-art ww-boss-hp', className)} width={width} height={height} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Boss HP ${hp} of ${maxHp}`}>
      <defs>
        <linearGradient id={ids.id('fill')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={style.fillHi} />
          <stop offset="0.5" stopColor={style.fill} />
          <stop offset="1" stopColor={style.fill} stopOpacity="0.75" />
        </linearGradient>
        <clipPath id={ids.id('clip')}>
          <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.h / 2} />
        </clipPath>
        <pattern id={ids.id('rope')} width="10" height="16" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">
          <rect width="10" height="16" fill="none" />
          <path d="M0,0V16" stroke="#000" strokeOpacity="0.35" strokeWidth="2.4" />
        </pattern>
      </defs>
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.h / 2} fill={style.track} />
      <g clipPath={ids.url('clip')}>
        <rect x={BAR.x} y={BAR.y} width={fmt(fillW)} height={BAR.h} fill={ids.url('fill')} />
        {bossId === 'hush_hierophant' && <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} fill={ids.url('rope')} />}
        {bossId === 'nocturna' && (
          <path
            d={`M${BAR.x},${BAR.y + 8}C80,4 120,14 180,8S300,4 ${BAR.x + BAR.w},${BAR.y + 6}M60,${BAR.y}L80,${BAR.y + 8}M140,${BAR.y + 16}L160,${BAR.y + 8}M240,${BAR.y}L262,${BAR.y + 8}M320,${BAR.y + 16}L338,${BAR.y + 8}`}
            stroke="#1A1424"
            strokeOpacity={0.55}
            strokeWidth={1.4}
            fill="none"
          />
        )}
      </g>
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.h / 2} fill="none" stroke={style.rim} strokeWidth={2} />
      {phaseNotches(maxHp).map((f, i) => {
        const x = BAR.x + BAR.w * f;
        return (
          <g key={i}>
            <path d={`M${fmt(x)},${BAR.y - 4}V${BAR.y + BAR.h + 4}`} stroke={PALETTE.tallowText} strokeWidth={2} />
            <path d={`M${fmt(x - 4)},${BAR.y - 6}H${fmt(x + 4)}L${fmt(x)},${BAR.y - 1}Z`} fill={PALETTE.tallowText} />
          </g>
        );
      })}
      {bossId === 'hush_hierophant' && <path d={`M${BAR.x},${BAR.y + BAR.h / 2}H4`} stroke={style.rim} strokeWidth={3} strokeLinecap="round" />}
      {bossId === 'guttered_king' &&
        [0, 1, 2].map((i) => {
          const x = BAR.x + BAR.w - 16 - (2 - i) * 20;
          return (
            <g key={i}>
              <circle cx={x} cy={BAR.y + BAR.h / 2} r={7} fill="#2A1E10" stroke={PALETTE.brass} strokeWidth={1.6} />
              {i < crowns && <circle cx={x} cy={BAR.y + BAR.h / 2} r={5} fill={PALETTE.sunriseGold} />}
            </g>
          );
        })}
      <text className="ww-num ww-halo-text" x={W / 2} y={BAR.y + BAR.h - 3.4} fontSize={13} textAnchor="middle" fill={PALETTE.tallowText} stroke="#0D0B12" strokeWidth={3}>
        {`${hp} / ${maxHp}`}
      </text>
    </svg>
  );
}
