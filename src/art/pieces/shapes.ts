/** Path builders for recurring piece silhouettes (64×64 tile space). */
import { fmt, smoothClosedPath, type Pt } from '../util/path';

/**
 * Candle body with a softly melted rim: straight-ish sides from `bottom` up to `top`,
 * rounded shoulders and a shallow dip in the middle of the rim.
 */
export function candleBody(cx: number, top: number, bottom: number, halfTop: number, halfBottom = halfTop, dip = 2.2): string {
  const shoulder = Math.min(3.2, halfTop * 0.45);
  return (
    `M${fmt(cx - halfBottom)},${fmt(bottom)}` +
    `L${fmt(cx - halfTop)},${fmt(top + shoulder)}` +
    `Q${fmt(cx - halfTop)},${fmt(top)} ${fmt(cx - halfTop + shoulder)},${fmt(top)}` +
    `Q${fmt(cx)},${fmt(top + dip)} ${fmt(cx + halfTop - shoulder)},${fmt(top)}` +
    `Q${fmt(cx + halfTop)},${fmt(top)} ${fmt(cx + halfTop)},${fmt(top + shoulder)}` +
    `L${fmt(cx + halfBottom)},${fmt(bottom)}Z`
  );
}

/** Ellipse as a path (so it can go through `WaxShape`). */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${fmt(cx - rx)},${fmt(cy)}` +
    `A${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(cx + rx)},${fmt(cy)}` +
    `A${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(cx - rx)},${fmt(cy)}Z`
  );
}

export function circlePath(cx: number, cy: number, r: number): string {
  return ellipsePath(cx, cy, r, r);
}

export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${fmt(x + rr)},${fmt(y)}H${fmt(x + w - rr)}Q${fmt(x + w)},${fmt(y)} ${fmt(x + w)},${fmt(y + rr)}` +
    `V${fmt(y + h - rr)}Q${fmt(x + w)},${fmt(y + h)} ${fmt(x + w - rr)},${fmt(y + h)}` +
    `H${fmt(x + rr)}Q${fmt(x)},${fmt(y + h)} ${fmt(x)},${fmt(y + h - rr)}` +
    `V${fmt(y + rr)}Q${fmt(x)},${fmt(y)} ${fmt(x + rr)},${fmt(y)}Z`
  );
}

/** Teardrop outline as a point list (for wobbling into smoke). Tip up at `tipY`, round bottom at `bottom`. */
export function teardropPoints(cx: number, tipY: number, bottom: number, halfW: number, tipLean = 0): Pt[] {
  const h = bottom - tipY;
  const pts: Pt[] = [];
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const t = i / steps; // 0 = tip, going clockwise
    const a = t * Math.PI * 2;
    // Parametric teardrop: x = sin(a) * sin(a/2)^m, y = -cos(a)
    const s = Math.sin(a / 2);
    const x = Math.sin(a) * s * s * 1.3;
    const y = (1 - Math.cos(a)) / 2; // 0 at tip, 1 at bottom
    pts.push({ x: cx + x * halfW + tipLean * (1 - y) * (1 - y), y: tipY + y * h });
  }
  return pts;
}

/** Smooth closed path through hand-placed points (alias with a sensible tension). */
export function blob(points: readonly Pt[], tension = 0.85): string {
  return smoothClosedPath(points, tension);
}

/** Shorthand for writing point lists: P(x, y). */
export function P(x: number, y: number): Pt {
  return { x, y };
}

/** Points list from a flat number array [x0, y0, x1, y1, ...]. */
export function pts(flat: readonly number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}
