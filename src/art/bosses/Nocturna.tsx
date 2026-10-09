/**
 * Nocturna (§10.4, §16.8): moon-white stained-glass moth wings (Voronoi cells with 2 px
 * ink leading) flapping on a 4 s CSS cycle, blinking eyespots, and a translucent abdomen
 * glowing with eaten light that brightens when she is hungry.
 */
import { useMemo, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { darken, mix } from '../util/color';
import { fmt, polygonPath, smoothClosedPath, smoothOpenPath, type Pt } from '../util/path';
import { seededRandom } from '../util/random';
import { animTiming, cssVars } from '../util/svg';
import { scatterSites, voronoiCells } from '../util/voronoi';
import { pts } from '../pieces/shapes';
import { GroundShadow, type BossKit } from './common';

const LEADING = '#1A1424';
const GLASS = ['#E8EDF7', PALETTE.moonsilver, PALETTE.mothSilver, '#C8E4F4', '#DCD0F2', '#F1E7C8', '#D2E8E2'];

const FORE_L = pts([62, 4, 46, -20, 22, -44, -6, -56, -28, -48, -34, -24, -26, 0, -6, 18, 22, 28, 48, 24]);
const HIND_L = pts([60, 28, 40, 32, 14, 42, -8, 60, -16, 84, -4, 104, 18, 108, 38, 92, 52, 68, 60, 46]);
const mirror = (poly: readonly Pt[]): Pt[] => poly.map((p) => ({ x: 128 - p.x, y: p.y }));

interface Wing {
  outline: string;
  cells: Array<{ d: string; fill: string }>;
}

function buildWing(poly: readonly Pt[], seed: string, count: number, phase: number): Wing {
  const rand = seededRandom(seed);
  const sites = scatterSites(poly, count, rand, 9);
  const cells = voronoiCells(poly, sites).map((cell, i) => {
    let fill = GLASS[Math.floor(rand() * GLASS.length)];
    // Later phases: smoke stains creep into the glass.
    if (phase >= 2 && i % 5 === 0) fill = mix(fill, PALETTE.snuffBodyBottom, 0.55);
    if (phase >= 3 && i % 3 === 1) fill = mix(fill, PALETTE.gloamFog, 0.7);
    return { d: polygonPath(cell), fill };
  });
  return { outline: smoothClosedPath(poly, 0.5), cells };
}

function WingGlass({ wing }: { wing: Wing }): ReactElement {
  return (
    <g>
      {wing.cells.map((c, i) => (
        <path key={i} d={c.d} fill={c.fill} stroke={LEADING} strokeWidth={2} strokeLinejoin="round" />
      ))}
      <path d={wing.outline} fill="none" stroke={LEADING} strokeWidth={3.4} strokeLinejoin="round" />
      <path d={wing.outline} fill="none" stroke={PALETTE.moonsilver} strokeOpacity={0.5} strokeWidth={1} />
    </g>
  );
}

function Eyespot({ kit, x, y, r, salt }: { kit: BossKit; x: number; y: number; r: number; salt: string }): ReactElement {
  const t = animTiming(`${kit.seed}spot${salt}`, 4.5, 6.5);
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={LEADING} />
      <circle cx={x} cy={y} r={r * 0.82} fill={PALETTE.tileHotWaxTop} />
      <g className={kit.animated ? 'ww-blink' : undefined} style={cssVars({ '--ww-blink-dur': t.duration, '--ww-blink-delay': t.delay })}>
        <circle cx={x} cy={y} r={r * 0.6} fill={LEADING} />
        <circle cx={x} cy={y} r={r * 0.34} fill={PALETTE.snuffEye} />
        <circle cx={x - r * 0.22} cy={y - r * 0.24} r={r * 0.14} fill="#FFFFFF" />
      </g>
    </g>
  );
}

export function NocturnaArt({ kit, hungry }: { kit: BossKit; hungry: boolean }): ReactElement {
  const { ids, animated, phase, seed } = kit;
  const wings = useMemo(
    () => ({
      foreL: buildWing(FORE_L, `${seed}fl`, 15, phase),
      hindL: buildWing(HIND_L, `${seed}hl`, 11, phase),
      foreR: buildWing(mirror(FORE_L), `${seed}fr`, 15, phase),
      hindR: buildWing(mirror(HIND_L), `${seed}hr`, 11, phase),
    }),
    [seed, phase],
  );
  const bob = animTiming(`${seed}bob`, 3.6, 4.4);
  const flap = (origin: string) => cssVars({ '--ww-origin': origin });
  const glowOpacity = hungry ? 1 : 0.55;
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('belly')} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor={PALETTE.flameCore} stopOpacity={hungry ? 1 : 0.8} />
          <stop offset="0.45" stopColor={PALETTE.candleGold} stopOpacity={hungry ? 0.9 : 0.55} />
          <stop offset="1" stopColor={PALETTE.ember} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('bellyHalo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={PALETTE.candleGold} stopOpacity="0.55" />
          <stop offset="1" stopColor={PALETTE.candleGold} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('fur')} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#F2F0FA" />
          <stop offset="0.6" stopColor={PALETTE.mothSilver} />
          <stop offset="1" stopColor={darken(PALETTE.mothSilver, 0.35)} />
        </radialGradient>
      </defs>
      <GroundShadow ids={ids} rx={60} />
      <g className={animated ? 'ww-bob-lg' : undefined} style={cssVars({ '--ww-dur': bob.duration, '--ww-delay': bob.delay })}>
        <g className={animated ? 'ww-wing-flap' : undefined} style={flap('100% 30%')}>
          <WingGlass wing={wings.hindL} />
          <WingGlass wing={wings.foreL} />
          <Eyespot kit={kit} x={2} y={-26} r={11} salt="l" />
        </g>
        <g className={animated ? 'ww-wing-flap' : undefined} style={flap('0% 30%')}>
          <WingGlass wing={wings.hindR} />
          <WingGlass wing={wings.foreR} />
          <Eyespot kit={kit} x={126} y={-26} r={11} salt="r" />
        </g>
        {/* abdomen: translucent, glowing with eaten light */}
        <circle cx={64} cy={66} r={34} fill={ids.url('bellyHalo')} opacity={glowOpacity} className={hungry && animated ? 'ww-glow-pulse' : undefined} />
        <path d="M64,30C76,34 80,52 78,70C76,86 70,98 64,104C58,98 52,86 50,70C48,52 52,34 64,30Z" fill={PALETTE.mothSilver} opacity={0.5} stroke={LEADING} strokeWidth={2} />
        <path d="M64,36C73,40 75,54 74,68C73,80 69,90 64,96C59,90 55,80 54,68C53,54 55,40 64,36Z" fill={ids.url('belly')} opacity={glowOpacity} />
        <path d="M52.6,52Q64,57 75.4,52M51.6,66Q64,71 76.4,66M53.6,80Q64,85 74.4,80M57.6,92Q64,96 70.4,92" stroke={LEADING} strokeWidth={1.4} fill="none" opacity={0.7} />
        {/* furry thorax and head */}
        <path d={smoothClosedPath(furRing(64, 22, 14, 17, 18), 0.9)} fill={ids.url('fur')} stroke={darken(PALETTE.mothSilver, 0.45)} strokeWidth={1.2} />
        <path d={smoothClosedPath(furRing(64, -2, 11, 10, 14), 0.9)} fill={ids.url('fur')} stroke={darken(PALETTE.mothSilver, 0.45)} strokeWidth={1.2} />
        {/* feathery antennae */}
        {[-1, 1].map((s) => {
          const shaft = pts([64 + s * 4, -10, 64 + s * 12, -30, 64 + s * 24, -46, 64 + s * 38, -52]);
          const barbs: string[] = [];
          for (let i = 1; i < 9; i++) {
            const t = i / 9;
            const bx = 64 + s * (4 + t * 34);
            const by = -10 - t * 42 + t * t * 0;
            barbs.push(`M${fmt(bx)},${fmt(by)}l${fmt(-s * 3 - 2)},${fmt(-5)}M${fmt(bx)},${fmt(by)}l${fmt(s * 5)},${fmt(-2)}`);
          }
          return (
            <g key={s}>
              <path d={smoothOpenPath(shaft)} stroke={PALETTE.mothSilver} strokeWidth={1.6} fill="none" strokeLinecap="round" />
              <path d={barbs.join('')} stroke={PALETTE.mothSilver} strokeWidth={0.8} strokeLinecap="round" opacity={0.85} />
            </g>
          );
        })}
        {/* great dark eyes with ember glints */}
        <ellipse cx={57} cy={-2} rx={5} ry={5.6} fill={LEADING} />
        <ellipse cx={71} cy={-2} rx={5} ry={5.6} fill={LEADING} />
        <circle cx={57.4} cy={-1.6} r={2} fill={PALETTE.snuffEye} />
        <circle cx={70.6} cy={-1.6} r={2} fill={PALETTE.snuffEye} />
        <circle cx={55.8} cy={-4} r={1.2} fill="#FFFFFF" opacity={0.85} />
        <circle cx={69.4} cy={-4} r={1.2} fill="#FFFFFF" opacity={0.85} />
      </g>
    </g>
  );
}

/** Fuzzy outline: an ellipse with many soft bumps. */
function furRing(cx: number, cy: number, rx: number, ry: number, bumps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < bumps * 2; i++) {
    const a = (i / (bumps * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1.08 : 0.96;
    out.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return out;
}
