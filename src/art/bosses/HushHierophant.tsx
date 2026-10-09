/**
 * Hush Hierophant (§10.2, §16.8): a riveted iron bell with a specular band, a smoke robe
 * hem and a glowing coal-red clapper — still in phase 1, swinging in phase 2, gone (it has
 * become The Clapper) in phase 3.
 */
import { useMemo, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { fmt, smoothClosedPath, wobbleOutline } from '../util/path';
import { seededRandom } from '../util/random';
import { animTiming, cssVars } from '../util/svg';
import { pts } from '../pieces/shapes';
import { BossEye, GroundShadow, type BossKit } from './common';

const BELL =
  'M64,-44C84,-44 98,-36 100,-18C102,0 102,20 106,40C110,58 122,70 134,78L134,86C110,92 18,92 -6,86L-6,78C6,70 18,58 22,40C26,20 26,0 28,-18C30,-36 44,-44 64,-44Z';
const LIP = 'M-6,78C18,87 110,87 134,78L134,86C110,95 18,95 -6,86Z';
const SPECULAR = 'M40,-36C34,-26 33,-6 32,16C31,36 26,56 14,72L22,73C32,58 38,38 40,16C41,-4 42,-24 46,-38Z';
const CRACKS_2 = 'M74,-40l-5,10l6,6l-4,11';
const CRACKS_3 = `${CRACKS_2}M30,28l9,5l-2,9l7,6M100,14l-7,8l3,8l-5,7M58,62l4,8l-3,7`;
const ROBE = pts([-8, 84, 136, 84, 146, 98, 152, 116, 138, 124, 122, 117, 106, 126, 90, 118, 74, 127, 56, 118, 40, 127, 24, 118, 8, 125, -10, 117, -24, 121, -20, 100]);

function rivetRow(y: number, x0: number, x1: number, step: number): ReactElement[] {
  const out: ReactElement[] = [];
  for (let x = x0; x <= x1 + 0.01; x += step) {
    out.push(
      <g key={`${y}-${x}`}>
        <circle cx={fmt(x)} cy={y} r={2} fill="#1A1722" />
        <circle cx={fmt(x - 0.5)} cy={y - 0.6} r={1} fill="#9A93A8" />
      </g>,
    );
  }
  return out;
}

export function HushHierophantArt({ kit }: { kit: BossKit }): ReactElement {
  const { ids, animated, phase, seed } = kit;
  const robe = useMemo(() => smoothClosedPath(wobbleOutline(ROBE, seededRandom(`${seed}robe`), 4, 3), 0.9), [seed]);
  const swing = animTiming(`${seed}swing`, 1.6, 1.9);
  const sway = animTiming(`${seed}sway`, 3.4, 4.2);
  const clapper = (
    <g>
      <path d="M64,62V98" stroke="#2A2532" strokeWidth={5} strokeLinecap="round" />
      <circle cx={64} cy={104} r={17} fill={ids.url('coalGlow')} />
      <circle cx={64} cy={104} r={10.5} fill={ids.url('coal')} stroke="#2A0A08" strokeWidth={1.4} />
      <path d="M58,100l3.6,2l-1,3.6M69,106l-2.6,-0.6l-0.6,3" stroke="#FFC070" strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      <defs>
        <linearGradient id={ids.id('iron')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1E1B26" />
          <stop offset="0.22" stopColor="#5A5468" />
          <stop offset="0.5" stopColor="#3A3545" />
          <stop offset="0.85" stopColor="#24202D" />
          <stop offset="1" stopColor="#15121B" />
        </linearGradient>
        <radialGradient id={ids.id('coal')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FFB060" />
          <stop offset="0.45" stopColor="#D2361F" />
          <stop offset="1" stopColor="#4A0F0C" />
        </radialGradient>
        <radialGradient id={ids.id('coalGlow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FF5A2C" stopOpacity="0.6" />
          <stop offset="1" stopColor="#FF5A2C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('mouth')} cx="0.5" cy="0.2" r="0.8">
          <stop offset="0" stopColor={phase === 3 ? '#B4401C' : '#05040A'} />
          <stop offset="1" stopColor="#05040A" />
        </radialGradient>
      </defs>
      <GroundShadow ids={ids} rx={80} />
      {/* smoke robe hem pouring out from under the bell */}
      <g className={animated ? 'ww-sway' : undefined} style={cssVars({ '--ww-dur': sway.duration, '--ww-delay': sway.delay })}>
        <path d={robe} fill={ids.url('snuff')} />
        <path d={robe} fill="none" stroke={PALETTE.snuffRim} strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M10,100Q40,108 64,102T118,104" stroke={PALETTE.snuffRim} strokeOpacity={0.35} strokeWidth={1.4} fill="none" />
      </g>
      <ellipse cx={64} cy={86} rx={68} ry={9} fill={ids.url('mouth')} />
      {phase === 1 && clapper}
      {phase === 2 && (
        <g className={animated ? 'ww-swing' : undefined} style={cssVars({ '--ww-pivot-x': '64px', '--ww-pivot-y': '62px', '--ww-dur': swing.duration })}>
          {clapper}
        </g>
      )}
      {phase === 3 && (
        <g>
          {/* the clapper has torn free: a snapped chain and drifting embers */}
          <path d="M64,62V72M60,74a4,4 0 1 0 8,0" stroke="#2A2532" strokeWidth={3} fill="none" strokeLinecap="round" />
          {[48, 60, 72, 84].map((x, i) => {
            const t = animTiming(`${seed}ember${i}`, 2.6, 3.6);
            return (
              <circle key={x} className={animated ? 'ww-wisp' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })} cx={x} cy={88 - (i % 2) * 4} r={1.6} fill={PALETTE.moltenCore} />
            );
          })}
        </g>
      )}
      {/* iron canons (hanging loop) */}
      <path d="M50,-42C50,-62 78,-62 78,-42" stroke="#2A2532" strokeWidth={7} fill="none" />
      <path d="M50,-42C50,-62 78,-62 78,-42" stroke="#5A5468" strokeWidth={2} fill="none" strokeDasharray="3 5" />
      {/* the bell */}
      <path d={BELL} fill={ids.url('iron')} />
      <path d={SPECULAR} fill={PALETTE.moonsilver} opacity={0.22} />
      <path d="M45,-35C42,-20 41,0 40,16" stroke={PALETTE.moonsilver} strokeOpacity={0.5} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <path d={BELL} fill="none" stroke={PALETTE.snuffRim} strokeOpacity={0.55} strokeWidth={2} />
      <path d="M28,-18C52,-12 76,-12 100,-18" stroke="#15121B" strokeWidth={4} fill="none" />
      {rivetRow(-15, 34, 94, 10)}
      <path d="M17,52C48,60 80,60 111,52" stroke="#15121B" strokeWidth={4} fill="none" />
      {rivetRow(56, 22, 106, 12)}
      <path d={LIP} fill="#24202D" stroke={PALETTE.snuffRim} strokeOpacity={0.5} strokeWidth={1.4} />
      <path d="M-4,80C20,88 108,88 132,80" stroke="#6A6478" strokeWidth={1.2} fill="none" />
      {phase >= 2 && (
        <g>
          <path d={phase >= 3 ? CRACKS_3 : CRACKS_2} stroke="#2A0A08" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={phase >= 3 ? CRACKS_3 : CRACKS_2} stroke={phase >= 3 ? '#FFB060' : PALETTE.ember} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {/* face: ember eyes over a stitched-shut mouth */}
      <BossEye ids={ids} x={46} y={12} w={10} tilt={14} />
      <BossEye ids={ids} x={82} y={12} w={10} tilt={-14} />
      <path d="M32,0L52,6M96,0L76,6" stroke="#15121B" strokeWidth={3} strokeLinecap="round" />
      <path d="M44,36Q64,42 84,36" stroke="#15121B" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M48,32l2,8M56,34l1.4,8.4M64,35v8.6M72,34l-1.4,8.4M80,32l-2,8" stroke="#8C8299" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}
