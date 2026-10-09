/**
 * Board zoom and pan (GDD §15.4 "on small screens it zooms and pans", §15.7 + / −, pinch).
 * The board scales about its centre; `x`/`y` pan it. Pure maths over sizes in CSS px.
 */

export interface BoardZoom {
  scale: number;
  x: number;
  y: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 1.25;
export const NO_ZOOM: BoardZoom = Object.freeze({ scale: 1, x: 0, y: 0 });

/** Keep the pan inside the zoomed board's overhang, so its edges never come inside the frame. */
export function clampZoom(z: BoardZoom, width: number, height: number): BoardZoom {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.scale));
  if (scale <= ZOOM_MIN + 1e-3) return NO_ZOOM;
  const maxX = (width * (scale - 1)) / 2;
  const maxY = (height * (scale - 1)) / 2;
  return { scale, x: Math.min(maxX, Math.max(-maxX, z.x)), y: Math.min(maxY, Math.max(-maxY, z.y)) };
}

/**
 * Zoom to `scale` keeping the point `focus` (px from the unzoomed board's centre) where it is on
 * screen.
 */
export function zoomAround(z: BoardZoom, scale: number, focus: { x: number; y: number }, width: number, height: number): BoardZoom {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
  const k = next / z.scale;
  return clampZoom({ scale: next, x: focus.x - k * (focus.x - z.x), y: focus.y - k * (focus.y - z.y) }, width, height);
}

export function panBy(z: BoardZoom, dx: number, dy: number, width: number, height: number): BoardZoom {
  return clampZoom({ ...z, x: z.x + dx, y: z.y + dy }, width, height);
}

export function sameZoom(a: BoardZoom, b: BoardZoom): boolean {
  return Math.abs(a.scale - b.scale) < 1e-4 && Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1;
}
