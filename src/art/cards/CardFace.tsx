/**
 * Cards (§16.7): full CardFace (240×336, tarot proportions), CardMini (hand fan: cost,
 * name, sigil only) and CardBack (matchbook). All scale by `width`; the view box is fixed.
 */
import type { ReactElement, ReactNode } from 'react';
import { CardTypeShape, cardTypeColor } from '../icons/cardTypes';
import { HOUSES, PALETTE } from '../palette';
import { PieceGraphic } from '../pieces/PieceArt';
import { darken, lighten, mix } from '../util/color';
import { fmt, polygonPath, scallopedEllipse, starPoints } from '../util/path';
import { cx, useSvgIds, type SvgIds } from '../util/svg';
import { GlassBackdrop, normalizeSigil, SigilGlyphs, type SigilBox } from './SigilArt';
import '../art.css';
import './cards.css';

export type CardTypeName = 'summon' | 'rite' | 'charm';
export type CardRarity = 'common' | 'rare' | 'mythic';

/** Plain card data — mirrors the content JSON fields the art needs (GDD A.2). */
export interface CardArtData {
  id: string;
  name: string;
  type: string;
  cost: number;
  rarity: string;
  text: string;
  flavor?: string;
  art?: { sigil?: readonly string[] | string; accent?: string };
  /** For Summons: the unit drawn in the art window instead of a sigil. */
  summonUnitId?: string;
  tempered?: boolean;
  disabled?: boolean;
  /** Localised reason shown on a disabled card ("Need 2 Flame"). */
  reason?: string;
}

export interface CardFaceProps {
  card: CardArtData;
  /** Rendered width in px (height follows the 240×336 ratio). */
  width?: number;
  /** House colour for summoned unit art. */
  houseColor?: string;
  animated?: boolean;
  className?: string;
}

const W = 240;
const H = 336;

interface FrameStyle {
  stops: [string, string, string];
  edge: string;
  label: string;
}

const RARITY: Readonly<Record<CardRarity, FrameStyle>> = {
  common: { stops: ['#F2EAD6', '#D6C7A0', '#A8936A'], edge: '#6E5A3A', label: 'Common' },
  rare: { stops: ['#F6DE9A', PALETTE.brass, '#6E5320'], edge: '#4A3714', label: 'Rare' },
  mythic: { stops: ['#FFFFFF', PALETTE.moonsilver, '#8E9AB8'], edge: '#4E5872', label: 'Mythic' },
};

function rarityOf(rarity: string): CardRarity {
  return rarity === 'rare' || rarity === 'mythic' ? rarity : 'common';
}

const TYPE_LABEL: Readonly<Record<string, string>> = { summon: 'SUMMON', rite: 'RITE', charm: 'CHARM' };

/** Rules text size steps down with length so long cards still fit (min 13 px at 240 wide). */
export function rulesFontSize(text: string, flavor = ''): number {
  const n = text.length + flavor.length * 0.7;
  if (n <= 70) return 16;
  if (n <= 110) return 15;
  if (n <= 150) return 14;
  return 13;
}

/** Name font size by length, so long names fit the banner. */
export function nameFontSize(name: string, max: number, min: number, width: number): number {
  const estimate = width / Math.max(1, name.length * 0.68);
  return Math.max(min, Math.min(max, estimate));
}

function accentFor(card: CardArtData): string {
  return card.art?.accent ?? cardTypeColor(card.type);
}

/* ------------------------------------------------------------- frame bits */

function FrameDefs({ ids, rarity }: { ids: SvgIds; rarity: CardRarity }): ReactElement {
  const r = RARITY[rarity];
  return (
    <>
      <linearGradient id={ids.id('frame')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={r.stops[0]} />
        <stop offset="0.5" stopColor={r.stops[1]} />
        <stop offset="1" stopColor={r.stops[2]} />
      </linearGradient>
      <linearGradient id={ids.id('vellum')} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor={PALETTE.vellumTop} />
        <stop offset="1" stopColor={PALETTE.vellumBottom} />
      </linearGradient>
      <linearGradient id={ids.id('sheen')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={rarity === 'mythic' ? 0.85 : 0.7} />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ids.id('shimmer')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#C8E4F4" stopOpacity="0" />
        <stop offset="0.3" stopColor="#C8E4F4" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.95" />
        <stop offset="0.7" stopColor="#DCD0F2" stopOpacity="0.8" />
        <stop offset="1" stopColor="#DCD0F2" stopOpacity="0" />
      </linearGradient>
    </>
  );
}

/** Moving sheen (Rare) or iridescent shimmer (Mythic) clipped to the frame ring. */
function FrameLight({ ids, rarity, ring, w, h, animated }: { ids: SvgIds; rarity: CardRarity; ring: string; w: number; h: number; animated: boolean }): ReactElement | null {
  if (rarity === 'common') return null;
  const mythic = rarity === 'mythic';
  return (
    <g>
      <clipPath id={ids.id('ring')}>
        <path d={ring} clipRule="evenodd" />
      </clipPath>
      <g clipPath={ids.url('ring')}>
        <g className={animated ? (mythic ? 'ww-card-shimmer' : 'ww-card-sheen') : undefined}>
          <rect x={-w * 0.3} y={-h * 0.2} width={w * (mythic ? 0.55 : 0.3)} height={h * 1.4} fill={ids.url(mythic ? 'shimmer' : 'sheen')} transform={`rotate(20 ${w / 2} ${h / 2})`} opacity={animated ? 1 : 0.45} />
        </g>
      </g>
    </g>
  );
}

function Corner({ x, y, sx, sy, color }: { x: number; y: number; sx: number; sy: number; color: string }): ReactElement {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${sx} ${sy})`}
      d="M0,14C0,6 6,0 14,0M4,14C4,8 8,4 14,4M8,9a2,2 0 1 0 0.01,0"
      fill="none"
      stroke={color}
      strokeWidth={1.1}
      strokeLinecap="round"
    />
  );
}

function CostSeal({ x, y, r, cost, tempered }: { x: number; y: number; r: number; cost: number; tempered: boolean }): ReactElement {
  return (
    <g className="ww-card-cost">
      <path d={scallopedEllipse(x + 0.8, y + 1.6, r, r, 12, 0.05)} fill="#2A0A0E" opacity={0.6} />
      <path d={scallopedEllipse(x, y, r, r, 12, 0.05)} fill={PALETTE.sealRed} />
      <circle cx={x} cy={y} r={r * 0.78} fill="none" stroke={darken(PALETTE.sealRed, 0.4)} strokeWidth={r * 0.06} />
      <circle cx={x - r * 0.25} cy={y - r * 0.3} r={r * 0.32} fill="#FFFFFF" opacity={0.14} />
      <text className="ww-num ww-halo-text" x={x} y={y + r * 0.42} fontSize={r * 1.2} textAnchor="middle" fill={PALETTE.flameCore} stroke="#3A0C10" strokeWidth={r * 0.1}>
        {cost}
      </text>
      {tempered && <circle cx={x + r * 0.72} cy={y + r * 0.72} r={r * 0.24} fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />}
    </g>
  );
}

function RarityGem({ rarity, x, y, r }: { rarity: CardRarity; x: number; y: number; r: number }): ReactElement {
  if (rarity === 'mythic') {
    return <path d={polygonPath(starPoints(x, y, r * 1.4, r * 0.5, 4))} fill={PALETTE.moonsilver} stroke="#4E5872" strokeWidth={0.8} />;
  }
  if (rarity === 'rare') {
    return <path d={`M${x},${y - r * 1.2}L${x + r},${y}L${x},${y + r * 1.2}L${x - r},${y}Z`} fill={PALETTE.brass} stroke="#4A3714" strokeWidth={0.8} />;
  }
  return <circle cx={x} cy={y} r={r * 0.8} fill="#EDE3CC" stroke="#6E5A3A" strokeWidth={0.8} />;
}

/** Art window content: unit piece for Summons, otherwise the procedural sigil. */
function ArtContent({ card, box, ids, houseColor, animated }: { card: CardArtData; box: SigilBox; ids: SvgIds; houseColor: string; animated: boolean }): ReactElement {
  const accent = accentFor(card);
  const sigil = normalizeSigil(card.art?.sigil);
  const showUnit = card.type === 'summon' && card.summonUnitId;
  const scale = (box.h * 0.92) / 64;
  return (
    <g>
      <GlassBackdrop box={box} accent={accent} seed={card.id} ids={ids} />
      {showUnit ? (
        <g transform={`translate(${fmt(box.x + box.w / 2 - 32 * scale)} ${fmt(box.y + box.h - 60 * scale)}) scale(${fmt(scale)})`}>
          <PieceGraphic defId={card.summonUnitId ?? ''} houseColor={houseColor} showStats={false} showPips={false} animated={animated} seed={`${card.id}art`} />
        </g>
      ) : (
        <SigilGlyphs sigil={sigil} accent={accent} box={{ x: box.x + box.w * 0.12, y: box.y + box.h * 0.08, w: box.w * 0.76, h: box.h * 0.84 }} />
      )}
    </g>
  );
}

function DisabledBanner({ y, w, reason, size }: { y: number; w: number; reason?: string; size: number }): ReactElement {
  return (
    <g className="ww-card-reason">
      <rect x={0} y={y} width={w} height={size * 2.1} fill="#0D0B12" opacity={0.86} />
      <path d={`M0,${y}H${w}M0,${y + size * 2.1}H${w}`} stroke={PALETTE.ashText} strokeWidth={1} opacity={0.6} />
      <text className="ww-label" x={w / 2} y={y + size * 1.42} fontSize={size} textAnchor="middle" fill={PALETTE.tallowText}>
        {reason ?? 'Unavailable'}
      </text>
    </g>
  );
}

/* ----------------------------------------------------------------- face */

const ARCH = 'M22,190V98C22,74 70,58 120,54C170,58 218,74 218,98V190Z';
/** Drips hanging from the top edge: [x, length]. */
const DRIP_SPECS: ReadonlyArray<readonly [number, number]> = [
  [214, 7],
  [190, 10],
  [168, 5],
  [131, 8],
  [92, 10],
  [62, 6],
  [24, 8],
];
const TOP_DRIPS = `M9,9H231V12${DRIP_SPECS.map(([x, len]) => `H${x + 3.4}v${len}a3.4,3.4 0 0 1 -6.8,0v${-len}`).join('')}H9Z`;
const ART_BOX: SigilBox = { x: 22, y: 54, w: 196, h: 136 };
const RING = `M0,14Q0,0 14,0H226Q240,0 240,14V322Q240,336 226,336H14Q0,336 0,322ZM18,9H222Q231,9 231,18V318Q231,327 222,327H18Q9,327 9,318V18Q9,9 18,9Z`;

export function CardFace({ card, width = 240, houseColor = HOUSES.house_beeswax.color, animated = true, className }: CardFaceProps): ReactElement {
  const ids = useSvgIds('card');
  const rarity = rarityOf(card.rarity);
  const frame = RARITY[rarity];
  const typeColor = cardTypeColor(card.type);
  const name = card.tempered ? `${card.name}+` : card.name;
  const nameSize = nameFontSize(name, 17, 11.5, 150);
  const rulesSize = rulesFontSize(card.text, card.flavor);
  const live = animated && !card.disabled;
  return (
    <svg
      className={cx('ww-art ww-card', !live && 'ww-still', card.disabled && 'ww-card-disabled', className)}
      width={width}
      height={(width * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${card.name}, ${card.type}, cost ${card.cost}`}
    >
      <defs>
        <FrameDefs ids={ids} rarity={rarity} />
        <clipPath id={ids.id('arch')}>
          <path d={ARCH} />
        </clipPath>
      </defs>
      {/* rarity frame */}
      <rect x={0} y={0} width={W} height={H} rx={14} fill={ids.url('frame')} stroke={frame.edge} strokeWidth={1.5} />
      <FrameLight ids={ids} rarity={rarity} ring={RING} w={W} h={H} animated={live} />
      {card.tempered && <rect x={3} y={3} width={W - 6} height={H - 6} rx={12} fill="none" stroke={PALETTE.brass} strokeWidth={3} />}
      {/* vellum face with engraved border */}
      <rect x={9} y={9} width={222} height={318} rx={9} fill={ids.url('vellum')} />
      <rect x={14} y={14} width={212} height={308} rx={6} fill="none" stroke="#8C7A5A" strokeWidth={1.2} />
      <rect x={17.5} y={17.5} width={205} height={301} rx={4} fill="none" stroke="#8C7A5A" strokeWidth={0.6} />
      <Corner x={20} y={20} sx={1} sy={1} color="#8C7A5A" />
      <Corner x={220} y={20} sx={-1} sy={1} color="#8C7A5A" />
      <Corner x={20} y={316} sx={1} sy={-1} color="#8C7A5A" />
      <Corner x={220} y={316} sx={-1} sy={-1} color="#8C7A5A" />
      {/* art window */}
      <g clipPath={ids.url('arch')}>
        <ArtContent card={card} box={ART_BOX} ids={ids} houseColor={houseColor} animated={live} />
      </g>
      <path d={ARCH} fill="none" stroke={typeColor} strokeWidth={3.4} />
      <path d={ARCH} fill="none" stroke="#2A1E10" strokeWidth={1} />
      {card.disabled && <DisabledBanner y={156} w={W} reason={card.reason} size={13} />}
      {/* name banner */}
      <path d="M56,20H226L232,34L226,48H56Z" fill={PALETTE.velvetDusk} stroke={card.tempered ? PALETTE.brass : '#0D0B12'} strokeWidth={card.tempered ? 2.4 : 1.2} strokeLinejoin="round" />
      <path d="M58,23.6H224" stroke={lighten(PALETTE.velvetDusk, 0.2)} strokeWidth={0.8} />
      <text className="ww-label" x={146} y={34 + nameSize * 0.36} fontSize={fmt(nameSize)} textAnchor="middle" fill={PALETTE.tallowText}>
        {card.name}
        {card.tempered && <tspan fill={PALETTE.candleGold}>+</tspan>}
      </text>
      {/* wax drips along the top edge, running onto the banner (§16.4) */}
      <path d={TOP_DRIPS} fill="#000" opacity={0.18} transform="translate(0.8 1.2)" />
      <path d={TOP_DRIPS} fill={frame.stops[1]} stroke={frame.edge} strokeOpacity={0.5} strokeWidth={0.7} />
      {DRIP_SPECS.map(([x, len]) => (
        <ellipse key={x} cx={x - 1} cy={12 + len - 0.6} rx={1.1} ry={1.5} fill="#FFFFFF" opacity={0.7} />
      ))}
      <CostSeal x={36} y={36} r={24} cost={card.cost} tempered={card.tempered === true} />
      {/* type ribbon */}
      <path d="M64,193H176L184,202L176,211H64L56,202Z" fill={darken(typeColor, 0.42)} stroke={typeColor} strokeWidth={1.4} strokeLinejoin="round" />
      <g transform="translate(66 194) scale(0.5)">
        <CardTypeShape type={card.type} color={typeColor} />
      </g>
      <text className="ww-label" x={128} y={206} fontSize={10.5} textAnchor="middle" fill={PALETTE.flameCore} letterSpacing={2.4}>
        {TYPE_LABEL[card.type] ?? card.type.toUpperCase()}
      </text>
      {/* rules box */}
      <rect x={22} y={215} width={196} height={102} rx={4} fill="#F4ECD6" stroke="#8C7A5A" strokeWidth={1} />
      <foreignObject x={27} y={218} width={186} height={96}>
        <div className="ww-card-rules" style={{ fontSize: `${rulesSize}px` }}>
          <p className="ww-card-text">{card.text}</p>
          {card.flavor && <p className="ww-card-flavor">{card.flavor}</p>}
        </div>
      </foreignObject>
      <RarityGem rarity={rarity} x={120} y={324} r={3.6} />
    </svg>
  );
}

/* ----------------------------------------------------------------- mini */

const MW = 120;
const MH = 168;
const MINI_ARCH = 'M10,124V44C10,26 34,14 60,12C86,14 110,26 110,44V124Z';
const MINI_BOX: SigilBox = { x: 10, y: 12, w: 100, h: 112 };
const MINI_RING = `M0,9Q0,0 9,0H111Q120,0 120,9V159Q120,168 111,168H9Q0,168 0,159ZM11,5H109Q115,5 115,11V157Q115,163 109,163H11Q5,163 5,157V11Q5,5 11,5Z`;

/** Mini card for the hand fan: cost, name and sigil only (§16.7). */
export function CardMini({ card, width = 120, houseColor = HOUSES.house_beeswax.color, animated = true, className }: CardFaceProps): ReactElement {
  const ids = useSvgIds('mini');
  const rarity = rarityOf(card.rarity);
  const frame = RARITY[rarity];
  const typeColor = cardTypeColor(card.type);
  const label = card.tempered ? `${card.name}+` : card.name;
  const size = nameFontSize(label, 12.5, 8.6, 98);
  const live = animated && !card.disabled;
  return (
    <svg
      className={cx('ww-art ww-card ww-card-mini', !live && 'ww-still', card.disabled && 'ww-card-disabled', className)}
      width={width}
      height={(width * MH) / MW}
      viewBox={`0 0 ${MW} ${MH}`}
      role="img"
      aria-label={`${card.name}, cost ${card.cost}`}
    >
      <defs>
        <FrameDefs ids={ids} rarity={rarity} />
        <clipPath id={ids.id('arch')}>
          <path d={MINI_ARCH} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={MW} height={MH} rx={9} fill={ids.url('frame')} stroke={frame.edge} strokeWidth={1.2} />
      <FrameLight ids={ids} rarity={rarity} ring={MINI_RING} w={MW} h={MH} animated={live} />
      {card.tempered && <rect x={2} y={2} width={MW - 4} height={MH - 4} rx={8} fill="none" stroke={PALETTE.brass} strokeWidth={2.4} />}
      <rect x={5} y={5} width={110} height={158} rx={6} fill={ids.url('vellum')} />
      <g clipPath={ids.url('arch')}>
        <ArtContent card={card} box={MINI_BOX} ids={ids} houseColor={houseColor} animated={live} />
      </g>
      <path d={MINI_ARCH} fill="none" stroke={typeColor} strokeWidth={2.6} />
      {card.disabled && <DisabledBanner y={92} w={MW} reason={card.reason} size={9} />}
      <path d="M8,130H112V156H8Z" fill={PALETTE.velvetDusk} stroke={card.tempered ? PALETTE.brass : '#0D0B12'} strokeWidth={card.tempered ? 1.8 : 1} />
      <text className="ww-label" x={60} y={143 + size * 0.36} fontSize={fmt(size)} textAnchor="middle" fill={PALETTE.tallowText}>
        {card.name}
        {card.tempered && <tspan fill={PALETTE.candleGold}>+</tspan>}
      </text>
      <CostSeal x={19} y={19} r={15} cost={card.cost} tempered={card.tempered === true} />
    </svg>
  );
}

/* ----------------------------------------------------------------- back */

/** Card back: a matchbook-red cover with a gold moth emblem and a striker strip. */
export function CardBack({ width = 240, className, children }: { width?: number; className?: string; children?: ReactNode }): ReactElement {
  const ids = useSvgIds('back');
  const gold = PALETTE.sunriseGold;
  const ink = '#2A0A0E';
  return (
    <svg className={cx('ww-art ww-card ww-card-back', className)} width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Card back">
      <defs>
        <radialGradient id={ids.id('red')} cx="0.5" cy="0.4" r="0.8">
          <stop offset="0" stopColor={lighten(PALETTE.matchbookRed, 0.18)} />
          <stop offset="1" stopColor={darken(PALETTE.matchbookRed, 0.3)} />
        </radialGradient>
        <pattern id={ids.id('stripe')} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0,0V8" stroke="#000" strokeOpacity={0.12} strokeWidth={3} />
        </pattern>
        <pattern id={ids.id('grit')} width={10} height={10} patternUnits="userSpaceOnUse">
          <rect width={10} height={10} fill="#4A3426" />
          <circle cx={2} cy={3} r={1} fill="#2A1C12" />
          <circle cx={7} cy={2} r={0.8} fill="#6B5040" />
          <circle cx={5} cy={7} r={1.1} fill="#2A1C12" />
          <circle cx={9} cy={8} r={0.7} fill="#7A604C" />
          <circle cx={1} cy={8.6} r={0.6} fill="#6B5040" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} rx={14} fill={ids.url('red')} stroke={ink} strokeWidth={1.5} />
      <rect x={0} y={0} width={W} height={H} rx={14} fill={ids.url('stripe')} />
      <rect x={10} y={10} width={220} height={316} rx={9} fill="none" stroke={PALETTE.brass} strokeWidth={2} />
      <rect x={15} y={15} width={210} height={306} rx={6} fill="none" stroke={PALETTE.brass} strokeWidth={0.8} strokeDasharray="2 3" />
      {/* filigree ring and moth emblem */}
      <circle cx={120} cy={128} r={66} fill={darken(PALETTE.matchbookRed, 0.25)} stroke={gold} strokeWidth={2} />
      <circle cx={120} cy={128} r={58} fill="none" stroke={gold} strokeWidth={0.8} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x = 120 + Math.cos(a) * 62;
        const y = 128 + Math.sin(a) * 62;
        return <path key={i} d={`M${fmt(x)},${fmt(y - 3)}L${fmt(x + 2)},${fmt(y)}L${fmt(x)},${fmt(y + 3)}L${fmt(x - 2)},${fmt(y)}Z`} fill={gold} />;
      })}
      <g stroke={ink} strokeWidth={1.4} strokeLinejoin="round">
        <path d="M117,120C108,98 84,90 76,102C70,112 86,124 115,128Z" fill={gold} />
        <path d="M123,120C132,98 156,90 164,102C170,112 154,124 125,128Z" fill={gold} />
        <path d="M116,132C102,138 92,152 98,160C104,166 112,152 118,138Z" fill={mix(gold, PALETTE.brass, 0.4)} />
        <path d="M124,132C138,138 148,152 142,160C136,166 128,152 122,138Z" fill={mix(gold, PALETTE.brass, 0.4)} />
        <ellipse cx={120} cy={132} rx={6} ry={22} fill={PALETTE.brass} />
      </g>
      <circle cx={92} cy={106} r={6} fill={darken(PALETTE.matchbookRed, 0.2)} stroke={ink} strokeWidth={1} />
      <circle cx={148} cy={106} r={6} fill={darken(PALETTE.matchbookRed, 0.2)} stroke={ink} strokeWidth={1} />
      <circle cx={92} cy={106} r={2.4} fill={gold} />
      <circle cx={148} cy={106} r={2.4} fill={gold} />
      <path d="M117,112C112,100 106,94 98,92M123,112C128,100 134,94 142,92" stroke={gold} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <text className="ww-display" x={120} y={226} fontSize={20} textAnchor="middle" fill={gold} letterSpacing={2}>
        Wickwatch
      </text>
      <text className="ww-label" x={120} y={246} fontSize={9} textAnchor="middle" fill={mix(gold, PALETTE.matchbookRed, 0.35)} letterSpacing={3}>
        STRIKE TO KEEP THE VIGIL
      </text>
      {/* striker strip with staple */}
      <rect x={24} y={270} width={192} height={30} rx={3} fill={ids.url('grit')} stroke={ink} strokeWidth={1.2} />
      <rect x={24} y={270} width={192} height={4} fill="#000" opacity={0.25} />
      <rect x={104} y={308} width={32} height={5} rx={1.6} fill="#B7BDD0" stroke="#4A4E60" strokeWidth={0.8} />
      {children}
    </svg>
  );
}
