/**
 * The pattern gallery (GDD §15.1.5): eight looping mini-boards, one per movement rune —
 * King step, Knight leap, Rook slide, Bishop slide, Queen slide, Pawn, Flying, Artillery.
 */
import { useMemo, type ReactElement } from 'react';
import { MoveDot, PALETTE, StrikeRing } from '../../../art';
import type { RuneId } from '../../../engine/types';
import { Anim, appearFrames, MiniBoard, MiniPiece, shift, squareAt, tourFrames, vanishFrames, type Stop } from './MiniBoard';

const N = 5;
type Sq = readonly [number, number];

const ORTH: readonly Sq[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG: readonly Sq[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT: readonly Sq[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

function onBoard([f, r]: Sq): boolean {
  return f >= 0 && r >= 0 && f < N && r < N;
}

function key([f, r]: Sq): string {
  return `${f},${r}`;
}

/** Slide destinations from `from`, stopping before blocked squares unless `flying`. */
export function slideSquares(from: Sq, dirs: readonly Sq[], range: number, blocked: ReadonlySet<string> = new Set(), flying = false): Sq[] {
  const out: Sq[] = [];
  for (const [dx, dy] of dirs) {
    for (let step = 1; step <= range; step++) {
      const sq: Sq = [from[0] + dx * step, from[1] + dy * step];
      if (!onBoard(sq)) break;
      if (blocked.has(key(sq))) {
        if (flying) continue;
        break;
      }
      out.push(sq);
    }
  }
  return out;
}

function Dots({ squares }: { squares: readonly Sq[] }): ReactElement {
  return (
    <>
      {squares.map((sq) => {
        const o = squareAt(sq[0], sq[1], N);
        return <MoveDot key={key(sq)} x={o.x} y={o.y} />;
      })}
    </>
  );
}

function Mover({ defId, home, stops, kind = 'unit', duration }: { defId: string; home: Sq; stops: readonly Stop[]; kind?: 'hero' | 'unit'; duration?: number }): ReactElement {
  const frames = useMemo(() => tourFrames(stops), [stops]);
  return (
    <Anim frames={frames} duration={duration}>
      <MiniPiece defId={defId} at={home} rows={N} kind={kind} />
    </Anim>
  );
}

const KING_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.25 },
  { at: [1, 1], travel: 0.1, rest: 0.25 },
  { at: [0, 0], travel: 0.1, rest: 0.2 },
  { at: [-1, 0], travel: 0.1, rest: 0.25 },
];

function KingBoard(): ReactElement {
  const home: Sq = [2, 2];
  return (
    <MiniBoard cols={N} rows={N} label="King step: one square in any direction">
      <Dots squares={slideSquares(home, [...ORTH, ...DIAG], 1)} />
      <Mover defId="sconce_paladin" kind="hero" home={home} stops={KING_STOPS} />
    </MiniBoard>
  );
}

const KNIGHT_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.3 },
  { at: [1, 2], travel: 0.16, rest: 0.25, arc: 0.7 },
  { at: [0, 0], travel: 0.16, rest: 0.2, arc: 0.7 },
  { at: [-2, -1], travel: 0.16, rest: 0.25, arc: 0.7 },
];

function KnightBoard(): ReactElement {
  const home: Sq = [2, 2];
  return (
    <MiniBoard cols={N} rows={N} label="Knight leap: jumps over pieces in between">
      <Dots squares={KNIGHT.map(([dx, dy]): Sq => [home[0] + dx, home[1] + dy]).filter(onBoard)} />
      <MiniPiece defId="taper" at={[2, 3]} rows={N} kind="unit" />
      <MiniPiece defId="taper" at={[1, 2]} rows={N} kind="unit" seed="taper2" />
      <Mover defId="moth_witch" kind="hero" home={home} stops={KNIGHT_STOPS} />
    </MiniBoard>
  );
}

const ROOK_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.25 },
  { at: [3, 0], travel: 0.2, rest: 0.25 },
  { at: [0, 0], travel: 0.2, rest: 0.15 },
  { at: [0, -2], travel: 0.14, rest: 0.25 },
];

function RookBoard(): ReactElement {
  const home: Sq = [0, 2];
  const blocked = new Set(['0,4']);
  return (
    <MiniBoard cols={N} rows={N} tiles={{ '0,4': 'pillar' }} label="Rook slide: straight lines, up to the pips">
      <Dots squares={slideSquares(home, ORTH, 3, blocked)} />
      <Mover defId="lampwright" kind="hero" home={home} stops={ROOK_STOPS} />
    </MiniBoard>
  );
}

const BISHOP_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.25 },
  { at: [3, 3], travel: 0.22, rest: 0.25 },
  { at: [0, 0], travel: 0.22, rest: 0.15 },
  { at: [-1, 1], travel: 0.1, rest: 0.25 },
];

function BishopBoard(): ReactElement {
  const home: Sq = [1, 1];
  return (
    <MiniBoard cols={N} rows={N} label="Bishop slide: diagonals, up to the pips">
      <Dots squares={slideSquares(home, DIAG, 3)} />
      <Mover defId="ember_duelist" kind="hero" home={home} stops={BISHOP_STOPS} />
    </MiniBoard>
  );
}

const QUEEN_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.25 },
  { at: [2, 0], travel: 0.16, rest: 0.25 },
  { at: [0, 0], travel: 0.16, rest: 0.15 },
  { at: [-2, 2], travel: 0.18, rest: 0.25 },
];

function QueenBoard(): ReactElement {
  const home: Sq = [2, 2];
  return (
    <MiniBoard cols={N} rows={N} label="Queen slide: any line, up to the pips">
      <Dots squares={slideSquares(home, [...ORTH, ...DIAG], 2)} />
      <Mover defId="cinderling" home={home} stops={QUEEN_STOPS} />
    </MiniBoard>
  );
}

/** Pawn: steps up, comes back, then strikes the diagonal foe and takes its square. */
const PAWN_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.2 },
  { at: [0, 1], travel: 0.1, rest: 0.2 },
  { at: [0, 0], travel: 0.1, rest: 0.15 },
  { at: [1, 1], travel: 0.08, rest: 0.35 },
];
const PAWN_FOE = vanishFrames(0.62, 0.93);

function PawnBoard(): ReactElement {
  const home: Sq = [2, 2];
  const ring = squareAt(3, 3, N);
  return (
    <MiniBoard cols={N} rows={N} label="Pawn: moves straight, strikes diagonally">
      <Dots squares={slideSquares(home, ORTH, 1)} />
      <Anim frames={PAWN_FOE}>
        <StrikeRing x={ring.x} y={ring.y} />
        <MiniPiece defId="sootling" at={[3, 3]} rows={N} side="snuff" kind="enemy" />
      </Anim>
      <Mover defId="taper" home={home} stops={PAWN_STOPS} />
    </MiniBoard>
  );
}

const FLY_STOPS: readonly Stop[] = [
  { at: [0, 0], rest: 0.25 },
  { at: [2, 2], travel: 0.2, rest: 0.25, arc: 0.35 },
  { at: [0, 0], travel: 0.2, rest: 0.15, arc: 0.35 },
  { at: [0, 2], travel: 0.18, rest: 0.25, arc: 0.35 },
];

function FlyingBoard(): ReactElement {
  const home: Sq = [1, 1];
  const blocked = new Set(['2,2', '1,2']);
  return (
    <MiniBoard cols={N} rows={N} tiles={{ '2,2': 'pillar' }} label="Flying: passes over pieces and pillars">
      <Dots squares={slideSquares(home, [...ORTH, ...DIAG], 2, blocked, true)} />
      <MiniPiece defId="sootling" at={[1, 2]} rows={N} side="snuff" kind="enemy" />
      <Mover defId="velvet_moth" home={home} stops={FLY_STOPS} />
    </MiniBoard>
  );
}

const SHOT_FRAMES: Keyframe[] = [
  { offset: 0, transform: shift(0, 0), opacity: 0 },
  { offset: 0.3, transform: shift(0, 0), opacity: 0 },
  { offset: 0.32, transform: shift(0, 0), opacity: 1 },
  { offset: 0.42, transform: shift(0, 2.6), opacity: 1 },
  { offset: 0.52, transform: shift(0, 3), opacity: 1 },
  { offset: 0.54, transform: shift(0, 3), opacity: 0 },
  { offset: 1, transform: shift(0, 0), opacity: 0 },
];
const MORTAR_FOE = vanishFrames(0.53, 0.9);
const MORTAR_FLASH = appearFrames(0.52, 0.6, 0.02);

function ArtilleryBoard(): ReactElement {
  const home: Sq = [2, 0];
  const targets: Sq[] = [];
  for (let f = 0; f < N; f++) {
    for (let r = 0; r < N; r++) {
      const d = Math.max(Math.abs(f - home[0]), Math.abs(r - home[1]));
      if (d >= 2 && d <= 4) targets.push([f, r]);
    }
  }
  const start = squareAt(home[0], home[1], N);
  const ring = squareAt(2, 3, N);
  return (
    <MiniBoard cols={N} rows={N} tiles={{ '2,1': 'pillar', '1,2': 'pillar' }} label="Artillery: hits a tile 2 to 4 away, over anything">
      {targets.map((sq) => {
        const o = squareAt(sq[0], sq[1], N);
        return <rect key={key(sq)} x={o.x + 6} y={o.y + 6} width={52} height={52} rx={6} fill="none" stroke={PALETTE.candleGold} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="6 5" />;
      })}
      <Anim frames={MORTAR_FOE}>
        <StrikeRing x={ring.x} y={ring.y} />
        <MiniPiece defId="ash_deacon" at={[2, 3]} rows={N} side="snuff" kind="enemy" />
      </Anim>
      <Anim frames={MORTAR_FLASH} still={{ opacity: 0 }}>
        <circle cx={ring.x + 32} cy={ring.y + 32} r={26} fill={PALETTE.flameCore} opacity={0.55} />
      </Anim>
      <MiniPiece defId="wick_mortar" at={home} rows={N} />
      <Anim frames={SHOT_FRAMES} still={{ opacity: 0 }}>
        <circle cx={start.x + 32} cy={start.y + 26} r={7} fill={PALETTE.ember} stroke={PALETTE.flameCore} strokeWidth={2.5} />
      </Anim>
    </MiniBoard>
  );
}

export interface PatternDiagram {
  rune: RuneId;
  pips?: number;
  Diagram: () => ReactElement;
}

export const PATTERN_DIAGRAMS: readonly PatternDiagram[] = [
  { rune: 'rune_crown', Diagram: KingBoard },
  { rune: 'rune_horse', Diagram: KnightBoard },
  { rune: 'rune_tower', pips: 3, Diagram: RookBoard },
  { rune: 'rune_mitre', pips: 3, Diagram: BishopBoard },
  { rune: 'rune_star', pips: 2, Diagram: QueenBoard },
  { rune: 'rune_pawn', Diagram: PawnBoard },
  { rune: 'rune_wing', Diagram: FlyingBoard },
  { rune: 'rune_arc', Diagram: ArtilleryBoard },
];
