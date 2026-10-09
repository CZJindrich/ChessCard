/** Piece base, action pips and stat/status badges (§16.6 layers 1, 2 and 7). */
import type { ReactElement } from 'react';
import { RuneGlyph } from '../icons/runes';
import { BurnGlyph, DazedGlyph, WardGlyph } from '../icons/status';
import { PALETTE } from '../palette';
import { darken, lighten } from '../util/color';
import { fmt, polygonPath, regularPolygon, scallopedEllipse, teardropPath } from '../util/path';
import type { PieceKit } from './kit';

export const BASE_CY = 52;

export function Shadow({ kit, rx = 25, opacity = 1 }: { kit: PieceKit; rx?: number; opacity?: number }): ReactElement {
  return <ellipse cx={32} cy={55.4} rx={rx} ry={rx * 0.27} fill={kit.ids.url('shadow')} opacity={opacity} />;
}

/** Pulsing House-colour halo for a Ready piece (§15.5). */
export function ReadyHalo({ color }: { color: string }): ReactElement {
  return (
    <g className="ww-ready-pulse">
      <ellipse cx={32} cy={BASE_CY + 1.4} rx={26} ry={8.2} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2.2} />
    </g>
  );
}

function engravedRune(kit: PieceKit, id: string, x: number, pips: number, key: string): ReactElement {
  return (
    <g key={key} transform={`translate(${x} ${BASE_CY}) scale(1 0.82) translate(${-x} ${-BASE_CY})`}>
      <RuneGlyph id={id} x={x + 0.4} y={BASE_CY + 0.55} size={9.4} color={lighten(kit.wax.base, 0.55)} strokeWidth={2.3} pips={pips} fill="none" />
      <RuneGlyph id={id} x={x} y={BASE_CY} size={9.4} color={darken(kit.wax.base, 0.68)} strokeWidth={2.3} pips={pips} fill={darken(kit.wax.base, 0.45)} />
    </g>
  );
}

interface SealBaseProps {
  kit: PieceKit;
  rune: string | null;
  strike?: string;
  pips: number;
}

/** Wax-seal base in the House colour (Snuff: `snuff_body`) with engraved runes. */
export function SealBase({ kit, rune, strike, pips }: SealBaseProps): ReactElement {
  const { wax, ids } = kit;
  return (
    <g className="ww-base">
      <ellipse cx={32} cy={BASE_CY + 2.4} rx={21} ry={6.2} fill={wax.dark} />
      <ellipse cx={32} cy={BASE_CY + 2.4} rx={21} ry={6.2} fill="none" stroke={wax.deep} strokeWidth={0.8} strokeOpacity={0.7} />
      <path d={scallopedEllipse(32, BASE_CY, 21, 5.9, 11, 0.025)} fill={ids.url('seal')} />
      <ellipse cx={32} cy={BASE_CY + 0.2} rx={16.6} ry={4.3} fill="none" stroke={lighten(wax.base, 0.35)} strokeOpacity={0.45} strokeWidth={0.7} />
      <ellipse cx={32} cy={BASE_CY - 0.2} rx={16.6} ry={4.3} fill="none" stroke={wax.deep} strokeOpacity={0.45} strokeWidth={0.7} />
      {rune && engravedRune(kit, rune, 16.2, pips, 'move')}
      {strike && engravedRune(kit, strike, 47.8, 0, 'strike')}
    </g>
  );
}

function BootPip({ x, y, full }: { x: number; y: number; full: boolean }): ReactElement {
  return (
    <path
      d={`M${fmt(x - 1.4)},${fmt(y - 2.4)}h2.2v2.6l1.9,0.7q0.6,0.3 0.5,1.1h-4.6Z`}
      fill={full ? PALETTE.flameCore : 'none'}
      stroke={full ? '#3B2A1C' : PALETTE.ashText}
      strokeWidth={0.6}
      strokeLinejoin="round"
      opacity={full ? 1 : 0.7}
    />
  );
}

function SwordPip({ x, y, full }: { x: number; y: number; full: boolean }): ReactElement {
  return (
    <g opacity={full ? 1 : 0.7}>
      <path d={`M${fmt(x - 0.6)},${fmt(y + 0.6)}L${fmt(x + 1.8)},${fmt(y - 1.8)}L${fmt(x + 2.4)},${fmt(y - 2.4)}L${fmt(x + 1.6)},${fmt(y - 2.6)}L${fmt(x - 1.4)},${fmt(y - 0.2)}Z`} fill={full ? PALETTE.flameCore : 'none'} stroke={full ? '#3B2A1C' : PALETTE.ashText} strokeWidth={0.55} strokeLinejoin="round" />
      <path d={`M${fmt(x - 1.8)},${fmt(y - 0.8)}L${fmt(x)},${fmt(y + 1)}M${fmt(x - 1.1)},${fmt(y + 0.3)}l-1,1`} stroke={full ? '#3B2A1C' : PALETTE.ashText} strokeWidth={0.7} strokeLinecap="round" />
    </g>
  );
}

/**
 * Boot and sword pips under the rune (§6.1). Extra Moves/Strikes add pips; empty pips
 * show as outlines.
 */
export function ActionPips({ moves, strikes, maxMoves, maxStrikes }: { moves: number; strikes: number; maxMoves: number; maxStrikes: number }): ReactElement {
  const items: ReactElement[] = [];
  let x = 19.6;
  const y = BASE_CY + 6.6;
  for (let i = 0; i < maxMoves; i++, x += 4.4) items.push(<BootPip key={`m${i}`} x={x} y={y} full={i < moves} />);
  for (let i = 0; i < maxStrikes; i++, x += 4.4) items.push(<SwordPip key={`s${i}`} x={x} y={y} full={i < strikes} />);
  return (
    <g className="ww-pips">
      <rect x={16.6} y={y - 3.6} width={x - 16.6 - 0.4} height={5} rx={2.5} fill="#0D0B12" opacity={0.55} />
      {items}
    </g>
  );
}

/** HP wax drop (bottom left). Its fill level shows hp/maxHp. */
export function HpDrop({ kit, hp, maxHp }: { kit: PieceKit; hp: number; maxHp: number }): ReactElement {
  const snuff = kit.side === 'snuff';
  const shell = snuff ? '#E4DDF6' : '#F6ECD2';
  const liquid = snuff ? PALETTE.snuffRim : PALETTE.candleGold;
  const d = teardropPath(7, 63.4, 14, 18);
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  const top = 63.4 - 18 * 0.82 * ratio;
  const clip = kit.ids.id('hpclip');
  return (
    <g className="ww-hp">
      <defs>
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={shell} />
      <rect x={0} y={fmt(top)} width={16} height={fmt(64 - top)} fill={liquid} opacity={0.55} clipPath={`url(#${clip})`} />
      <path className="ww-outline" d={d} fill="none" stroke="#2B1A10" strokeWidth={1.1} />
      <text className="ww-num" x={7} y={60.6} fontSize={hp >= 10 ? 8.6 : 10.6} textAnchor="middle" fill="#2B1A10">
        {hp}
      </text>
    </g>
  );
}

/** ATK blade (bottom right): a short sword blade with a crossguard, numeral on the blade. */
export function AtkBlade({ kit, atk }: { kit: PieceKit; atk: number }): ReactElement {
  const blade = 'M57,44.2L62.6,49.8V58.2H51.4V49.8Z';
  return (
    <g className="ww-atk">
      <path d={blade} fill={kit.ids.url('steel')} />
      <path className="ww-outline" d={blade} fill="none" stroke="#22202C" strokeWidth={1.1} strokeLinejoin="round" />
      <rect x={49.2} y={57.6} width={15.6} height={2.8} rx={1.2} fill={kit.ids.url('brass')} stroke="#4A3714" strokeWidth={0.7} />
      <rect x={55.6} y={60.4} width={2.8} height={3.2} rx={0.8} fill="#5E3A22" />
      <text className="ww-num" x={57} y={56.4} fontSize={atk >= 10 ? 8.4 : 10.4} textAnchor="middle" fill="#1A1622">
        {atk}
      </text>
    </g>
  );
}

/** Vigil Candle 3-segment HP band (§16.6). */
export function CandleHpBand({ hp, maxHp }: { hp: number; maxHp: number }): ReactElement {
  const segments = Math.max(1, Math.min(6, maxHp));
  const total = 30;
  const gap = 1.6;
  const w = (total - gap * (segments - 1)) / segments;
  const x0 = 32 - total / 2;
  return (
    <g className="ww-candle-hp">
      <rect x={x0 - 1.6} y={57.2} width={total + 3.2} height={6.4} rx={3.2} fill="#15121B" stroke="#6E5320" strokeWidth={0.8} />
      {Array.from({ length: segments }, (_, i) => {
        const lit = i < hp;
        const x = x0 + i * (w + gap);
        return (
          <g key={i}>
            <rect x={fmt(x)} y={58.6} width={fmt(w)} height={3.6} rx={1.6} fill={lit ? PALETTE.candleGold : '#3B3550'} />
            {lit && <rect x={fmt(x + 0.8)} y={59} width={fmt(w - 1.6)} height={1.1} rx={0.5} fill={PALETTE.flameCore} opacity={0.8} />}
          </g>
        );
      })}
    </g>
  );
}

/** Status badges: Ward and Charm on the left, Burn and Dazed on the right. */
export function StatusBadges({ ward, burn, dazed }: { ward: boolean; burn: number | null; dazed: boolean }): ReactElement {
  const right: ReactElement[] = [];
  let ry = 8.6;
  if (burn !== null) {
    right.push(<BurnGlyph key="burn" x={56.4} y={ry} r={5.4} count={burn > 0 ? burn : undefined} />);
    ry += 12;
  }
  if (dazed) right.push(<DazedGlyph key="dazed" x={56.4} y={ry} r={5.4} />);
  return (
    <g className="ww-status">
      {ward && <WardGlyph x={7.6} y={8.6} r={6} />}
      {right}
    </g>
  );
}

/** Faint hexagonal shell around a Warded piece. */
export function WardShell({ scale }: { scale: number }): ReactElement {
  const r = 27 * scale;
  return (
    <path
      d={polygonPath(regularPolygon(32, 34 - (scale - 1) * 18, r, 6, 0))}
      fill={PALETTE.moonmoth}
      fillOpacity={0.07}
      stroke={PALETTE.moonmoth}
      strokeOpacity={0.55}
      strokeWidth={1.2}
      strokeDasharray="5 2"
      strokeLinejoin="round"
    />
  );
}

/** Charm socket gem (left, under Ward). */
export function CharmSocket({ y }: { y: number }): ReactElement {
  return (
    <g className="ww-charm">
      <circle cx={7.6} cy={y} r={4.6} fill="#1E2A26" stroke={PALETTE.brass} strokeWidth={1.4} />
      <path d={polygonPath(regularPolygon(7.6, y, 3, 4, 0))} fill={PALETTE.verdigris} stroke="#BFF2E2" strokeWidth={0.6} />
      <circle cx={6.8} cy={y - 0.9} r={0.7} fill="#FFFFFF" opacity={0.8} />
    </g>
  );
}

/** Halo sigil behind a hero's head (§8.1): soft glow, a thin ring and four rune studs, turning slowly. */
export function HeroHalo({ x, y, color }: { x: number; y: number; color: string }): ReactElement {
  const studs: ReactElement[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sx = x + Math.cos(a) * 11.4;
    const sy = y + Math.sin(a) * 11.4;
    studs.push(<path key={i} d={`M${fmt(sx)},${fmt(sy - 1.6)}L${fmt(sx + 1.1)},${fmt(sy)}L${fmt(sx)},${fmt(sy + 1.6)}L${fmt(sx - 1.1)},${fmt(sy)}Z`} fill={color} />);
  }
  return (
    <g className="ww-hero-halo">
      <circle cx={x} cy={y} r={12.4} fill={color} opacity={0.14} />
      <g className="ww-halo-spin">
        <circle cx={x} cy={y} r={11.4} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={0.6} strokeDasharray="5 1.6" />
        {studs}
      </g>
    </g>
  );
}
