/**
 * HUD and token icons (§15.4, §16.4): Flame (lit / spent wick), Hour Candle dread meter,
 * Gloam Bell, Glory, deck, discard, Hero Power, Undo, Hint, End Turn wax seal, Silencing
 * Peal bell, crown socket, First Light token and the bounty "Wanted" seal.
 */
import type { ReactElement } from 'react';
import { CLASS_FLAMES, PALETTE } from '../palette';
import { darken, lighten, mix } from '../util/color';
import { fmt, regularPolygon, polygonPath, scallopedEllipse, starPoints, teardropPath } from '../util/path';
import { animTiming, cssVars, useSvgIds } from '../util/svg';
import { IconSvg, type IconProps } from './IconSvg';

const INK = '#1A1222';

/* ---------------------------------------------------------------- flame */

export interface FlameIconProps extends IconProps {
  /** Lit flame (available Flame) or a spent, smoking wick. */
  lit?: boolean;
  /** Flame edge colour (defaults to candle gold). */
  color?: string;
  animated?: boolean;
  /** Pulse (the Flame a selected card would spend). */
  pending?: boolean;
}

/** One unit of Flame in the sconce row: a teardrop with dot eyes, or a smoking wick. */
export function FlameIcon({ lit = true, color = PALETTE.candleGold, animated = true, pending = false, size = 24, title, className }: FlameIconProps): ReactElement {
  const ids = useSvgIds('flm');
  const t = animTiming(ids.seed, 1.6, 2.4);
  return (
    <IconSvg size={size} viewBox="0 0 24 32" height={(size * 32) / 24} title={title ?? (lit ? 'Flame' : 'Spent Flame')} className={className} still={!animated}>
      <defs>
        <radialGradient id={ids.id('g')} cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor={PALETTE.flameCore} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      {/* brass sconce cup */}
      <path d="M5,24H19L17,28.6H7Z" fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />
      <rect x={4} y={22.4} width={16} height={2.4} rx={1.2} fill={lighten(PALETTE.brass, 0.25)} stroke="#4A3714" strokeWidth={0.6} />
      <path d="M12,22.4v-2.6" stroke={lit ? INK : '#0D0B12'} strokeWidth={1.2} strokeLinecap="round" />
      {lit ? (
        <g className={pending && animated ? 'ww-ready-pulse' : undefined}>
          <circle cx={12} cy={13} r={10} fill={color} opacity={0.18} />
          <g className={animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
            <path d={teardropPath(12, 21, 12.6, 19)} fill={ids.url('g')} />
          </g>
          <circle cx={9.9} cy={15.2} r={1.1} fill={PALETTE.eyeInk} />
          <circle cx={14.1} cy={15.2} r={1.1} fill={PALETTE.eyeInk} />
        </g>
      ) : (
        <g>
          <circle cx={12} cy={19.4} r={1.2} fill={PALETTE.ember} opacity={0.8} />
          <g className={animated ? 'ww-wisp' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
            <path d="M12,18c-2.4,-2.4 2.4,-4.4 0,-7.2s2.2,-4.2 0.4,-7" stroke={PALETTE.ashText} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.8} />
          </g>
        </g>
      )}
    </IconSvg>
  );
}

/* ---------------------------------------------------------- hour candle */

export interface HourCandleProps extends IconProps {
  /** Current Dread. */
  value: number;
  /** `dread_max` (M). */
  max: number;
  /** Play the gutter animation (Dread +1). */
  guttering?: boolean;
  animated?: boolean;
  showValue?: boolean;
}

/** Dread thresholds (§13.1.2): dimming ⌊M/3⌋, deep_dark ⌊2M/3⌋, long_night_falls M. */
export function dreadThresholds(max: number): { dimming: number; deepDark: number; longNight: number } {
  return { dimming: Math.floor(max / 3), deepDark: Math.floor((2 * max) / 3), longNight: max };
}

/**
 * Hour Candle dread meter: the candle burns down one notch per Dread. Threshold notches
 * are brass; as Dread rises the flame cools toward violet. `size` is the width in px.
 */
export function HourCandle({ value, max, guttering = false, animated = true, showValue = true, size = 40, title, className }: HourCandleProps): ReactElement {
  const ids = useSvgIds('hour');
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, value));
  const top = 14;
  const bottom = 98;
  const span = bottom - top;
  const waxTop = top + (span * v) / m;
  const { dimming, deepDark } = dreadThresholds(m);
  const out = v >= m;
  const flameEdge = mix(PALETTE.candleGold, PALETTE.plumeViolet, v / m);
  const t = animTiming(ids.seed, 1.6, 2.2);
  const notches: ReactElement[] = [];
  for (let i = 1; i < m; i++) {
    const y = top + (span * i) / m;
    const threshold = i === dimming || i === deepDark;
    notches.push(
      <path key={i} d={`M${threshold ? 9 : 13},${fmt(y)}H${threshold ? 31 : 17}`} stroke={threshold ? PALETTE.brass : '#6E5A3A'} strokeWidth={threshold ? 1.8 : 1} opacity={y < waxTop ? 0.35 : 1} />,
    );
  }
  return (
    <IconSvg size={size} viewBox="0 0 40 124" height={(size * 124) / 40} title={title ?? `Dread ${v} of ${m}`} className={className} still={!animated}>
      <defs>
        <linearGradient id={ids.id('wax')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C9B88F" />
          <stop offset="0.4" stopColor="#F4EAD2" />
          <stop offset="1" stopColor="#B7A57E" />
        </linearGradient>
        <radialGradient id={ids.id('flame')} cx="0.5" cy="0.78" r="0.75">
          <stop offset="0" stopColor={PALETTE.flameCore} />
          <stop offset="1" stopColor={flameEdge} />
        </radialGradient>
        <radialGradient id={ids.id('halo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={flameEdge} stopOpacity="0.5" />
          <stop offset="1" stopColor={flameEdge} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* burnt-away ghost of the full candle */}
      <rect x={12} y={top} width={16} height={fmt(waxTop - top)} rx={2} fill="none" stroke={PALETTE.engraving} strokeDasharray="2 2" />
      <rect x={12} y={fmt(waxTop)} width={16} height={fmt(bottom - waxTop)} fill={ids.url('wax')} />
      {!out && <path d={`M12,${fmt(waxTop)}h16v3a1.6,1.6 0 0 1 -3.2,0v-1a1.6,1.6 0 0 1 -3.2,0v4a1.6,1.6 0 0 1 -3.2,0v-3a1.6,1.6 0 0 1 -3.2,0Z`} fill="#FFF8E6" />}
      {notches}
      {/* brass holder */}
      <path d="M4,100H36L32,106H8Z" fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />
      <ellipse cx={20} cy={99} rx={17} ry={3} fill={lighten(PALETTE.brass, 0.25)} stroke="#4A3714" strokeWidth={0.8} />
      <path d="M14,106H26L28,112H12Z" fill={darken(PALETTE.brass, 0.25)} />
      {out ? (
        <path d={`M20,${fmt(waxTop - 2)}c-2,-3 2,-5 0,-9s2,-5 0,-8`} stroke={PALETTE.ashText} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      ) : (
        <g>
          <path d={`M20,${fmt(waxTop)}v-3`} stroke={INK} strokeWidth={1.2} />
          <circle cx={20} cy={fmt(waxTop - 9)} r={11} fill={ids.url('halo')} />
          <g className={guttering && animated ? 'ww-gutter' : animated ? 'ww-flicker' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
            <path d={teardropPath(20, waxTop - 2, 9, 15)} fill={ids.url('flame')} />
            <path d={teardropPath(20, waxTop - 2.4, 4.4, 8)} fill={PALETTE.flameCore} />
          </g>
        </g>
      )}
      {showValue && (
        <text className="ww-num ww-halo-text" x={20} y={122} fontSize={12} textAnchor="middle" fill={PALETTE.tallowText} stroke="#0D0B12" strokeWidth={2.6}>
          {v}/{m}
        </text>
      )}
    </IconSvg>
  );
}

/* ---------------------------------------------------------------- bells */

function bellShape(color: string, rim: string): ReactElement {
  return (
    <g>
      <path d="M16,4.6C10,4.6 8,9.6 8,15.6C8,20.4 6.6,22.6 4.6,24.4H27.4C25.4,22.6 24,20.4 24,15.6C24,9.6 22,4.6 16,4.6Z" fill={color} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M4.6,24.4H27.4" stroke={rim} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M12,8.6C10.6,11 10.4,14 10.4,17" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <path d="M14,3.4a2,2 0 1 1 4,0" stroke={INK} strokeWidth={1.4} fill="none" />
    </g>
  );
}

/** Gloam Bell: counts down the rounds until the next Gloam closing (§13.2.8). */
export function GloamBellIcon({ rounds, size = 32, title, className }: IconProps & { rounds?: number }): ReactElement {
  return (
    <IconSvg size={size} title={title ?? (rounds === undefined ? 'Gloam Bell' : `Gloam closes in ${rounds}`)} className={className}>
      <circle cx={16} cy={16} r={15.4} fill={PALETTE.gloamFog} opacity={0.55} />
      {bellShape(PALETTE.gloamBand, PALETTE.snuffRim)}
      <circle cx={16} cy={27.4} r={2.2} fill={PALETTE.snuffRim} stroke={INK} strokeWidth={0.8} />
      {rounds !== undefined && (
        <text className="ww-num ww-halo-text" x={16} y={20.4} fontSize={11} textAnchor="middle" fill="#FFFFFF" stroke={INK} strokeWidth={2.4}>
          {rounds}
        </text>
      )}
    </IconSvg>
  );
}

/** Silencing Peal: an iron bell with a hush stroke — each seat may play 1 card. */
export function PealBellIcon({ size = 32, title, className }: IconProps): ReactElement {
  return (
    <IconSvg size={size} title={title ?? 'Silencing Peal: 1 card'} className={className}>
      {bellShape('#4A4458', PALETTE.ashText)}
      <circle cx={16} cy={27.2} r={2.4} fill="#D2361F" stroke={INK} strokeWidth={0.8} />
      <path d="M5,5L27,27" stroke={PALETTE.tallowText} strokeWidth={4} strokeLinecap="round" />
      <path d="M5,5L27,27" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={26} cy={7} r={5.4} fill={PALETTE.tallowText} stroke={INK} strokeWidth={1} />
      <text className="ww-num" x={26} y={10.6} fontSize={9} textAnchor="middle" fill={INK}>
        1
      </text>
    </IconSvg>
  );
}

/* ----------------------------------------------------------- score bits */

/** Glory: a gold sun-medal with a laurel (Last Flame score). */
export function GloryIcon({ size = 32, title, className, value }: IconProps & { value?: number }): ReactElement {
  return (
    <IconSvg size={size} title={title ?? (value === undefined ? 'Glory' : `Glory ${value}`)} className={className}>
      <path d={polygonPath(starPoints(16, 16, 15, 11, 16, 0))} fill={PALETTE.sunriseGold} opacity={0.6} />
      <circle cx={16} cy={16} r={10.6} fill={PALETTE.sunriseGold} stroke="#7A5A12" strokeWidth={1.2} />
      <path d="M9.4,19.6C8.4,15.4 10,11 13.4,9M22.6,19.6C23.6,15.4 22,11 18.6,9" stroke="#7A5A12" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <path d="M9.6,16.4l-2,-0.8M10,13.4l-1.8,-1.4M11.4,10.8l-1.2,-1.8M22.4,16.4l2,-0.8M22,13.4l1.8,-1.4M20.6,10.8l1.2,-1.8" stroke="#7A5A12" strokeWidth={1.1} strokeLinecap="round" />
      {value === undefined ? (
        <path d={teardropPath(16, 22, 6.4, 10)} fill="#FFF3C4" stroke="#7A5A12" strokeWidth={0.8} />
      ) : (
        <text className="ww-num" x={16} y={20.4} fontSize={value >= 10 ? 10 : 12} textAnchor="middle" fill="#3A2A08">
          {value}
        </text>
      )}
    </IconSvg>
  );
}

/** Crown socket (Guttered King Checkmates; boss HP bar). */
export function CrownSocketIcon({ filled = false, size = 24, title, className }: IconProps & { filled?: boolean }): ReactElement {
  return (
    <IconSvg size={size} viewBox="0 0 24 24" title={title ?? (filled ? 'Crown socket (filled)' : 'Crown socket')} className={className}>
      <path d="M3,18L2,7L7.4,11L12,4L16.6,11L22,7L21,18Z" fill={PALETTE.brass} stroke="#4A3714" strokeWidth={1} strokeLinejoin="round" />
      <circle cx={12} cy={14} r={3.6} fill="#2A1E10" stroke="#4A3714" strokeWidth={0.8} />
      {filled && <circle cx={12} cy={14} r={2.8} fill={PALETTE.sunriseGold} />}
      {filled && <circle cx={11.1} cy={13.1} r={0.9} fill="#FFFFFF" opacity={0.85} />}
      <path d="M3,20.6H21" stroke={PALETTE.brass} strokeWidth={1.6} strokeLinecap="round" />
    </IconSvg>
  );
}

/** First Light: the first-player token — a brass disc with a dawn candle. */
export function FirstLightToken({ size = 32, title, className }: IconProps): ReactElement {
  const rays = starPoints(16, 17, 14.6, 9, 12, -Math.PI / 2);
  return (
    <IconSvg size={size} title={title ?? 'First Light'} className={className}>
      <path d={polygonPath(rays)} fill={PALETTE.sunriseGold} opacity={0.7} />
      <circle cx={16} cy={17} r={10} fill={PALETTE.brass} stroke="#4A3714" strokeWidth={1.2} />
      <circle cx={16} cy={17} r={8} fill="none" stroke={lighten(PALETTE.brass, 0.35)} strokeWidth={0.8} />
      <rect x={13.6} y={15} width={4.8} height={8.4} rx={1} fill="#F4EAD2" stroke="#6E5A3A" strokeWidth={0.6} />
      <path d={teardropPath(16, 14.6, 4.4, 7.4)} fill={PALETTE.candleGold} />
      <path d={teardropPath(16, 14.2, 2, 3.8)} fill={PALETTE.flameCore} />
    </IconSvg>
  );
}

/** Wax seal base shape for seals (End Turn, Wanted). */
function sealDisc(cx: number, cy: number, r: number, wax: string, ids: ReturnType<typeof useSvgIds>): ReactElement {
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('wax')} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor={lighten(wax, 0.28)} />
          <stop offset="0.55" stopColor={wax} />
          <stop offset="1" stopColor={darken(wax, 0.45)} />
        </radialGradient>
      </defs>
      <path d={scallopedEllipse(cx, cy + 1.2, r, r, 13, 0.045)} fill={darken(wax, 0.5)} />
      <path d={scallopedEllipse(cx, cy, r, r, 13, 0.045)} fill={ids.url('wax')} />
      <circle cx={cx} cy={cy} r={r * 0.74} fill="none" stroke={darken(wax, 0.4)} strokeWidth={r * 0.05} />
      <circle cx={cx} cy={cy - r * 0.02} r={r * 0.74} fill="none" stroke={lighten(wax, 0.3)} strokeWidth={r * 0.025} opacity={0.6} />
    </g>
  );
}

/** Bounty "Wanted" seal shown on the sole Glory leader's plaque (§13.2.4). */
export function WantedSeal({ size = 40, title, className }: IconProps): ReactElement {
  const ids = useSvgIds('wanted');
  return (
    <IconSvg size={size} viewBox="0 0 48 48" title={title ?? 'Wanted'} className={className}>
      <defs>
        <path id={ids.id('arc')} d="M10,24A14,14 0 0 1 38,24" />
      </defs>
      {sealDisc(24, 24, 21, PALETTE.sealRed, ids)}
      <text className="ww-num" fontSize={7.4} fill={PALETTE.flameCore} letterSpacing={1.2}>
        <textPath href={`#${ids.id('arc')}`} startOffset="50%" textAnchor="middle">
          WANTED
        </textPath>
      </text>
      <path d="M16,33L15,25.6L19.6,28.6L24,22.6L28.4,28.6L33,25.6L32,33Z" fill={PALETTE.sunriseGold} stroke="#4A1014" strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M16,35.4H32" stroke={PALETTE.sunriseGold} strokeWidth={1.4} />
    </IconSvg>
  );
}

/* ------------------------------------------------------------- buttons */

export interface EndTurnSealProps extends IconProps {
  label?: string;
  /** Pulses when nothing is left to do (§15.4). */
  pulsing?: boolean;
  /** Touch: armed after the first tap (preview showing). */
  armed?: boolean;
  animated?: boolean;
}

/** End Turn: a large wax seal stamped with a candle snuffer. */
export function EndTurnSeal({ label = 'END TURN', pulsing = false, armed = false, animated = true, size = 96, title, className }: EndTurnSealProps): ReactElement {
  const ids = useSvgIds('endturn');
  return (
    <IconSvg size={size} viewBox="0 0 96 96" title={title ?? 'End Turn'} className={className} still={!animated}>
      <defs>
        <radialGradient id={ids.id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.6" stopColor={PALETTE.candleGold} stopOpacity="0.5" />
          <stop offset="1" stopColor={PALETTE.candleGold} stopOpacity="0" />
        </radialGradient>
      </defs>
      {(pulsing || armed) && <circle className={animated ? 'ww-ready-pulse' : undefined} cx={48} cy={48} r={47} fill={ids.url('glow')} />}
      {sealDisc(48, 47, 40, armed ? '#A8342C' : PALETTE.sealRed, ids)}
      {/* emblem: a crescent moon cradling a candle flame — the night moves on */}
      <path d="M62.6,22.6A17,17 0 1 0 62.6,51.4A13.4,13.4 0 1 1 62.6,22.6Z" fill={PALETTE.sunriseGold} stroke="#4A1014" strokeWidth={1.2} transform="rotate(-24 48 37)" />
      <path d={teardropPath(51, 46, 9, 16)} fill={PALETTE.flameCore} stroke="#4A1014" strokeWidth={0.9} />
      <path d={teardropPath(51, 45.4, 4.2, 8)} fill={PALETTE.sunriseGold} />
      <circle cx={38} cy={24} r={1.4} fill={PALETTE.sunriseGold} />
      <circle cx={63} cy={45} r={1.1} fill={PALETTE.sunriseGold} />
      <text className="ww-num ww-halo-text" x={48} y={67} fontSize={label.length > 8 ? 10.4 : 12} textAnchor="middle" fill={PALETTE.flameCore} stroke="#3A0C10" strokeWidth={2.4} letterSpacing={0.8}>
        {label}
      </text>
    </IconSvg>
  );
}

/** Undo: a curling wax-drip arrow. */
export function UndoIcon({ size = 32, title, className }: IconProps): ReactElement {
  return (
    <IconSvg size={size} title={title ?? 'Undo'} className={className}>
      <path d="M9,12H19A7.4,7.4 0 0 1 19,26.8H11" stroke={PALETTE.tallowText} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <path d="M12,5.4L4.6,12L12,18.6Z" fill={PALETTE.tallowText} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M15,26.8v2.4a1.4,1.4 0 0 0 2.8,0v-2.4" fill={PALETTE.tallowText} />
    </IconSvg>
  );
}

/** Hint: a little lantern with a question-mark glow. */
export function HintIcon({ size = 32, title, className }: IconProps): ReactElement {
  return (
    <IconSvg size={size} title={title ?? 'Hint'} className={className}>
      <circle cx={16} cy={18} r={13} fill={PALETTE.candleGold} opacity={0.18} />
      <path d="M13,4.6a3,3 0 0 1 6,0" stroke={PALETTE.brass} strokeWidth={1.4} fill="none" />
      <path d="M9.6,9.6L16,5.4L22.4,9.6Z" fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />
      <rect x={9.6} y={9.6} width={12.8} height={15} rx={1.4} fill={mix(PALETTE.candleGold, '#FFFFFF', 0.25)} stroke={PALETTE.brass} strokeWidth={1.6} />
      <rect x={8.6} y={24.4} width={14.8} height={3.2} rx={1.2} fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />
      <text className="ww-num" x={16} y={21.6} fontSize={11} textAnchor="middle" fill="#5E3A0C">
        ?
      </text>
    </IconSvg>
  );
}

/** Deck: a stack of matchbook-red card backs with an optional count. */
export function DeckIcon({ count, size = 32, title, className }: IconProps & { count?: number }): ReactElement {
  return (
    <IconSvg size={size} title={title ?? (count === undefined ? 'Deck' : `Deck: ${count}`)} className={className}>
      {[3, 1.5, 0].map((o, i) => (
        <g key={i}>
          <rect x={7 + o} y={4 + o} width={16} height={22} rx={2} fill={i === 2 ? PALETTE.matchbookRed : darken(PALETTE.matchbookRed, 0.25)} stroke={PALETTE.brass} strokeWidth={1} />
        </g>
      ))}
      <rect x={7} y={22} width={16} height={4} fill="#3A2A1E" />
      <path d="M15,9.4C13,7.6 10.6,8.6 11.4,10.6C10.2,12.4 13,13 15,11.4C17,13 19.8,12.4 18.6,10.6C19.4,8.6 17,7.6 15,9.4Z" fill={PALETTE.candleGold} />
      {count !== undefined && (
        <g>
          <circle cx={24} cy={24} r={6.6} fill={PALETTE.tallowText} stroke={INK} strokeWidth={1} />
          <text className="ww-num" x={24} y={27.4} fontSize={count >= 10 ? 7.6 : 9} textAnchor="middle" fill={INK}>
            {count}
          </text>
        </g>
      )}
    </IconSvg>
  );
}

/** Discard: scorched, scattered cards with a curl of smoke. */
export function DiscardIcon({ count, size = 32, title, className }: IconProps & { count?: number }): ReactElement {
  return (
    <IconSvg size={size} title={title ?? (count === undefined ? 'Discard' : `Discard: ${count}`)} className={className}>
      <rect x={5} y={9} width={14} height={19} rx={2} fill="#B9AA88" stroke={INK} strokeWidth={1} transform="rotate(-16 12 18)" />
      <rect x={12} y={8} width={14} height={19} rx={2} fill="#D8C6A0" stroke={INK} strokeWidth={1} transform="rotate(10 19 17)" />
      <path d="M15.4,26.6Q19,24 22.8,27.6L21.4,22.4Q18,20.6 16,23Z" fill="#3A2A1E" opacity={0.6} />
      <path d="M21,8c-2,-2 1.6,-3.4 0,-5.6" stroke={PALETTE.ashText} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {count !== undefined && (
        <g>
          <circle cx={24} cy={24} r={6.6} fill={PALETTE.tallowText} stroke={INK} strokeWidth={1} />
          <text className="ww-num" x={24} y={27.4} fontSize={count >= 10 ? 7.6 : 9} textAnchor="middle" fill={INK}>
            {count}
          </text>
        </g>
      )}
    </IconSvg>
  );
}

/* ------------------------------------------------------------ hero power */

const POWER_EMBLEMS: Readonly<Record<string, (c: string) => ReactElement>> = {
  // lantern_oath: a shield with a lantern flame
  sconce_paladin: (c) => (
    <g>
      <path d="M16,6L24,9V16C24,21 20.4,24.6 16,26.4C11.6,24.6 8,21 8,16V9Z" fill={darken(c, 0.55)} stroke={c} strokeWidth={1.6} strokeLinejoin="round" />
      <path d={teardropPath(16, 21, 6.4, 10.6)} fill={c} />
      <path d={teardropPath(16, 20.4, 3, 5.4)} fill={PALETTE.flameCore} />
    </g>
  ),
  // flutterswap: two moths and a swap loop
  moth_witch: (c) => (
    <g>
      <path d="M8,22C8,13 24,19 24,10" stroke={c} strokeWidth={1.4} fill="none" strokeDasharray="2 2" />
      {[
        [9, 22],
        [23, 10],
      ].map(([x, y]) => (
        <path key={x} d={`M${x},${y}c-2.6,-3.4 -5,-1.8 -3.6,0.6c-1.4,2 1.2,3 3.6,0c2.4,3 5,2 3.6,0c1.4,-2.4 -1,-4 -3.6,-0.6Z`} fill={c} stroke={INK} strokeWidth={0.6} />
      ))}
    </g>
  ),
  // castle: a tower with a swap arrow
  lampwright: (c) => (
    <g>
      <path d="M10,26V12H8.4V7H11.6V9H14.4V7H17.6V9H20.4V7H23.6V12H22V26Z" fill={darken(c, 0.5)} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M13,18h6M17,15.6L19.6,18L17,20.4" stroke={c} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  // shadowstep: a dashing ember silhouette
  ember_duelist: (c) => (
    <g>
      <path d="M6,12h6M4,16h7M6,20h6" stroke={c} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
      <path d={teardropPath(19, 25, 9, 17)} fill={c} transform="rotate(20 19 18)" />
      <path d={teardropPath(19, 24, 4.4, 9)} fill={PALETTE.flameCore} transform="rotate(20 19 18)" />
    </g>
  ),
};

export interface HeroPowerIconProps extends IconProps {
  /** Hero id; selects the power emblem and class flame colour. */
  heroId: string;
  /** Used this turn: dim the medallion. */
  used?: boolean;
  cost?: number;
}

/** Hero Power button art: a brass medallion with the hero's power emblem and Flame cost. */
export function HeroPowerIcon({ heroId, used = false, cost, size = 48, title, className }: HeroPowerIconProps): ReactElement {
  const flame = CLASS_FLAMES[heroId]?.edge ?? PALETTE.candleGold;
  const emblem = POWER_EMBLEMS[heroId];
  return (
    <IconSvg size={size} title={title ?? 'Hero Power'} className={className}>
      <g opacity={used ? 0.45 : 1}>
        <path d={polygonPath(regularPolygon(16, 16, 15.4, 8, Math.PI / 8))} fill={PALETTE.velvetDusk} stroke={PALETTE.brass} strokeWidth={1.4} strokeLinejoin="round" />
        <circle cx={16} cy={16} r={12} fill="none" stroke={flame} strokeOpacity={0.6} strokeWidth={0.8} />
        {emblem ? emblem(flame) : <path d={polygonPath(starPoints(16, 16, 9, 4, 5))} fill={flame} />}
      </g>
      {cost !== undefined && (
        <g>
          <path d={teardropPath(26, 31.6, 9, 12)} fill={PALETTE.candleGold} stroke={INK} strokeWidth={0.8} />
          <text className="ww-num" x={26} y={29.6} fontSize={7.6} textAnchor="middle" fill={INK}>
            {cost}
          </text>
        </g>
      )}
    </IconSvg>
  );
}
