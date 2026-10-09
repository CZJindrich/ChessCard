/**
 * Boss movement (GDD §10.1, §12.4). A step or slide shifts the whole footprint by one vector:
 * every newly entered tile must be on the board, enterable, empty and not a Pillar (a flying
 * slide passes over anything and only needs an empty landing). Bosses never trample, never use
 * Chimneys, crush the Plumes they move onto and put out the Lit Shrines they stand on.
 *
 * Choice: among staying and every one-move destination, the boss takes the anchor that lets the
 * most of its intents hit their targets; ties go to the cheapest path toward the focus target
 * (the nearest standing hero; Last Flame ties to the highest Glory, then reading order), priced
 * with the Snuff AI tile costs (a boss not immune to Hot Wax walks around it), then the nearer
 * anchor, staying put, and reading order.
 */
import { plannedHits, planBossIntents } from './bossIntents';
import { afterMoveEnd, takesHotWax } from './combat';
import { canOccupy, compareReadingOrder, footprint, footprintDistance, inFootprint, patternMoves, posKey, samePos, sqName } from './geometry';
import type { BoardQuery, MoveDest, MoveOptions } from './geometry';
import { addLog, pieceName } from './log';
import { putOutShrine, snuffRangeDelta } from './snuff';
import { boardQuery, emit, heroPieces, isOver, pieceList, tileAt } from './state';
import type { Ctx } from './state';
import type { GameState, Pattern, Piece, Pos } from './types';

interface DestScore {
  dest: MoveDest;
  hits: number;
  /** AI path cost from here to an anchor next to the focus target, this move included (Infinity: unreachable). */
  path: number;
  /** Footprint distance to the focus target. */
  reach: number;
  stays: boolean;
}

/** Standing still costs half a step unless the boss is already next to its focus: it keeps walking its path. */
const STAY_PENALTY = 0.5;

function ascending(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDest(a: DestScore, b: DestScore): number {
  return (
    b.hits - a.hits ||
    ascending(a.path, b.path) ||
    ascending(a.reach, b.reach) ||
    Number(b.stays) - Number(a.stays) ||
    compareReadingOrder(a.dest.to, b.dest.to)
  );
}

/** The focus target (§10.1): the nearest standing hero, else the nearest Wickfolk piece or Candle. */
export function focusTarget(s: GameState, boss: Piece): Piece | null {
  const standing = heroPieces(s).filter((h) => !h.smoldering && !(h.owner !== null && s.players[h.owner]?.eliminated));
  const pool = standing.length > 0 ? standing : pieceList(s).filter((p) => p.side === 'wick' && !p.smoldering);
  const glory = (p: Piece) => (s.config.mode === 'last_flame' && p.owner !== null ? (s.players[p.owner]?.glory ?? 0) : 0);
  const distance = (p: Piece) => footprintDistance(boss.pos, boss.size, p.pos, p.size);
  return pool.slice().sort((a, b) => distance(a) - distance(b) || glory(b) - glory(a) || compareReadingOrder(a.pos, b.pos))[0] ?? null;
}

/**
 * Path cost from every anchor to the nearest anchor next to the focus target: a reverse
 * Dijkstra over boss moves (they are symmetric), each move costing the anchor it enters.
 */
function distanceField(q: BoardQuery, pattern: Pattern, opts: MoveOptions, size: number, focus: Piece, cost: (anchor: Pos) => number): Map<string, number> {
  const field = new Map<string, number>();
  const open = new Map<string, Pos>();
  for (let y = 0; y + size <= q.h; y++) {
    for (let x = 0; x + size <= q.w; x++) {
      const anchor = { x, y };
      if (!canOccupy(q, anchor, size) || footprintDistance(anchor, size, focus.pos, focus.size) > 1) continue;
      field.set(posKey(anchor), 0);
      open.set(posKey(anchor), anchor);
    }
  }
  const done = new Set<string>();
  while (open.size > 0) {
    let key = '';
    for (const k of open.keys()) if (key === '' || (field.get(k) ?? Infinity) < (field.get(key) ?? Infinity)) key = k;
    const at = open.get(key) as Pos;
    open.delete(key);
    done.add(key);
    const through = (field.get(key) ?? 0) + cost(at);
    for (const move of patternMoves(q, at, pattern, opts)) {
      const next = posKey(move.to);
      if (done.has(next) || through >= (field.get(next) ?? Infinity)) continue;
      field.set(next, through);
      open.set(next, move.to);
    }
  }
  return field;
}

/** Snuff AI cost of standing on an anchor: the dearest tile of the footprint (§5.4). */
function anchorCost(ctx: Ctx, boss: Piece, anchor: Pos): number {
  return Math.max(
    ...footprint(anchor, boss.size).map((t) => {
      const tile = tileAt(ctx.s, t);
      const def = tile ? ctx.reg.tiles.byId[tile.type] : undefined;
      if (tile?.type === 'hot_wax' && !takesHotWax(ctx.reg, boss)) return def?.aiCostImmune ?? 1;
      return def?.aiCost ?? 1;
    }),
  );
}

/** Bosses moving onto a Plume destroy it (§9.4). */
function crushPlumes(ctx: Ctx, boss: Piece): void {
  const crushed = ctx.s.plumes.filter((m) => inFootprint(m.pos, boss.pos, boss.size));
  if (crushed.length === 0) return;
  ctx.s.plumes = ctx.s.plumes.filter((m) => !crushed.includes(m));
  for (const plume of crushed) {
    emit(ctx, { type: 'plume_popped', plumeId: plume.id, pos: plume.pos, seat: null });
    addLog(ctx, `${pieceName(ctx.reg, boss)} crushes the Plume at ${sqName(plume.pos)}.`);
  }
}

function stepBoss(ctx: Ctx, boss: Piece, dest: MoveDest, pattern: Pattern): void {
  const from = { ...boss.pos };
  boss.pos = { ...dest.to };
  emit(ctx, { type: 'piece_moved', pieceId: boss.id, from, to: { ...boss.pos }, kind: pattern.flying ? 'fly' : 'boss_step', path: dest.path });
  addLog(ctx, `${pieceName(ctx.reg, boss)} moves ${sqName(from)} → ${sqName(boss.pos)}.`);
  crushPlumes(ctx, boss);
  for (const t of footprint(boss.pos, boss.size)) putOutShrine(ctx, t);
  afterMoveEnd(ctx, boss, null);
}

/** The boss's move for this Snuff Move (none when staying is best). */
export function moveBoss(ctx: Ctx, boss: Piece, pattern: Pattern, intentIds: readonly string[]): void {
  const { s, reg } = ctx;
  if (pattern.type === 'immobile' || isOver(s)) return;
  const q = boardQuery(s, { ignoreIds: [boss.id] });
  const opts: MoveOptions = { size: boss.size, rangeDelta: snuffRangeDelta(s), useChimneys: false };
  const stay: MoveDest = { to: { ...boss.pos }, path: [], chimney: null };
  const focus = focusTarget(s, boss);
  const cost = (anchor: Pos) => anchorCost(ctx, boss, anchor);
  const field = focus ? distanceField(q, pattern, opts, boss.size, focus, cost) : new Map<string, number>();
  const scored = [stay, ...patternMoves(q, boss.pos, pattern, opts)].map((dest): DestScore => {
    const stays = samePos(dest.to, boss.pos);
    const remaining = field.get(posKey(dest.to)) ?? Infinity;
    return {
      dest,
      hits: plannedHits(planBossIntents(s, reg, boss, dest.to, intentIds)),
      path: stays ? remaining + (remaining > 0 ? STAY_PENALTY : 0) : remaining + cost(dest.to),
      reach: focus ? footprintDistance(dest.to, boss.size, focus.pos, focus.size) : 0,
      stays,
    };
  });
  const best = scored.sort(compareDest)[0];
  if (best && !best.stays) stepBoss(ctx, boss, best.dest, pattern);
}
