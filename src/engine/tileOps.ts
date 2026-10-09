/**
 * Tile-changing effects (GDD A.2 `create_tile`, `move_tile`): Hot Wax from Waxen Rain and the
 * Drip Hulk, Rubble from Crumbling Nave, and the Chimney pairs that Shifting Chimneys moves.
 * Random tiles come from the `spawn` stream.
 */
import { chebyshev } from './geometry';
import { addLog } from './log';
import { streamPick } from './rng';
import { allTiles, emit, heroPieces, pieceAt, plumeAt, setTileType, tileAt } from './state';
import type { Ctx } from './state';
import type { Pos, TileId, TileWhere } from './types';

/** A tile matches a `where` filter (default base: flagstone). Gloam tiles never match `notGloam`. */
export function whereMatches(ctx: Ctx, p: Pos, where: TileWhere): boolean {
  const tile = tileAt(ctx.s, p);
  if (!tile) return false;
  if (!(where.base ?? ['flagstone']).includes(tile.type)) return false;
  if (where.empty && (pieceAt(ctx.s, p) || plumeAt(ctx.s, p))) return false;
  if (where.notGloam && (tile.gloam || tile.gloamWarning)) return false;
  const minHero = where.minHeroDistance ?? 0;
  if (minHero > 0 && heroPieces(ctx.s).some((h) => chebyshev(h.pos, p) < minHero)) return false;
  return true;
}

/** Change one tile's type (Chimneys keep their pair index when one is given). */
export function changeTile(ctx: Ctx, p: Pos, to: TileId, chimneyPair: number | null = null): void {
  const tile = tileAt(ctx.s, p);
  if (!tile || (tile.type === to && tile.chimneyPair === chimneyPair)) return;
  const from = tile.type;
  setTileType(ctx.s, p, to);
  if (to === 'chimney') tile.chimneyPair = chimneyPair;
  emit(ctx, { type: 'tile_changed', pos: { ...p }, from, to });
}

/** `count` distinct random tiles matching `where` (every match when `count` is undefined). */
export function tilesWhere(ctx: Ctx, where: TileWhere, count: number | undefined): Pos[] {
  const candidates = allTiles(ctx.s).filter((p) => whereMatches(ctx, p, where));
  if (count === undefined) return candidates;
  const picked: Pos[] = [];
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const pick = streamPick(ctx.s, 'spawn', candidates);
    picked.push(pick);
    candidates.splice(candidates.indexOf(pick), 1);
  }
  return picked;
}

/** Turn tiles into `type`. Pillars only crumble into Rubble; `onlyEmpty` skips occupied tiles. */
export function createTiles(ctx: Ctx, tiles: readonly Pos[], type: TileId, onlyEmpty: boolean): void {
  for (const p of tiles) {
    if (onlyEmpty && pieceAt(ctx.s, p)) continue;
    if (tileAt(ctx.s, p)?.type === 'pillar' && type !== 'rubble') continue;
    changeTile(ctx, p, type);
  }
}

function chimneyPairs(ctx: Ctx): Map<number, Pos[]> {
  const pairs = new Map<number, Pos[]>();
  for (const p of allTiles(ctx.s)) {
    const tile = tileAt(ctx.s, p);
    if (tile?.type !== 'chimney' || tile.chimneyPair === null) continue;
    pairs.set(tile.chimneyPair, [...(pairs.get(tile.chimneyPair) ?? []), p]);
  }
  return pairs;
}

/**
 * `move_tile` (Shifting Chimneys): each Chimney pair moves to 2 new tiles matching `where`
 * (never in the Gloam); a pair without 2 legal tiles stays. Other tile types move one by one.
 */
export function moveTiles(ctx: Ctx, type: TileId, where: TileWhere): void {
  const legal: TileWhere = { ...where, notGloam: true };
  if (type === 'chimney') {
    const pairs = [...chimneyPairs(ctx).entries()].sort((a, b) => a[0] - b[0]);
    let moved = 0;
    for (const [pair, tiles] of pairs) {
      const dest = tilesWhere(ctx, legal, 2);
      if (dest.length < 2) continue;
      for (const old of tiles) changeTile(ctx, old, 'flagstone');
      for (const p of dest) changeTile(ctx, p, 'chimney', pair);
      moved += 1;
    }
    if (moved > 0) addLog(ctx, 'The Chimneys shift.');
    return;
  }
  for (const old of allTiles(ctx.s).filter((p) => tileAt(ctx.s, p)?.type === type)) {
    const [dest] = tilesWhere(ctx, legal, 1);
    if (!dest) return;
    changeTile(ctx, old, 'flagstone');
    changeTile(ctx, dest, type);
  }
}
