/**
 * Procedural card sigils (§16.7): a library of composable stained-glass glyphs drawn in a
 * 100×100 box with ink leading. Cards name glyphs in `art.sigil`; unknown names fall back
 * to a rune star so mods never break the art window.
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { darken, mix } from '../util/color';
import { fmt, polygonPath, regularPolygon, smoothClosedPath, spiralPath, starPoints, teardropPath } from '../util/path';
import { pts } from '../pieces/shapes';

export interface SigilColors {
  accent: string;
  light: string;
  dark: string;
  ink: string;
  core: string;
}

export function sigilColors(accent: string): SigilColors {
  return {
    accent,
    light: mix(accent, '#FFFFFF', 0.45),
    dark: darken(accent, 0.45),
    ink: '#160F1C',
    core: PALETTE.flameCore,
  };
}

type Glyph = (c: SigilColors) => ReactElement;

const W = 3.2; // leading width

function Lead({ d, fill, c, w = W, rule }: { d: string; fill: string; c: SigilColors; w?: number; rule?: 'evenodd' }): ReactElement {
  return <path d={d} fill={fill} fillRule={rule} stroke={c.ink} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />;
}

function Line({ d, c, w = W, color }: { d: string; c: SigilColors; w?: number; color?: string }): ReactElement {
  return <path d={d} fill="none" stroke={color ?? c.ink} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />;
}

/* All glyphs are centred on (50, 50) and span roughly 14..86. */
const GLYPHS: Readonly<Record<string, Glyph>> = {
  flame: (c) => (
    <g>
      <Lead d={teardropPath(50, 88, 50, 76)} fill={c.accent} c={c} />
      <Lead d={teardropPath(50, 86, 28, 46)} fill={c.light} c={c} w={2} />
      <path d={teardropPath(50, 84, 12, 22)} fill={c.core} />
    </g>
  ),
  spark: (c) => (
    <g>
      <Lead d={polygonPath(starPoints(50, 50, 38, 9, 4))} fill={c.light} c={c} />
      <Lead d={polygonPath(starPoints(50, 50, 22, 6, 4, -Math.PI / 4))} fill={c.accent} c={c} w={2} />
      <circle cx={50} cy={50} r={6} fill={c.core} />
    </g>
  ),
  sun: (c) => (
    <g>
      <Lead d={polygonPath(starPoints(50, 50, 38, 24, 12))} fill={c.accent} c={c} />
      <Lead d="M50,30a20,20 0 1 0 0.01,0Z" fill={c.light} c={c} />
      <circle cx={44} cy={44} r={5} fill={c.core} opacity={0.8} />
    </g>
  ),
  dawn: (c) => (
    <g>
      <Lead d={polygonPath(starPoints(50, 64, 40, 26, 10, Math.PI))} fill={c.accent} c={c} />
      <Lead d="M26,64A24,24 0 0 1 74,64Z" fill={c.light} c={c} />
      <Line d="M12,66H88" c={c} w={4} />
    </g>
  ),
  moon: (c) => <Lead d="M62,16A34,34 0 1 0 62,84A27,27 0 1 1 62,16Z" fill={c.light} c={c} />,
  star: (c) => (
    <g>
      <Lead d={polygonPath(starPoints(50, 50, 38, 15, 8))} fill={c.accent} c={c} />
      <Lead d={polygonPath(regularPolygon(50, 50, 10, 8, 0))} fill={c.light} c={c} w={2} />
    </g>
  ),
  shield: (c) => (
    <g>
      <Lead d="M50,12L82,22V48C82,68 68,82 50,90C32,82 18,68 18,48V22Z" fill={c.dark} c={c} />
      <Lead d="M50,20L74,28V48C74,63 64,74 50,81C36,74 26,63 26,48V28Z" fill={c.accent} c={c} w={2} />
      <Line d="M50,22V80M28,46H72" c={c} w={2.4} />
    </g>
  ),
  sword: (c) => (
    <g>
      <Lead d="M50,8L57,20V64H43V20Z" fill={c.light} c={c} />
      <Line d="M50,16V62" c={c} w={1.6} />
      <Lead d="M30,64H70V71H30Z" fill={c.accent} c={c} />
      <Lead d="M46,71H54V86H46Z" fill={c.dark} c={c} />
      <Lead d="M50,86m-6,0a6,6 0 1 0 12,0a6,6 0 1 0 -12,0" fill={c.accent} c={c} />
    </g>
  ),
  knife: (c) => (
    <g transform="rotate(35 50 50)">
      <Lead d="M50,14L58,30V60H42V30Z" fill={c.light} c={c} />
      <Lead d="M34,60H66V67H34Z" fill={c.accent} c={c} />
      <Lead d="M45,67H55V86H45Z" fill={c.dark} c={c} />
    </g>
  ),
  twin_knives: (c) => (
    <g>
      {[-30, 30].map((a) => (
        <g key={a} transform={`rotate(${a} 50 56)`}>
          <Lead d="M50,12L56,26V56H44V26Z" fill={c.light} c={c} />
          <Lead d="M37,56H63V62H37Z" fill={c.accent} c={c} />
          <Lead d="M46,62H54V80H46Z" fill={c.dark} c={c} />
        </g>
      ))}
    </g>
  ),
  hammer: (c) => (
    <g>
      <Lead d="M46,36H54V88H46Z" fill={c.dark} c={c} />
      <Lead d="M22,16H78V38H22Z" fill={c.accent} c={c} />
      <Line d="M30,22V32M70,22V32" c={c} w={2} />
    </g>
  ),
  key: (c) => (
    <g>
      <Lead d="M50,14a16,16 0 1 0 0.01,0ZM50,24a6,6 0 1 1 -0.01,0Z" fill={c.accent} c={c} rule="evenodd" />
      <Lead d="M45,44H55V88H45Z" fill={c.accent} c={c} />
      <Lead d="M55,66H68V73H55ZM55,78H64V85H55Z" fill={c.light} c={c} />
    </g>
  ),
  ring: (c) => (
    <g>
      <Lead d="M50,26a28,28 0 1 0 0.01,0ZM50,36a18,18 0 1 1 -0.01,0Z" fill={c.accent} c={c} rule="evenodd" />
      <Lead d={polygonPath(regularPolygon(50, 22, 11, 6, 0))} fill={c.light} c={c} />
      <path d={polygonPath(regularPolygon(48, 20, 4, 6, 0))} fill="#FFFFFF" opacity={0.8} />
    </g>
  ),
  bell: (c) => (
    <g>
      <Lead d="M50,14C36,14 31,26 31,42C31,56 27,64 18,72H82C73,64 69,56 69,42C69,26 64,14 50,14Z" fill={c.accent} c={c} />
      <Lead d="M18,72H82V79H18Z" fill={c.dark} c={c} />
      <Lead d="M50,80m-7,0a7,7 0 1 0 14,0a7,7 0 1 0 -14,0" fill={c.light} c={c} />
      <Line d="M40,24C37,32 37,42 37,52" c={c} w={2.4} color={c.light} />
    </g>
  ),
  lantern: (c) => (
    <g>
      <Line d="M42,14A8,8 0 0 1 58,14" c={c} w={4} />
      <Lead d="M30,28L50,14L70,28Z" fill={c.dark} c={c} />
      <Lead d="M30,28H70V74H30Z" fill={c.light} c={c} />
      <Lead d={teardropPath(50, 66, 18, 30)} fill={c.accent} c={c} w={2} />
      <Line d="M40,28V74M60,28V74" c={c} w={2.4} />
      <Lead d="M26,74H74V84H26Z" fill={c.dark} c={c} />
    </g>
  ),
  candle: (c) => (
    <g>
      <Lead d="M38,44H62V88H38Z" fill={PALETTE.vellumTop} c={c} />
      <Lead d="M38,44q4,10 0,16a3,3 0 0 0 6,0V44Z" fill="#FFFFFF" c={c} w={1.6} />
      <Lead d={teardropPath(50, 40, 20, 32)} fill={c.accent} c={c} />
      <path d={teardropPath(50, 38, 9, 14)} fill={c.core} />
    </g>
  ),
  wax_drop: (c) => (
    <g>
      <Lead d="M50,12C60,30 74,44 74,60A24,24 0 0 1 26,60C26,44 40,30 50,12Z" fill={c.accent} c={c} />
      <path d="M38,58A12,12 0 0 0 46,74" stroke={c.light} strokeWidth={5} fill="none" strokeLinecap="round" />
    </g>
  ),
  heart: (c) => (
    <g>
      <Lead d="M50,84C30,68 16,56 16,38C16,26 25,18 35,18C42,18 47,22 50,28C53,22 58,18 65,18C75,18 84,26 84,38C84,56 70,68 50,84Z" fill={c.accent} c={c} />
      <path d="M28,34C28,28 32,25 36,25" stroke={c.light} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  ),
  skull: (c) => (
    <g>
      <Lead d="M50,14C30,14 20,28 20,44C20,54 25,60 31,64V78H69V64C75,60 80,54 80,44C80,28 70,14 50,14Z" fill={PALETTE.moonsilver} c={c} />
      <Lead d="M38,40m-8,0a8,9 0 1 0 16,0a8,9 0 1 0 -16,0M62,40m-8,0a8,9 0 1 0 16,0a8,9 0 1 0 -16,0" fill={c.ink} c={c} />
      <Lead d="M50,52L45,62H55Z" fill={c.ink} c={c} w={1.6} />
      <Line d="M42,70V78M50,70V78M58,70V78" c={c} w={2.4} />
      <circle cx={38} cy={41} r={3} fill={c.accent} />
      <circle cx={62} cy={41} r={3} fill={c.accent} />
    </g>
  ),
  eye: (c) => (
    <g>
      <Lead d="M10,50Q50,10 90,50Q50,90 10,50Z" fill={PALETTE.moonsilver} c={c} />
      <Lead d="M50,30a20,20 0 1 0 0.01,0Z" fill={c.accent} c={c} />
      <circle cx={50} cy={50} r={9} fill={c.ink} />
      <circle cx={45} cy={45} r={4} fill="#FFFFFF" />
    </g>
  ),
  moth: (c) => (
    <g>
      <Lead d="M48,46C40,24 18,16 12,28C8,38 22,48 46,52Z" fill={c.light} c={c} />
      <Lead d="M52,46C60,24 82,16 88,28C92,38 78,48 54,52Z" fill={c.light} c={c} />
      <Lead d="M47,54C34,60 24,72 30,80C36,86 44,74 49,60Z" fill={c.accent} c={c} />
      <Lead d="M53,54C66,60 76,72 70,80C64,86 56,74 51,60Z" fill={c.accent} c={c} />
      <circle cx={26} cy={32} r={6} fill={c.ink} />
      <circle cx={74} cy={32} r={6} fill={c.ink} />
      <circle cx={26} cy={32} r={2.6} fill={c.accent} />
      <circle cx={74} cy={32} r={2.6} fill={c.accent} />
      <Lead d="M50,34a6,26 0 1 0 0.01,0Z" fill={c.dark} c={c} />
      <Line d="M47,34C44,26 40,20 34,16M53,34C56,26 60,20 66,16" c={c} w={2.2} />
    </g>
  ),
  wings: (c) => (
    <g>
      {[1, -1].map((s) => (
        <g key={s} transform={s < 0 ? 'translate(100 0) scale(-1 1)' : undefined}>
          <Lead d="M48,52C40,30 26,18 10,16C12,30 18,40 24,46C18,48 14,52 12,58C22,60 30,58 36,56C34,62 34,68 36,74C42,68 46,62 48,52Z" fill={c.light} c={c} />
          <Line d="M46,50C36,40 26,30 16,22M42,54C34,52 24,54 18,56" c={c} w={1.8} />
        </g>
      ))}
    </g>
  ),
  web: (c) => (
    <g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return <Line key={i} d={`M50,50L${fmt(50 + Math.cos(a) * 40)},${fmt(50 + Math.sin(a) * 40)}`} c={c} w={2.2} color={c.light} />;
      })}
      {[12, 22, 32, 40].map((r) => (
        <path key={r} d={polygonPath(regularPolygon(50, 50, r, 8, 0))} fill="none" stroke={c.light} strokeWidth={1.8} />
      ))}
      <Lead d="M50,44a6,6 0 1 0 0.01,0Z" fill={c.accent} c={c} w={2} />
    </g>
  ),
  cocoon: (c) => (
    <g>
      <Line d="M50,8V18" c={c} w={2} color={c.light} />
      <Lead d="M50,18C66,18 72,40 70,58C68,76 60,88 50,88C40,88 32,76 30,58C28,40 34,18 50,18Z" fill={c.light} c={c} />
      <Line d="M32,40Q50,48 68,36M30,56Q50,64 70,52M34,72Q50,80 66,70" c={c} w={2} />
      <circle cx={50} cy={56} r={8} fill={c.accent} opacity={0.7} />
    </g>
  ),
  swirl: (c) => (
    <g>
      <path d={spiralPath(50, 50, 2.6, 38, 64, 0)} fill="none" stroke={c.ink} strokeWidth={9} strokeLinecap="round" />
      <path d={spiralPath(50, 50, 2.6, 38, 64, 0)} fill="none" stroke={c.accent} strokeWidth={5} strokeLinecap="round" />
    </g>
  ),
  arrow: (c) => (
    <g>
      <Lead d="M22,78L62,38" fill="none" c={c} w={9} />
      <Line d="M22,78L62,38" c={c} w={4.6} color={c.light} />
      <Lead d="M80,20L72,56L44,28Z" fill={c.accent} c={c} />
      <Lead d="M22,78L14,70L22,66ZM22,78L30,86L34,78Z" fill={c.dark} c={c} w={2} />
    </g>
  ),
  bolt: (c) => <Lead d="M58,10L24,56H46L38,90L76,40H54Z" fill={c.accent} c={c} />,
  hand: (c) => (
    <g>
      <Lead
        d="M32,86C26,76 22,64 22,54V44C22,40 28,40 28,44V54H30V28C30,24 36,24 36,28V50H38V22C38,18 44,18 44,22V50H46V24C46,20 52,20 52,24V52H54V32C54,28 60,28 60,32V62C64,56 68,52 72,54C76,56 72,62 70,66C64,76 60,82 58,86Z"
        fill={c.light}
        c={c}
      />
      <circle cx={42} cy={66} r={6} fill={c.accent} />
    </g>
  ),
  horse: (c) => (
    <g transform="translate(8 8) scale(3.5)">
      <path
        d="M7.5,20.5H17.5V13.5C17.5,8.2 14.6,4.6 10.6,4.4L9.6,2.6L8.4,5.2C6.2,6.4 4.6,8.8 4.4,11.4L6.4,12.8L9.6,11.2L10.6,12.4C8.6,14.6 7.5,17 7.5,20.5Z"
        fill={c.accent}
        stroke={c.ink}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <circle cx={9.2} cy={7.6} r={0.7} fill={c.ink} />
    </g>
  ),
  mitre: (c) => (
    <g>
      <Lead d="M50,10C68,22 76,40 72,62H28C24,40 32,22 50,10Z" fill={c.light} c={c} />
      <Line d="M60,22L42,46" c={c} w={3} />
      <Lead d="M26,62H74V72H26Z" fill={c.accent} c={c} />
      <Lead d="M34,72H66V86H34Z" fill={c.dark} c={c} />
    </g>
  ),
  tower: (c) => (
    <g>
      <Lead d="M28,88V36H22V14H34V22H44V14H56V22H66V14H78V36H72V88Z" fill={c.accent} c={c} />
      <Lead d="M44,88V66A6,6 0 0 1 56,66V88Z" fill={c.ink} c={c} w={2} />
      <Line d="M28,36H72" c={c} w={2.4} />
    </g>
  ),
  crown: (c) => (
    <g>
      <Lead d="M16,72L12,28L32,46L50,18L68,46L88,28L84,72Z" fill={c.accent} c={c} />
      <Lead d="M16,72H84V84H16Z" fill={c.dark} c={c} />
      {[30, 50, 70].map((x) => (
        <circle key={x} cx={x} cy={78} r={3.6} fill={c.light} />
      ))}
    </g>
  ),
  ram: (c) => (
    <g>
      <Lead d="M38,32H62L58,66Q50,80 42,66Z" fill={c.light} c={c} />
      <path d={spiralPath(28, 42, 1.4, 16, 30, Math.PI)} fill="none" stroke={c.ink} strokeWidth={10} strokeLinecap="round" />
      <path d={spiralPath(28, 42, 1.4, 16, 30, Math.PI)} fill="none" stroke={c.accent} strokeWidth={6} strokeLinecap="round" />
      <path d={spiralPath(72, 42, -1.4, 16, 30, 0)} fill="none" stroke={c.ink} strokeWidth={10} strokeLinecap="round" />
      <path d={spiralPath(72, 42, -1.4, 16, 30, 0)} fill="none" stroke={c.accent} strokeWidth={6} strokeLinecap="round" />
      <circle cx={44} cy={46} r={3} fill={c.ink} />
      <circle cx={56} cy={46} r={3} fill={c.ink} />
    </g>
  ),
  golem: (c) => (
    <g>
      <Lead d="M50,30C70,30 76,46 74,60C72,74 62,84 50,88C38,84 28,74 26,60C24,46 30,30 50,30Z" fill={c.accent} c={c} />
      <Line d="M24,46L32,52L24,58L32,64M76,46L68,52L76,58L68,64" c={c} w={3} />
      <Lead d="M50,14a10,10 0 1 0 0.01,0Z" fill={c.light} c={c} />
      <Lead d="M44,86H56L54,94H46Z" fill={c.dark} c={c} w={2} />
    </g>
  ),
  mortar: (c) => (
    <g>
      <g transform="rotate(-35 54 50)">
        <Lead d="M44,14H64V52H44Z" fill={c.dark} c={c} />
        <Lead d="M40,10H68V18H40Z" fill={c.accent} c={c} />
      </g>
      <Lead d="M24,52Q50,44 76,52Q80,70 76,88Q50,94 24,88Q20,70 24,52Z" fill={c.light} c={c} />
      <Line d="M22,62Q50,56 78,62M22,78Q50,84 78,78" c={c} w={2.4} />
    </g>
  ),
  cinder: (c) => (
    <g>
      <Lead d={polygonPath(pts([50, 22, 70, 32, 78, 54, 66, 76, 42, 80, 24, 64, 26, 38]))} fill={darken(c.accent, 0.35)} c={c} />
      <Line d="M36,44L48,52L44,64M58,36L54,50L66,58" c={c} w={3} color={c.light} />
      {[
        [80, 20],
        [20, 24],
        [84, 80],
      ].map(([x, y]) => (
        <path key={x} d={polygonPath(starPoints(x, y, 7, 2, 4))} fill={c.light} />
      ))}
    </g>
  ),
  chain: (c) => (
    <g>
      <Lead d="M22,40a14,14 0 0 1 14,-14h10a14,14 0 0 1 0,28h-10a14,14 0 0 1 -14,-14ZM32,40a4,4 0 0 0 4,4h10a4,4 0 0 0 0,-8h-10a4,4 0 0 0 -4,4Z" fill={c.accent} c={c} rule="evenodd" />
      <Lead d="M44,60a14,14 0 0 1 14,-14h10a14,14 0 0 1 0,28h-10a14,14 0 0 1 -14,-14ZM54,60a4,4 0 0 0 4,4h10a4,4 0 0 0 0,-8h-10a4,4 0 0 0 -4,4Z" fill={c.light} c={c} rule="evenodd" />
    </g>
  ),
  hourglass: (c) => (
    <g>
      <Lead d="M26,12H74V20H26ZM26,80H74V88H26Z" fill={c.dark} c={c} />
      <Lead d="M32,20H68C68,36 56,44 54,50C56,56 68,64 68,80H32C32,64 44,56 46,50C44,44 32,36 32,20Z" fill={PALETTE.moonsilver} c={c} />
      <path d="M38,28H62C60,36 52,42 50,48C48,42 40,36 38,28ZM50,58L64,78H36Z" fill={c.accent} />
    </g>
  ),
  leaf: (c) => (
    <g>
      <Lead d="M20,80C20,44 44,20 82,18C80,54 56,80 20,80Z" fill={c.accent} c={c} />
      <Line d="M20,80C40,60 56,44 70,30" c={c} w={2.4} />
    </g>
  ),
  cross: (c) => (
    <g>
      <Lead d="M42,10H58V34H82V50H58V90H42V50H18V34H42Z" fill={c.accent} c={c} />
      <circle cx={50} cy={42} r={5} fill={c.light} />
    </g>
  ),
  lens: (c) => (
    <g>
      <Lead d="M62,62L84,84" fill="none" c={c} w={12} />
      <Line d="M62,62L84,84" c={c} w={7} color={PALETTE.brass} />
      <Lead d="M42,12a30,30 0 1 0 0.01,0Z" fill={PALETTE.brass} c={c} />
      <Lead d="M42,20a22,22 0 1 0 0.01,0Z" fill={mix(c.light, '#FFFFFF', 0.4)} c={c} w={2} />
      <path d="M30,34A14,14 0 0 1 42,26" stroke="#FFFFFF" strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  ),
  feather: (c) => (
    <g>
      <Lead d="M78,14C50,18 28,42 24,76L30,80C46,62 66,44 78,14Z" fill={c.light} c={c} />
      <Line d="M20,88L72,24" c={c} w={2.6} />
    </g>
  ),
  wick: (c) => (
    <g>
      <Lead d="M36,62H64V88H36Z" fill={PALETTE.vellumTop} c={c} />
      <Lead d="M36,62q3,8 0,12a3,3 0 0 0 6,0V62Z" fill="#FFFFFF" c={c} w={1.4} />
      <Line d="M50,62C50,54 44,50 48,42C51,36 46,32 50,28" c={c} w={5} />
      <Line d="M50,62C50,54 44,50 48,42C51,36 46,32 50,28" c={c} w={2.4} color={c.dark} />
      <Lead d={teardropPath(50, 30, 16, 24)} fill={c.accent} c={c} w={2.2} />
      <path d={teardropPath(50, 28.6, 7, 11)} fill={c.core} />
    </g>
  ),
  seal: (c) => (
    <g>
      <Lead d={smoothClosedPath(starPoints(50, 50, 38, 34, 14).map((p) => ({ x: p.x, y: p.y })), 1)} fill={c.accent} c={c} />
      <Lead d="M50,26a24,24 0 1 0 0.01,0Z" fill="none" c={c} w={2.4} />
      <Lead d={teardropPath(50, 64, 18, 28)} fill={c.light} c={c} w={2} />
      <path d="M36,36A18,18 0 0 1 48,30" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  ),
  censer: (c) => (
    <g>
      <Line d="M50,8V36M40,36L50,24L60,36" c={c} w={2.4} />
      <Lead d="M26,44H74C74,62 64,74 50,74C36,74 26,62 26,44Z" fill={c.accent} c={c} />
      <Lead d="M24,38H76V46H24Z" fill={c.dark} c={c} />
      <circle cx={40} cy={58} r={3.4} fill={c.ink} />
      <circle cx={50} cy={60} r={3.4} fill={c.ink} />
      <circle cx={60} cy={58} r={3.4} fill={c.ink} />
      <Line d="M36,80C30,86 40,90 34,96M64,80C70,86 60,90 66,96" c={c} w={2.4} color={c.light} />
    </g>
  ),
  burst: (c) => (
    <g>
      <Lead d={polygonPath(starPoints(50, 50, 42, 18, 10, -Math.PI / 2))} fill={c.accent} c={c} />
      <Lead d={polygonPath(starPoints(50, 50, 22, 10, 10, -Math.PI / 2 + 0.31))} fill={c.light} c={c} w={2} />
      <circle cx={50} cy={50} r={6} fill={c.core} />
    </g>
  ),
  gear: (c) => (
    <g>
      <Lead
        d={`${polygonPath(
          Array.from({ length: 32 }, (_, i) => {
            const a = (i / 32) * Math.PI * 2;
            const r = Math.floor(i / 2) % 2 === 0 ? 40 : 31;
            return { x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r };
          }),
        )}M50,38a12,12 0 1 1 -0.01,0Z`}
        fill={c.accent}
        c={c}
        rule="evenodd"
      />
      <Line d="M50,24V30M50,70V76M24,50H30M70,50H76" c={c} w={2} color={c.light} />
    </g>
  ),
  swap: (c) => (
    <g>
      <Line d="M24,44A28,28 0 0 1 72,32" c={c} w={10} />
      <Line d="M24,44A28,28 0 0 1 72,32" c={c} w={5.4} color={c.accent} />
      <Lead d="M80,20L78,44L58,34Z" fill={c.accent} c={c} w={2.4} />
      <Line d="M76,56A28,28 0 0 1 28,68" c={c} w={10} />
      <Line d="M76,56A28,28 0 0 1 28,68" c={c} w={5.4} color={c.light} />
      <Lead d="M20,80L22,56L42,66Z" fill={c.light} c={c} w={2.4} />
    </g>
  ),
  pawn: (c) => (
    <g>
      <Lead d="M50,14a12,12 0 1 0 0.01,0Z" fill={c.accent} c={c} />
      <Lead d="M38,40H62L58,46C60,58 66,66 74,72V84H26V72C34,66 40,58 42,46Z" fill={c.accent} c={c} />
    </g>
  ),
};

const ALIASES: Readonly<Record<string, string>> = {
  drop: 'wax_drop',
  wax: 'wax_drop',
  dagger: 'knife',
  rapier: 'sword',
  blade: 'sword',
  knives: 'twin_knives',
  twin_blades: 'twin_knives',
  wing: 'wings',
  cog: 'gear',
  explosion: 'burst',
  thurible: 'censer',
  lightning: 'bolt',
  heal: 'heart',
  sunrise: 'dawn',
  rook: 'tower',
  bishop: 'mitre',
  knight: 'horse',
  queen: 'star',
  king: 'crown',
  spider: 'web',
  silk: 'web',
  ember: 'cinder',
  coal: 'cinder',
  bellows: 'golem',
  barrel: 'mortar',
  glass: 'lens',
  spiral: 'swirl',
  taper: 'candle',
  shroud: 'cocoon',
  claw: 'hand',
};

export const SIGIL_GLYPH_IDS: readonly string[] = Object.keys(GLYPHS);

export function resolveGlyphId(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (key in GLYPHS) return key;
  const alias = ALIASES[key];
  return alias && alias in GLYPHS ? alias : null;
}

/** Fallback glyph: a leaded rune star in a diamond. */
function unknownGlyph(c: SigilColors): ReactElement {
  return (
    <g>
      <Lead d="M50,10L90,50L50,90L10,50Z" fill={c.dark} c={c} />
      <Lead d={polygonPath(starPoints(50, 50, 26, 9, 4))} fill={c.accent} c={c} />
    </g>
  );
}

export function SigilGlyph({ name, colors }: { name: string; colors: SigilColors }): ReactElement {
  const id = resolveGlyphId(name);
  return id ? GLYPHS[id](colors) : unknownGlyph(colors);
}

/** Smoothed rosette path used behind sigils (stained-glass halo). */
export function rosettePath(cx: number, cy: number, r: number, petals: number): string {
  const p = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.82;
    p.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return smoothClosedPath(p, 1);
}

