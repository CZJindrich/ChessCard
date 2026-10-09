import { describe, expect, it } from 'vitest';
import { tierForNight } from '../../../src/config';
import { buildFixedMap, checkSiteLayout, generateVigilSite, getContent, initStreams, sqName } from '../../../src/engine';
import type { SiteLayout, TileId } from '../../../src/engine';
import { act, newGame, toPlayers } from './helpers';

const reg = getContent();
const SITES = ['cathedral_of_tallow', 'soot_market', 'belfry_steps', 'the_waxworks'] as const;
const SIZES = ['8x8', '10x10'] as const;

function count(layout: SiteLayout, type: TileId): number {
  return layout.tiles.filter((t) => t.type === type).length;
}

describe('generated Vigil sites (§13.3.4)', () => {
  for (const site of SITES) {
    for (const size of SIZES) {
      it(`${site} ${size}: valid over 200 seeds with the template counts`, () => {
        const counts = reg.sites.byId[site].counts[size];
        let fallbacks = 0;
        for (let i = 0; i < 200; i++) {
          const layout = generateVigilSite({ rng: initStreams(`site-${i}`, ['map']) }, reg, site, size);
          expect(checkSiteLayout(layout, reg)).toEqual([]);
          if (layout.fallback) {
            fallbacks += 1;
            continue;
          }
          expect(layout.w).toBe(size === '8x8' ? 8 : 10);
          expect(count(layout, 'pillar')).toBe(counts.pillars);
          expect(count(layout, 'rubble')).toBe(counts.rubble);
          expect(count(layout, 'votive_shrine')).toBe(counts.shrines);
          expect(count(layout, 'hot_wax')).toBe(counts.hotWax);
          expect(count(layout, 'chimney')).toBe(2 * counts.chimneyPairs);
          expect(layout.smokestacks).toHaveLength(counts.smokestacks);
          expect(layout.candles).toHaveLength(3);
          const deployRanks = layout.tiles.filter((t, idx) => Math.floor(idx / layout.w) < 2 && t.type !== 'flagstone');
          expect(deployRanks).toHaveLength(0);
        }
        expect(fallbacks).toBeLessThanOrEqual(2);
      });
    }
  }

  it('cathedral pillars are mirrored left-right', () => {
    for (let i = 0; i < 30; i++) {
      const layout = generateVigilSite({ rng: initStreams(`mirror-${i}`, ['map']) }, reg, 'cathedral_of_tallow', '10x10');
      layout.tiles.forEach((t, idx) => {
        if (t.type !== 'pillar') return;
        const x = idx % layout.w;
        const y = Math.floor(idx / layout.w);
        expect(layout.tiles[y * layout.w + (layout.w - 1 - x)].type).toBe('pillar');
      });
    }
  });

  it('Chimneys come in numbered pairs at least 3 apart', () => {
    const layout = generateVigilSite({ rng: initStreams('chimneys', ['map']) }, reg, 'the_waxworks', '10x10');
    const ends = layout.tiles.map((t, idx) => ({ t, x: idx % layout.w, y: Math.floor(idx / layout.w) })).filter((e) => e.t.type === 'chimney');
    expect(ends.map((e) => e.t.chimneyPair).sort()).toEqual([0, 0, 1, 1]);
    for (const pair of [0, 1]) {
      const [a, b] = ends.filter((e) => e.t.chimneyPair === pair);
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(3);
    }
  });

  it('flags broken layouts', () => {
    const layout = generateVigilSite({ rng: initStreams('broken', ['map']) }, reg, 'cathedral_of_tallow', '8x8');
    const walled: SiteLayout = { ...layout, tiles: layout.tiles.map((t, idx) => (Math.floor(idx / layout.w) === 4 ? { ...t, type: 'pillar' as const } : t)) };
    expect(checkSiteLayout(walled, reg).some((p) => p.includes('unreachable') || p.includes('Plume'))).toBe(true);
  });
});

describe('fixed maps', () => {
  it('first_vigil', () => {
    const map = buildFixedMap(reg, 'first_vigil', '8x8', 1);
    expect(map.candles.map(sqName)).toEqual(['c3', 'f3', 'g5']);
    expect(count(map, 'pillar')).toBe(2);
    expect(map.tiles[4 * 8 + 2].type).toBe('votive_shrine');
    expect(map.scriptedPlumes.map((p) => [p.at, p.tally])).toEqual([
      ['c6', 0],
      ['f6', 1],
      ['b6', 2],
    ]);
    expect(checkSiteLayout(map, reg)).toEqual([]);
  });

  it('hollow_nave at 8×8 and 10×10', () => {
    const small = buildFixedMap(reg, 'hollow_nave', '8x8', 2);
    expect([small.w, sqName(small.bossAnchor ?? { x: -1, y: -1 })]).toEqual([8, 'd6']);
    expect(small.candles.map(sqName)).toEqual(['b4', 'e3', 'g4']);
    const big = buildFixedMap(reg, 'hollow_nave', '10x10', 4);
    expect([big.w, sqName(big.bossAnchor ?? { x: -1, y: -1 })]).toEqual([10, 'e7']);
    expect(big.heroStarts.map(sqName)).toEqual(['e1', 'f1', 'd1', 'g1']);
  });

  it('last_flame_ring at 10×10 and 12×12, with the 2-seat start tiles', () => {
    expect(buildFixedMap(reg, 'last_flame_ring', '10x10', 2).heroStarts.map(sqName)).toEqual(['c3', 'h8']);
    expect(buildFixedMap(reg, 'last_flame_ring', '10x10', 3).heroStarts.map(sqName)).toEqual(['c3', 'h3', 'h8', 'c8']);
    const ring = buildFixedMap(reg, 'last_flame_ring', '12x12', 4);
    expect(ring.heroStarts.map(sqName)).toEqual(['c3', 'j3', 'j10', 'c10']);
    expect(count(ring, 'chimney')).toBe(4);
    expect(count(ring, 'pillar')).toBe(8);
  });
});

describe('Night order and tiers (§13.3.1, §13.3.3)', () => {
  it('tiers per length', () => {
    expect([1, 2].map((k) => tierForNight(k, 2))).toEqual([1, 2]);
    expect([1, 2, 3].map((k) => tierForNight(k, 3))).toEqual([1, 2, 3]);
    expect([1, 2, 3, 4, 5].map((k) => tierForNight(k, 5))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 3, 4].map((k) => tierForNight(k, 4))).toEqual([1, 1, 2, 3]);
  });

  it('Night 1 is the Cathedral, later Nights draw the other sites without repeats, the last is hollow_nave', () => {
    let s = newGame({ seed: 'order', overrides: { length: 'long', nights: 6, tolls: false, moth_die: false } });
    const sites: string[] = [s.siteId];
    for (let night = 1; night < 6; night++) {
      s = toPlayers(s);
      s.round = s.roundsThisNight ?? 0;
      s.phase = 'tally';
      s.pieces = Object.fromEntries(Object.entries(s.pieces).filter(([, p]) => p.side === 'wick'));
      s.plumes = [];
      s.intents = [];
      s = act(s, { type: 'advance' }).state;
      expect(s.phase).toBe('dawn');
      s = act(s, { type: 'advance' }).state;
      s = act(s, { type: 'skip_pick', seat: 0 }).state;
      s = act(s, { type: 'boon_pick', seat: 0, boon: null, args: {} }).state;
      s = act(s, { type: 'advance' }).state;
      sites.push(s.siteId);
    }
    expect(sites[0]).toBe('cathedral_of_tallow');
    expect(new Set(sites.slice(1, 4))).toEqual(new Set(['soot_market', 'belfry_steps', 'the_waxworks']));
    expect(sites[5]).toBe('hollow_nave');
    expect(s.isBossNight).toBe(true);
    expect(s.usedSites).toEqual(sites);
  });

  it('tier-2 Nights add the extra Smokestack when it is on; the Boss Night has P + mod enemies', () => {
    let s = newGame({ seed: 'stack', overrides: { length: 'short', nights: 3, tolls: false, moth_die: false, extra_smokestack: true, initial_enemies_mod: 0 } });
    expect(Object.values(s.pieces).some((p) => p.defId === 'smokestack')).toBe(false);
    for (let night = 1; night < 3; night++) {
      s = toPlayers(s);
      s.round = s.roundsThisNight ?? 0;
      s.phase = 'tally';
      s.pieces = Object.fromEntries(Object.entries(s.pieces).filter(([, p]) => p.side === 'wick'));
      s.plumes = [];
      s = act(act(s, { type: 'advance' }).state, { type: 'advance' }).state;
      s = act(s, { type: 'skip_pick', seat: 0 }).state;
      s = act(s, { type: 'boon_pick', seat: 0, boon: null, args: {} }).state;
      s = act(s, { type: 'advance' }).state;
      if (night === 1) {
        expect(s.tier).toBe(2);
        expect(Object.values(s.pieces).filter((p) => p.defId === 'smokestack').length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(s.isBossNight).toBe(true);
    expect(s.tier).toBe(3);
    expect(Object.values(s.pieces).filter((p) => p.kind === 'enemy')).toHaveLength(1);
    expect(Object.values(s.pieces).filter((p) => p.kind === 'boss')).toHaveLength(1);
    expect(s.roundsThisNight).toBeNull();
  });
});
