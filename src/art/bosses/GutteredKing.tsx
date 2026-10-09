/**
 * The Guttered King (§10.3, §16.8): a mountain of melted candles with a sunken crown of
 * 7 moonfire-blue wicks, a drip beard and a cross sceptre. Crown sockets fill gold on
 * each Checkmate (0–3).
 */
import { useMemo, type ReactElement } from 'react';
import { MOONFIRE_FLAME, PALETTE } from '../palette';
import { mix } from '../util/color';
import { fmt, smoothClosedPath, teardropPath, wobbleOutline } from '../util/path';
import { seededRandom } from '../util/random';
import { animTiming, cssVars } from '../util/svg';
import { pts } from '../pieces/shapes';
import { GroundShadow, type BossKit } from './common';

const MOUND = pts([
  -26, 124, -23, 102, -13, 86, 2, 74, 17, 64, 25, 42, 29, 12, 37, -10, 50, -22, 64, -25, 78, -22, 91, -10, 99, 12, 103, 42, 111, 64, 126,
  74, 141, 86, 151, 102, 154, 124,
]);
const CROWN_X = [34, 44, 54, 64, 74, 84, 94];
const SOCKET_X = [46, 64, 82];

interface StubSpec {
  x: number;
  top: number;
  w: number;
}
const STUBS: StubSpec[] = [
  { x: -12, top: 46, w: 13 },
  { x: 8, top: 22, w: 15 },
  { x: 120, top: 18, w: 15 },
  { x: 140, top: 50, w: 12 },
  { x: -26, top: 74, w: 10 },
];

function MoonFlame({ kit, x, y, size, i }: { kit: BossKit; x: number; y: number; size: number; i: number }): ReactElement {
  const t = animTiming(`${kit.seed}moon${i}`, 1.6, 2.4);
  return (
    <g>
      <circle cx={x} cy={y - size * 0.45} r={size * 0.95} fill={kit.ids.url('moonHalo')} />
      <path d={`M${fmt(x)},${fmt(y + 2.6)}q0.6,-1.6 0,-3`} stroke="#15121B" strokeWidth={1.4} fill="none" />
      <g className={kit.animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
        <path d={teardropPath(x, y, size * 0.62, size)} fill={kit.ids.url('moonfire')} />
        <path d={teardropPath(x, y - size * 0.04, size * 0.3, size * 0.58)} fill={MOONFIRE_FLAME.core} />
      </g>
    </g>
  );
}

function Stub({ s, kit }: { s: StubSpec; kit: BossKit }): ReactElement {
  const d = `M${fmt(s.x - s.w / 2)},120V${fmt(s.top + 3)}Q${fmt(s.x - s.w / 2)},${fmt(s.top)} ${fmt(s.x - s.w / 4)},${fmt(s.top)}Q${fmt(s.x)},${fmt(s.top + 3)} ${fmt(s.x + s.w / 4)},${fmt(s.top)}Q${fmt(s.x + s.w / 2)},${fmt(s.top)} ${fmt(s.x + s.w / 2)},${fmt(s.top + 3)}V120Z`;
  return (
    <g>
      <path d={d} fill={kit.ids.url('waxSide')} stroke="#5E4630" strokeWidth={1} />
      <path d={`M${fmt(s.x - s.w / 4)},${fmt(s.top + 1)}v${fmt(s.w * 0.9)}a2,2 0 0 0 4,0v${fmt(-s.w * 0.7)}`} fill={PALETTE.gutteredWaxTop} opacity={0.8} />
      <path d={`M${fmt(s.x)},${fmt(s.top + 1.5)}q1,-3 -0.6,-5`} stroke="#15121B" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </g>
  );
}

interface BeardDrip {
  x: number;
  len: number;
  w: number;
  dx: number;
}

const BEARD: readonly BeardDrip[] = [
  { x: 42, len: 12, w: 6, dx: -1 },
  { x: 48.5, len: 28, w: 7, dx: 1.5 },
  { x: 55, len: 18, w: 5.4, dx: -1 },
  { x: 62, len: 40, w: 8.4, dx: 1 },
  { x: 69, len: 24, w: 6, dx: -1.5 },
  { x: 75.5, len: 33, w: 7, dx: 2 },
  { x: 82, len: 16, w: 5.6, dx: 0.5 },
  { x: 87.5, len: 9, w: 5, dx: -0.5 },
];

/** A single organic drip: slight sway, tapering neck, round bulb. */
function dripPath(x: number, y0: number, len: number, w: number, dx: number): string {
  const n = w * 0.3;
  const bulbY = y0 + len - w * 0.4;
  return (
    `M${fmt(x - w / 2)},${fmt(y0)}` +
    `C${fmt(x - w / 2)},${fmt(y0 + len * 0.45)} ${fmt(x + dx - n)},${fmt(y0 + len * 0.55)} ${fmt(x + dx - n)},${fmt(bulbY)}` +
    `A${fmt(w * 0.44)},${fmt(w * 0.48)} 0 1 0 ${fmt(x + dx + n)},${fmt(bulbY)}` +
    `C${fmt(x + dx + n)},${fmt(y0 + len * 0.55)} ${fmt(x + w / 2)},${fmt(y0 + len * 0.45)} ${fmt(x + w / 2)},${fmt(y0)}Z`
  );
}

export function GutteredKingArt({ kit, crowns }: { kit: BossKit; crowns: number }): ReactElement {
  const { ids, animated, phase, seed } = kit;
  const mound = useMemo(() => smoothClosedPath(wobbleOutline(MOUND, seededRandom(`${seed}mound`), 2.2, 2), 0.9), [seed]);
  const glow = animTiming(`${seed}core`, 2.2, 3);
  const filled = Math.max(0, Math.min(3, Math.floor(crowns)));
  const crack = phase >= 3 ? '#FFD08A' : PALETTE.moltenCore;
  return (
    <g>
      <defs>
        <linearGradient id={ids.id('wax')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={PALETTE.gutteredWaxTop} />
          <stop offset="0.55" stopColor={mix(PALETTE.gutteredWaxTop, PALETTE.gutteredWaxBottom, 0.55)} />
          <stop offset="1" stopColor={PALETTE.gutteredWaxBottom} />
        </linearGradient>
        <linearGradient id={ids.id('waxSide')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={PALETTE.gutteredWaxBottom} />
          <stop offset="0.4" stopColor={PALETTE.gutteredWaxTop} />
          <stop offset="1" stopColor={PALETTE.gutteredWaxBottom} />
        </linearGradient>
        <radialGradient id={ids.id('waxGlow')} cx="0.5" cy="0.15" r="0.7">
          <stop offset="0" stopColor={PALETTE.moonfire} stopOpacity="0.35" />
          <stop offset="1" stopColor={PALETTE.moonfire} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('moonfire')} cx="0.5" cy="0.78" r="0.75">
          <stop offset="0" stopColor={MOONFIRE_FLAME.core} />
          <stop offset="1" stopColor={MOONFIRE_FLAME.edge} />
        </radialGradient>
        <radialGradient id={ids.id('moonHalo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.moonfire} stopOpacity="0.5" />
          <stop offset="1" stopColor={PALETTE.moonfire} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('molten')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.flameCore} />
          <stop offset="0.5" stopColor={PALETTE.moltenCore} />
          <stop offset="1" stopColor="#B4521E" />
        </radialGradient>
        <linearGradient id={ids.id('beard')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={mix(PALETTE.gutteredWaxTop, PALETTE.gutteredWaxBottom, 0.35)} />
          <stop offset="0.4" stopColor="#EADBB8" />
          <stop offset="1" stopColor={mix(PALETTE.gutteredWaxTop, PALETTE.gutteredWaxBottom, 0.45)} />
        </linearGradient>
        <radialGradient id={ids.id('pool')} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={PALETTE.tileHotWaxTop} />
          <stop offset="1" stopColor={PALETTE.tileHotWaxBottom} />
        </radialGradient>
      </defs>
      <GroundShadow ids={ids} rx={86} />
      {phase >= 3 && <ellipse cx={64} cy={118} rx={92} ry={14} fill={ids.url('pool')} opacity={0.85} />}
      {STUBS.map((s, i) => (
        <Stub key={i} s={s} kit={kit} />
      ))}
      {/* ladle in the left hand */}
      <path d="M4,74L-18,30" stroke="#3A3545" strokeWidth={4} strokeLinecap="round" />
      <path d="M-34,26Q-20,46 -6,26Z" fill="#3A3545" stroke="#1E1A26" strokeWidth={1.4} strokeLinejoin="round" />
      <ellipse cx={-20} cy={27} rx={13} ry={3} fill={PALETTE.tileHotWaxTop} />
      <path d="M-24,30v8a2,2 0 0 0 4,0v-6" fill={PALETTE.tileHotWaxTop} />
      {/* the mound of melted candles */}
      <path d={mound} fill={ids.url('wax')} />
      <path d={mound} fill={ids.url('waxGlow')} />
      <path d={mound} fill="none" stroke="#5E4630" strokeWidth={1.6} />
      {/* shoulder drips */}
      {[
        [6, 72, 16, 5],
        [16, 64, 22, 6],
        [112, 64, 20, 6],
        [124, 72, 14, 5],
        [140, 86, 12, 4],
        [-12, 88, 12, 4],
      ].map(([x, y, len, w], i) => (
        <path key={i} d={`M${x - w / 2},${y}v${len}a${w / 2},${w / 2} 0 0 0 ${w},0v${-len}Z`} fill={PALETTE.gutteredWaxTop} opacity={0.9} />
      ))}
      {/* molten cracks */}
      <g className={animated ? 'ww-glow-pulse' : undefined} style={cssVars({ '--ww-dur': glow.duration, '--ww-delay': glow.delay, '--ww-glow-min': '0.5' })}>
        <path d="M10,104l10,-8l-2,-10l8,-6M118,100l-8,-10l4,-8l-6,-6M40,112l6,-10l10,-2M96,114l-4,-10l-10,-4" stroke={crack} strokeWidth={phase >= 3 ? 2.6 : 1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* sunken crown with 7 moonfire wicks */}
      <path d="M30,-4Q64,4 98,-4L98,6Q64,14 30,6Z" fill={ids.url('brass')} stroke="#4A3714" strokeWidth={1.2} />
      {CROWN_X.map((x, i) => {
        const h = i % 2 === 0 ? 12 : 17;
        const base = -4 + Math.abs(x - 64) * 0.12;
        return (
          <path key={x} d={`M${x - 5},${fmt(base + 1)}L${x},${fmt(base - h)}L${x + 5},${fmt(base + 1)}Z`} fill={ids.url('brass')} stroke="#4A3714" strokeWidth={1} strokeLinejoin="round" />
        );
      })}
      {/* wax pooled over the crown band */}
      <path d="M36,-2q4,8 0,12a3,3 0 0 0 6,0q-2,-6 0,-11ZM86,-2q-3,9 1,13a3,3 0 0 0 5,-1q-3,-6 -1,-12Z" fill={PALETTE.gutteredWaxTop} />
      {SOCKET_X.map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={3.4} r={4.2} fill="#2A1E10" stroke="#4A3714" strokeWidth={1} />
          {i < filled && (
            <g>
              <circle cx={x} cy={3.4} r={3.4} fill={PALETTE.sunriseGold} />
              <circle cx={x - 1.1} cy={2.2} r={1.1} fill="#FFFFFF" opacity={0.85} />
            </g>
          )}
        </g>
      ))}
      {CROWN_X.map((x, i) => {
        const h = i % 2 === 0 ? 12 : 17;
        const base = -4 + Math.abs(x - 64) * 0.12;
        return <MoonFlame key={x} kit={kit} x={x} y={base - h - 1} size={i % 2 === 0 ? 11 : 13} i={i} />;
      })}
      {/* heavy-lidded molten eyes */}
      {[46, 82].map((x, i) => (
        <g key={x}>
          <ellipse cx={x} cy={22} rx={9} ry={6} fill="#3A2614" />
          <ellipse cx={x} cy={23} rx={7} ry={4.6} fill={ids.url('molten')} />
          <path d={`M${x - 10},${i === 0 ? 17 : 21}Q${x},${14} ${x + 10},${i === 0 ? 21 : 17}L${x + 10},24Q${x},${21} ${x - 10},24Z`} fill={PALETTE.gutteredWaxTop} stroke="#8C6B4A" strokeWidth={0.8} />
        </g>
      ))}
      <path d="M58,26Q64,40 70,26Q72,36 64,38Q56,36 58,26Z" fill={mix(PALETTE.gutteredWaxTop, PALETTE.gutteredWaxBottom, 0.3)} />
      <path d="M50,46Q64,40 78,46" stroke={PALETTE.moltenCore} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* drip beard: a wax mass with a wavy hem and organic drips */}
      <path d="M36,40Q64,32 92,40Q94,52 88,60Q82,56 76,62Q70,57 63,64Q56,57 50,62Q44,56 39,59Q34,50 36,40Z" fill={ids.url('beard')} stroke="#9C8058" strokeWidth={0.8} />
      {BEARD.map((d, i) => {
        const len = phase >= 2 ? d.len + 7 : d.len;
        return (
          <g key={i}>
            <path d={dripPath(d.x, 54, len, d.w, d.dx)} fill={ids.url('beard')} stroke="#9C8058" strokeWidth={0.6} />
            <ellipse cx={fmt(d.x + d.dx - d.w * 0.14)} cy={fmt(54 + len - d.w * 0.5)} rx={fmt(d.w * 0.13)} ry={fmt(d.w * 0.2)} fill="#FFFFFF" opacity={0.65} />
          </g>
        );
      })}
      {/* cross sceptre in the right hand */}
      <path d="M124,104L131,-22" stroke={ids.url('brass')} strokeWidth={4.4} strokeLinecap="round" />
      <circle cx={131.4} cy={-26} r={6} fill={ids.url('brass')} stroke="#4A3714" strokeWidth={1} />
      <path d="M132.4,-30V-56M122,-46H142.6" stroke={ids.url('brass')} strokeWidth={4.6} strokeLinecap="round" />
      <path d="M132.4,-30V-56M122,-46H142.6" stroke="#4A3714" strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
      <ellipse cx={126} cy={68} rx={9} ry={7} fill={PALETTE.gutteredWaxTop} stroke="#8C6B4A" strokeWidth={1} />
      <ellipse cx={4} cy={74} rx={8} ry={6.4} fill={PALETTE.gutteredWaxTop} stroke="#8C6B4A" strokeWidth={1} />
    </g>
  );
}
