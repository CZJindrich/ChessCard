import { describe, expect, it } from 'vitest';
import { getContent } from '../../../src/engine';
import type { GameEvent, GameState } from '../../../src/engine/types';
import { boltPoint, MAX_PARTICLES, ParticleSystem, silverDust, strikeSparks } from '../../../src/ui/fx/particles';
import { darknessAlpha, flicker, FLICKER, LIGHT_RADIUS, lightSources } from '../../../src/ui/fx/darkness';
import { fxForStep } from '../../../src/ui/fx/director';
import { flashAllowed, MIN_FLASH_GAP_MS, shakeFrames } from '../../../src/ui/fx/ScreenFx';
import { newGame } from './harness';

/** A seeded random for repeatable particle tests. */
function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function craftedState(): GameState {
  return structuredClone(newGame());
}

describe('particle system', () => {
  it('caps live particles at 300 and expires them', () => {
    const system = new ParticleSystem(seeded());
    for (let i = 0; i < 40; i++) system.add(silverDust(1, 1, system.random));
    expect(system.count).toBe(MAX_PARTICLES);
    system.step(5000);
    expect(system.count).toBe(0);
    expect(system.idle).toBe(true);
  });

  it('a melee hit makes 12 sparks around a flash; a Snuff burst 24 dust motes', () => {
    const sparks = strikeSparks(2, 2, seeded());
    expect(sparks.filter((p) => p.shape === 'streak')).toHaveLength(12);
    expect(silverDust(2, 2, seeded())).toHaveLength(24);
  });

  it('delayed particles wait, then move', () => {
    const system = new ParticleSystem(seeded());
    system.add([{ x: 0, y: 0, vx: 1, ttl: 500, color: [255, 255, 255], age: -100 }]);
    system.step(50);
    expect(system.particles[0].x).toBe(0);
    system.step(150);
    expect(system.particles[0].x).toBeGreaterThan(0);
  });

  it('a bolt follows its arc and bursts on arrival', () => {
    const bolt = { fromX: 0, fromY: 4, toX: 4, toY: 4, arc: 1 };
    expect(boltPoint(bolt, 0)).toEqual({ x: 0, y: 4 });
    expect(boltPoint(bolt, 0.5)).toEqual({ x: 2, y: 3 });
    const system = new ParticleSystem(seeded());
    system.addBolt({ ...bolt, duration: 200, color: [232, 116, 44], trailRate: 0 });
    system.step(250);
    expect(system.bolts).toHaveLength(0);
    expect(system.count).toBeGreaterThan(0);
  });
});

describe('darkness (§16.5)', () => {
  it('lights Wickfolk 2.2, Lanterns 3, Shrines 1.5 unlit and 3 lit', () => {
    const s = craftedState();
    const hero = s.pieces[s.players[0].heroPieceId];
    const lights = lightSources(s);
    expect(lights.find((l) => l.id === hero.id)?.radius).toBe(LIGHT_RADIUS.wickfolk);
    hero.defId = 'lantern';
    expect(lightSources(s).find((l) => l.id === hero.id)?.radius).toBe(3);
    s.board.tiles[0] = { ...s.board.tiles[0], type: 'votive_shrine', shrineLit: false };
    expect(lightSources(s).find((l) => l.id === 'tile:0,0')?.radius).toBe(1.5);
    s.board.tiles[0] = { ...s.board.tiles[0], shrineLit: true };
    expect(lightSources(s).find((l) => l.id === 'tile:0,0')?.radius).toBe(3);
    expect(lights.every((l) => !s.pieces[l.id] || s.pieces[l.id].side === 'wick')).toBe(true);
  });

  it('deepens with Dread: α = 0.30 + 0.30 × Dread / M', () => {
    const s = craftedState();
    if (!s.vigil) throw new Error('Vigil expected');
    s.vigil.dread = 0;
    expect(darknessAlpha(s)).toBeCloseTo(0.3);
    s.vigil.dread = s.vigil.dreadMax / 2;
    expect(darknessAlpha(s)).toBeCloseTo(0.45);
    s.vigil.dread = s.vigil.dreadMax;
    expect(darknessAlpha(s)).toBeCloseTo(0.6);
  });

  it('flickers within ±4%', () => {
    for (let t = 0; t < 5000; t += 37) {
      const k = flicker(t, 1.3);
      expect(k).toBeGreaterThanOrEqual(1 - FLICKER - 1e-9);
      expect(k).toBeLessThanOrEqual(1 + FLICKER + 1e-9);
    }
  });
});

describe('FX director (§16.9)', () => {
  const reg = getContent();
  const step = (event: GameEvent, duration = 300): { event: GameEvent; duration: number } => ({ event, duration });

  it('melee strikes spark, ranged strikes fire a bolt, artillery arcs', () => {
    const s = craftedState();
    const hero = s.pieces[s.players[0].heroPieceId];
    const target = { x: hero.pos.x + 1, y: hero.pos.y + 1 };
    expect(fxForStep(step({ type: 'strike', attackerId: hero.id, kind: 'melee', from: hero.pos, target }), s, reg).map((c) => c.kind)).toEqual(['burst']);
    const ranged = fxForStep(step({ type: 'strike', attackerId: hero.id, kind: 'ranged', from: hero.pos, target }), s, reg);
    expect(ranged[0]).toMatchObject({ kind: 'bolt', arc: 0 });
    const arc = fxForStep(step({ type: 'strike', attackerId: hero.id, kind: 'artillery', from: hero.pos, target }), s, reg);
    expect(arc[0]).toMatchObject({ kind: 'bolt' });
    expect(arc[0].kind === 'bolt' && arc[0].arc).toBeGreaterThan(0);
  });

  it('Snuff burst into dust, Wickfolk melt into smoke, Ward breaks into shards', () => {
    const s = craftedState();
    const snuff = Object.values(s.pieces).find((p) => p.side === 'snuff');
    const hero = s.pieces[s.players[0].heroPieceId];
    if (!snuff) throw new Error('a Snuff expected');
    const died = (p: typeof hero): GameEvent => ({ type: 'piece_died', pieceId: p.id, defId: p.defId, kind: p.kind, side: p.side, pos: p.pos, killerSeat: null, cause: 'strike' });
    expect(fxForStep(step(died(snuff)), s, reg)[0]).toMatchObject({ kind: 'burst', burst: 'dust' });
    expect(fxForStep(step(died(hero)), s, reg)[0]).toMatchObject({ kind: 'burst', burst: 'melt_smoke' });
    const warded = fxForStep(step({ type: 'damage', pieceId: hero.id, amount: 1, hpAfter: hero.hp, lethal: false, blockedByWard: true, cause: 'intent', sourceId: null, seat: null }), s, reg);
    expect(warded[0]).toMatchObject({ kind: 'burst', burst: 'ward_shards' });
  });

  it('Dread +1 pulses the vignette; a boss phase flashes, shakes and sends a shockwave', () => {
    const s = craftedState();
    expect(fxForStep(step({ type: 'dread_changed', from: 1, to: 2, cause: 'candle_hit', threshold: null }), s, reg)).toEqual([{ kind: 'vignette', strength: 0.7, duration: 450 }]);
    expect(fxForStep(step({ type: 'dread_changed', from: 2, to: 1, cause: 'dawn', threshold: null }), s, reg)).toEqual([]);
    const kinds = fxForStep(step({ type: 'boss_phase', bossId: 'hush_hierophant', phase: 2 }, 1500), s, reg).map((c) => c.kind);
    expect(kinds).toContain('flash');
    expect(kinds).toContain('shake');
  });

  it('slides leave a flame trail along their path', () => {
    const s = craftedState();
    const hero = s.pieces[s.players[0].heroPieceId];
    const path = [
      { x: hero.pos.x, y: hero.pos.y + 1 },
      { x: hero.pos.x, y: hero.pos.y + 2 },
    ];
    const [trail] = fxForStep(step({ type: 'piece_moved', pieceId: hero.id, from: hero.pos, to: path[1], kind: 'slide', path }, 360), s, reg);
    expect(trail).toMatchObject({ kind: 'trail', msPerTile: 180 });
    expect(trail.kind === 'trail' && trail.points).toHaveLength(3);
  });
});

describe('screen effects', () => {
  it('never flashes more than 3 times a second', () => {
    expect(flashAllowed(null, 0)).toBe(true);
    expect(flashAllowed(0, MIN_FLASH_GAP_MS - 1)).toBe(false);
    expect(flashAllowed(0, MIN_FLASH_GAP_MS)).toBe(true);
    expect(MIN_FLASH_GAP_MS).toBeGreaterThanOrEqual(1000 / 3);
  });

  it('a shake decays and ends at rest', () => {
    const frames = shakeFrames(6, 8, seeded());
    expect(frames[0]).toEqual({ translate: '0px 0px' });
    expect(frames[frames.length - 1]).toEqual({ translate: '0px 0px' });
    const offsets = frames.map((f) => Math.abs(parseFloat(String(f.translate))));
    expect(Math.max(...offsets)).toBeLessThanOrEqual(6);
  });
});
