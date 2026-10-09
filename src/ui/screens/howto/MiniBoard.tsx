/**
 * Tiny looping board diagrams for How to Play. Boards are drawn with the art library's
 * BoardArt (64 units per tile); motion runs through the Web Animations API on transform and
 * opacity only, and stops entirely under reduced motion (the still pose is the first frame).
 */
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { BoardArt, PieceGraphic, tileOrigin, type BoardTileSpec } from '../../../art';
import { usePresentation } from '../../app/services';

export const T = 64;

/** A board-space translation of (files, ranks) tiles; ranks grow upward on screen. */
export function shift(files: number, ranks: number): string {
  return `translate(${files * T}px, ${-ranks * T}px)`;
}

export interface Stop {
  /** Tiles from the piece's home square. */
  at: readonly [number, number];
  /** Fraction of the loop spent travelling to this stop. */
  travel?: number;
  /** Fraction of the loop spent resting here. */
  rest: number;
  /** Height of the travel arc in tiles (leaps, flight). */
  arc?: number;
}

/**
 * Keyframes that visit each stop in order and come home. The first stop is home; the
 * fractions are normalised, so they only need to be right relative to each other.
 */
export function tourFrames(stops: readonly Stop[]): Keyframe[] {
  const total = stops.reduce((sum, s) => sum + (s.travel ?? 0) + s.rest, 0) + 0.12;
  const frames: Keyframe[] = [];
  let t = 0;
  let prev: readonly [number, number] = stops[0]?.at ?? [0, 0];
  const push = (offset: number, at: readonly [number, number]): void => {
    frames.push({ offset: Math.min(1, offset / total), transform: shift(at[0], at[1]) });
  };
  for (const stop of stops) {
    const travel = stop.travel ?? 0;
    if (travel > 0 && stop.arc) {
      const mid: [number, number] = [(prev[0] + stop.at[0]) / 2, (prev[1] + stop.at[1]) / 2 + stop.arc];
      push(t + travel / 2, mid);
    }
    t += travel;
    push(t, stop.at);
    t += stop.rest;
    push(t, stop.at);
    prev = stop.at;
  }
  push(total, stops[0]?.at ?? [0, 0]);
  return frames;
}

/** Opacity keyframes: visible, gone between `from` and `until` (fractions of the loop). */
export function vanishFrames(from: number, until: number, fade = 0.04): Keyframe[] {
  return [
    { offset: 0, opacity: 1 },
    { offset: from, opacity: 1 },
    { offset: Math.min(1, from + fade), opacity: 0 },
    { offset: until, opacity: 0 },
    { offset: Math.min(1, until + fade), opacity: 1 },
    { offset: 1, opacity: 1 },
  ];
}

/** Opacity keyframes: hidden, shown between `from` and `until`. */
export function appearFrames(from: number, until: number, fade = 0.04): Keyframe[] {
  return [
    { offset: 0, opacity: 0 },
    { offset: from, opacity: 0 },
    { offset: Math.min(1, from + fade), opacity: 1 },
    { offset: until, opacity: 1 },
    { offset: Math.min(1, until + fade), opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}

export interface AnimProps {
  frames: readonly Keyframe[];
  /** Loop length in ms. */
  duration?: number;
  children: ReactNode;
  /** Pose for the still (reduced motion) and before the animation starts. */
  still?: { transform?: string; opacity?: number };
}

/** A `<g>` that loops `frames` forever (transform/opacity only). */
export function Anim({ frames, duration = 4200, children, still }: AnimProps): ReactElement {
  const ref = useRef<SVGGElement | null>(null);
  const { reduced_motion: reduced, animation_speed: speed } = usePresentation();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== 'function') return;
    const animation = el.animate([...frames], { duration: duration / speed, iterations: Infinity, easing: 'ease-in-out' });
    return () => animation.cancel();
  }, [frames, duration, reduced, speed]);
  return (
    <g ref={ref} style={still ? { transform: still.transform, opacity: still.opacity } : undefined}>
      {children}
    </g>
  );
}

export interface MiniPieceProps {
  defId: string;
  at: readonly [number, number];
  rows: number;
  side?: 'wick' | 'snuff';
  kind?: 'hero' | 'unit' | 'enemy' | 'candle' | 'wick';
  houseColor?: string;
  hp?: number;
  atk?: number;
  showPips?: boolean;
  /** Runtime-like seed so identical pieces differ. */
  seed?: string;
}

/** A piece drawn at a board square (file, rank) in board space. */
export function MiniPiece({ defId, at, rows, side, kind, houseColor, hp, atk, showPips = false, seed }: MiniPieceProps): ReactElement {
  const o = tileOrigin({ x: at[0], y: at[1] }, 1, rows);
  return (
    <g transform={`translate(${o.x} ${o.y})`}>
      <PieceGraphic
        defId={defId}
        side={side}
        kind={kind}
        houseColor={houseColor}
        hp={hp}
        atk={atk}
        showStats={hp !== undefined}
        showPips={showPips}
        animated={false}
        seed={seed ?? `${defId}${at[0]}${at[1]}`}
      />
    </g>
  );
}

/** Top-left corner of a square in board space. */
export function squareAt(file: number, rank: number, rows: number): { x: number; y: number } {
  return tileOrigin({ x: file, y: rank }, 1, rows);
}

export interface MiniBoardProps {
  cols: number;
  rows: number;
  tiles?: Readonly<Record<string, BoardTileSpec | string>>;
  label: string;
  children: ReactNode;
  className?: string;
}

export function MiniBoard({ cols, rows, tiles, label, children, className }: MiniBoardProps): ReactElement {
  return (
    <figure className={className ? `ww-miniboard ${className}` : 'ww-miniboard'} aria-label={label}>
      <BoardArt cols={cols} rows={rows} tiles={tiles} frame={false} tileSize={32} animated={false} seed={label}>
        {children}
      </BoardArt>
    </figure>
  );
}
