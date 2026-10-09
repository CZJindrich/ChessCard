/**
 * Procedural Sconcewick skyline: gothic towers, spires and a cathedral, with lancet
 * windows. Pure and seeded so every render of a layer is identical.
 */
import { fmt } from '../util/path';
import { between, seededRandom, type Rand } from '../util/random';

export interface SkylineWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lit windows flicker; dark ones are just shapes. */
  lit: boolean;
}

export interface SkylineLayer {
  /** One path with every building as a sub-path. */
  d: string;
  windows: SkylineWindow[];
  /** Tallest point (useful for placing the candle window). */
  peaks: Array<{ x: number; y: number }>;
}

export interface SkylineOptions {
  width: number;
  baseline: number;
  minHeight: number;
  maxHeight: number;
  /** Average building width. */
  unit: number;
  seed: string;
  /** Probability that a window is lit. */
  litChance: number;
  /** Put a cathedral (twin towers + rose) centred at this x. */
  cathedralX?: number;
}

function tower(x: number, w: number, top: number, base: number, rand: Rand): { d: string; peak: { x: number; y: number } } {
  const spire = rand() < 0.65;
  const spireH = spire ? w * between(rand, 1.2, 2.4) : 0;
  const cx = x + w / 2;
  let d = `M${fmt(x)},${fmt(base)}V${fmt(top)}`;
  if (spire) {
    // ogee-ish spire with a small pinnacle
    d += `L${fmt(x + w * 0.1)},${fmt(top)}Q${fmt(cx - w * 0.08)},${fmt(top - spireH * 0.55)} ${fmt(cx)},${fmt(top - spireH)}`;
    d += `Q${fmt(cx + w * 0.08)},${fmt(top - spireH * 0.55)} ${fmt(x + w * 0.9)},${fmt(top)}`;
  } else {
    // crenellated top
    const n = Math.max(2, Math.round(w / 8));
    const step = w / (n * 2 - 1);
    for (let i = 0; i < n * 2 - 1; i++) {
      const up = i % 2 === 0;
      d += `V${fmt(up ? top - step * 0.8 : top)}H${fmt(x + step * (i + 1))}`;
    }
  }
  d += `L${fmt(x + w)},${fmt(top)}V${fmt(base)}Z`;
  return { d, peak: { x: cx, y: top - spireH } };
}

function cathedral(cx: number, base: number, h: number): { d: string; rose: { x: number; y: number; r: number } } {
  const w = h * 0.9;
  const x0 = cx - w / 2;
  const nave = base - h * 0.55;
  const towerW = w * 0.18;
  const towerTop = base - h;
  const d =
    // nave with a steep gable
    `M${fmt(x0)},${fmt(base)}V${fmt(nave)}L${fmt(cx)},${fmt(nave - h * 0.22)}L${fmt(x0 + w)},${fmt(nave)}V${fmt(base)}Z` +
    // twin towers with tall spires
    `M${fmt(x0 - towerW * 0.4)},${fmt(base)}V${fmt(towerTop)}L${fmt(x0 + towerW * 0.3)},${fmt(towerTop - h * 0.45)}L${fmt(x0 + towerW)},${fmt(towerTop)}V${fmt(base)}Z` +
    `M${fmt(x0 + w - towerW)},${fmt(base)}V${fmt(towerTop)}L${fmt(x0 + w - towerW * 0.3)},${fmt(towerTop - h * 0.45)}L${fmt(x0 + w + towerW * 0.4)},${fmt(towerTop)}V${fmt(base)}Z`;
  return { d, rose: { x: cx, y: nave + h * 0.05, r: w * 0.11 } };
}

export function generateSkyline(opts: SkylineOptions): SkylineLayer & { rose?: { x: number; y: number; r: number } } {
  const rand = seededRandom(opts.seed);
  const parts: string[] = [];
  const windows: SkylineWindow[] = [];
  const peaks: Array<{ x: number; y: number }> = [];
  let x = -opts.unit * 0.5;
  let rose: { x: number; y: number; r: number } | undefined;
  while (x < opts.width + opts.unit) {
    const w = opts.unit * between(rand, 0.55, 1.4);
    const h = between(rand, opts.minHeight, opts.maxHeight);
    if (opts.cathedralX !== undefined && Math.abs(x + w / 2 - opts.cathedralX) < opts.unit * 0.8 && !rose) {
      const c = cathedral(opts.cathedralX, opts.baseline, opts.maxHeight * 1.15);
      parts.push(c.d);
      rose = c.rose;
      x = opts.cathedralX + opts.maxHeight * 0.55;
      continue;
    }
    const top = opts.baseline - h;
    const t = tower(x, w, top, opts.baseline + 2, rand);
    parts.push(t.d);
    peaks.push(t.peak);
    // a column or two of lancet windows
    const cols = w > opts.unit ? 2 : 1;
    const rows = Math.max(1, Math.floor(h / (opts.unit * 0.55)));
    const ww = Math.max(2, w * 0.14);
    for (let c = 0; c < cols; c++) {
      const wx = x + (w * (c + 1)) / (cols + 1) - ww / 2;
      for (let r = 0; r < rows; r++) {
        if (rand() < 0.35) continue;
        const wy = top + opts.unit * 0.25 + r * opts.unit * 0.5;
        if (wy + ww * 2.2 > opts.baseline - 4) continue;
        windows.push({ x: wx, y: wy, w: ww, h: ww * 2.2, lit: rand() < opts.litChance });
      }
    }
    x += w + opts.unit * between(rand, -0.15, 0.25);
  }
  return { d: parts.join(''), windows, peaks, rose };
}

/** Lancet (pointed-arch) window path. */
export function lancetPath(x: number, y: number, w: number, h: number): string {
  return `M${fmt(x)},${fmt(y + h)}V${fmt(y + w * 0.6)}Q${fmt(x)},${fmt(y)} ${fmt(x + w / 2)},${fmt(y - w * 0.15)}Q${fmt(x + w)},${fmt(y)} ${fmt(x + w)},${fmt(y + w * 0.6)}V${fmt(y + h)}Z`;
}
