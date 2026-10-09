/** Small canvas helpers shared by the FX layers. */

/**
 * A 2D context, or null where canvas drawing is unavailable. jsdom implements the element but
 * not drawing (it logs an error per call), so the FX layers simply stay blank there.
 */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return null;
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

/** Device pixel ratio, capped so huge screens don't pay for 4× canvases. */
export function pixelRatio(cap = 2): number {
  return typeof window === 'undefined' ? 1 : Math.min(cap, Math.max(1, window.devicePixelRatio || 1));
}

export type FrameCallback = (now: number, dt: number) => boolean;

/**
 * Run `frame` on every animation frame until it returns false or the returned stop function is
 * called. `minInterval` throttles the callback (ms) for effects that need no 60 fps.
 */
export function runFrames(frame: FrameCallback, minInterval = 0): () => void {
  let handle = 0;
  let last = -1;
  let stopped = false;
  const tick = (now: number): void => {
    if (stopped) return;
    if (last < 0) last = now;
    const dt = now - last;
    if (dt >= minInterval) {
      last = now;
      if (!frame(now, Math.min(dt, 100))) {
        stopped = true;
        return;
      }
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}
