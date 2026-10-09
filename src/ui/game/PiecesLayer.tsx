/**
 * The pieces (GDD §16.6) as absolutely positioned slots moved by CSS transforms, y-sorted
 * with the boss art (§16.8). Event playback animates them with the Web Animations API
 * (§16.9): hops per tile for steps and slides, arcs for leaps and flights, slides for pushes
 * and Takes, fades for teleports, a lunge for melee strikes and a jolt when hit.
 */
import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import { BossArt, bossArtPlacement, PieceArt } from '../../art';
import type { GameEvent, Piece, Pos } from '../../engine/types';
import { readyPieces, type ControllerSnapshot, type PlaybackStep } from '../../game';
import { usePresentation } from '../app/services';
import { useController } from './context';
import { tileXY, type BoardMetrics } from './geometry';
import { pieceArtProps } from './pieceView';
import type { BoardModel } from './useBoardModel';

interface LayerProps {
  snap: ControllerSnapshot;
  model: BoardModel;
  metrics: BoardMetrics;
}

type Nodes = Map<string, HTMLDivElement>;

/** Length of the summon / rise animation (board.css `ww-piece-rise`) plus a margin. */
const ENTER_MS = 520;

function translate(p: { x: number; y: number }, lift = 0, sx = 1, sy = 1): string {
  return `translate(${p.x}px, ${p.y - lift}px) scale(${sx}, ${sy})`;
}

function canAnimate(node: HTMLElement | undefined): node is HTMLElement {
  return node !== undefined && typeof node.animate === 'function';
}

/** Hop from tile to tile along the path, with a wax squash on each landing. */
function hopFrames(from: Pos, path: Pos[], m: BoardMetrics): Keyframe[] {
  const points = [from, ...path].map((p) => tileXY(p, m));
  const frames: Keyframe[] = [];
  const legs = points.length - 1;
  const lift = m.tile * 0.16;
  points.forEach((pt, i) => {
    const offset = legs === 0 ? 0 : i / legs;
    if (i > 0) {
      const prev = points[i - 1];
      frames.push({ transform: translate({ x: (prev.x + pt.x) / 2, y: (prev.y + pt.y) / 2 }, lift, 0.94, 1.08), offset: (i - 0.5) / legs });
    }
    frames.push({ transform: translate(pt, 0, i === 0 ? 1 : 1.06, i === 0 ? 1 : 0.92), offset });
  });
  frames[frames.length - 1] = { transform: translate(points[points.length - 1]), offset: 1 };
  return frames;
}

function arcFrames(from: Pos, to: Pos, m: BoardMetrics): Keyframe[] {
  const a = tileXY(from, m);
  const b = tileXY(to, m);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return [
    { transform: translate(a), offset: 0 },
    { transform: translate(mid, m.tile * 0.6, 0.96, 1.04), offset: 0.5 },
    { transform: translate(b, 0, 1.08, 0.9), offset: 0.88 },
    { transform: translate(b), offset: 1 },
  ];
}

function slideFrames(from: Pos, to: Pos, m: BoardMetrics, nudge: boolean): Keyframe[] {
  const a = tileXY(from, m);
  const b = tileXY(to, m);
  const frames: Keyframe[] = [
    { transform: translate(a), offset: 0 },
    { transform: translate(b), offset: nudge ? 0.75 : 1 },
  ];
  if (nudge) {
    const dx = Math.sign(b.x - a.x) * 2;
    const dy = Math.sign(b.y - a.y) * 2;
    frames.push({ transform: translate({ x: b.x + dx, y: b.y + dy }), offset: 0.87 }, { transform: translate(b), offset: 1 });
  }
  return frames;
}

function fadeFrames(from: Pos, to: Pos, m: BoardMetrics): Keyframe[] {
  const a = tileXY(from, m);
  const b = tileXY(to, m);
  return [
    { transform: translate(a), opacity: 1, offset: 0 },
    { transform: translate(a, 0, 0.4, 1.3), opacity: 0, offset: 0.45 },
    { transform: translate(b, 0, 0.4, 1.3), opacity: 0, offset: 0.55 },
    { transform: translate(b), opacity: 1, offset: 1 },
  ];
}

function moveFrames(e: Extract<GameEvent, { type: 'piece_moved' }>, m: BoardMetrics): Keyframe[] {
  switch (e.kind) {
    case 'step':
    case 'slide':
      return hopFrames(e.from, e.path && e.path.length > 0 ? e.path : [e.to], m);
    case 'leap':
    case 'fly':
      return arcFrames(e.from, e.to, m);
    case 'chimney':
    case 'teleport':
    case 'swap':
    case 'respawn':
      return fadeFrames(e.from, e.to, m);
    case 'push':
    case 'pull':
      return slideFrames(e.from, e.to, m, e.bump !== undefined);
    case 'take':
    case 'deploy':
    case 'boss_step':
      return slideFrames(e.from, e.to, m, false);
  }
}

function lungeFrames(from: Pos, target: Pos, m: BoardMetrics): Keyframe[] {
  const a = tileXY(from, m);
  const b = tileXY(target, m);
  const reach = { x: a.x + (b.x - a.x) * 0.4, y: a.y + (b.y - a.y) * 0.4 };
  return [
    { transform: translate(a), offset: 0 },
    { transform: translate(reach, 0, 1.06, 0.95), offset: 0.55 },
    { transform: translate(a), offset: 1 },
  ];
}

function joltFrames(at: Pos, m: BoardMetrics): Keyframe[] {
  const a = tileXY(at, m);
  const d = Math.max(2, m.tile * 0.05);
  return [
    { transform: translate(a), offset: 0 },
    { transform: translate({ x: a.x - d, y: a.y }, 0, 1.04, 0.96), offset: 0.2 },
    { transform: translate({ x: a.x + d, y: a.y }), offset: 0.5 },
    { transform: translate(a), offset: 1 },
  ];
}

/** The tile a Snuff strike is aimed at (its first intent tile). */
function strikeTarget(e: Extract<GameEvent, { type: 'strike' }>): Pos | null {
  return e.target ?? e.tiles?.[0] ?? null;
}

function animateStep(step: PlaybackStep, nodes: Nodes, m: BoardMetrics, shownPos: (id: string) => Pos | null, reducedMotion: boolean): void {
  if (step.duration <= 0) return;
  const e = step.event;
  const options: KeyframeAnimationOptions = { duration: step.duration, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' };
  if (e.type === 'piece_moved') {
    const node = nodes.get(e.pieceId);
    if (canAnimate(node)) node.animate(moveFrames(e, m), options);
    return;
  }
  if (e.type === 'strike' && (e.kind === 'melee' || e.kind === 'snuff' || e.kind === 'boss')) {
    const node = nodes.get(e.attackerId);
    const target = strikeTarget(e);
    if (canAnimate(node) && target) node.animate(lungeFrames(e.from, target, m), options);
    return;
  }
  if (e.type === 'damage' && !e.blockedByWard && !reducedMotion) {
    const node = nodes.get(e.pieceId);
    const at = shownPos(e.pieceId);
    if (canAnimate(node) && at) node.animate(joltFrames(at, m), { duration: Math.max(140, step.duration), easing: 'ease-out' });
  }
}

function sortKey(piece: Piece): number {
  return -(piece.pos.y * 10) + (piece.kind === 'boss' ? 5 : 0);
}

function bossStyle(boss: Piece, m: BoardMetrics, rows: number): CSSProperties {
  const topLeft = tileXY({ x: boss.pos.x, y: boss.pos.y + boss.size - 1 }, m);
  const place = bossArtPlacement(m.tile);
  return { transform: `translate(${topLeft.x + place.offsetX}px, ${topLeft.y + place.offsetY}px)`, width: place.size, height: place.size, zIndex: (rows - boss.pos.y) * 10 + 5 };
}

/** The cursor is over the boss art but not its footprint (§16.8: the art turns see-through). */
function overBossArt(boss: Piece, hover: Pos | null): boolean {
  if (!hover) return false;
  const inFootprint = hover.x >= boss.pos.x && hover.x < boss.pos.x + boss.size && hover.y >= boss.pos.y && hover.y < boss.pos.y + boss.size;
  const inArt = hover.x >= boss.pos.x - 1 && hover.x <= boss.pos.x + boss.size && hover.y >= boss.pos.y && hover.y <= boss.pos.y + boss.size;
  return inArt && !inFootprint;
}

export function PiecesLayer({ snap, model, metrics }: LayerProps): ReactElement {
  const controller = useController();
  const presentation = usePresentation();
  const nodes = useRef<Nodes>(new Map());
  const metricsRef = useRef(metrics);
  const stateRef = useRef(snap.state);
  const reducedRef = useRef(presentation.reduced_motion);
  reducedRef.current = presentation.reduced_motion;
  const seen = useRef<Set<string> | null>(null);
  /** Pieces that arrived mid-game keep their rise animation class until it has played. */
  const entering = useRef(new Map<string, number>());
  metricsRef.current = metrics;
  stateRef.current = snap.state;

  useEffect(
    () =>
      controller.onCue((step) =>
        animateStep(
          step,
          nodes.current,
          metricsRef.current,
          (id) => stateRef.current.pieces[id]?.pos ?? null,
          reducedRef.current,
        ),
      ),
    [controller],
  );

  const { state, latest, uiSeat, selection } = snap;
  const ready = useMemo(() => new Set(!snap.animating && uiSeat !== null && latest.phase === 'players' ? readyPieces(latest, uiSeat).map((p) => p.id) : []), [snap.animating, uiSeat, latest]);
  const pieces = Object.values(state.pieces).sort((a, b) => sortKey(a) - sortKey(b));
  const now = performance.now();
  if (seen.current !== null) {
    for (const piece of pieces) if (!seen.current.has(piece.id) && !entering.current.has(piece.id)) entering.current.set(piece.id, now + ENTER_MS);
  }
  for (const [id, until] of entering.current) if (until < now) entering.current.delete(id);

  useEffect(() => {
    seen.current = new Set(Object.keys(state.pieces));
  }, [state.pieces]);

  const hover = selection.hover;
  const targetIds = new Set(model.targeting?.info.targets.flatMap((t) => (t.choice.kind === 'piece' ? [t.choice.pieceId] : [])) ?? []);
  const dimOthers = model.targeting !== null && model.targeting.info.steps > 0;

  return (
    <div className="ww-pieces" aria-label="Pieces">
      {pieces.map((piece) => {
        const rising = entering.current.has(piece.id);
        const ref = (node: HTMLDivElement | null): void => {
          if (node) nodes.current.set(piece.id, node);
          else nodes.current.delete(piece.id);
        };
        if (piece.kind === 'boss') {
          const bossState = state.boss;
          return (
            <div key={piece.id} ref={ref} className={`ww-boss-slot${overBossArt(piece, hover) ? ' ww-boss-slot--see-through' : ''}`} style={bossStyle(piece, metrics, state.board.h)} data-piece-id={piece.id}>
              <BossArt bossId={piece.defId} phase={bossState?.phase ?? 1} crowns={bossState?.crowns ?? 0} size={metrics.tile * 3} animated={!presentation.reduced_motion} seed={piece.id} />
            </div>
          );
        }
        const xy = tileXY(piece.pos, metrics);
        const look = hover ? { dx: hover.x - piece.pos.x, dy: piece.pos.y - hover.y } : null;
        const selected = selection.pieceId === piece.id;
        const dimmed = dimOthers && !targetIds.has(piece.id);
        const classes = ['ww-piece-slot', selected && 'ww-piece-slot--selected', rising && 'ww-piece-slot--enter', dimmed && 'ww-piece-slot--dim', piece.side === 'snuff' && 'ww-piece-slot--snuff'].filter(Boolean).join(' ');
        return (
          <div
            key={piece.id}
            ref={ref}
            className={classes}
            style={{ transform: `translate(${xy.x}px, ${xy.y}px)`, width: metrics.tile, height: metrics.tile, zIndex: (state.board.h - piece.pos.y) * 10 }}
            data-piece-id={piece.id}
            data-def={piece.defId}
          >
            <div className="ww-piece-slot__lift">
              <PieceArt {...pieceArtProps(state, piece, metrics.tile, ready.has(piece.id))} lookAt={look} animated={!presentation.reduced_motion} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
