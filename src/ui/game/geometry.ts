/**
 * Board geometry for the game screen: tile size from the space available, tile origins in
 * px (rank 1 at the bottom), pointer → tile, and the 64-unit board space the art uses.
 */
import { FRAME, TILE } from '../../art';
import type { Pos } from '../../engine/types';

/** Tiles never render smaller than this (GDD §14.4 / §15.4). */
export const MIN_TILE = 36;
export const MAX_TILE = 96;

export interface BoardMetrics {
  cols: number;
  rows: number;
  /** Tile size in px. */
  tile: number;
  /** The carved frame around the tiles, in px. */
  frame: number;
  /** Whole board (frame included) in px. */
  width: number;
  height: number;
}

/** The largest tile size that fits the board (with its frame) inside `avail`. */
export function fitBoard(cols: number, rows: number, availW: number, availH: number): BoardMetrics {
  const frameTiles = (FRAME * 2) / TILE;
  const raw = Math.min(availW / (cols + frameTiles), availH / (rows + frameTiles));
  const tile = Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor(raw)));
  const frame = (FRAME * tile) / TILE;
  return { cols, rows, tile, frame, width: cols * tile + frame * 2, height: rows * tile + frame * 2 };
}

/** Top-left of a tile inside the tile area (px). */
export function tileXY(pos: Pos, m: BoardMetrics): { x: number; y: number } {
  return { x: pos.x * m.tile, y: (m.rows - 1 - pos.y) * m.tile };
}

/** The tile under a point given relative to the tile area's top-left, or null off-board. */
export function tileAtPoint(px: number, py: number, m: BoardMetrics): Pos | null {
  const col = Math.floor(px / m.tile);
  const row = Math.floor(py / m.tile);
  if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return null;
  return { x: col, y: m.rows - 1 - row };
}

/** Board-space (64 units per tile) origin of a tile, for SVG layers. */
export function tileUnits(pos: Pos, rows: number): { x: number; y: number } {
  return { x: pos.x * TILE, y: (rows - 1 - pos.y) * TILE };
}

export function tileCentreUnits(pos: Pos, rows: number): { x: number; y: number } {
  const o = tileUnits(pos, rows);
  return { x: o.x + TILE / 2, y: o.y + TILE / 2 };
}

export { TILE };
