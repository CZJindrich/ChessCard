/**
 * The darkness layer (GDD §16.5, §15.5 render order): one canvas over the floor only, under the
 * hazard glyphs and the pieces, cut with soft flickering light holes. It renders at a low
 * resolution (the darkness is soft, the browser scales it up), lights glide after moving pieces,
 * and with reduced motion the flicker freezes and lights snap.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { context2d, runFrames } from './canvas';
import { DARKNESS_RGB, flicker, type LightSource } from './darkness';

/** Canvas pixels per tile. */
const RES = 24;
/** Redraw at most every this many ms (the flicker needs no 60 fps). */
const FRAME_MS = 40;
/** Time constant of a light gliding after its piece (ms). */
const GLIDE_MS = 90;

export interface DarknessCanvasProps {
  cols: number;
  rows: number;
  /** Tile size, CSS px. */
  tile: number;
  lights: readonly LightSource[];
  alpha: number;
  animated: boolean;
  className?: string;
}

interface Glide {
  x: number;
  y: number;
}

function warmth(light: LightSource): string {
  return light.id.startsWith('tile:') ? '63,162,140' : '255,176,72';
}

function draw(ctx: CanvasRenderingContext2D, props: DarknessCanvasProps, glides: Map<string, Glide>, now: number): void {
  const w = props.cols * RES;
  const h = props.rows * RES;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgba(${DARKNESS_RGB.join(',')},${props.alpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  const holes = props.lights.map((light) => {
    const at = glides.get(light.id) ?? light;
    const scale = props.animated ? flicker(now, light.phase) : 1;
    return { light, x: at.x * RES, y: (props.rows - at.y) * RES, r: light.radius * RES * scale };
  });
  ctx.globalCompositeOperation = 'destination-out';
  for (const { x, y, r } of holes) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.88)');
    g.addColorStop(0.78, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A faint warm (or verdigris, for Shrines) tint where the light falls.
  ctx.globalCompositeOperation = 'source-over';
  for (const { light, x, y, r } of holes) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
    g.addColorStop(0, `rgba(${warmth(light)},0.10)`);
    g.addColorStop(1, `rgba(${warmth(light)},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Move each light toward its piece; returns true while any is still gliding. */
function glide(glides: Map<string, Glide>, lights: readonly LightSource[], dt: number, animated: boolean): boolean {
  const k = animated ? 1 - Math.exp(-dt / GLIDE_MS) : 1;
  const live = new Set<string>();
  let moving = false;
  for (const light of lights) {
    live.add(light.id);
    const at = glides.get(light.id);
    if (!at) {
      glides.set(light.id, { x: light.x, y: light.y });
      continue;
    }
    at.x += (light.x - at.x) * k;
    at.y += (light.y - at.y) * k;
    if (Math.abs(light.x - at.x) + Math.abs(light.y - at.y) > 0.01) moving = true;
    else {
      at.x = light.x;
      at.y = light.y;
    }
  }
  for (const id of [...glides.keys()]) if (!live.has(id)) glides.delete(id);
  return moving;
}

export function DarknessCanvas(props: DarknessCanvasProps): ReactElement {
  const { cols, rows, tile, animated, className } = props;
  const ref = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const glides = useRef(new Map<string, Glide>());
  propsRef.current = props;

  // Animated: one frame loop for the layer's life, reading the latest props.
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas ? context2d(canvas) : null;
    if (!ctx || !animated) return undefined;
    return runFrames((now, dt) => {
      const current = propsRef.current;
      glide(glides.current, current.lights, dt, true);
      draw(ctx, current, glides.current, now);
      return true;
    }, FRAME_MS);
  }, [animated]);

  // Reduced motion: a still picture, redrawn when the board changes.
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas ? context2d(canvas) : null;
    if (!ctx || animated) return;
    glide(glides.current, props.lights, 0, false);
    draw(ctx, props, glides.current, 0);
  });

  return <canvas ref={ref} className={className} width={cols * RES} height={rows * RES} style={{ width: cols * tile, height: rows * tile }} aria-hidden="true" />;
}
