/**
 * Bounded Voronoi cells by half-plane clipping (O(n²) — fine for the ~30 cells a
 * stained-glass wing needs). Used for Nocturna's wings and stained-glass sigil windows.
 */
import type { Pt } from './path';
import type { Rand } from './random';

/** Keep the part of `poly` that is closer to `site` than to `other`. */
export function clipToSite(poly: readonly Pt[], site: Pt, other: Pt): Pt[] {
  const mx = (site.x + other.x) / 2;
  const my = (site.y + other.y) / 2;
  const dx = other.x - site.x;
  const dy = other.y - site.y;
  const side = (p: Pt): number => (p.x - mx) * dx + (p.y - my) * dy; // <= 0 means site side
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function voronoiCells(bounds: readonly Pt[], sites: readonly Pt[]): Pt[][] {
  return sites.map((site, i) => {
    let cell: Pt[] = bounds.slice();
    for (let j = 0; j < sites.length && cell.length > 0; j++) {
      if (j !== i) cell = clipToSite(cell, site, sites[j]);
    }
    return cell;
  });
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Rejection-sample `count` sites inside `poly`, at least `minGap` apart where possible. */
export function scatterSites(poly: readonly Pt[], count: number, rand: Rand, minGap: number): Pt[] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sites: Pt[] = [];
  for (let attempt = 0; attempt < count * 60 && sites.length < count; attempt++) {
    const p = { x: minX + rand() * (maxX - minX), y: minY + rand() * (maxY - minY) };
    if (!pointInPolygon(p, poly)) continue;
    if (sites.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= minGap)) sites.push(p);
  }
  return sites;
}

export function polygonCentroid(poly: readonly Pt[]): Pt {
  const n = poly.length || 1;
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / n,
    y: poly.reduce((s, p) => s + p.y, 0) / n,
  };
}
