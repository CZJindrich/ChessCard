import { describe, expect, it } from 'vitest';
import { darken, hexToRgb, lighten, mix, rgbToHex } from '../../../src/art/util/color';
import { ellipsePoints, fmt, scallopedEllipse, smoothClosedPath, teardropPath, wobbleOutline, type Pt } from '../../../src/art/util/path';
import { hashString, mulberry32, seededRandom } from '../../../src/art/util/random';
import { pointInPolygon, scatterSites, voronoiCells } from '../../../src/art/util/voronoi';

function area(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

describe('colour helpers', () => {
  it('parses short and long hex, and falls back to grey for junk', () => {
    expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#E09A2D')).toEqual({ r: 224, g: 154, b: 45 });
    expect(hexToRgb('not a colour')).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('mixes, darkens and lightens', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(darken('#FFFFFF', 0.3)).toBe('#B3B3B3');
    expect(lighten('#000000', 1)).toBe('#FFFFFF');
    expect(rgbToHex({ r: 300, g: -4, b: 15.6 })).toBe('#FF0010');
  });
});

describe('seeded randomness', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = seededRandom('p12');
    const b = seededRandom('p12');
    const c = seededRandom('p13');
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    expect(hashString('abc')).toBe(hashString('abc'));
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('path builders', () => {
  it('formats numbers compactly and without negative zero', () => {
    expect(fmt(1.23456)).toBe('1.23');
    expect(fmt(-0.001)).toBe('0');
  });

  it('pre-bakes the same smoke edge for the same seed (§16.6)', () => {
    const base = ellipsePoints(32, 32, 12, 16, 10);
    const one = smoothClosedPath(wobbleOutline(base, seededRandom('sootling:p4'), 1.5, 3));
    const two = smoothClosedPath(wobbleOutline(base, seededRandom('sootling:p4'), 1.5, 3));
    const other = smoothClosedPath(wobbleOutline(base, seededRandom('sootling:p5'), 1.5, 3));
    expect(one).toBe(two);
    expect(one).not.toBe(other);
    expect(wobbleOutline(base, seededRandom('x'), 1, 3)).toHaveLength(30);
  });

  it('keeps wobble within the amplitude', () => {
    const base = ellipsePoints(0, 0, 20, 20, 24);
    const out = wobbleOutline(base, seededRandom('amp'), 2, 1);
    out.forEach((p, i) => expect(Math.hypot(p.x - base[i].x, p.y - base[i].y)).toBeLessThanOrEqual(2.0001));
  });

  it('builds closed teardrop and scalloped paths', () => {
    expect(teardropPath(10, 20, 6, 12)).toMatch(/^M10,8C.*Z$/);
    expect(scallopedEllipse(32, 52, 21, 6, 11, 0.03)).toMatch(/Z$/);
  });
});

describe('voronoi', () => {
  it('partitions a polygon into one cell per site', () => {
    const bounds: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ];
    const sites = scatterSites(bounds, 15, seededRandom('glass'), 8);
    expect(sites.length).toBeGreaterThan(8);
    sites.forEach((s) => expect(pointInPolygon(s, bounds)).toBe(true));
    const cells = voronoiCells(bounds, sites);
    expect(cells).toHaveLength(sites.length);
    const total = cells.reduce((sum, c) => sum + area(c), 0);
    expect(total).toBeCloseTo(6000, 0);
  });
});
