/**
 * `ui_scale` keeps board tiles at 36 px or more (GDD §14.4). Every UI length is in rem, so the
 * space left for the board shrinks linearly as the root font grows: from one measurement of the
 * board's stage at the current scale, the largest scale that still fits 36 px tiles follows.
 */
import { FRAME, TILE } from '../../art';
import { MIN_TILE } from './geometry';

export interface ScaleProbe {
  /** Viewport, CSS px. */
  viewportW: number;
  viewportH: number;
  /** The board stage's size at the current scale, CSS px. */
  stageW: number;
  stageH: number;
  /** Root font size now (px) and the scale it was set with. */
  rem: number;
  scale: number;
  cols: number;
  rows: number;
}

/** The lowest cap: below it the board zooms and pans instead (§15.4). */
export const MIN_UI_SCALE = 0.9;

/** The largest UI scale whose board tiles stay at least MIN_TILE px, rounded down to 1%. */
export function maxUiScale(p: ScaleProbe): number {
  if (p.rem <= 0 || p.scale <= 0) return Number.POSITIVE_INFINITY;
  const base = p.rem / p.scale;
  const frameTiles = (FRAME * 2) / TILE;
  // The rest of the layout, in rem: what the viewport keeps besides the stage.
  const remW = Math.max(0, (p.viewportW - p.stageW) / p.rem);
  const remH = Math.max(0, (p.viewportH - p.stageH) / p.rem);
  const limit = (viewport: number, cells: number, remUsed: number): number =>
    remUsed <= 0 ? Number.POSITIVE_INFINITY : (viewport - MIN_TILE * (cells + frameTiles)) / (remUsed * base);
  const raw = Math.min(limit(p.viewportW, p.cols, remW), limit(p.viewportH, p.rows, remH));
  return Math.max(MIN_UI_SCALE, Math.floor(raw * 100) / 100);
}
