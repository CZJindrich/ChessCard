/**
 * Snuff silhouettes (§16.6): cold, silvery-violet smoke with ember eyes. Outlines are
 * wobbled once by seeded noise (pre-baked) and swayed by a CSS transform.
 */
import type { ReactElement, ReactNode } from 'react';
import { PALETTE } from '../palette';
import { mix } from '../util/color';
import { fmt, smoothOpenPath, type Pt } from '../util/path';
import { animTiming, cssVars } from '../util/svg';
import { Drips, EmberEyes, SmokeBody, Sparks, UnderGlow, Wisps, type PieceKit } from './kit';
import { pts, teardropPoints } from './shapes';
import type { FigureProps } from './wickfolk';

const IRON = '#3A3545';
const IRON_DARK = '#1E1A26';
const VOID = '#120E1A';
const INK = '#1E1830';

/** Wraps a Snuff body in the sway animation (random phase per piece). */
function Sway({ kit, children, salt = '' }: { kit: PieceKit; children: ReactNode; salt?: string }): ReactElement {
  const t = animTiming(`${kit.seed}sway${salt}`, 2.8, 4.2);
  return (
    <g className={kit.animated ? 'ww-sway' : undefined} style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}>
      {children}
    </g>
  );
}

/* --------------------------------------------------------------- outlines */

const SOOTLING = teardropPoints(32, 15.5, 52.6, 12.4, 5);
const GNAW_WING_L = pts([31, 29, 25, 19.6, 15.6, 15.6, 8.6, 19.6, 8.4, 27.6, 14.6, 32.4, 21.4, 33.6, 15.2, 38.6, 15.4, 45.6, 22.4, 46.4, 30.4, 38.6]);
const GNAW_WING_R: Pt[] = GNAW_WING_L.map((p) => ({ x: 64 - p.x, y: p.y }));
const GNAW_BODY = pts([32, 20.6, 35.6, 24.6, 36, 33, 34.6, 42.6, 32, 47, 29.4, 42.6, 28, 33, 28.4, 24.6]);
const HOUND = pts([
  10.8, 31.2, 13.6, 28, 17.4, 24.4, 18.2, 16.6, 22.4, 21.8, 25.6, 15.6, 27.6, 23.4, 31.6, 27.2, 38.4, 29.6, 45.4, 30.4, 48.4, 25.4,
  50.6, 19.6, 55, 16.6, 55.6, 22.8, 53, 29.4, 50.6, 36, 49.6, 44.4, 47.6, 52, 41.6, 52, 40.6, 46.4, 35.4, 46.8, 33.6, 52.2, 27.4, 52.2,
  26.4, 44.4, 23.2, 38.4, 19.2, 35.2, 14.2, 34.2,
]);
const WRETCH = pts([27.4, 52.6, 25.2, 42, 23.8, 32.4, 24.4, 24.4, 27, 17.4, 31.6, 13.6, 36.4, 15.6, 38.6, 21.6, 38.8, 30.4, 40.4, 41, 39.6, 52.6]);
const MONK = pts([18.6, 52.6, 20.6, 41, 22.6, 31, 23.4, 22.4, 26.6, 15, 32, 10.2, 37.4, 15, 40.6, 22.4, 41.4, 31, 43.4, 41, 45.4, 52.6]);
const DEACON = pts([19.6, 52.6, 21.6, 40, 23.6, 30.6, 25.4, 23.4, 38.6, 23.4, 40.4, 30.6, 42.4, 40, 44.4, 52.6]);
const BANSHEE = pts([
  32, 8.6, 39.4, 10.6, 43.4, 17, 44.2, 26, 46.4, 34, 49.6, 42.4, 46.6, 46.2, 43.6, 43.6, 41.6, 49, 37.6, 44.8, 34.6, 50, 32, 45.6,
  29.4, 50, 26.4, 44.8, 22.4, 49, 20.4, 43.6, 17.4, 46.2, 14.4, 42.4, 17.6, 34, 19.8, 26, 20.6, 17, 24.6, 10.6,
]);
const PAWN_SKIRT = pts([20.6, 52.6, 21.6, 47.4, 26.2, 43.4, 27.6, 37.2, 37.4, 37.2, 38.6, 43.4, 42.6, 47.4, 43.4, 52.6]);
const PAWN_HEAD = pts([34.6, 20.4, 40.4, 22.4, 42.6, 28, 40.6, 33.8, 34.6, 36, 28.6, 34.2, 26.6, 28.8, 28.6, 22.8]);
const HULK = pts([9.6, 52.6, 10.6, 44.4, 13.6, 36, 17.4, 28, 22.4, 22, 28.4, 18.6, 34.4, 18.2, 40.4, 20, 46, 25, 50.2, 32, 52.4, 40, 54.4, 46, 54.6, 52.6]);
const KNIGHT_HEAD = pts([
  26.8, 52.6, 27.4, 46, 29.2, 40, 28.4, 35.6, 24, 36.8, 18.6, 36.6, 15.6, 33.6, 17.4, 30, 24, 24.6, 30, 20.6, 36, 19.4, 41, 24.4, 43.4, 33,
  43, 44, 44, 52.6,
]);
const LAMPLIGHTER_COAT = pts([21.4, 52.6, 23.4, 41, 24.6, 31.4, 26, 26.4, 38, 26.4, 39.4, 31.4, 40.6, 41, 42.6, 52.6]);
const STACK_PUFF = pts([27.6, 11, 29.4, 6.6, 33.6, 5, 37.6, 6.4, 40.6, 4, 44.4, 5.6, 45, 9.6, 41.6, 12.6, 35.6, 13.4, 30.4, 13.6]);
const GENERIC = teardropPoints(32, 19, 52.6, 12, -3);

/* ---------------------------------------------------------------- figures */

export function SootlingFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={17} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={SOOTLING} amplitude={1.5} />
        <EmberEyes kit={kit} x={31.6} y={39.4} gap={7.6} size={1.15} />
        <path d="M28.4,45.4l1.4,-1l1.4,1l1.4,-1l1.4,1l1.4,-1" stroke={VOID} strokeWidth={0.9} fill="none" strokeLinejoin="round" />
      </Sway>
      <Wisps kit={kit} at={pts([37, 15.6, 26, 30])} />
    </g>
  );
}

function Eyespot({ x, y, r }: { x: number; y: number; r: number }): ReactElement {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={PALETTE.moonsilver} opacity={0.85} />
      <circle cx={x} cy={y} r={r * 0.74} fill={VOID} />
      <circle cx={x} cy={y} r={r * 0.42} fill={PALETTE.snuffEye} />
      <circle cx={x - r * 0.2} cy={y - r * 0.2} r={r * 0.16} fill="#FFFFFF" />
    </g>
  );
}

export function GnawmothFigure({ kit }: FigureProps): ReactElement {
  const t = animTiming(`${kit.seed}flap`, 0.32, 0.45);
  const flap = (origin: string) => cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay, '--ww-origin': origin });
  return (
    <g>
      <g className={kit.animated ? 'ww-flutter' : undefined} style={flap('100% 50%')}>
        <SmokeBody kit={kit} points={GNAW_WING_L} amplitude={1.1} salt="wl" />
        <Eyespot x={16.4} y={24.6} r={4.2} />
      </g>
      <g className={kit.animated ? 'ww-flutter' : undefined} style={flap('0% 50%')}>
        <SmokeBody kit={kit} points={GNAW_WING_R} amplitude={1.1} salt="wr" />
        <Eyespot x={47.6} y={24.6} r={4.2} />
      </g>
      <SmokeBody kit={kit} points={GNAW_BODY} amplitude={0.7} salt="b" />
      <path d="M30.2,36.4h3.6M30,40h4" stroke={PALETTE.snuffBodyBottom} strokeWidth={1} />
      <path d="M30.4,21.4C28.6,17 26.4,14.8 23.6,14.2l1,1.8l-2.4,0.4M33.6,21.4C35.4,17 37.6,14.8 40.4,14.2l-1,1.8l2.4,0.4" stroke={PALETTE.snuffRim} strokeWidth={0.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29.6,29.6q-0.6,3 1.6,3.4M34.4,29.6q0.6,3 -1.6,3.4" stroke={PALETTE.moonsilver} strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <EmberEyes kit={kit} x={32} y={25.6} gap={4} size={0.75} slant={18} />
    </g>
  );
}

export function SmokehoundFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={22} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={HOUND} amplitude={1.3} />
        <path d="M13.6,33.4l1,2.2l1,-1.8" fill={PALETTE.moonsilver} />
        <path d="M11.4,31.4q3.6,1.2 8.4,0.2" stroke={VOID} strokeWidth={0.8} fill="none" />
        <circle cx={11.6} cy={30.4} r={0.9} fill={VOID} />
        <EmberEyes kit={kit} x={21.4} y={27} gap={4.6} size={0.85} slant={20} />
      </Sway>
      <Wisps kit={kit} at={pts([53.4, 17.6, 40, 29.6, 25.6, 16])} />
    </g>
  );
}

export function InkWretchFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={16} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={WRETCH} amplitude={1.2} />
        <path d="M27.2,15.6Q31.6,12.8 36.4,16.6L37,25.6Q31.6,28 26.4,25.6Z" fill={VOID} opacity={0.85} />
        <EmberEyes kit={kit} x={31.6} y={21.4} gap={4.6} size={0.85} slant={16} />
        <Drips kit={kit} drips={[{ x: 26.4, y: 44, len: 7, w: 2.2 }, { x: 38.8, y: 40, len: 9, w: 2 }, { x: 33, y: 47, len: 5, w: 1.8 }]} color={INK} gleam={false} />
      </Sway>
      {/* lance */}
      <path d="M14.6,51.4L50.6,12.4" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M14.6,51.4L50.6,12.4" stroke={PALETTE.snuffRim} strokeWidth={0.6} strokeOpacity={0.7} />
      <path d="M55.4,6.6L53,15.2L47.4,10.2Z" fill={INK} stroke={PALETTE.snuffRim} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M41.6,22.4c-1,1.6 -0.4,3 0.6,4.4" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <ellipse cx={38.4} cy={26} rx={2.6} ry={2.2} fill={PALETTE.snuffBodyTop} stroke={PALETTE.snuffRim} strokeWidth={1} />
      <Drips kit={kit} drips={[{ x: 49.6, y: 14.6, len: 5, w: 1.6 }, { x: 22, y: 43.4, len: 4, w: 1.6 }]} color={INK} gleam={false} />
    </g>
  );
}

export function HushMonkFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={19} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={MONK} amplitude={1.1} />
        <path d="M26,25.6Q32,16 38,25.6Q38.4,31 32,31.6Q25.6,31 26,25.6Z" fill={VOID} />
        <EmberEyes kit={kit} x={32} y={25} gap={4.8} size={0.85} slant={-6} />
        <path d="M22.6,36.6Q32,39.6 41.6,36.6" stroke={PALETTE.snuffBodyBottom} strokeWidth={1.4} fill="none" />
        <path d="M24,38.6l-1,4.6M25.6,38.8l-0.4,3.6" stroke={PALETTE.snuffBodyBottom} strokeWidth={1} />
      </Sway>
      {/* handbell */}
      <path d="M33.4,39.2Q37,40.6 39.6,37.8" stroke={PALETTE.snuffRim} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M41.6,36.4V32.6" stroke="#6E5320" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M37.4,44C37.4,39.6 39,37.2 41.6,37.2C44.2,37.2 45.8,39.6 45.8,44Z" fill="#8C7A4E" stroke="#3B2E14" strokeWidth={0.7} />
      <path d="M38.6,41.6Q41.6,40.4 44.6,41.6" stroke="#C9B27A" strokeWidth={0.6} fill="none" />
      <circle cx={41.6} cy={45} r={1.1} fill="#3B2E14" />
    </g>
  );
}

export function AshDeaconFigure({ kit }: FigureProps): ReactElement {
  const t = animTiming(`${kit.seed}censer`, 1.6, 2.2);
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={18} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={DEACON} amplitude={1.1} />
        {/* tall ash-grey cap */}
        <path d="M24.6,24.4L27.6,10.6Q32,4.6 36.4,10.6L39.4,24.4Z" fill="#4A4458" stroke={PALETTE.snuffRim} strokeWidth={1.4} strokeLinejoin="round" />
        <path d="M32,7.8V23.6M27.4,15.6H36.6" stroke={PALETTE.ashText} strokeWidth={1} opacity={0.75} />
        <path d="M26,24.2Q32,22.6 38,24.2Q38.6,31.4 32,32.4Q25.4,31.4 26,24.2Z" fill={VOID} opacity={0.9} />
        <EmberEyes kit={kit} x={32} y={27.6} gap={5} size={0.85} />
        {/* deacon's ash-grey stole */}
        <path d="M28,33L26.6,51.6M36,33L37.4,51.6" stroke={PALETTE.ashText} strokeWidth={2.6} strokeLinecap="round" opacity={0.8} />
        <path d="M25.6,49.6h2.4M36.4,49.6h2.4" stroke={PALETTE.snuffBodyBottom} strokeWidth={1} />
      </Sway>
      {/* raised arm and swinging censer full of embers */}
      <path d="M39.6,32.6Q45,29.6 46.6,23.4" stroke={PALETTE.snuffBodyTop} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <path d="M39.6,32.6Q45,29.6 46.6,23.4" stroke={PALETTE.snuffRim} strokeWidth={0.8} fill="none" strokeOpacity={0.8} />
      <g className={kit.animated ? 'ww-swing' : undefined} style={cssVars({ '--ww-pivot-x': '46.6px', '--ww-pivot-y': '22.6px', '--ww-dur': t.duration })}>
        <path d="M46.6,22.6L50.4,13.6" stroke={IRON} strokeWidth={0.8} strokeDasharray="1 0.6" />
        <circle cx={51.4} cy={10.6} r={4.2} fill={IRON} stroke={PALETTE.snuffRim} strokeWidth={0.9} />
        <circle cx={50.2} cy={9.6} r={0.9} fill={PALETTE.ember} />
        <circle cx={52.6} cy={11.6} r={0.9} fill={PALETTE.ember} />
        <circle cx={50.6} cy={12.2} r={0.7} fill={PALETTE.moltenCore} />
      </g>
      <Sparks kit={kit} at={pts([55.6, 5.6, 47.6, 4.6, 57.6, 13.6])} color={PALETTE.ember} />
    </g>
  );
}

export function KnellBansheeFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={BANSHEE} amplitude={1.2} />
        {/* the veil */}
        <path d="M21.4,16.6Q32,4.6 42.6,16.6L43.6,27.4Q40.6,25.4 37.6,28Q35,26 32,28.4Q29,26 26.4,28Q23.4,25.4 20.4,27.4Z" fill={PALETTE.moonsilver} opacity={0.32} />
        <EmberEyes kit={kit} x={32} y={22.6} gap={6.4} size={0.95} slant={-10} />
        <ellipse cx={32} cy={33.6} rx={2.2} ry={3.4} fill={VOID} />
        <path d="M23.4,31.6Q32,35 40.6,31.6" stroke={PALETTE.snuffRim} strokeWidth={0.7} fill="none" opacity={0.6} />
      </Sway>
      <Wisps kit={kit} at={pts([20, 46, 44, 46, 32, 47])} />
    </g>
  );
}

export function GutterPawnFigure({ kit }: FigureProps): ReactElement {
  const grey = mix('#9A93A8', PALETTE.snuffBodyTop, 0.3);
  const fill = kit.ids.url('gutter');
  return (
    <g>
      <defs>
        <linearGradient id={kit.ids.id('gutter')} x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={mix(grey, PALETTE.moonsilver, 0.25)} />
          <stop offset="1" stopColor="#57506A" />
        </linearGradient>
      </defs>
      <UnderGlow kit={kit} cy={51} rx={17} />
      {/* ladle: a long handle into the rim of a deep bowl of molten wax */}
      <path d="M25.4,42.6L16.6,25.6" stroke={IRON} strokeWidth={1.8} strokeLinecap="round" />
      <path d="M6.4,26.4A5.4,5.2 0 0 0 17.2,26.4Z" fill={IRON} stroke={PALETTE.snuffRim} strokeWidth={0.9} strokeLinejoin="round" />
      <ellipse cx={11.8} cy={26.4} rx={5.4} ry={1.3} fill={PALETTE.gutteredWaxTop} />
      <Drips kit={kit} drips={[{ x: 8.6, y: 29.6, len: 5, w: 1.8 }]} color={PALETTE.gutteredWaxTop} gleam={false} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={PAWN_SKIRT} amplitude={0.6} salt="s" fill={fill} />
        <SmokeBody kit={kit} points={PAWN_HEAD} amplitude={0.6} salt="h" fill={fill} />
        <Drips kit={kit} drips={[{ x: 29, y: 32.6, len: 6, w: 2.4 }, { x: 40.6, y: 30, len: 7, w: 2.2 }]} color={mix(grey, PALETTE.moonsilver, 0.3)} gleam={false} />
        <EmberEyes kit={kit} x={34.4} y={28.6} gap={5.4} size={0.8} slant={-14} />
        <path d="M30.4,27.4l2.8,0.6M38.4,27.4l-2.8,0.6" stroke={VOID} strokeWidth={0.9} strokeLinecap="round" />
      </Sway>
      <ellipse cx={25.6} cy={42.6} rx={2.4} ry={2} fill={grey} stroke={PALETTE.snuffRim} strokeWidth={0.8} />
    </g>
  );
}

export function DripHulkFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={24} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={HULK} amplitude={1.6} />
        <Drips
          kit={kit}
          drips={[
            { x: 18.6, y: 28, len: 9, w: 3 },
            { x: 26, y: 21, len: 7, w: 2.6 },
            { x: 41.6, y: 21.6, len: 11, w: 3 },
            { x: 48.4, y: 30, len: 8, w: 2.6 },
            { x: 34.6, y: 19, len: 5, w: 2.4 },
          ]}
          gleam={false}
        />
        <EmberEyes kit={kit} x={31.4} y={33.6} gap={10} size={1.25} slant={-12} />
        <path d="M24.4,42.6Q31.4,38.4 38.6,42.6Q35,45 31.4,44.4Q27.8,45 24.4,42.6Z" fill={VOID} />
        <path d="M28,42.4v2.6M34.6,42.4v3.4" stroke={PALETTE.snuffBodyTop} strokeWidth={1.2} strokeLinecap="round" />
      </Sway>
    </g>
  );
}

export function SnufferKnightFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={18} />
      {/* snuffer pole behind */}
      <path d="M47.6,52.4L53.2,13" stroke={IRON} strokeWidth={1.8} strokeLinecap="round" />
      <path d="M49.6,13.6L56.8,14.6L53.6,6.4Z" fill={IRON} stroke={PALETTE.snuffRim} strokeWidth={0.8} strokeLinejoin="round" />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={KNIGHT_HEAD} amplitude={1.2} />
        <ellipse cx={17.4} cy={32.6} rx={0.9} ry={0.7} fill={VOID} />
        <path d="M16.6,35.4q3.4,0.8 7,-0.4" stroke={VOID} strokeWidth={0.8} fill="none" />
        {/* cone helm: a candle snuffer worn as a helmet, visor slit glowing */}
        <path d="M27.6,25.4L42,22.4L37.6,4.6Z" fill={IRON} stroke={PALETTE.snuffRim} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M37.6,4.6L36.2,23.4" stroke="#56506A" strokeWidth={1.4} />
        <path d="M26.6,24.8L42.8,21.4L43.4,24.4L27.4,28Z" fill={IRON_DARK} stroke={PALETTE.snuffRim} strokeWidth={0.8} strokeLinejoin="round" />
        <EmberEyes kit={kit} x={26.4} y={29} single size={0.95} slant={-14} />
      </Sway>
      <ellipse cx={44.6} cy={38.4} rx={2.4} ry={2} fill={PALETTE.snuffBodyTop} stroke={PALETTE.snuffRim} strokeWidth={0.8} />
      <Wisps kit={kit} at={pts([42, 30, 30, 48])} />
    </g>
  );
}

export function HollowLamplighterFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={17} />
      {/* hooked pole */}
      <path d="M45.4,52.4L48.4,8.4" stroke={IRON} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M48.4,8.4Q48.6,4.4 51.6,4.6Q54.4,5 54,8.2" stroke={IRON} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={LAMPLIGHTER_COAT} amplitude={1.1} />
        <path d="M26,26.6L32,33L38,26.6" stroke={PALETTE.snuffBodyBottom} strokeWidth={1.4} fill="none" />
        <path d="M32,33V50" stroke={PALETTE.snuffBodyBottom} strokeWidth={0.9} />
      </Sway>
      <path d="M38.6,34.4Q43.4,37 45.6,40" stroke={PALETTE.snuffBodyTop} strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* empty lantern for a head: an iron cage around a void with floating ember eyes */}
      <path d="M24.4,12.6L32,6.4L39.6,12.6Z" fill={IRON} stroke={PALETTE.snuffRim} strokeWidth={0.9} strokeLinejoin="round" />
      <circle cx={32} cy={5.2} r={1.6} fill="none" stroke={IRON} strokeWidth={1} />
      <rect x={25.4} y={12.6} width={13.2} height={13.2} fill={VOID} />
      <rect x={25.4} y={12.6} width={13.2} height={13.2} fill={PALETTE.plumeViolet} opacity={0.08} />
      <EmberEyes kit={kit} x={32} y={19.4} gap={5} size={0.8} slant={6} />
      <path d="M25.4,12.6V25.8M29.8,12.6V25.8M34.2,12.6V25.8M38.6,12.6V25.8M25.4,19.2H38.6" stroke={IRON} strokeWidth={1.1} />
      <path d="M24.4,12.6H39.6M24.4,25.8H39.6" stroke={PALETTE.snuffRim} strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );
}

export function SmokestackFigure({ kit }: FigureProps): ReactElement {
  const bricks: string[] = [];
  for (let row = 0; row < 9; row++) {
    const y = 18 + row * 3.8;
    if (row === 3) continue;
    bricks.push(`M23,${fmt(y)}H41`);
    const offset = row % 2 === 0 ? 0 : 3;
    for (let x = 23 + offset + 6; x < 41; x += 6) bricks.push(`M${fmt(x)},${fmt(y)}V${fmt(y + 3.8)}`);
  }
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={18} />
      <g transform="rotate(-7 32 52)">
        <path d="M23,52.6V16H41V52.6Z" fill={kit.ids.url('snuff')} />
        <path d={bricks.join('')} stroke={IRON_DARK} strokeWidth={0.8} opacity={0.8} />
        {/* the gap between bricks where its eyes glow */}
        <rect x={24.6} y={29.6} width={14.8} height={4.6} rx={1.4} fill={VOID} />
        <EmberEyes kit={kit} x={32} y={31.9} gap={7} size={0.9} slant={-8} />
        <path className="ww-outline" d="M23,52.6V16H41V52.6" fill="none" stroke={PALETTE.snuffRim} strokeWidth={1.6} />
        <rect x={21.4} y={12.6} width={21.2} height={4.4} rx={1} fill={PALETTE.snuffBodyBottom} stroke={PALETTE.snuffRim} strokeWidth={1.2} />
        <Sway kit={kit} salt="puff">
          <SmokeBody kit={kit} points={STACK_PUFF} amplitude={1} salt="puff" />
        </Sway>
      </g>
      <Wisps kit={kit} at={pts([36, 5, 44, 6, 30, 7])} />
    </g>
  );
}

export function ClapperFigure({ kit }: FigureProps): ReactElement {
  const legs = [
    [27.6, 40.6, 24.6, 46, 20.4, 48.6, 18.6, 52.6],
    [32, 43.4, 31, 48, 33, 50.6, 32, 53],
    [36.4, 40.6, 39.4, 46, 43.6, 48.6, 45.4, 52.6],
  ];
  return (
    <g>
      <defs>
        <radialGradient id={kit.ids.id('coal')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FF9A4A" />
          <stop offset="0.45" stopColor="#C2321F" />
          <stop offset="1" stopColor="#4A0F0C" />
        </radialGradient>
      </defs>
      <UnderGlow kit={kit} cy={51} rx={18} />
      <circle cx={32} cy={31} r={17} fill={kit.ids.url('flameHalo')} opacity={0.5} />
      <Sway kit={kit}>
        {legs.map((l, i) => (
          <g key={i}>
            <path d={smoothOpenPath(pts(l))} stroke={PALETTE.snuffRim} strokeWidth={4.6} fill="none" strokeLinecap="round" />
            <path d={smoothOpenPath(pts(l))} stroke={PALETTE.snuffBodyTop} strokeWidth={2.8} fill="none" strokeLinecap="round" />
          </g>
        ))}
      </Sway>
      <path d="M32,21V9.6" stroke={IRON} strokeWidth={3} strokeLinecap="round" />
      <circle cx={32} cy={7} r={3} fill="none" stroke={IRON} strokeWidth={1.8} />
      <circle cx={32} cy={32} r={11.4} fill={kit.ids.url('coal')} stroke="#2A0A08" strokeWidth={1} />
      <path d="M24.6,27.6l3.4,2.4l-1,3.6M38.6,35.6l-3,-1.4l-0.6,3.4M30.4,40.6l1.6,-2.4l2.6,1" stroke="#FFC070" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <g className="ww-glance" style={{ transform: `translate(${fmt(kit.look.x)}px, ${fmt(kit.look.y)}px)` }}>
        <path d="M25.6,30.2l5,1.6l-5,1.4Z M38.4,30.2l-5,1.6l5,1.4Z" fill="#FFE6A0" stroke="#2A0A08" strokeWidth={0.8} strokeLinejoin="round" />
      </g>
      <Sparks kit={kit} at={pts([19, 22, 45, 24, 43, 41])} color={PALETTE.moltenCore} />
    </g>
  );
}

/** Fallback for unknown Snuff ids: a plain smoke wisp with ember eyes. */
export function GenericSnuffFigure({ kit }: FigureProps): ReactElement {
  return (
    <g>
      <UnderGlow kit={kit} cy={51} rx={16} />
      <Sway kit={kit}>
        <SmokeBody kit={kit} points={GENERIC} amplitude={1.5} />
        <EmberEyes kit={kit} x={32} y={38} gap={7} />
      </Sway>
      <Wisps kit={kit} at={pts([29, 19])} />
    </g>
  );
}
