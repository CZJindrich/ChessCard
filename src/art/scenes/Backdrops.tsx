/**
 * In-game and screen backdrops (§15.1, §16.8): the static in-play sky with drifting motes,
 * the Dawn Breaks sunrise, the Long Night defeat eyespots and the boss-intro rise.
 */
import type { ReactElement, ReactNode } from 'react';
import { BossArt } from '../bosses/BossArt';
import { PALETTE } from '../palette';
import { fmt, polygonPath, starPoints } from '../util/path';
import { cssVars, cx, useSvgIds } from '../util/svg';
import { MothMoon, Motes, SkyGradient, SkylineSvgLayer, Stars } from './parts';
import type { SkylineOptions } from './skyline';
import '../art.css';
import './scenes.css';

const VW = 1600;
const VH = 900;

const SKY_FAR: SkylineOptions = { width: VW, baseline: 820, minHeight: 90, maxHeight: 220, unit: 70, seed: 'sky-far', litChance: 0.1 };
const SKY_NEAR: SkylineOptions = { width: VW, baseline: 900, minHeight: 80, maxHeight: 200, unit: 110, seed: 'sky-near', litChance: 0.16, cathedralX: 1180 };

interface BackdropProps {
  reducedMotion?: boolean;
  className?: string;
  children?: ReactNode;
}

function Scene({ className, label, still, svg, children }: { className: string; label: string; still: boolean; svg: ReactNode; children?: ReactNode }): ReactElement {
  return (
    <div className={cx('ww-scene', className, still && 'ww-still')}>
      <svg className="ww-art ww-scene-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
        {svg}
      </svg>
      {children && <div className="ww-scene-overlay">{children}</div>}
    </div>
  );
}

/**
 * Static sky behind the board (§16.8: no parallax in play) with drifting motes.
 * `dread` (0–1) cools and darkens the horizon as the Long Night approaches.
 */
export function SkyBackdrop({ reducedMotion = false, className, children, dread = 0 }: BackdropProps & { dread?: number }): ReactElement {
  const ids = useSvgIds('skybd');
  const animated = !reducedMotion;
  const d = Math.max(0, Math.min(1, dread));
  return (
    <Scene
      className={cx('ww-sky-backdrop', className)}
      label="Night sky over Sconcewick"
      still={reducedMotion}
      svg={
        <>
          <SkyGradient ids={ids} w={VW} h={VH} />
          <Stars w={VW} h={600} count={70} seed="sky" animated={false} />
          <MothMoon ids={ids} x={1320} y={170} r={74} />
          <SkylineSvgLayer options={SKY_FAR} fill="#231C30" animated={false} windowAlpha={0.35} />
          <SkylineSvgLayer options={SKY_NEAR} fill="#15111D" animated={false} windowAlpha={0.55} />
          <Motes w={VW} h={VH} count={24} seed="sky" color={PALETTE.mothSilver} animated={animated} rise={220} />
          <rect x={0} y={0} width={VW} height={VH} fill="#05040A" opacity={fmt(0.15 + d * 0.35)} />
        </>
      }
    >
      {children}
    </Scene>
  );
}

/** "Dawn Breaks": a gold radial sunrise sweeps up over the spires (3 s). */
export function VictorySunrise({ reducedMotion = false, className, children }: BackdropProps): ReactElement {
  const ids = useSvgIds('sunrise');
  const animated = !reducedMotion;
  return (
    <Scene
      className={cx('ww-victory-sunrise', className)}
      label="Dawn breaks over Sconcewick"
      still={reducedMotion}
      svg={
        <>
          <defs>
            <radialGradient id={ids.id('dawn')} cx="0.5" cy="1" r="1">
              <stop offset="0" stopColor={PALETTE.flameCore} />
              <stop offset="0.22" stopColor={PALETTE.sunriseGold} />
              <stop offset="0.5" stopColor="#E89A5A" stopOpacity="0.85" />
              <stop offset="0.8" stopColor="#6A4C7C" stopOpacity="0.4" />
              <stop offset="1" stopColor="#2A2238" stopOpacity="0" />
            </radialGradient>
          </defs>
          <SkyGradient
            ids={ids}
            w={VW}
            h={VH}
            stops={[
              [0, '#1C1530'],
              [0.6, '#4A3358'],
              [1, '#8A5A5A'],
            ]}
          />
          <g className={animated ? 'ww-sunrise-wipe' : undefined}>
            <ellipse cx={800} cy={900} rx={1300} ry={900} fill={ids.url('dawn')} />
          </g>
          <g className={animated ? 'ww-sun-rays' : undefined}>
            <path d={polygonPath(starPoints(800, 720, 900, 120, 18))} fill={PALETTE.sunriseGold} opacity={0.12} />
          </g>
          <circle cx={800} cy={720} r={190} fill={PALETTE.sunriseGold} opacity={0.35} />
          <circle cx={800} cy={720} r={120} fill={PALETTE.flameCore} opacity={0.95} />
          <SkylineSvgLayer options={SKY_FAR} fill="#5A3E52" animated={false} windowAlpha={0} />
          <SkylineSvgLayer options={SKY_NEAR} fill="#2A1C2C" animated={false} windowColor={PALETTE.sunriseGold} windowAlpha={0.9} />
          <Motes w={VW} h={VH} count={30} seed="dawn" color={PALETTE.sunriseGold} animated={animated} rise={260} />
        </>
      }
    >
      {children}
    </Scene>
  );
}

/** "The Long Night Falls": black, then two moth eyespots slowly open. */
export function DefeatEyespots({ reducedMotion = false, className, children }: BackdropProps): ReactElement {
  const ids = useSvgIds('defeat');
  const animated = !reducedMotion;
  const eye = (x: number, key: string): ReactElement => (
    <g key={key} className={animated ? 'ww-eyespot-open' : undefined}>
      <circle cx={x} cy={420} r={150} fill={ids.url('spotGlow')} />
      <circle cx={x} cy={420} r={110} fill="#1A1424" stroke={PALETTE.mothSilver} strokeOpacity={0.35} strokeWidth={4} />
      <circle cx={x} cy={420} r={86} fill={PALETTE.tileHotWaxBottom} opacity={0.75} />
      <circle cx={x} cy={420} r={62} fill="#0B0910" />
      <circle cx={x} cy={420} r={34} fill={PALETTE.snuffEye} opacity={0.85} />
      <circle cx={x - 18} cy={400} r={12} fill="#FFFFFF" opacity={0.7} />
    </g>
  );
  return (
    <Scene
      className={cx('ww-defeat-eyespots', className)}
      label="The Long Night falls"
      still={reducedMotion}
      svg={
        <>
          <defs>
            <radialGradient id={ids.id('spotGlow')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.6" stopColor={PALETTE.snuffEye} stopOpacity="0.25" />
              <stop offset="1" stopColor={PALETTE.snuffEye} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={VW} height={VH} fill="#050407" />
          {/* the faint outline of vast wings */}
          <g className={animated ? 'ww-wing-reveal' : undefined} fill="none" stroke={PALETTE.mothSilver} strokeOpacity={0.12} strokeWidth={3}>
            <path d="M780,470C700,180 360,60 120,160C0,260 120,520 760,520Z" />
            <path d="M820,470C900,180 1240,60 1480,160C1600,260 1480,520 840,520Z" />
            <path d="M770,540C560,600 380,780 470,860C560,920 700,760 790,580Z" />
            <path d="M830,540C1040,600 1220,780 1130,860C1040,920 900,760 810,580Z" />
          </g>
          {eye(470, 'l')}
          {eye(1130, 'r')}
        </>
      }
    >
      {children}
    </Scene>
  );
}

/** Boss intro (§15.1): the screen dims, a bell tolls, the boss silhouette rises from smoke. */
export function BossIntroBackdrop({ bossId, reducedMotion = false, className, children }: BackdropProps & { bossId: string }): ReactElement {
  const ids = useSvgIds('bossintro');
  const animated = !reducedMotion;
  return (
    <div className={cx('ww-scene ww-boss-intro', reducedMotion && 'ww-still', className)}>
      <svg className="ww-art ww-scene-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="A boss rises from the smoke">
        <defs>
          <radialGradient id={ids.id('dim')} cx="0.5" cy="0.55" r="0.75">
            <stop offset="0" stopColor="#2A1F3A" />
            <stop offset="1" stopColor="#050407" />
          </radialGradient>
          <radialGradient id={ids.id('billow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={PALETTE.snuffBodyTop} stopOpacity="0.75" />
            <stop offset="1" stopColor={PALETTE.snuffBodyBottom} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={VW} height={VH} fill={ids.url('dim')} />
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            className={animated ? 'ww-bell-ring' : undefined}
            style={cssVars({ '--ww-delay': `${i * 0.5}s` })}
            cx={800}
            cy={430}
            r={360}
            fill="none"
            stroke={PALETTE.snuffRim}
            strokeOpacity={animated ? 0.5 : 0.12}
            strokeWidth={4}
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <ellipse
            key={i}
            className={animated ? 'ww-smoke-billow' : undefined}
            style={cssVars({ '--ww-dur': `${6 + (i % 3)}s`, '--ww-delay': `${-i * 0.9}s` })}
            cx={80 + i * 180}
            cy={860 - (i % 2) * 40}
            rx={260}
            ry={140}
            fill={ids.url('billow')}
          />
        ))}
      </svg>
      <div className={cx('ww-boss-intro-figure', animated && 'ww-boss-rise')}>
        <BossArt bossId={bossId} silhouette size={560} animated={false} />
      </div>
      {children && <div className="ww-scene-overlay">{children}</div>}
    </div>
  );
}
