/**
 * Title scene (§15.1): the Moth-Moon over the spires of Sconcewick, one candle burning in
 * a window and smoke tendrils creeping toward it. A small light follows the cursor and
 * pushes the tendrils back; layers move with gentle parallax. Pointer work writes CSS
 * variables / transforms directly (no React re-render per frame).
 */
import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { PALETTE } from '../palette';
import { fmt, teardropPath, type Pt } from '../util/path';
import { animTiming, cssVars, cx, useSvgIds } from '../util/svg';
import { MothMoon, Motes, SkyGradient, SkylineSvgLayer, Stars, tendrilPath } from './parts';
import { lancetPath, type SkylineOptions } from './skyline';
import '../art.css';
import './scenes.css';

const VW = 1600;
const VH = 900;
const CANDLE: Pt = { x: 372, y: 548 };

const FAR: SkylineOptions = { width: VW, baseline: 700, minHeight: 110, maxHeight: 250, unit: 64, seed: 'title-far', litChance: 0.12 };
const MID: SkylineOptions = { width: VW, baseline: 790, minHeight: 140, maxHeight: 320, unit: 92, seed: 'title-mid', litChance: 0.28, cathedralX: 860 };
const NEAR: SkylineOptions = { width: VW, baseline: 910, minHeight: 90, maxHeight: 210, unit: 150, seed: 'title-near', litChance: 0.18 };

interface Tendril {
  from: Pt;
  to: Pt;
  width: number;
}

const TENDRILS: Tendril[] = [
  { from: { x: -60, y: 470 }, to: { x: 250, y: 540 }, width: 46 },
  { from: { x: -40, y: 760 }, to: { x: 270, y: 640 }, width: 54 },
  { from: { x: 120, y: 960 }, to: { x: 330, y: 700 }, width: 58 },
  { from: { x: 560, y: 980 }, to: { x: 450, y: 690 }, width: 56 },
  { from: { x: 900, y: 960 }, to: { x: 520, y: 640 }, width: 62 },
  { from: { x: 760, y: 420 }, to: { x: 500, y: 520 }, width: 40 },
  { from: { x: 120, y: 300 }, to: { x: 300, y: 470 }, width: 36 },
];

/** A small curl of smoke at a tendril's tip, turning toward the candle. */
function tipCurl(t: Tendril): string {
  const dx = t.to.x - t.from.x;
  const dy = t.to.y - t.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const r = 9;
  const cx0 = t.to.x + ux * 6 - uy * r;
  const cy0 = t.to.y + uy * 6 + ux * r;
  return `M${fmt(t.to.x)},${fmt(t.to.y)}Q${fmt(t.to.x + ux * 14)},${fmt(t.to.y + uy * 14)} ${fmt(cx0 + uy * r)},${fmt(cy0 - ux * r)}A${r},${r} 0 1 1 ${fmt(cx0)},${fmt(cy0)}`;
}

/** Push radius and maximum push distance, in view-box units. */
const PUSH_RADIUS = 300;
const PUSH_MAX = 110;

export interface TitleSceneProps {
  reducedMotion?: boolean;
  className?: string;
  /** UI drawn over the scene (logo, buttons). */
  children?: ReactNode;
}

function CandleTower({ ids, animated }: { ids: ReturnType<typeof useSvgIds>; animated: boolean }): ReactElement {
  const t = animTiming('title-candle', 1.6, 2.2);
  const winX = CANDLE.x - 30;
  const winY = CANDLE.y - 70;
  return (
    <g>
      <path d="M300,920V470L318,470L318,440L336,440L336,470L408,470L408,440L426,440L426,470L444,470V920Z" fill="#0F0B15" />
      <path d="M300,470L372,250L444,470Z" fill="#0F0B15" />
      <circle cx={CANDLE.x} cy={CANDLE.y - 20} r={170} fill={ids.url('candleGlow')} className={animated ? 'ww-glow-pulse' : undefined} style={cssVars({ '--ww-dur': '2.6s', '--ww-glow-min': '0.75' })} />
      <path d={lancetPath(winX, winY, 60, 116)} fill="#3A2412" stroke="#060409" strokeWidth={6} />
      <path d={lancetPath(winX, winY, 60, 116)} fill={ids.url('windowGlow')} />
      <path d={`M${CANDLE.x},${winY - 8}V${winY + 116}M${winX},${winY + 50}H${winX + 60}`} stroke="#060409" strokeWidth={4} />
      {/* the candle on the sill */}
      <rect x={CANDLE.x - 7} y={CANDLE.y + 10} width={14} height={30} rx={2} fill="#F1E6CB" />
      <path d={`M${CANDLE.x},${CANDLE.y + 10}v-4`} stroke="#1A1222" strokeWidth={1.6} />
      <g className={animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
        <path d={teardropPath(CANDLE.x, CANDLE.y + 7, 14, 26)} fill={PALETTE.candleGold} />
        <path d={teardropPath(CANDLE.x, CANDLE.y + 6, 7, 13)} fill={PALETTE.flameCore} />
      </g>
      <rect x={winX - 8} y={winY + 116} width={76} height={8} fill="#060409" />
    </g>
  );
}

export function TitleScene({ reducedMotion = false, className, children }: TitleSceneProps): ReactElement {
  const ids = useSvgIds('title');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lightRef = useRef<SVGGElement | null>(null);
  const tendrilRefs = useRef<Array<SVGGElement | null>>([]);
  const animated = !reducedMotion;
  const tendrilPaths = useMemo(() => TENDRILS.map((t, i) => tendrilPath(t.from, t.to, t.width, `tendril${i}`)), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || reducedMotion) return;
    let frame = 0;
    let pending: { x: number; y: number } | null = null;
    const apply = (): void => {
      frame = 0;
      if (!pending) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(pending.x, pending.y).matrixTransform(ctm.inverse());
      const rect = svg.getBoundingClientRect();
      svg.style.setProperty('--ww-px', fmt((pending.x - rect.left) / Math.max(1, rect.width) - 0.5));
      svg.style.setProperty('--ww-py', fmt((pending.y - rect.top) / Math.max(1, rect.height) - 0.5));
      if (lightRef.current) lightRef.current.style.transform = `translate(${fmt(pt.x)}px, ${fmt(pt.y)}px)`;
      TENDRILS.forEach((t, i) => {
        const el = tendrilRefs.current[i];
        if (!el) return;
        const dx = t.to.x - pt.x;
        const dy = t.to.y - pt.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.max(0, 1 - d / PUSH_RADIUS) * PUSH_MAX;
        el.style.transform = `translate(${fmt((dx / d) * k)}px, ${fmt((dy / d) * k)}px)`;
      });
    };
    const onMove = (e: PointerEvent): void => {
      pending = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div className={cx('ww-scene ww-title-scene', reducedMotion && 'ww-still', className)}>
      <svg ref={svgRef} className="ww-art ww-scene-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="The Moth-Moon over Sconcewick">
        <defs>
          <radialGradient id={ids.id('candleGlow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={PALETTE.candleGold} stopOpacity="0.55" />
            <stop offset="0.4" stopColor={PALETTE.ember} stopOpacity="0.18" />
            <stop offset="1" stopColor={PALETTE.ember} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={ids.id('windowGlow')} cx="0.5" cy="0.7" r="0.7">
            <stop offset="0" stopColor={PALETTE.flameCore} />
            <stop offset="0.5" stopColor={PALETTE.candleGold} stopOpacity="0.85" />
            <stop offset="1" stopColor={PALETTE.ember} stopOpacity="0.4" />
          </radialGradient>
          <radialGradient id={ids.id('cursor')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={PALETTE.flameCore} stopOpacity="0.35" />
            <stop offset="0.4" stopColor={PALETTE.candleGold} stopOpacity="0.12" />
            <stop offset="1" stopColor={PALETTE.candleGold} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.id('smoke')} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={PALETTE.snuffBodyBottom} stopOpacity="0.95" />
            <stop offset="1" stopColor={PALETTE.snuffBodyTop} stopOpacity="0.75" />
          </linearGradient>
          <radialGradient id={ids.id('vignette')} cx="0.5" cy="0.45" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.7" />
          </radialGradient>
          <linearGradient id={ids.id('fog')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={PALETTE.gloamFog} stopOpacity="0" />
            <stop offset="1" stopColor={PALETTE.gloamFog} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <SkyGradient ids={ids} w={VW} h={VH} />
        <g className="ww-parallax" style={cssVars({ '--ww-depth': 6 })}>
          <Stars w={VW} h={560} count={90} seed="title" animated={animated} />
        </g>
        <g className="ww-parallax" style={cssVars({ '--ww-depth': 10 })}>
          <MothMoon ids={ids} x={1160} y={240} r={130} />
        </g>
        <g className="ww-parallax" style={cssVars({ '--ww-depth': 16 })}>
          <SkylineSvgLayer options={FAR} fill="#2A2238" animated={animated} windowAlpha={0.45} />
        </g>
        <g className="ww-parallax" style={cssVars({ '--ww-depth': 26 })}>
          <SkylineSvgLayer options={MID} fill="#1B1526" animated={animated} windowAlpha={0.85} />
          <rect x={0} y={640} width={VW} height={160} fill={ids.url('fog')} />
        </g>
        <g className="ww-parallax" style={cssVars({ '--ww-depth': 40 })}>
          <SkylineSvgLayer options={NEAR} fill="#100C16" animated={animated} windowAlpha={0.7} />
          <CandleTower ids={ids} animated={animated} />
          {TENDRILS.map((t, i) => {
            const timing = animTiming(`tendril-creep${i}`, 5, 8);
            return (
              <g key={i} ref={(el) => {
                tendrilRefs.current[i] = el;
              }} className="ww-tendril-push">
                <g
                  className={animated ? 'ww-tendril-creep' : undefined}
                  style={cssVars({
                    '--ww-dur': timing.duration,
                    '--ww-delay': timing.delay,
                    '--ww-creep-x': `${fmt((CANDLE.x - t.to.x) * 0.12)}px`,
                    '--ww-creep-y': `${fmt((CANDLE.y - t.to.y) * 0.12)}px`,
                  })}
                >
                  <path d={tendrilPaths[i]} fill="none" stroke={PALETTE.snuffBodyTop} strokeOpacity={0.16} strokeWidth={22} strokeLinejoin="round" />
                  <path d={tendrilPaths[i]} fill={ids.url('smoke')} opacity={0.55} />
                  <path d={tendrilPaths[i]} fill="none" stroke={PALETTE.snuffRim} strokeOpacity={0.45} strokeWidth={1.6} />
                  <path d={tipCurl(t)} fill="none" stroke={PALETTE.snuffRim} strokeOpacity={0.5} strokeWidth={2.4} strokeLinecap="round" />
                </g>
              </g>
            );
          })}
        </g>
        <Motes w={VW} h={VH} count={26} seed="title" color={PALETTE.candleGold} animated={animated} />
        <g ref={lightRef} className="ww-cursor-light" style={{ transform: `translate(${CANDLE.x + 180}px, ${CANDLE.y}px)` }}>
          <circle cx={0} cy={0} r={150} fill={ids.url('cursor')} />
          <circle cx={0} cy={0} r={4} fill={PALETTE.flameCore} opacity={0.8} />
        </g>
        <rect x={0} y={0} width={VW} height={VH} fill={ids.url('vignette')} pointerEvents="none" />
      </svg>
      {children && <div className="ww-scene-overlay">{children}</div>}
    </div>
  );
}
