/** Geometry helpers that build SVG path strings. Pure functions, no DOM. */
import type { Rand } from './random';

export interface Pt {
  x: number;
  y: number;
}

/** Round to 2 decimals to keep path strings short and stable. */
export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

export function polygonPath(points: readonly Pt[]): string {
  if (points.length === 0) return '';
  return `M${points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join('L')}Z`;
}

/**
 * Closed Catmull-Rom spline through `points`, emitted as cubic Béziers.
 * `tension` 1 is the classic spline; smaller values hug the polygon.
 */
export function smoothClosedPath(points: readonly Pt[], tension = 1): string {
  const n = points.length;
  if (n < 3) return polygonPath(points);
  const k = tension / 6;
  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += `C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return `${d}Z`;
}

/** Open Catmull-Rom spline (end points are duplicated as phantom neighbours). */
export function smoothOpenPath(points: readonly Pt[], tension = 1): string {
  const n = points.length;
  if (n < 2) return '';
  const k = tension / 6;
  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += `C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return d;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, count: number, startAngle = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/** Signed area (positive = clockwise in SVG's y-down space). */
function signedArea(points: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Split each polygon edge into `parts` equal segments. */
export function subdivide(points: readonly Pt[], parts: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let s = 0; s < parts; s++) {
      const t = s / parts;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * Pre-baked smoke edge (§16.6): subdivide the outline and push every vertex along its
 * outward normal by smoothed seeded noise. `weights` (0..1 per output vertex, optional)
 * lets callers keep some regions (e.g. a face) calm.
 */
export function wobbleOutline(
  points: readonly Pt[],
  rand: Rand,
  amplitude: number,
  parts = 3,
  weight: (p: Pt) => number = () => 1,
): Pt[] {
  const dense = subdivide(points, parts);
  const n = dense.length;
  const orientation = signedArea(dense) >= 0 ? 1 : -1;
  const raw = dense.map(() => rand() * 2 - 1);
  // One smoothing pass so neighbouring vertices move together (soft billows, not spikes).
  const noise = raw.map((v, i) => (raw[(i - 1 + n) % n] + 2 * v + raw[(i + 1) % n]) / 4);
  return dense.map((p, i) => {
    const prev = dense[(i - 1 + n) % n];
    const next = dense[(i + 1) % n];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Outward normal for a clockwise (y-down) polygon is (ty, -tx).
    const nx = (ty / len) * orientation;
    const ny = (-tx / len) * orientation;
    const offset = noise[i] * amplitude * weight(p);
    return { x: p.x + nx * offset, y: p.y + ny * offset };
  });
}

/** Wobbled, smoothed closed path in one call. */
export function smokePath(points: readonly Pt[], rand: Rand, amplitude: number, parts = 3): string {
  return smoothClosedPath(wobbleOutline(points, rand, amplitude, parts), 0.9);
}

/**
 * Teardrop with its round bottom at (cx, baseY) and its tip `height` above.
 * Matches the flame motif (§16.4).
 */
export function teardropPath(cx: number, baseY: number, width: number, height: number): string {
  const w = width / 0.9;
  const h = height;
  const P = (x: number, y: number): string => `${fmt(cx + x * w)},${fmt(baseY + y * h)}`;
  return (
    `M${P(0, -1)}` +
    `C${P(0.15, -0.7)} ${P(0.45, -0.5)} ${P(0.45, -0.25)}` +
    `C${P(0.45, -0.08)} ${P(0.25, 0)} ${P(0, 0)}` +
    `C${P(-0.25, 0)} ${P(-0.45, -0.08)} ${P(-0.45, -0.25)}` +
    `C${P(-0.45, -0.5)} ${P(-0.15, -0.7)} ${P(0, -1)}Z`
  );
}

/** Ellipse whose rim has `bumps` soft scallops (wax-seal edge). */
export function scallopedEllipse(cx: number, cy: number, rx: number, ry: number, bumps: number, depth: number): string {
  const pts: Pt[] = [];
  const steps = bumps * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + depth * Math.cos(a * bumps);
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return smoothClosedPath(pts, 1);
}

/** Regular polygon (e.g. the Ward hexagon). `rotation` in radians. */
export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** Archimedean spiral as an open smooth path (Dazed, Plume, Chimney vortex). */
export function spiralPath(cx: number, cy: number, turns: number, maxR: number, samples = 48, phase = 0): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = phase + t * turns * Math.PI * 2;
    const r = t * maxR;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return smoothOpenPath(pts, 1);
}

/** Star with alternating outer/inner radii. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, spikes: number, rotation = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (spikes * 2)) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}
