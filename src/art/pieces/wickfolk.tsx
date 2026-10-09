/**
 * Wickfolk silhouettes (§16.6): warm, glowing, soft-edged wax figures with dot eyes.
 * Every figure stands on the seal base (top surface around y = 52) inside a 64×64 box.
 */
import type { ReactElement } from 'react';
import { PALETTE } from '../palette';
import { darken, lighten, mix } from '../util/color';
import { fmt, polygonPath, scallopedEllipse, smoothOpenPath, starPoints } from '../util/path';
import { animTiming, cssVars } from '../util/svg';
import { Blush, Drips, Eyes, Flame, Sparks, WaxShape, type PieceKit } from './kit';
import { blob, candleBody, circlePath, ellipsePath, pts, roundedRect } from './shapes';

export interface FigureProps {
  kit: PieceKit;
}

/* ------------------------------------------------------------ small parts */

function BrassPlate({ kit, d }: { kit: PieceKit; d: string }): ReactElement {
  return (
    <g>
      <path d={d} fill={kit.ids.url('brass')} />
      <path className="ww-outline" d={d} fill="none" stroke="#4A3714" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

function Rivet({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g>
      <circle cx={x} cy={y} r={0.9} fill="#5E4718" />
      <circle cx={x - 0.25} cy={y - 0.25} r={0.4} fill="#FFF0C0" />
    </g>
  );
}

/** Pawn skirt + collar shared by the Taper family. */
function PawnSkirt({ kit, top = 38, width = 11 }: { kit: PieceKit; top?: number; width?: number }): ReactElement {
  const d = `M${fmt(32 - width)},53C${fmt(32 - width)},47 ${fmt(27)},45.5 27.4,${fmt(top)}L36.6,${fmt(top)}C37,45.5 ${fmt(32 + width)},47 ${fmt(32 + width)},53Z`;
  return (
    <g>
      <WaxShape kit={kit} d={d} />
      <WaxShape kit={kit} d={ellipsePath(32, top, 7.6, 2.3)} />
    </g>
  );
}

/* ------------------------------------------------------------------ units */

export function TaperFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <PawnSkirt kit={kit} />
      <WaxShape kit={kit} d={blob(pts([32, 20.4, 37.8, 22.6, 40.2, 28.4, 38, 34.6, 32, 36.6, 26, 34.6, 23.8, 28.4, 26.2, 22.6]), 0.95)} />
      <Drips kit={kit} drips={[{ x: 27, y: 22.6, len: 5.5 }, { x: 36.8, y: 22.4, len: 7.5 }, { x: 39.2, y: 26, len: 4 }]} />
      <Eyes kit={kit} x={32} y={29} gap={6.2} />
      <Blush x={32} y={32.4} gap={10} />
      <Flame kit={kit} x={32} y={20.2} size={11} />
    </g>
  );
}

function Crown({ kit, cx, y, w }: { kit: PieceKit; cx: number; y: number; w: number }): ReactElement {
  const h = w * 0.62;
  const d =
    `M${fmt(cx - w / 2)},${fmt(y)}L${fmt(cx - w / 2 - 0.6)},${fmt(y - h)}L${fmt(cx - w / 4)},${fmt(y - h * 0.45)}` +
    `L${fmt(cx)},${fmt(y - h * 1.15)}L${fmt(cx + w / 4)},${fmt(y - h * 0.45)}L${fmt(cx + w / 2 + 0.6)},${fmt(y - h)}L${fmt(cx + w / 2)},${fmt(y)}Z`;
  return (
    <g>
      <BrassPlate kit={kit} d={d} />
      <circle cx={fmt(cx - w / 2 - 0.6)} cy={fmt(y - h)} r={0.9} fill={PALETTE.flameCore} />
      <circle cx={fmt(cx + w / 2 + 0.6)} cy={fmt(y - h)} r={0.9} fill={PALETTE.flameCore} />
      <circle cx={fmt(cx)} cy={fmt(y - h * 0.4)} r={1} fill="#C8455A" />
    </g>
  );
}

export function TaperCaptainFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <PawnSkirt kit={kit} width={12} />
      {/* officer's sash across the skirt */}
      <path d="M24.5,48.5L37.8,40.2L39.4,42.8L26.6,51Z" fill={kit.wax.deep} opacity={0.55} />
      <WaxShape kit={kit} d={blob(pts([32, 19.4, 38.3, 21.8, 40.8, 28.2, 38.4, 34.8, 32, 36.8, 25.6, 34.8, 23.2, 28.2, 25.7, 21.8]), 0.95)} />
      <Drips kit={kit} drips={[{ x: 26.6, y: 23.4, len: 5 }, { x: 38.6, y: 24, len: 6.5 }, { x: 24.4, y: 27.4, len: 3.4, w: 2.2 }]} />
      <Crown kit={kit} cx={32} y={23} w={11} />
      <Eyes kit={kit} x={32} y={29.2} gap={6.4} />
      <Blush x={32} y={32.6} gap={10.4} />
      <Flame kit={kit} x={32} y={15.4} size={10} />
    </g>
  );
}

export function WickhorseFigure({ kit }: FigureProps): ReactElement {
  const head = blob(
    pts([
      26.5, 45, 29.5, 38.5, 30.2, 33.6, 25.4, 34.6, 21, 34.2, 18.6, 31.6, 19.4, 28.6, 24.6, 22.6, 26.4, 16.6, 28.6, 14.2, 29.6, 18.4,
      32.6, 14.6, 34.6, 18.6, 39.6, 22.6, 42.2, 30, 42.4, 38.6, 41.6, 45,
    ]),
    0.6,
  );
  return (
    <g>
      <WaxShape kit={kit} d="M20.5,53C20.5,48 25,45.4 26,43.4L42,43.4C43,45.4 43.5,48 43.5,53Z" />
      <WaxShape kit={kit} d={ellipsePath(34, 43.6, 8.6, 2.2)} />
      <WaxShape kit={kit} d={head} />
      {/* mane drips down the back of the neck */}
      <Drips kit={kit} drips={[{ x: 39.6, y: 24, len: 5 }, { x: 41.6, y: 30, len: 6, w: 2.4 }, { x: 36.4, y: 19.6, len: 3.6, w: 2.2 }]} />
      <circle cx={21.2} cy={30.6} r={0.9} fill={kit.wax.deep} />
      <path d="M21.4,33.2q2.4,0.8 4.4,-0.2" stroke={kit.wax.deep} strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <Eyes kit={kit} x={28.2} y={25} single size={1.1} />
      <Flame kit={kit} x={34.6} y={18.2} size={10.5} lean={14} />
    </g>
  );
}

export function IncenseAcolyteFigure({ kit }: FigureProps): ReactElement {
  const censerTiming = animTiming(`${kit.seed}censer`, 2.2, 2.8);
  const mitre = 'M23.4,31.6C22.6,24.6 26.6,18 32,13C37.4,18 41.4,24.6 40.6,31.6Z';
  return (
    <g>
      <WaxShape kit={kit} d={candleBody(32, 30, 53, 9, 10.6, 0)} />
      <WaxShape kit={kit} d={mitre} fill={lighten(kit.wax.base, 0.25)} />
      <path d="M23.6,28.6Q32,30.6 40.4,28.6L40.6,31.6Q32,33.4 23.4,31.6Z" fill={kit.ids.url('brass')} />
      <path d="M32,14.6V28.8" stroke={kit.ids.url('brass')} strokeWidth={2} />
      <path d="M34.6,17.2L29.4,24.2" stroke={kit.wax.deep} strokeWidth={0.9} strokeLinecap="round" opacity={0.7} />
      <Drips kit={kit} drips={[{ x: 26, y: 33, len: 5 }, { x: 37.6, y: 33, len: 7 }, { x: 31, y: 33.4, len: 3.4, w: 2.2 }]} />
      <Eyes kit={kit} x={32} y={38.4} gap={6} />
      <Blush x={32} y={41.6} gap={10} />
      <Flame kit={kit} x={32} y={13.2} size={8.5} />
      {/* censer on a chain from the right hand, swinging gently */}
      <g
        className={kit.animated ? 'ww-swing' : undefined}
        style={cssVars({ '--ww-pivot-x': '41.5px', '--ww-pivot-y': '36px', '--ww-dur': censerTiming.duration })}
      >
        <path d="M41.5,36L46,44.4" stroke="#6E5320" strokeWidth={0.8} strokeDasharray="1 0.6" />
        <path d="M43,45.2A3.6,3.4 0 0 0 50.2,45.2Z" fill={kit.ids.url('brass')} stroke="#4A3714" strokeWidth={0.6} />
        <path d="M43.4,45A3.2,2.4 0 0 1 49.8,45Z" fill="#8C6B2A" stroke="#4A3714" strokeWidth={0.5} />
        <path d="M46.6,42.2c-1.2,-1.6 0.6,-2.6 0,-4.2c-0.5,-1.4 1,-2.4 1.6,-3" stroke={PALETTE.moonsilver} strokeOpacity={0.6} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      </g>
      <WaxShape kit={kit} d={ellipsePath(41.2, 37.2, 2.2, 1.8)} />
    </g>
  );
}

export function SconceSquireFigure({ kit }: FigureProps): ReactElement {
  const shield = 'M27.4,31.4H44.6V39.6C44.6,45.2 40.4,49.4 36,51.6C31.6,49.4 27.4,45.2 27.4,39.6Z';
  return (
    <g>
      <WaxShape kit={kit} d={candleBody(30, 21, 53, 8.6, 9.6)} />
      <Drips kit={kit} drips={[{ x: 23.6, y: 23, len: 6 }, { x: 35.4, y: 22.6, len: 4.5 }, { x: 28, y: 23.4, len: 3, w: 2.2 }]} />
      <Eyes kit={kit} x={29.4} y={27.4} gap={6} />
      <Flame kit={kit} x={30} y={21.4} size={10.5} />
      <path d={shield} fill={darken(kit.wax.base, 0.42)} />
      <path d={shield} fill={kit.ids.url('glow')} opacity={0.5} />
      <path className="ww-outline" d={shield} fill="none" stroke={kit.ids.url('brass')} strokeWidth={2.2} strokeLinejoin="round" />
      {/* chevron and boss */}
      <path d="M30.6,41.2L36,36.4L41.4,41.2" stroke={kit.ids.url('brass')} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      <circle cx={36} cy={44.6} r={1.6} fill={kit.ids.url('brass')} />
    </g>
  );
}

export function BrassRamFigure({ kit }: FigureProps): ReactElement {
  const tower =
    'M20.6,53L21.4,22.4H19.6V14.6H25V17.8H29.2V14.6H34.8V17.8H39V14.6H44.4V22.4H42.6L43.4,53Z';
  return (
    <g>
      <WaxShape kit={kit} d={tower} />
      <path d="M21.4,22.4H42.6" stroke={kit.wax.deep} strokeWidth={0.8} opacity={0.5} />
      <path d="M21.2,46.6H42.8" stroke={kit.ids.url('brass')} strokeWidth={2} />
      <Drips kit={kit} drips={[{ x: 22.4, y: 22.6, len: 5 }, { x: 41.4, y: 22.6, len: 7 }, { x: 25.6, y: 22.6, len: 3, w: 2.2 }]} />
      {/* ram head: brass face plate with curled horns */}
      <BrassPlate kit={kit} d="M27.4,26.4H36.6L35.6,36.6Q32,41.4 28.4,36.6Z" />
      <path d={smoothOpenPath(pts([28, 28, 23.4, 26.2, 20.6, 29.6, 22.2, 33.6, 25.8, 33, 25.6, 30.6]))} stroke={kit.ids.url('brass')} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d={smoothOpenPath(pts([36, 28, 40.6, 26.2, 43.4, 29.6, 41.8, 33.6, 38.2, 33, 38.4, 30.6]))} stroke={kit.ids.url('brass')} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d={smoothOpenPath(pts([28, 28, 23.4, 26.2, 20.6, 29.6, 22.2, 33.6, 25.8, 33, 25.6, 30.6]))} stroke="#4A3714" strokeWidth={0.6} fill="none" strokeDasharray="1.2 1.2" />
      <path d={smoothOpenPath(pts([36, 28, 40.6, 26.2, 43.4, 29.6, 41.8, 33.6, 38.2, 33, 38.4, 30.6]))} stroke="#4A3714" strokeWidth={0.6} fill="none" strokeDasharray="1.2 1.2" />
      <Eyes kit={kit} x={32} y={30.4} gap={5.2} size={0.9} />
      <path d="M31,36.4h2" stroke="#4A3714" strokeWidth={0.8} strokeLinecap="round" />
      <Flame kit={kit} x={32} y={17.6} size={10} />
    </g>
  );
}

/** Round fuzzy moth (also used for Velveteen's orbiting moths and Moth Migration art). */
export function VelvetMothFigure({ kit }: FigureProps): ReactElement {
  const wing = mix(PALETTE.mothSilver, kit.wax.base, 0.35);
  const wingDark = darken(wing, 0.25);
  const t = animTiming(`${kit.seed}flap`, 0.55, 0.75);
  const vars = { '--ww-dur': t.duration, '--ww-delay': t.delay };
  return (
    <g>
      <g className={kit.animated ? 'ww-flutter' : undefined} style={cssVars({ ...vars, '--ww-origin': '100% 60%' })}>
        <path d="M30,30C24,18 12,16 10.6,24C9.6,30 16,34.6 24,34.4C20,37 16.6,41.6 20,44.4C23.6,47 28.6,41 30.6,35Z" fill={wing} stroke={wingDark} strokeWidth={0.9} />
        <circle cx={18.6} cy={26.4} r={2.6} fill={kit.wax.base} opacity={0.85} />
        <circle cx={18.6} cy={26.4} r={1.1} fill={PALETTE.eyeInk} />
      </g>
      <g className={kit.animated ? 'ww-flutter' : undefined} style={cssVars({ ...vars, '--ww-origin': '0% 60%' })}>
        <path d="M34,30C40,18 52,16 53.4,24C54.4,30 48,34.6 40,34.4C44,37 47.4,41.6 44,44.4C40.4,47 35.4,41 33.4,35Z" fill={wing} stroke={wingDark} strokeWidth={0.9} />
        <circle cx={45.4} cy={26.4} r={2.6} fill={kit.wax.base} opacity={0.85} />
        <circle cx={45.4} cy={26.4} r={1.1} fill={PALETTE.eyeInk} />
      </g>
      <path d="M30.2,24.6C28.6,20 26.6,17.4 23.8,16.2M33.8,24.6C35.4,20 37.4,17.4 40.2,16.2" stroke={kit.wax.deep} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <path d="M24.6,17.4l-1.4,1.6M26,18.8l-1.6,1.2M39.4,17.4l1.4,1.6M38,18.8l1.6,1.2" stroke={kit.wax.deep} strokeWidth={0.6} />
      <WaxShape kit={kit} d={scallopedEllipse(32, 32.6, 8.6, 9.4, 11, 0.06)} />
      <Drips kit={kit} drips={[{ x: 28.6, y: 39.6, len: 3.6, w: 2 }, { x: 32.4, y: 40.8, len: 5, w: 2.2 }, { x: 35.8, y: 39.4, len: 3, w: 1.8 }]} />
      <Eyes kit={kit} x={32} y={31.6} gap={6} size={1.1} />
      <Blush x={32} y={35.4} gap={9.6} />
      <Flame kit={kit} x={32} y={23.4} size={7.5} />
    </g>
  );
}

export function SilkspinnerFigure({ kit }: FigureProps): ReactElement {
  const leg = darken(kit.wax.base, 0.55);
  const left = [
    [26.6, 30.6, 19.6, 21.6, 14.2, 26.4, 10.4, 43.4],
    [26.6, 33.6, 18.2, 28.4, 13.4, 34.6, 12, 49.4],
    [27, 36.8, 21.4, 35, 18.6, 41, 18.4, 52.6],
  ];
  const legs = [...left, ...left.map((l) => l.map((v, i) => (i % 2 === 0 ? 64 - v : v)))];
  return (
    <g>
      {legs.map((l, i) => (
        <g key={i}>
          <path d={smoothOpenPath(pts(l), 0.7)} stroke={leg} strokeWidth={1.9} fill="none" strokeLinecap="round" />
          <circle cx={l[2]} cy={l[3]} r={1.2} fill={kit.wax.dark} />
        </g>
      ))}
      <path d="M32,41V49.6" stroke={PALETTE.moonsilver} strokeOpacity={0.7} strokeWidth={0.6} />
      <path d="M29.4,48.4l2.6,1.4l2.6,-1.4M30.2,50.6h3.6" stroke={PALETTE.moonsilver} strokeOpacity={0.55} strokeWidth={0.5} fill="none" />
      <WaxShape kit={kit} d={candleBody(32, 22.6, 41.4, 7.4, 6.4)} />
      <WaxShape kit={kit} d={ellipsePath(32, 41.2, 6.6, 2.2)} />
      <Drips kit={kit} drips={[{ x: 26.6, y: 24.6, len: 5 }, { x: 37.2, y: 24.2, len: 6 }, { x: 33.4, y: 24.4, len: 2.8, w: 2 }]} />
      <Eyes kit={kit} x={32} y={30.6} gap={6.2} />
      <circle cx={29.6} cy={26.6} r={0.75} fill={PALETTE.eyeInk} />
      <circle cx={34.4} cy={26.6} r={0.75} fill={PALETTE.eyeInk} />
      <Flame kit={kit} x={32} y={22.6} size={9.5} />
    </g>
  );
}

export function LanternFigure({ kit }: FigureProps): ReactElement {
  const glass = mix(PALETTE.candleGold, kit.wax.base, 0.3);
  return (
    <g>
      {/* handle ring and roof */}
      <path d="M28.6,13.6A3.4,3.4 0 1 1 35.4,13.6" stroke={kit.ids.url('brass')} strokeWidth={1.6} fill="none" />
      <BrassPlate kit={kit} d="M24,22.6L32,14.6L40,22.6Z" />
      <BrassPlate kit={kit} d={roundedRect(22.6, 21.8, 18.8, 3, 1)} />
      {/* hexagonal stained-glass body: one wide front pane, two narrow side panes */}
      <path d="M23.6,24.8L20.8,28.8V41.4L23.6,45.4Z" fill={darken(glass, 0.35)} />
      <path d="M40.4,24.8L43.2,28.8V41.4L40.4,45.4Z" fill={darken(glass, 0.45)} />
      <rect x={23.6} y={24.8} width={16.8} height={20.6} fill={glass} opacity={0.88} />
      <rect x={23.6} y={24.8} width={16.8} height={20.6} fill={kit.ids.url('glow')} />
      <Flame kit={kit} x={32} y={42.6} size={13} wick={false} />
      {/* the flame is the face: teardrop with two dot eyes */}
      <Eyes kit={kit} x={32} y={37.4} gap={3.6} size={0.75} />
      <path d="M23.6,24.8V45.4M40.4,24.8V45.4M20.8,28.8V41.4M43.2,28.8V41.4" stroke={kit.ids.url('brass')} strokeWidth={1.4} />
      <path d="M23.6,35.2H40.4" stroke="#6E5320" strokeWidth={0.6} opacity={0.6} />
      <BrassPlate kit={kit} d={roundedRect(21.4, 45, 21.2, 3.4, 1.2)} />
      <BrassPlate kit={kit} d="M24.6,48.4H39.4L37.6,52.6H26.4Z" />
      <Drips kit={kit} drips={[{ x: 24.4, y: 46, len: 4, w: 2.2 }, { x: 38.8, y: 46, len: 5.4, w: 2.2 }, { x: 31, y: 47.6, len: 2.6, w: 1.8 }]} />
    </g>
  );
}

export function WickMortarFigure({ kit }: FigureProps): ReactElement {
  const cord = smoothOpenPath(pts([31.6, 34.4, 26, 31.4, 21.6, 33.6, 18.4, 29.2, 19.4, 24.6]));
  return (
    <g>
      {/* mortar tube angled up and right */}
      <g transform="rotate(-38 33 37)">
        <rect x={27.6} y={18} width={10.8} height={18} rx={1.6} fill="#3A3545" />
        <rect x={27.6} y={18} width={4} height={18} fill="#56506A" />
        <rect x={26.4} y={16.6} width={13.2} height={3.4} rx={1} fill={kit.ids.url('brass')} />
        <ellipse cx={33} cy={16.8} rx={5.4} ry={1.4} fill="#15121B" />
      </g>
      {/* barrel */}
      <WaxShape kit={kit} d="M20.8,35.4Q31,32.2 41.2,35.4Q43.6,44 41.2,52.6Q31,54.6 20.8,52.6Q18.4,44 20.8,35.4Z" />
      <path d="M25.6,34.4Q24.8,44 25.6,53.4M31,33.6V54M36.4,34.4Q37.2,44 36.4,53.4" stroke={kit.wax.deep} strokeWidth={0.6} opacity={0.4} fill="none" />
      <path d="M19.9,39.4Q31,37 42.1,39.4" stroke={kit.ids.url('brass')} strokeWidth={1.8} fill="none" />
      <path d="M19.9,49Q31,51.2 42.1,49" stroke={kit.ids.url('brass')} strokeWidth={1.8} fill="none" />
      <Drips kit={kit} drips={[{ x: 23.6, y: 35, len: 3.6, w: 2.2 }, { x: 38.4, y: 35, len: 3, w: 2.2 }, { x: 33.4, y: 34.4, len: 2.4, w: 2 }]} />
      <Eyes kit={kit} x={31} y={44.2} gap={6} />
      {/* match-cord fuse */}
      <path d={cord} stroke="#8C6B4A" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <path d={cord} stroke="#D9C7A3" strokeWidth={0.5} fill="none" strokeDasharray="0.8 1.4" />
      <Flame kit={kit} x={19.4} y={25} size={7} wick={false} />
      <Sparks kit={kit} at={pts([16, 21, 23, 19.6, 21.6, 24.6])} />
    </g>
  );
}

export function BellowsGolemFigure({ kit }: FigureProps): ReactElement {
  const leather = darken(kit.wax.base, 0.6);
  const torso = 'M32,22.6C42.6,22.6 46.6,30.6 45.4,39C44.4,45.6 39,50.4 32,52.4C25,50.4 19.6,45.6 18.6,39C17.4,30.6 21.4,22.6 32,22.6Z';
  return (
    <g>
      {/* stubby arms */}
      <WaxShape kit={kit} d="M18.4,30.6C13.6,31 11.4,36 12.4,41.6C13,44.4 16.4,44.6 17.4,42.2L19.2,35.8Z" />
      <WaxShape kit={kit} d="M45.6,30.6C50.4,31 52.6,36 51.6,41.6C51,44.4 47.6,44.6 46.6,42.2L44.8,35.8Z" />
      {/* pleated leather sides */}
      <path d="M17.6,32L20.8,34.4L17.4,36.8L20.6,39.2L17.8,41.6L21.2,44" stroke={leather} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <path d="M46.4,32L43.2,34.4L46.6,36.8L43.4,39.2L46.2,41.6L42.8,44" stroke={leather} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <WaxShape kit={kit} d={torso} />
      {/* bellows board, nozzle and brass studs */}
      <path d="M32,25.4C39.4,25.4 42.4,31 41.6,37.4C40.8,43 37,47 32,48.8C27,47 23.2,43 22.4,37.4C21.6,31 24.6,25.4 32,25.4Z" fill="none" stroke={kit.wax.deep} strokeWidth={0.8} opacity={0.45} />
      <BrassPlate kit={kit} d="M29.6,48.6H34.4L33.2,53.4H30.8Z" />
      <Rivet x={25.4} y={32} />
      <Rivet x={38.6} y={32} />
      <Rivet x={24.6} y={42} />
      <Rivet x={39.4} y={42} />
      <Drips kit={kit} drips={[{ x: 25, y: 25.6, len: 4.6 }, { x: 39.2, y: 25.6, len: 6 }, { x: 35.4, y: 24, len: 3, w: 2.2 }]} />
      {/* small head on the big torso */}
      <WaxShape kit={kit} d={circlePath(32, 21, 6.4)} />
      <Eyes kit={kit} x={32} y={21.6} gap={4.8} size={0.85} />
      <path d="M29.6,35.2Q32,37.6 34.4,35.2" stroke={kit.wax.deep} strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.65} />
      <Flame kit={kit} x={32} y={14.8} size={8.5} />
    </g>
  );
}

export function CinderlingFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      {/* little legs */}
      <WaxShape kit={kit} d={ellipsePath(27.6, 51.4, 3.4, 2.2)} />
      <WaxShape kit={kit} d={ellipsePath(36.4, 51.4, 3.4, 2.2)} />
      <WaxShape kit={kit} d={blob(pts([32, 35.6, 39.4, 38.4, 41.4, 44.6, 38, 50.2, 32, 51.4, 26, 50.2, 22.6, 44.6, 24.6, 38.4]), 0.95)} />
      <Drips kit={kit} drips={[{ x: 26.4, y: 40.6, len: 4, w: 2.2 }, { x: 37.6, y: 40.4, len: 5, w: 2.2 }, { x: 31.6, y: 41.4, len: 3, w: 2 }]} />
      {/* arms raised in glee */}
      <path d="M24.6,41.6Q20,40 19.4,35.2M39.4,41.6Q44,40 44.6,35.2" stroke={kit.wax.dark} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* the head is a living flame with a face (teardrop flame with dot eyes) */}
      <Flame kit={kit} x={32} y={40.4} size={27} wick={false} />
      <path d="M26.4,21.6L24.6,16.4L28.6,19.6M37.6,21.6L39.4,16.4L35.4,19.6" fill={kit.ids.url('flame')} />
      <Eyes kit={kit} x={32} y={30.6} gap={5.6} size={1.05} />
      <path d="M30.2,34.2Q32,35.8 33.8,34.2" stroke={PALETTE.eyeInk} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <Sparks kit={kit} at={pts([20, 24, 45, 22, 47, 33, 17.4, 33, 40, 13.6])} />
    </g>
  );
}

function Knife({ kit, x, y, angle }: { kit: PieceKit; x: number; y: number; angle: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M-1.2,0L0,-11L1.2,0Z" fill={kit.ids.url('steel')} stroke="#3B3550" strokeWidth={0.5} />
      <rect x={-2.6} y={-0.3} width={5.2} height={1.3} rx={0.6} fill={kit.ids.url('brass')} />
      <rect x={-0.8} y={1} width={1.6} height={3.6} rx={0.6} fill="#5E3A22" />
    </g>
  );
}

export function TwinwickFigure({ kit }: FigureProps): ReactElement {
  const body = 'M22.6,53L23.4,27.6Q23.4,23 27.4,22.8Q30.6,23 32,26.4Q33.4,23 36.6,22.8Q40.6,23 40.6,27.6L41.4,53Z';
  return (
    <g>
      <Knife kit={kit} x={19.6} y={42} angle={-28} />
      <WaxShape kit={kit} d={body} />
      <Drips kit={kit} drips={[{ x: 24.4, y: 26, len: 6 }, { x: 31.8, y: 27.4, len: 4.4, w: 2.2 }, { x: 39.6, y: 26.4, len: 5 }]} />
      <Eyes kit={kit} x={32} y={34} gap={6.4} />
      <Blush x={32} y={37.4} gap={10.6} />
      <path d="M29.6,40.2l2.4,1.6l2.4,-1.6" stroke={kit.wax.deep} strokeWidth={0.8} fill="none" opacity={0.6} />
      <Knife kit={kit} x={44.4} y={42} angle={28} />
      <WaxShape kit={kit} d={ellipsePath(21.2, 42.6, 2.4, 2)} />
      <WaxShape kit={kit} d={ellipsePath(42.8, 42.6, 2.4, 2)} />
      <Flame kit={kit} x={27.6} y={22.4} size={9.5} lean={-8} salt="a" />
      <Flame kit={kit} x={36.4} y={22.4} size={9.5} lean={8} salt="b" />
    </g>
  );
}

/* ----------------------------------------------------------------- heroes */

export function SconcePaladinFigure({ kit }: FigureProps): ReactElement {
  const rays = starPoints(23.4, 41.4, 8.8, 6.4, 12, 0);
  return (
    <g>
      <WaxShape kit={kit} d={candleBody(32, 17.6, 53, 10.2, 10.8)} />
      <Drips kit={kit} drips={[{ x: 25.4, y: 19.6, len: 4.6 }, { x: 37.2, y: 19.4, len: 3.6 }, { x: 31.2, y: 19.8, len: 2.6, w: 2 }]} />
      {/* brass pauldrons: domed shoulder plates with a lame below */}
      <BrassPlate kit={kit} d="M14.6,29.4C14.2,22.6 18,19.4 22,19.4C25.6,19.4 28.2,22 28.4,26C24.6,25.2 18.6,26.4 14.6,29.4Z" />
      <BrassPlate kit={kit} d="M49.4,29.4C49.8,22.6 46,19.4 42,19.4C38.4,19.4 35.8,22 35.6,26C39.4,25.2 45.4,26.4 49.4,29.4Z" />
      <path d="M15.6,31.6C19,29.2 23.6,28.2 27.6,28.6" stroke={kit.ids.url('brass')} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M48.4,31.6C45,29.2 40.4,28.2 36.4,28.6" stroke={kit.ids.url('brass')} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Rivet x={20.4} y={23.4} />
      <Rivet x={43.6} y={23.4} />
      <Eyes kit={kit} x={32} y={30.8} gap={6.4} />
      <Blush x={32} y={34.2} gap={10.8} />
      {/* sun shield */}
      <path d={polygonPath(rays)} fill={kit.ids.url('brass')} />
      <circle cx={23.4} cy={41.4} r={6.6} fill={darken(kit.wax.base, 0.35)} stroke={kit.ids.url('brass')} strokeWidth={1.6} />
      <circle cx={23.4} cy={41.4} r={3.4} fill={PALETTE.candleGold} />
      <circle cx={22.4} cy={40.4} r={1.2} fill={PALETTE.flameCore} />
      <Flame kit={kit} x={32} y={17.4} size={13} />
    </g>
  );
}

/** One small moth circling Velveteen; two synced sinusoids trace an ellipse (transform-only). */
function OrbitingMoth({ kit, index }: { kit: PieceKit; index: number }): ReactElement {
  const wing = mix(PALETTE.mothSilver, '#F09AD0', 0.35);
  const moth = (
    <g>
      <path d="M32,24C30.4,18.8 25,18.6 25.4,22.2C25.8,24.4 29,24.8 32,24ZM32,24C33.6,18.8 39,18.6 38.6,22.2C38.2,24.4 35,24.8 32,24Z" fill={wing} stroke={darken(wing, 0.45)} strokeWidth={0.5} />
      <path d="M32,24.6C30.6,26 28.2,28.2 29.6,29.2C30.8,29.8 31.8,27.4 32,24.6ZM32,24.6C33.4,26 35.8,28.2 34.4,29.2C33.2,29.8 32.2,27.4 32,24.6Z" fill={darken(wing, 0.12)} stroke={darken(wing, 0.45)} strokeWidth={0.5} />
      <circle cx={28} cy={21.8} r={0.9} fill={PALETTE.eyeInk} opacity={0.7} />
      <circle cx={36} cy={21.8} r={0.9} fill={PALETTE.eyeInk} opacity={0.7} />
      <ellipse cx={32} cy={24.8} rx={0.9} ry={2.4} fill={darken(wing, 0.5)} />
    </g>
  );
  // The orbit circles the hat, above the brim.
  if (!kit.animated) {
    const angle = (index / 3) * Math.PI * 2 + 0.6;
    return <g transform={`translate(${fmt(Math.cos(angle) * 16)} ${fmt(Math.sin(angle) * 5 - 9)})`}>{moth}</g>;
  }
  const period = 7;
  const delay = -(index * period) / 3;
  return (
    <g transform="translate(0 -9)">
      <g className="ww-orbit-x" style={cssVars({ '--ww-dur': `${period / 2}s`, '--ww-delay': `${delay}s` })}>
        <g className="ww-orbit-y" style={cssVars({ '--ww-dur': `${period / 2}s`, '--ww-delay': `${delay - period / 4}s` })}>
          {moth}
        </g>
      </g>
    </g>
  );
}

export function MothWitchFigure({ kit }: FigureProps): ReactElement {
  const hat = '#3B2A52';
  const body = 'M24.4,53C24.6,46 26.2,40.6 27,35.6C27.6,31.4 26.6,28.6 27.6,25.8L37.4,25.8C38.4,29.4 36.6,32.6 36.6,36.6C36.6,41.4 38.8,46.4 39.4,53Z';
  return (
    <g>
      <WaxShape kit={kit} d={body} />
      <Drips kit={kit} drips={[{ x: 28.6, y: 27.6, len: 6 }, { x: 35.8, y: 27.4, len: 4.6 }, { x: 31.8, y: 27.8, len: 3, w: 2 }]} />
      <Eyes kit={kit} x={32} y={32.2} gap={5.8} />
      <Blush x={32} y={35.4} gap={9.6} />
      {/* crooked witch hat with feathery moth antennae */}
      <path d="M17.8,27.4C22,24.4 42,24.4 46.2,27.4C42.6,30 21.4,30 17.8,27.4Z" fill={hat} stroke="#1C1328" strokeWidth={0.8} />
      <path d="M24.6,26.6C27,19.6 29.2,13.6 33.4,9.6C35.4,8.4 37.8,9.6 38.6,7.6C39.2,11.4 36.6,12 36.4,14.2C36.4,18.6 38.6,22.8 39.6,26.6Z" fill={hat} stroke="#1C1328" strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M25.4,24.6Q32,22.6 38.8,24.6" stroke={kit.wax.base} strokeWidth={1.6} fill="none" />
      {/* feathered moth antennae sprouting from the hat */}
      <path d="M29,19.4C27.4,15.4 25,12.6 21.6,11.2M35.2,19C37.6,16.6 40.6,15 44.6,14.8" stroke={PALETTE.mothSilver} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <path d="M21.6,11.2C20.4,8.6 22.6,7.4 24,9.4C25,11 23.6,12.6 21.6,11.2Z" fill={PALETTE.mothSilver} stroke="#1C1328" strokeWidth={0.4} />
      <path d="M44.6,14.8C46.4,12.6 48.6,13.8 47.6,16C46.8,17.6 44.8,17 44.6,14.8Z" fill={PALETTE.mothSilver} stroke="#1C1328" strokeWidth={0.4} />
      <Flame kit={kit} x={38.6} y={7.8} size={8} wick={false} />
      {[0, 1, 2].map((i) => (
        <OrbitingMoth key={i} kit={kit} index={i} />
      ))}
    </g>
  );
}

export function LampwrightFigure({ kit }: FigureProps): ReactElement {
  const wood = '#7A5230';
  return (
    <g>
      {/* ladder-pole behind the body, hook and little lamp at the top */}
      <g transform="rotate(24 40 30)">
        <path d="M38.6,5V52M42.6,5V52" stroke={wood} strokeWidth={1.4} strokeLinecap="round" />
        {[10, 16, 22, 28, 34, 40, 46].map((y) => (
          <path key={y} d={`M38.6,${y}H42.6`} stroke={darken(wood, 0.2)} strokeWidth={1} />
        ))}
        <path d="M40.6,5V1.4Q40.6,-1.6 43.4,-1.6Q46,-1.6 46,1.2" stroke={kit.ids.url('brass')} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </g>
      <WaxShape kit={kit} d={candleBody(30, 27.4, 53, 11.6, 12.4)} />
      <Drips kit={kit} drips={[{ x: 21, y: 29.6, len: 5 }, { x: 37.6, y: 29.4, len: 4 }, { x: 40.6, y: 31.2, len: 5.6, w: 2.4 }]} />
      {/* apron */}
      <path d="M23.4,42.6H36.6V51.6Q30,53.6 23.4,51.6Z" fill="#6B4A2E" opacity={0.85} />
      <path d="M25,45.4H35" stroke="#4A3220" strokeWidth={0.7} />
      {/* goggles */}
      <path d="M18.6,35.4H41.4" stroke="#3B2A1C" strokeWidth={1.8} />
      <circle cx={26.4} cy={35.4} r={3.9} fill={mix(PALETTE.moonmoth, '#FFFFFF', 0.4)} opacity={0.85} />
      <circle cx={33.6} cy={35.4} r={3.9} fill={mix(PALETTE.moonmoth, '#FFFFFF', 0.4)} opacity={0.85} />
      <Eyes kit={kit} x={30} y={35.6} gap={7.2} size={1.15} />
      <circle cx={26.4} cy={35.4} r={3.9} fill="none" stroke={kit.ids.url('brass')} strokeWidth={1.5} />
      <circle cx={33.6} cy={35.4} r={3.9} fill="none" stroke={kit.ids.url('brass')} strokeWidth={1.5} />
      <path d="M24.6,33.4a2.2,2.2 0 0 1 2.6,-1M31.8,33.4a2.2,2.2 0 0 1 2.6,-1" stroke="#FFFFFF" strokeWidth={0.7} fill="none" opacity={0.8} />
      {/* hand on the pole */}
      <WaxShape kit={kit} d={ellipsePath(42.4, 40.4, 2.6, 2.2)} />
      <Flame kit={kit} x={30} y={27.4} size={11.5} />
    </g>
  );
}

export function EmberDuelistFigure({ kit }: FigureProps): ReactElement {
  const hot = { ...kit, wax: { ...kit.wax, base: mix(kit.wax.base, PALETTE.flameCore, 0.45), dark: mix(kit.wax.dark, PALETTE.flameCore, 0.25) } };
  return (
    <g>
      {/* rapier held in a raised salute */}
      <g transform="rotate(18 41.6 39)">
        <path d="M40.6,37.6L41.6,5.4L42.6,37.6Z" fill={kit.ids.url('steel')} stroke="#2A2638" strokeWidth={0.5} strokeLinejoin="round" />
        <path d="M41.3,36L41.6,8" stroke="#FFFFFF" strokeWidth={0.45} opacity={0.9} />
        <path d="M38.2,38.6Q41.6,42.6 45,38.6" stroke={kit.ids.url('brass')} strokeWidth={1.4} fill="none" />
        <rect x={37.6} y={37.4} width={8} height={1.4} rx={0.7} fill={kit.ids.url('brass')} />
        <rect x={40.8} y={38.8} width={1.6} height={4.4} rx={0.7} fill="#5E3A22" />
      </g>
      <WaxShape kit={hot} d={candleBody(31, 17, 53, 6.6, 7.8, 1.4)} />
      {/* ember sash */}
      <path d="M24,43.6L37.6,35.2L38.4,38.4L24.4,47Z" fill={PALETTE.ember} opacity={0.85} />
      <Drips kit={hot} drips={[{ x: 26.6, y: 19, len: 5 }, { x: 35.6, y: 19.4, len: 3.6, w: 2.2 }, { x: 31, y: 19.6, len: 2.6, w: 1.8 }]} />
      <Eyes kit={kit} x={31} y={25.4} gap={5.4} />
      <path d="M27.4,22.2l2.2,0.6M34.6,22.2l-2.2,0.6" stroke={PALETTE.eyeInk} strokeWidth={0.8} strokeLinecap="round" />
      <path d="M29.6,29q1.4,1 2.8,0" stroke={PALETTE.eyeInk} strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <WaxShape kit={hot} d={ellipsePath(40.4, 39.2, 2.4, 2)} />
      {/* flame ponytail streaming back */}
      <Flame kit={kit} x={29.4} y={17.2} size={11} lean={-48} salt="tail" halo={false} />
      <Flame kit={kit} x={31} y={17} size={13.5} lean={-14} />
    </g>
  );
}

/* --------------------------------------------------------------- structures */

/** Vigil Candle: tall altar candle on a brass dish (§16.6). The HP band is drawn by PieceArt. */
export function VigilCandleFigure({ kit }: FigureProps): ReactElement {
  const ivory = { ...kit, wax: { base: '#F1E6CB', dark: '#C9B88F', deep: '#6E5A3A', light: '#FFF8E6' } };
  return (
    <g>
      <path d="M15,48.6Q32,56.4 49,48.6L47,51.6Q32,57.6 17,51.6Z" fill={kit.ids.url('brass')} stroke="#4A3714" strokeWidth={0.7} />
      <ellipse cx={32} cy={48.4} rx={17} ry={4.6} fill={kit.ids.url('brass')} stroke="#4A3714" strokeWidth={0.7} />
      <ellipse cx={32} cy={48.2} rx={13.4} ry={3.2} fill="#6E5320" opacity={0.55} />
      <WaxShape kit={ivory} d={candleBody(32, 13.4, 48.6, 7.4, 8)} fill={ivory.ids.url('body')} />
      <path d={candleBody(32, 13.4, 48.6, 7.4, 8)} fill="#F1E6CB" opacity={0.75} />
      <path d={candleBody(32, 13.4, 48.6, 7.4, 8)} fill={kit.ids.url('glow')} />
      <Drips kit={ivory} drips={[{ x: 26.2, y: 15.4, len: 9 }, { x: 37.8, y: 15, len: 13 }, { x: 31, y: 16, len: 4, w: 2.2 }, { x: 34.4, y: 15.8, len: 6, w: 2 }]} />
      <path d="M24.8,20H39.2" stroke="#B8913A" strokeWidth={0.8} opacity={0.5} />
      <path d="M24.8,41.6H39.2" stroke="#B8913A" strokeWidth={0.8} opacity={0.5} />
      <Eyes kit={kit} x={32} y={27} gap={6} />
      <Blush x={32} y={30.4} gap={9.6} />
      <Flame kit={kit} x={32} y={13.2} size={12.5} />
    </g>
  );
}

/** Smoldering Wick: a blackened stub with one glowing ember (§16.6). */
export function SmolderingWickFigure({ kit }: FigureProps): ReactElement {
  const char = { ...kit, wax: { base: '#3A3442', dark: '#1C1822', deep: '#0D0B12', light: kit.wax.base } };
  const t = animTiming(`${kit.seed}ember`, 1.8, 2.6);
  return (
    <g>
      <WaxShape kit={char} d={candleBody(32, 38.4, 53, 8.6, 10)} plain />
      <Drips kit={char} drips={[{ x: 25.6, y: 40, len: 7, w: 2.8 }, { x: 37.8, y: 40.4, len: 9, w: 2.6 }, { x: 31.6, y: 40.8, len: 4, w: 2.2 }]} />
      <path d="M26.4,44.4l2,1.6l-0.6,2.4M35.6,46l1.6,-1.6" stroke="#0D0B12" strokeWidth={0.7} fill="none" />
      <Eyes kit={{ ...kit, eyes: 'closed' }} x={32} y={46.4} gap={6} color="#8C8299" />
      <path d="M32,40.4q0.6,-1.6 -0.2,-3" stroke="#1C1822" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <g className={kit.animated ? 'ww-glow-pulse' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay, '--ww-glow-min': '0.45' })}>
        <circle cx={31.8} cy={37.2} r={6.5} fill={kit.ids.url('flameHalo')} />
        <circle cx={31.8} cy={37.2} r={2.1} fill={PALETTE.ember} />
        <circle cx={31.6} cy={37} r={0.7} fill={PALETTE.flameCore} />
      </g>
    </g>
  );
}

/** Fallback for unknown Wickfolk ids: a plain, friendly candle. */
export function GenericCandleFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <WaxShape kit={kit} d={candleBody(32, 24, 53, 8.6, 9.6)} />
      <Drips kit={kit} drips={[{ x: 25.4, y: 26, len: 6 }, { x: 37.6, y: 25.6, len: 4.6 }, { x: 31.2, y: 26.4, len: 3, w: 2.2 }]} />
      <Eyes kit={kit} x={32} y={33} gap={6.2} />
      <Blush x={32} y={36.4} gap={10} />
      <Flame kit={kit} x={32} y={23.6} size={11} />
    </g>
  );
}
