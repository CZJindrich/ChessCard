/**
 * Sites and maps (GDD §13.3): generated Vigil sites (cathedral_of_tallow, soot_market,
 * belfry_steps, the_waxworks) on 8×8 and 10×10, and the fixed maps first_vigil, hollow_nave and
 * last_flame_ring. Generation uses the `map` stream; a layout must pass `checkSiteLayout`, with up
 * to `siteGeneration.maxAttempts` tries before falling back to a fixed layout.
 */
import { chebyshev, DIRS_ALL, addPos, inBounds, posKey, rectContains, sq } from './geometry';
import { streamPick } from './rng';
import type { StreamHolder } from './rng';
import type {
  BoardSizeKey,
  BoardZones,
  ContentRegistry,
  MapLayout,
  Pos,
  Rect,
  ScriptedPlume,
  SiteDef,
  SiteZones,
  Tile,
  TileId,
} from './types';

export interface SiteLayout {
  siteId: string;
  size: BoardSizeKey;
  w: number;
  h: number;
  /** Row-major: index = y * w + x. */
  tiles: Tile[];
  candles: Pos[];
  smokestacks: Pos[];
  /** Default start tiles in seat order. */
  heroStarts: Pos[];
  zones: BoardZones;
  bossAnchor: Pos | null;
  scriptedPlumes: ScriptedPlume[];
  /** Generation failed every attempt and fell back to a fixed layout. */
  fallback: boolean;
}

/** The generated Vigil sites, in GDD order. */
export const GENERATED_SITES = ['cathedral_of_tallow', 'soot_market', 'belfry_steps', 'the_waxworks'] as const;
/** Sites drawn for Vigil Nights 2+ before every one has been used (§13.3.1). */
export const LATER_NIGHT_SITES = ['soot_market', 'belfry_steps', 'the_waxworks'] as const;

const EDGE: Record<BoardSizeKey, number> = { '8x8': 8, '10x10': 10, '12x12': 12 };

// =============================================================================================
// Tiles and zones
// =============================================================================================

function flagstone(): Tile {
  return { type: 'flagstone', chimneyPair: null, shrineLit: false, gloam: false, gloamWarning: false };
}

function blankTiles(w: number, h: number): Tile[] {
  return Array.from({ length: w * h }, flagstone);
}

function tileIndex(w: number, p: Pos): number {
  return p.y * w + p.x;
}

function bandRect(band: { from: number; to: number }, w: number): Rect {
  return { x: 0, y: band.from - 1, w, h: band.to - band.from + 1 };
}

export function zonesFromBands(zones: SiteZones, w: number): BoardZones {
  return {
    deploy: [bandRect(zones.deploy, w)],
    snuff: [bandRect(zones.snuff, w)],
    plume: [bandRect(zones.plume, w)],
    candleSlots: [bandRect(zones.candles, w)],
  };
}

/** Last Flame: no deploy band; Plumes may go anywhere legal (quadrants pick within it). */
function ringZones(w: number, h: number): BoardZones {
  return { deploy: [], snuff: [], plume: [{ x: 0, y: 0, w, h }], candleSlots: [] };
}

function vigilSize(size: BoardSizeKey): '8x8' | '10x10' {
  return size === '10x10' ? '10x10' : '8x8';
}

// =============================================================================================
// Generation
// =============================================================================================

class Builder {
  readonly tiles: Tile[];
  readonly candles: Pos[] = [];
  readonly smokestacks: Pos[] = [];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = blankTiles(w, h);
  }

  type(p: Pos): TileId {
    return this.tiles[tileIndex(this.w, p)].type;
  }

  set(p: Pos, type: TileId, chimneyPair: number | null = null): void {
    const tile = this.tiles[tileIndex(this.w, p)];
    tile.type = type;
    tile.chimneyPair = chimneyPair;
  }

  reserved(p: Pos): boolean {
    return [...this.candles, ...this.smokestacks].some((c) => c.x === p.x && c.y === p.y);
  }

  /** Free flagstone tiles in ranks [yFrom, yTo] (0-based, inclusive) passing `extra`. */
  free(yFrom: number, yTo: number, extra: (p: Pos) => boolean = () => true): Pos[] {
    const out: Pos[] = [];
    for (let y = Math.max(0, yFrom); y <= Math.min(this.h - 1, yTo); y++) {
      for (let x = 0; x < this.w; x++) {
        const p = { x, y };
        if (this.type(p) === 'flagstone' && !this.reserved(p) && extra(p)) out.push(p);
      }
    }
    return out;
  }

  near(p: Pos, type: TileId, distance: number): boolean {
    for (let y = p.y - distance; y <= p.y + distance; y++) {
      for (let x = p.x - distance; x <= p.x + distance; x++) {
        if ((x !== p.x || y !== p.y) && inBounds({ x, y }, this.w, this.h) && this.type({ x, y }) === type) return true;
      }
    }
    return false;
  }
}

class GenerationFailed extends Error {}

function pickOrFail(holder: StreamHolder, options: readonly Pos[]): Pos {
  if (options.length === 0) throw new GenerationFailed();
  return streamPick(holder, 'map', options);
}

/** Feature ranks: never in the deploy zone (ranks 1-2) nor on the top rank. */
function featureBand(b: Builder): [number, number] {
  return [2, b.h - 2];
}

function placePillars(holder: StreamHolder, b: Builder, layout: SiteDef['pillarLayout'], count: number): void {
  const [lo, hi] = featureBand(b);
  if (layout === 'mirrored') {
    for (let i = 0; i < Math.floor(count / 2); i++) {
      const options = b.free(lo, hi, (p) => p.x >= 1 && p.x < b.w / 2 && b.type({ x: b.w - 1 - p.x, y: p.y }) === 'flagstone' && !b.near(p, 'pillar', 1));
      const p = pickOrFail(holder, options);
      b.set(p, 'pillar');
      b.set({ x: b.w - 1 - p.x, y: p.y }, 'pillar');
    }
    return;
  }
  if (layout === 'staggered_lanes') {
    const rows = Math.ceil(count / 2);
    const gap = Math.floor(b.w / 2);
    const evenStart = streamPick(holder, 'map', Array.from({ length: gap }, (_, i) => i));
    const oddStart = (evenStart + Math.floor(gap / 2)) % gap;
    const firstRow = streamPick(holder, 'map', [2, 3].filter((y) => y + 2 * (rows - 1) <= b.h - 1));
    let placed = 0;
    for (let k = 0; k < rows; k++) {
      const start = k % 2 === 0 ? evenStart : oddStart;
      for (const x of [start, start + gap]) {
        if (placed >= count || x >= b.w) continue;
        b.set({ x, y: firstRow + 2 * k }, 'pillar');
        placed += 1;
      }
    }
    return;
  }
  for (let i = 0; i < count; i++) {
    const spaced = b.free(lo, hi, (p) => !b.near(p, 'pillar', 1));
    b.set(pickOrFail(holder, spaced.length > 0 ? spaced : b.free(lo, hi)), 'pillar');
  }
}

/** Three Candles in the Candle slots, one per third of the board, at least `candleMinSpacing` apart. */
function placeCandles(holder: StreamHolder, b: Builder, reg: ContentRegistry, band: { from: number; to: number }): void {
  const thirds = [0, Math.floor(b.w / 3), Math.floor((2 * b.w) / 3), b.w];
  for (let i = 0; i < reg.rules.candlesPerNight; i++) {
    const third = i % 3;
    const options = b.free(band.from - 1, band.to - 1, (p) => {
      return p.x >= thirds[third] && p.x < thirds[third + 1] && b.candles.every((c) => chebyshev(c, p) >= reg.rules.candleMinSpacing);
    });
    b.candles.push(pickOrFail(holder, options));
  }
}

function placeScattered(holder: StreamHolder, b: Builder, type: TileId, count: number, yFrom: number, yTo: number): void {
  for (let i = 0; i < count; i++) {
    const spaced = b.free(yFrom, yTo, (p) => !b.near(p, type, 1));
    b.set(pickOrFail(holder, spaced.length > 0 ? spaced : b.free(yFrom, yTo)), type);
  }
}

/** Chimney pairs: one end in the lower half, the other in the upper half, at least 3 apart. */
function placeChimneys(holder: StreamHolder, b: Builder, pairs: number): void {
  const mid = Math.floor(b.h / 2);
  for (let pair = 0; pair < pairs; pair++) {
    const a = pickOrFail(holder, b.free(2, mid - 1, (p) => !b.near(p, 'chimney', 1)));
    b.set(a, 'chimney', pair);
    const c = pickOrFail(holder, b.free(mid, b.h - 2, (p) => chebyshev(p, a) >= 3 && !b.near(p, 'chimney', 1)));
    b.set(c, 'chimney', pair);
  }
}

function placeSmokestacks(holder: StreamHolder, b: Builder, count: number, starts: readonly Pos[], minDistance: number): void {
  for (let i = 0; i < count; i++) {
    const options = b.free(b.h - 3, b.h - 1, (p) => starts.every((s) => chebyshev(s, p) > minDistance) && !b.near(p, 'pillar', 1));
    b.smokestacks.push(pickOrFail(holder, options));
  }
}

function generateOnce(holder: StreamHolder, reg: ContentRegistry, def: SiteDef, size: '8x8' | '10x10', starts: Pos[]): SiteLayout {
  const w = EDGE[size];
  const counts = def.counts[size];
  const zones = reg.rules.vigilZones[size];
  const b = new Builder(w, w);
  const [lo, hi] = featureBand(b);
  placePillars(holder, b, def.pillarLayout, counts.pillars);
  placeCandles(holder, b, reg, zones.candles);
  placeScattered(holder, b, 'votive_shrine', counts.shrines, lo, hi);
  placeChimneys(holder, b, counts.chimneyPairs);
  placeScattered(holder, b, 'hot_wax', counts.hotWax, lo, b.h - 1);
  placeScattered(holder, b, 'rubble', counts.rubble, lo, b.h - 1);
  placeSmokestacks(holder, b, counts.smokestacks, starts, reg.rules.siteGeneration.enemyMinHeroDistance);
  return {
    siteId: def.id,
    size,
    w,
    h: w,
    tiles: b.tiles,
    candles: b.candles,
    smokestacks: b.smokestacks,
    heroStarts: starts,
    zones: zonesFromBands(zones, w),
    bossAnchor: null,
    scriptedPlumes: [],
    fallback: false,
  };
}

/** Fixed fallback: the first_vigil layout on 8×8 (without its scripted content), hollow_nave's on 10×10. */
function fallbackLayout(reg: ContentRegistry, siteId: string, size: '8x8' | '10x10'): SiteLayout {
  const layout = size === '8x8' ? buildFixedMap(reg, 'first_vigil', '8x8', 4) : buildFixedMap(reg, 'hollow_nave', '10x10', 4);
  return { ...layout, siteId, bossAnchor: null, scriptedPlumes: [], fallback: true };
}

/** Generate a valid Vigil site (§13.3.4), retrying up to `maxAttempts` times. */
export function generateVigilSite(holder: StreamHolder, reg: ContentRegistry, siteId: string, size: BoardSizeKey): SiteLayout {
  const def = reg.sites.byId[siteId];
  if (!def) throw new Error(`unknown site "${siteId}"`);
  const vsize = vigilSize(size);
  const starts = reg.rules.vigilHeroStarts[vsize].map(sq);
  for (let attempt = 0; attempt < reg.rules.siteGeneration.maxAttempts; attempt++) {
    try {
      const layout = generateOnce(holder, reg, def, vsize, starts);
      if (checkSiteLayout(layout, reg).length === 0) return layout;
    } catch (e) {
      if (!(e instanceof GenerationFailed)) throw e;
    }
  }
  return fallbackLayout(reg, siteId, vsize);
}

// =============================================================================================
// Validation (§13.3.4)
// =============================================================================================

function isEnterable(layout: SiteLayout, p: Pos): boolean {
  return inBounds(p, layout.w, layout.h) && layout.tiles[tileIndex(layout.w, p)].type !== 'pillar';
}

function blockedByStructure(layout: SiteLayout, p: Pos): boolean {
  return [...layout.candles, ...layout.smokestacks].some((c) => c.x === p.x && c.y === p.y);
}

function inZone(rects: readonly Rect[], p: Pos): boolean {
  return rects.some((r) => rectContains(r, p));
}

function allPositions(layout: SiteLayout): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) out.push({ x, y });
  return out;
}

/** King-step flood fill over tiles passing `open`. */
function flood(seeds: readonly Pos[], open: (p: Pos) => boolean): Set<string> {
  const seen = new Set(seeds.map(posKey));
  const queue = seeds.slice();
  while (queue.length > 0) {
    const cur = queue.shift() as Pos;
    for (const d of DIRS_ALL) {
      const next = addPos(cur, d);
      const key = posKey(next);
      if (seen.has(key) || !open(next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

/** Problems with a layout; an empty list means valid. */
export function checkSiteLayout(layout: SiteLayout, reg: ContentRegistry): string[] {
  const problems: string[] = [];
  const open = (p: Pos) => isEnterable(layout, p) && !blockedByStructure(layout, p);

  if (layout.candles.length !== reg.rules.candlesPerNight) problems.push('wrong number of Candles');
  layout.candles.forEach((c, i) => {
    if (layout.candles.some((o, j) => j !== i && chebyshev(o, c) < reg.rules.candleMinSpacing)) problems.push(`Candle ${i} too close`);
  });

  const snuffSeeds = allPositions(layout).filter((p) => inZone(layout.zones.snuff, p) && open(p));
  const reached = flood(snuffSeeds, open);
  layout.candles.forEach((c, i) => {
    if (!DIRS_ALL.some((d) => reached.has(posKey(addPos(c, d))))) problems.push(`Candle ${i} unreachable by a Sootling`);
  });

  const deploy = allPositions(layout).filter((p) => inZone(layout.zones.deploy, p) && open(p));
  if (deploy.length > 0) {
    const component = flood([deploy[0]], (p) => inZone(layout.zones.deploy, p) && open(p));
    if (deploy.some((p) => !component.has(posKey(p)))) problems.push('deploy zone not connected');
  }
  for (const start of layout.heroStarts) if (!open(start) || layout.tiles[tileIndex(layout.w, start)].type !== 'flagstone') problems.push('hero start blocked');

  const pairs = new Map<number, number>();
  for (const t of layout.tiles) if (t.type === 'chimney') pairs.set(t.chimneyPair ?? -1, (pairs.get(t.chimneyPair ?? -1) ?? 0) + 1);
  for (const [pair, n] of pairs) if (pair < 0 || n !== 2) problems.push(`chimney pair ${pair} has ${n} ends`);

  const plumeTiles = allPositions(layout).filter(
    (p) =>
      inZone(layout.zones.plume, p) &&
      reg.rules.plumeLegalTiles.includes(layout.tiles[tileIndex(layout.w, p)].type) &&
      !blockedByStructure(layout, p) &&
      layout.heroStarts.every((h) => chebyshev(h, p) >= reg.rules.plumeMinHeroDistance),
  );
  if (plumeTiles.length < reg.rules.siteGeneration.minPlumeTiles) problems.push(`only ${plumeTiles.length} legal Plume tiles`);

  const minEnemy = reg.rules.siteGeneration.enemyMinHeroDistance;
  for (const stack of layout.smokestacks) if (layout.heroStarts.some((h) => chebyshev(h, stack) <= minEnemy)) problems.push('Smokestack too close to a hero start');
  return problems;
}

// =============================================================================================
// Fixed maps
// =============================================================================================

function layoutFor(reg: ContentRegistry, mapId: string, size: BoardSizeKey | null): MapLayout {
  const def = reg.maps.byId[mapId];
  if (!def) throw new Error(`unknown map "${mapId}"`);
  return def.layouts.find((l) => l.size === size) ?? def.layouts[0];
}

/** A fixed map (first_vigil, hollow_nave, last_flame_ring) at a size, for `seatCount` seats. */
export function buildFixedMap(reg: ContentRegistry, mapId: string, size: BoardSizeKey | null, seatCount: number): SiteLayout {
  const layout = layoutFor(reg, mapId, size);
  const kind = reg.maps.byId[mapId].kind;
  const tiles = blankTiles(layout.w, layout.h);
  const set = (name: string, type: TileId, pair: number | null = null) => {
    const tile = tiles[tileIndex(layout.w, sq(name))];
    tile.type = type;
    tile.chimneyPair = pair;
  };
  layout.pillars.forEach((n) => set(n, 'pillar'));
  layout.rubble.forEach((n) => set(n, 'rubble'));
  layout.shrines.forEach((n) => set(n, 'votive_shrine'));
  layout.hotWax.forEach((n) => set(n, 'hot_wax'));
  layout.chimneys.forEach(([a, b], pair) => {
    set(a, 'chimney', pair);
    set(b, 'chimney', pair);
  });
  const starts = seatCount === 2 && layout.heroStarts2 ? layout.heroStarts2 : layout.heroStarts;
  const zones =
    kind === 'ring' ? ringZones(layout.w, layout.h) : zonesFromBands(layout.zones ?? reg.rules.vigilZones[vigilSize(layout.size)], layout.w);
  return {
    siteId: mapId,
    size: layout.size,
    w: layout.w,
    h: layout.h,
    tiles,
    candles: layout.candles.map(sq),
    smokestacks: [],
    heroStarts: starts.map(sq),
    zones,
    bossAnchor: layout.bossAnchor ? sq(layout.bossAnchor) : null,
    scriptedPlumes: layout.plumes.map((p) => ({ ...p })),
    fallback: false,
  };
}

/** Build a Night's layout: a fixed map by id, otherwise a generated site. */
export function buildSite(holder: StreamHolder, reg: ContentRegistry, siteId: string, size: BoardSizeKey, seatCount: number): SiteLayout {
  if (reg.maps.byId[siteId]) return buildFixedMap(reg, siteId, size, seatCount);
  return generateVigilSite(holder, reg, siteId, size);
}
