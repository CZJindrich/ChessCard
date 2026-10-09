/**
 * Board geometry (GDD §5): coordinates, distance, reading order, directions, movement patterns,
 * melee reach, line tracing, artillery, push/pull paths and area shapes.
 *
 * Everything here works over the small `BoardQuery` interface, so it does not depend on
 * GameState. An adapter decides what blocks: e.g. whether a Smoldering Wick blocks line of
 * sight (`OccupantInfo.blocksLos`) or whether a Chimney can be used right now (`chimneyAt`).
 */
import type { AreaShape, Dir, DirSet, LeapOffsets, Pattern, Pos, Rect, Rotation } from './types';

// =============================================================================================
// Positions
// =============================================================================================

export function pos(x: number, y: number): Pos {
  return { x, y };
}

/** "x,y" — the key used for tile maps (DangerMap etc.). */
export function posKey(p: Pos): string {
  return `${p.x},${p.y}`;
}

export function parseKey(key: string): Pos {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addPos(p: Pos, d: Pos, times = 1): Pos {
  return { x: p.x + d.x * times, y: p.y + d.y * times };
}

export function subPos(a: Pos, b: Pos): Pos {
  return { x: a.x - b.x, y: a.y - b.y };
}

const FILES = 'abcdefghijkl';

/** Absolute square name, e.g. {x:2,y:2} -> "c3". */
export function sqName(p: Pos): string {
  return `${FILES[p.x] ?? '?'}${p.y + 1}`;
}

/** "c3" -> {x:2,y:2}; null if the text is not a square a1-l12. */
export function parseSq(name: string): Pos | null {
  const match = /^([a-l])(1[0-2]|[1-9])$/.exec(name.trim().toLowerCase());
  if (!match) return null;
  return { x: FILES.indexOf(match[1]), y: Number(match[2]) - 1 };
}

/** Like parseSq but throws: for squares that come from validated content. */
export function sq(name: string): Pos {
  const p = parseSq(name);
  if (!p) throw new Error(`not a square: ${name}`);
  return p;
}

export function inBounds(p: Pos, w: number, h: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
}

/** Chebyshev distance: max(|dx|, |dy|). */
export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The tiles covered by a size×size piece anchored at its lowest file and rank. */
export function footprint(anchor: Pos, size = 1): Pos[] {
  const tiles: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push({ x: anchor.x + dx, y: anchor.y + dy });
  return tiles;
}

export function inFootprint(p: Pos, anchor: Pos, size = 1): boolean {
  return p.x >= anchor.x && p.y >= anchor.y && p.x < anchor.x + size && p.y < anchor.y + size;
}

function gap(aLo: number, aSize: number, bLo: number, bSize: number): number {
  return Math.max(0, aLo - (bLo + bSize - 1), bLo - (aLo + aSize - 1));
}

/** Distance between two footprints: the minimum Chebyshev distance over their tiles. */
export function footprintDistance(a: Pos, sizeA: number, b: Pos, sizeB: number): number {
  return Math.max(gap(a.x, sizeA, b.x, sizeB), gap(a.y, sizeA, b.y, sizeB));
}

/** The footprint tile closest to `target` (ties resolve to the lowest file/rank). */
export function nearestFootprintTile(anchor: Pos, size: number, target: Pos): Pos {
  const clampAxis = (lo: number, v: number) => Math.min(Math.max(v, lo), lo + size - 1);
  return { x: clampAxis(anchor.x, target.x), y: clampAxis(anchor.y, target.y) };
}

/** One of the 8 neighbouring tiles (multi-tile aware). */
export function isAdjacent(a: Pos, b: Pos, sizeA = 1, sizeB = 1): boolean {
  return footprintDistance(a, sizeA, b, sizeB) === 1;
}

export function isOrthAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Reading order: rank descending, then file ascending (a8, b8, … h8, a7, …). */
export function compareReadingOrder(a: Pos, b: Pos): number {
  return b.y - a.y || a.x - b.x;
}

export function sortReadingOrder<T>(items: readonly T[], posOf: (item: T) => Pos): T[] {
  return items.slice().sort((a, b) => compareReadingOrder(posOf(a), posOf(b)));
}

export function sortPositions(tiles: readonly Pos[]): Pos[] {
  return sortReadingOrder(tiles, (p) => p);
}

export function uniquePositions(tiles: readonly Pos[]): Pos[] {
  const seen = new Set<string>();
  return tiles.filter((p) => {
    const key = posKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clipToBoard(tiles: readonly Pos[], w: number, h: number): Pos[] {
  return tiles.filter((p) => inBounds(p, w, h));
}

export function rectContains(r: Rect, p: Pos): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

export function rectTiles(r: Rect): Pos[] {
  const tiles: Pos[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles.push({ x, y });
  return tiles;
}

/** Every on-board tile within `r` of a footprint, in reading order. */
export function tilesWithin(anchor: Pos, size: number, r: number, w: number, h: number): Pos[] {
  const tiles: Pos[] = [];
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (footprintDistance(anchor, size, { x, y }, 1) <= r) tiles.push({ x, y });
  }
  return tiles;
}

/** Gloam ring index of a tile: 0 = the outermost ring. */
export function ringOf(p: Pos, w: number, h: number): number {
  return Math.min(p.x, p.y, w - 1 - p.x, h - 1 - p.y);
}

export function ringTiles(ring: number, w: number, h: number): Pos[] {
  const tiles: Pos[] = [];
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (ringOf({ x, y }, w, h) === ring) tiles.push({ x, y });
  return tiles;
}

/**
 * Quadrant of a tile with the board split at its middle file and rank:
 * 0 = bottom-left, 1 = bottom-right, 2 = top-right, 3 = top-left. This is seat order on
 * last_flame_ring (start tiles c3, j3, j10, c10), i.e. the GDD's "clockwise".
 */
export function quadrantOf(p: Pos, w: number, h: number): 0 | 1 | 2 | 3 {
  const right = p.x >= w / 2;
  const top = p.y >= h / 2;
  if (!top) return right ? 1 : 0;
  return right ? 2 : 3;
}

/** Rotate a tile 90° counter-clockwise about the centre of a square board (x,y) -> (n-1-y, x). */
export function rotate90(p: Pos, n: number): Pos {
  return { x: n - 1 - p.y, y: p.x };
}

// =============================================================================================
// Directions
// =============================================================================================

export const DIR_N: Dir = { x: 0, y: 1 };
export const DIR_E: Dir = { x: 1, y: 0 };
export const DIR_S: Dir = { x: 0, y: -1 };
export const DIR_W: Dir = { x: -1, y: 0 };

export const DIRS_ORTH: readonly Dir[] = [DIR_N, DIR_E, DIR_S, DIR_W];
export const DIRS_DIAG: readonly Dir[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
  { x: -1, y: 1 },
];
export const DIRS_ALL: readonly Dir[] = [...DIRS_ORTH, ...DIRS_DIAG];

export const KNIGHT_OFFSETS: readonly Pos[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: 2, y: -1 },
  { x: 1, y: -2 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
  { x: -2, y: 1 },
  { x: -1, y: 2 },
];

export function dirsFor(set: DirSet): readonly Dir[] {
  return set === 'orth' ? DIRS_ORTH : set === 'diag' ? DIRS_DIAG : DIRS_ALL;
}

export function leapOffsetsOf(offsets: LeapOffsets): readonly Pos[] {
  return offsets === 'knight' ? KNIGHT_OFFSETS : offsets.map(([x, y]) => ({ x, y }));
}

const ROTATION_DIRS: Readonly<Record<Rotation, Dir>> = { N: DIR_N, E: DIR_E, S: DIR_S, W: DIR_W };

export function rotationDir(rot: Rotation): Dir {
  return ROTATION_DIRS[rot];
}

export function dirRotation(d: Dir): Rotation | null {
  if (d.x === 0 && d.y === 1) return 'N';
  if (d.x === 1 && d.y === 0) return 'E';
  if (d.x === 0 && d.y === -1) return 'S';
  if (d.x === -1 && d.y === 0) return 'W';
  return null;
}

/** (sign Δfile, sign Δrank) from `from` to `to`. */
export function signDir(from: Pos, to: Pos): Dir {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

/** The direction of a straight orthogonal or diagonal line from `from` to `to`, else null. */
export function lineDir(from: Pos, to: Pos): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return signDir(from, to);
}

export function reverseDir(d: Dir): Dir {
  return { x: -d.x, y: -d.y };
}

export function isOrthDir(d: Dir): boolean {
  return Math.abs(d.x) + Math.abs(d.y) === 1;
}

export function isDiagDir(d: Dir): boolean {
  return Math.abs(d.x) === 1 && Math.abs(d.y) === 1;
}

export function inDirSet(d: Dir, set: DirSet): boolean {
  return set === 'all' ? isOrthDir(d) || isDiagDir(d) : set === 'orth' ? isOrthDir(d) : isDiagDir(d);
}

/**
 * Push direction (GDD §6.4): sign vector from the source to the target; a multi-tile source
 * measures from its nearest footprint tile. {0,0} if the target overlaps the source.
 */
export function pushDirection(source: Pos, sourceSize: number, target: Pos): Dir {
  return signDir(nearestFootprintTile(source, sourceSize, target), target);
}

/** Tiles an area anchor covers per axis (block2x2 spans 2; every other shape is anchored on one tile). */
export function areaAnchorSize(shape: AreaShape): number {
  return shape === 'block2x2' ? 2 : 1;
}

/**
 * Mirror an aim offset through the attacker (reversed artillery, GDD §6.8).
 * Offsets are from the attacker's anchor to the area's anchor.
 */
export function mirrorOffset(offset: Pos, attackerSize = 1, areaSize = 1): Pos {
  return { x: attackerSize - areaSize - offset.x, y: attackerSize - areaSize - offset.y };
}

// =============================================================================================
// Board query
// =============================================================================================

export interface TerrainInfo {
  enterable: boolean;
  /** Rubble: a non-flying slide that enters it stops there. */
  endsSlide: boolean;
  /** Pillars. */
  blocksLos: boolean;
}

export interface OccupantInfo {
  id: string;
  /** Pieces block line of sight (Candles, structures, boss footprints); adapters decide for Smoldering Wicks. */
  blocksLos: boolean;
}

export interface BoardQuery {
  readonly w: number;
  readonly h: number;
  /** Terrain at an on-board tile; null off the board. */
  tileAt(p: Pos): TerrainInfo | null;
  /** The piece covering the tile (any tile of a multi-tile footprint), or null. */
  pieceAt(p: Pos): OccupantInfo | null;
  plumeAt(p: Pos): boolean;
  /**
   * Chimney at the tile, for voluntary Wickfolk moves: null = not a (working) Chimney;
   * `{ exit: null }` = a Chimney that cannot be used now (pair occupied); `{ exit }` = arrive there.
   */
  chimneyAt(p: Pos): { exit: Pos | null } | null;
}

export const TERRAIN_OPEN: TerrainInfo = { enterable: true, endsSlide: false, blocksLos: false };
export const TERRAIN_PILLAR: TerrainInfo = { enterable: false, endsSlide: false, blocksLos: true };
export const TERRAIN_RUBBLE: TerrainInfo = { enterable: true, endsSlide: true, blocksLos: false };

export interface BoardQuerySpec {
  w: number;
  h: number;
  /** Terrain per on-board tile (default open flagstone). */
  terrain?: (p: Pos) => TerrainInfo;
  pieces?: ReadonlyArray<{ id: string; pos: Pos; size?: number; blocksLos?: boolean }>;
  plumes?: readonly Pos[];
  /** Chimney pairs; a pair works only while its other end is empty. */
  chimneys?: ReadonlyArray<readonly [Pos, Pos]>;
}

/** A BoardQuery over plain data (tests, previews, adapters). */
export function createBoardQuery(spec: BoardQuerySpec): BoardQuery {
  const { w, h } = spec;
  const occupants = new Map<string, OccupantInfo>();
  for (const piece of spec.pieces ?? []) {
    for (const tile of footprint(piece.pos, piece.size ?? 1)) {
      occupants.set(posKey(tile), { id: piece.id, blocksLos: piece.blocksLos ?? true });
    }
  }
  const plumes = new Set((spec.plumes ?? []).map(posKey));
  const pairs = new Map<string, Pos>();
  for (const [a, b] of spec.chimneys ?? []) {
    pairs.set(posKey(a), b);
    pairs.set(posKey(b), a);
  }
  const query: BoardQuery = {
    w,
    h,
    tileAt: (p) => (inBounds(p, w, h) ? (spec.terrain?.(p) ?? TERRAIN_OPEN) : null),
    pieceAt: (p) => occupants.get(posKey(p)) ?? null,
    plumeAt: (p) => plumes.has(posKey(p)),
    chimneyAt: (p) => {
      const other = pairs.get(posKey(p));
      if (!other) return null;
      return { exit: query.pieceAt(other) ? null : other };
    },
  };
  return query;
}

/** Board query that hides some pieces (the mover itself, or pieces assumed gone). */
export function withoutPieces(q: BoardQuery, ids: readonly string[]): BoardQuery {
  if (ids.length === 0) return q;
  const hidden = new Set(ids);
  return {
    w: q.w,
    h: q.h,
    tileAt: (p) => q.tileAt(p),
    pieceAt: (p) => {
      const occupant = q.pieceAt(p);
      return occupant && hidden.has(occupant.id) ? null : occupant;
    },
    plumeAt: (p) => q.plumeAt(p),
    chimneyAt: (p) => q.chimneyAt(p),
  };
}

/** Empty (no piece) and enterable. Plumes do not block standing. */
export function isOpenTile(q: BoardQuery, p: Pos): boolean {
  const terrain = q.tileAt(p);
  return terrain !== null && terrain.enterable && q.pieceAt(p) === null;
}

/** Every footprint tile on the board, enterable and empty. */
export function canOccupy(q: BoardQuery, anchor: Pos, size = 1): boolean {
  return footprint(anchor, size).every((t) => isOpenTile(q, t));
}

// =============================================================================================
// Movement patterns
// =============================================================================================

export interface MoveOptions {
  /** Footprint edge length of the mover (bosses: 2). Chimneys are never used by multi-tile movers. */
  size?: number;
  /** Pieces treated as absent (the mover is always ignored). */
  ignoreIds?: readonly string[];
  /** Added to step/slide ranges (Restless Soot +1, Long Shadows -1), minimum 1. Leaps are unchanged. */
  rangeDelta?: number;
  /** Overrides the pattern's flying flag (Moth-Velvet Cloak). */
  flying?: boolean;
  /** Voluntary Wickfolk moves enter Chimneys (GDD §5.4). Default false. */
  useChimneys?: boolean;
}

export interface MoveDest {
  /** Final anchor (the paired Chimney when one was entered). */
  to: Pos;
  /** Tiles walked, excluding the start, ending on the entered tile (before any Chimney jump). */
  path: Pos[];
  /** The Chimney entered, or null. */
  chimney: Pos | null;
}

/** Effective step/slide range: null = to the edge. */
export function effectiveRange(pattern: Pattern, rangeDelta = 0): number | null {
  if (pattern.type === 'leap' || pattern.type === 'immobile') return null;
  if (pattern.range === null) return null;
  return Math.max(1, pattern.range + rangeDelta);
}

function moverId(q: BoardQuery, from: Pos): string | null {
  return q.pieceAt(from)?.id ?? null;
}

function queryForMover(q: BoardQuery, from: Pos, ignoreIds: readonly string[] = []): BoardQuery {
  const self = moverId(q, from);
  return withoutPieces(q, self ? [...ignoreIds, self] : ignoreIds);
}

function arrive(q: BoardQuery, tile: Pos, path: Pos[], useChimneys: boolean): MoveDest | null {
  const chimney = useChimneys ? q.chimneyAt(tile) : null;
  if (!chimney) return { to: tile, path, chimney: null };
  return chimney.exit ? { to: chimney.exit, path, chimney: tile } : null;
}

/** A non-flying slide stops when a newly entered footprint tile ends slides (Rubble). */
function slideStops(q: BoardQuery, prev: Pos, anchor: Pos, size: number): boolean {
  return footprint(anchor, size).some((t) => !inFootprint(t, prev, size) && q.tileAt(t)?.endsSlide === true);
}

/**
 * Legal destinations of a movement pattern (GDD §5.2):
 * - steps/slides need every tile of the path empty and enterable; a non-flying slide stops IN Rubble;
 * - flying slides pass over pieces and obstacles and land on an empty, enterable tile;
 * - leaps ignore the tiles in between;
 * - `range: null` slides to the board edge.
 * Entering a Chimney (with `useChimneys`) ends the move on its pair, if that is empty; a
 * non-flying path cannot continue through a Chimney.
 */
export function patternMoves(qIn: BoardQuery, from: Pos, pattern: Pattern, opts: MoveOptions = {}): MoveDest[] {
  const size = opts.size ?? 1;
  const q = queryForMover(qIn, from, opts.ignoreIds);
  const useChimneys = (opts.useChimneys ?? false) && size === 1;
  const flying = opts.flying ?? pattern.flying;
  const out: MoveDest[] = [];
  if (pattern.type === 'immobile') return out;
  if (pattern.type === 'leap') {
    for (const offset of leapOffsetsOf(pattern.offsets ?? 'knight')) {
      const to = addPos(from, offset);
      if (!canOccupy(q, to, size)) continue;
      const dest = arrive(q, to, [to], useChimneys);
      if (dest) out.push(dest);
    }
    return out;
  }
  const range = effectiveRange(pattern, opts.rangeDelta) ?? Math.max(q.w, q.h);
  for (const d of dirsFor(pattern.dirs)) {
    const path: Pos[] = [];
    for (let t = 1; t <= range; t++) {
      const anchor = addPos(from, d, t);
      if (!footprint(anchor, size).every((tile) => inBounds(tile, q.w, q.h))) break;
      path.push(anchor);
      const open = canOccupy(q, anchor, size);
      if (!open) {
        if (flying) continue;
        break;
      }
      const isChimney = useChimneys && q.chimneyAt(anchor) !== null;
      const dest = arrive(q, anchor, path.slice(), useChimneys);
      if (dest) out.push(dest);
      if (isChimney && !flying) break;
      if (!flying && slideStops(q, addPos(from, d, t - 1), anchor, size)) break;
    }
  }
  return out;
}

export interface ReachHit {
  pieceId: string;
  /** The first tile of that piece the pattern reaches. */
  pos: Pos;
}

/**
 * Melee "as move" reach (GDD §6.2): pieces standing where the pattern could land if that tile
 * were empty. Slides need a clear path up to the target; flying slides reach past blockers.
 * Multi-tile targets appear once (at the first footprint tile reached).
 */
export function meleeReach(qIn: BoardQuery, from: Pos, pattern: Pattern, opts: MoveOptions = {}): ReachHit[] {
  const size = opts.size ?? 1;
  const q = queryForMover(qIn, from, opts.ignoreIds);
  const flying = opts.flying ?? pattern.flying;
  const hits: ReachHit[] = [];
  const seen = new Set<string>();
  const add = (tile: Pos) => {
    const occupant = q.pieceAt(tile);
    if (!occupant || seen.has(occupant.id)) return;
    seen.add(occupant.id);
    hits.push({ pieceId: occupant.id, pos: tile });
  };
  if (pattern.type === 'immobile') return hits;
  if (pattern.type === 'leap') {
    for (const offset of leapOffsetsOf(pattern.offsets ?? 'knight')) {
      const tile = addPos(from, offset);
      if (inBounds(tile, q.w, q.h)) add(tile);
    }
    return hits;
  }
  const range = effectiveRange(pattern, opts.rangeDelta) ?? Math.max(q.w, q.h);
  for (const d of dirsFor(pattern.dirs)) {
    for (let t = 1; t <= range; t++) {
      const anchor = addPos(from, d, t);
      const tiles = footprint(anchor, size);
      if (!tiles.every((tile) => inBounds(tile, q.w, q.h))) break;
      const occupied = tiles.filter((tile) => q.pieceAt(tile) !== null);
      const terrainOk = tiles.every((tile) => q.tileAt(tile)?.enterable === true);
      if (occupied.length > 0) {
        occupied.forEach(add);
        if (!flying) break;
        continue;
      }
      if (!terrainOk) {
        if (flying) continue;
        break;
      }
      if (!flying && slideStops(q, addPos(from, d, t - 1), anchor, size)) break;
    }
  }
  return hits;
}

/** Empty tiles holding a Plume that the pattern could land on (strike-to-pop targets, no Chimney jumps). */
export function reachablePlumes(q: BoardQuery, from: Pos, pattern: Pattern, opts: MoveOptions = {}): Pos[] {
  return patternMoves(q, from, pattern, { ...opts, useChimneys: false })
    .map((m) => m.to)
    .filter((p) => q.plumeAt(p));
}

// =============================================================================================
// Line of sight, ranged lines, artillery
// =============================================================================================

export interface LineTrace {
  /** Tiles the line covers, in order (stops before a Pillar). */
  tiles: Pos[];
  /** Pieces hit: the first blocker for firstHit, every piece for pierce (multi-tile once). */
  hits: ReachHit[];
  /** Plume tiles on the line before the first blocker (a firstHit shooter may pick one instead). */
  plumes: Pos[];
  /** Where the line was stopped (Pillar tile, or the blocking piece's tile), or null. */
  blockedAt: Pos | null;
}

/**
 * Trace a straight line from `origin` (exclusive) in `dir` for up to `range` tiles (null = edge).
 * firstHit: stops at the first LOS blocker and hits it if it is a piece; Plumes do not stop it.
 * pierce: hits every piece up to the range; only Pillars stop it.
 */
export function traceLine(
  qIn: BoardQuery,
  origin: Pos,
  dir: Dir,
  range: number | null,
  mode: 'firstHit' | 'pierce',
  opts: { ignoreIds?: readonly string[] } = {},
): LineTrace {
  const q = withoutPieces(qIn, opts.ignoreIds ?? []);
  const limit = range ?? Math.max(q.w, q.h);
  const trace: LineTrace = { tiles: [], hits: [], plumes: [], blockedAt: null };
  const seen = new Set<string>();
  for (let t = 1; t <= limit; t++) {
    const tile = addPos(origin, dir, t);
    const terrain = q.tileAt(tile);
    if (!terrain) break;
    if (terrain.blocksLos) {
      trace.blockedAt = tile;
      break;
    }
    trace.tiles.push(tile);
    const occupant = q.pieceAt(tile);
    if (occupant && mode === 'pierce') {
      if (!seen.has(occupant.id)) trace.hits.push({ pieceId: occupant.id, pos: tile });
      seen.add(occupant.id);
    } else if (occupant && occupant.blocksLos) {
      trace.hits.push({ pieceId: occupant.id, pos: tile });
      trace.blockedAt = tile;
      break;
    }
    if (q.plumeAt(tile) && !occupant) trace.plumes.push(tile);
  }
  return trace;
}

/** One trace per direction of a ranged attack (orth / diag / all lines). */
export function rangedLines(
  q: BoardQuery,
  origin: Pos,
  dirs: DirSet,
  range: number | null,
  mode: 'firstHit' | 'pierce',
  opts: { ignoreIds?: readonly string[] } = {},
): Array<{ dir: Dir; trace: LineTrace }> {
  const self = q.pieceAt(origin)?.id;
  const ignoreIds = self ? [...(opts.ignoreIds ?? []), self] : opts.ignoreIds;
  return dirsFor(dirs).map((dir) => ({ dir, trace: traceLine(q, origin, dir, range, mode, { ignoreIds }) }));
}

/**
 * Clear straight line between two tiles (cards "in a straight line", targets with `los`):
 * orthogonal or diagonal, and no Pillar or LOS-blocking piece strictly between them.
 */
export function hasClearLine(q: BoardQuery, from: Pos, to: Pos): boolean {
  const dir = lineDir(from, to);
  if (!dir) return false;
  for (let tile = addPos(from, dir); !samePos(tile, to); tile = addPos(tile, dir)) {
    const terrain = q.tileAt(tile);
    if (!terrain || terrain.blocksLos || q.pieceAt(tile)?.blocksLos) return false;
  }
  return true;
}

/** Artillery aim tiles: on-board tiles whose distance from the shooter's footprint is in [min, max]. Ignores LOS. */
export function artilleryTiles(q: BoardQuery, from: Pos, size: number, minRange: number, maxRange: number): Pos[] {
  return tilesWithin(from, size, maxRange, q.w, q.h).filter((t) => footprintDistance(from, size, t, 1) >= minRange);
}

// =============================================================================================
// Push and pull
// =============================================================================================

export interface DisplacementPath {
  /** Tiles moved through, ending on the final tile (empty if it could not move). */
  path: Pos[];
  end: Pos;
  /** The first blocked tile and the piece there (null = edge or obstacle), when the move was cut short. */
  bump: { at: Pos; pieceId: string | null } | null;
}

/**
 * Push (GDD §6.4): move tile by tile in `dir`; at the first blocked tile (piece, Pillar, edge)
 * stop and report the bump. Plumes and Gloam never block.
 */
export function pushPath(qIn: BoardQuery, start: Pos, dir: Dir, distance: number): DisplacementPath {
  const q = queryForMover(qIn, start);
  const path: Pos[] = [];
  let cur = start;
  for (let t = 0; t < distance; t++) {
    const next = addPos(cur, dir);
    if (!isOpenTile(q, next)) return { path, end: cur, bump: { at: next, pieceId: q.pieceAt(next)?.id ?? null } };
    path.push(next);
    cur = next;
  }
  return { path, end: cur, bump: null };
}

/**
 * Pull (GDD §6.4): a push toward the source (fixed sign direction toward its nearest footprint
 * tile) that stops as soon as the pulled piece is adjacent to the source.
 */
export function pullPath(qIn: BoardQuery, start: Pos, source: Pos, sourceSize: number, distance: number): DisplacementPath {
  const q = queryForMover(qIn, start);
  const dir = signDir(start, nearestFootprintTile(source, sourceSize, start));
  const path: Pos[] = [];
  let cur = start;
  for (let t = 0; t < distance && footprintDistance(source, sourceSize, cur, 1) > 1; t++) {
    const next = addPos(cur, dir);
    if (!isOpenTile(q, next)) return { path, end: cur, bump: { at: next, pieceId: q.pieceAt(next)?.id ?? null } };
    path.push(next);
    cur = next;
  }
  return { path, end: cur, bump: null };
}

// =============================================================================================
// Area shapes (GDD A.1)
// =============================================================================================

export interface AreaOptions {
  /** Direction for line / beam2 / side2 (beam2 and side2 need an orthogonal one). */
  dir?: Dir;
  /** Length for line and beam2. */
  range?: number;
  /** Footprint size for beam2 / side2 / ring12 (default 2). */
  size?: number;
}

function sideTiles(anchor: Pos, size: number, dir: Dir, depth: number): Pos[] {
  const tiles: Pos[] = [];
  for (let k = 1; k <= depth; k++) {
    for (let i = 0; i < size; i++) {
      if (dir.y === 1) tiles.push({ x: anchor.x + i, y: anchor.y + size - 1 + k });
      else if (dir.y === -1) tiles.push({ x: anchor.x + i, y: anchor.y - k });
      else if (dir.x === 1) tiles.push({ x: anchor.x + size - 1 + k, y: anchor.y + i });
      else tiles.push({ x: anchor.x - k, y: anchor.y + i });
    }
  }
  return tiles;
}

function ringAround(anchor: Pos, size: number): Pos[] {
  const tiles: Pos[] = [];
  for (let y = anchor.y - 1; y <= anchor.y + size; y++) {
    for (let x = anchor.x - 1; x <= anchor.x + size; x++) if (!inFootprint({ x, y }, anchor, size)) tiles.push({ x, y });
  }
  return tiles;
}

function requireOrth(shape: AreaShape, dir: Dir | undefined): Dir {
  if (!dir || !isOrthDir(dir)) throw new Error(`${shape} needs an orthogonal direction`);
  return dir;
}

/**
 * Tiles of an area shape (unclipped: parts off the board fizzle, use clipToBoard).
 * - single: the anchor. line: a ray from the anchor (exclusive) in `dir` for `range` tiles.
 * - beam2: a `size`-wide ray of `range` tiles from one side of the footprint at `anchor`.
 * - side2: the `size` ring tiles along one side of the footprint.
 * - ring8: the 8 tiles around a 1×1. ring12: the 12 tiles around a 2×2 (corners included).
 * - square3: 3×3 centred on the anchor. plus5: the anchor and its 4 orthogonal neighbours.
 * - block2x2: a 2×2 block whose anchor is its lowest file and rank.
 */
export function areaTiles(shape: AreaShape, anchor: Pos, opts: AreaOptions = {}): Pos[] {
  const size = opts.size ?? 2;
  switch (shape) {
    case 'single':
      return [anchor];
    case 'line': {
      if (!opts.dir) throw new Error('line needs a direction');
      const dir = opts.dir;
      return Array.from({ length: opts.range ?? 1 }, (_, i) => addPos(anchor, dir, i + 1));
    }
    case 'beam2':
      return sideTiles(anchor, size, requireOrth(shape, opts.dir), opts.range ?? 1);
    case 'side2':
      return sideTiles(anchor, size, requireOrth(shape, opts.dir), 1);
    case 'ring8':
      return ringAround(anchor, 1);
    case 'ring12':
      return ringAround(anchor, size);
    case 'square3':
      return footprint({ x: anchor.x - 1, y: anchor.y - 1 }, 3);
    case 'plus5':
      return [anchor, ...DIRS_ORTH.map((d) => addPos(anchor, d))];
    case 'block2x2':
      return footprint(anchor, 2);
  }
}

/**
 * A `size`-wide beam of `length` tiles from one side of a footprint (boss `beam2`, and `side2`
 * with length 1). Each lane runs straight out from the side and stops before a tile that blocks
 * line of sight (a Pillar) or the board edge; pieces never stop it (pierce).
 */
export function beamTiles(q: BoardQuery, anchor: Pos, size: number, dir: Dir, length: number): Pos[] {
  const tiles: Pos[] = [];
  for (const head of sideTiles(anchor, size, requireOrth('beam2', dir), 1)) {
    for (let k = 0; k < length; k++) {
      const tile = addPos(head, dir, k);
      const terrain = q.tileAt(tile);
      if (!terrain || terrain.blocksLos) break;
      tiles.push(tile);
    }
  }
  return tiles;
}

/** areaTiles with a rotation (N/E/S/W) instead of a direction vector. */
export function rotatedArea(shape: AreaShape, anchor: Pos, rot: Rotation, opts: Omit<AreaOptions, 'dir'> = {}): Pos[] {
  return areaTiles(shape, anchor, { ...opts, dir: rotationDir(rot) });
}
