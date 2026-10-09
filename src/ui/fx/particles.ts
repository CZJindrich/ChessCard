/**
 * The particle system behind the board's one particle canvas (GDD §16.9, §16.10): plain data,
 * no DOM, capped at 300 live particles. Positions, speeds and sizes are in tile units in screen
 * space (x right, y down, tile centres at .5), so effects scale with the board. Randomness is
 * cosmetic (GDD B.3) and injectable for tests.
 */

export const MAX_PARTICLES = 300;
/** Ambient emitters (Gloam fog) stop adding particles above this, so bursts always fit. */
export const AMBIENT_LIMIT = 90;

export type ParticleShape = 'dot' | 'streak' | 'puff' | 'shard' | 'ring' | 'chip';

export type Rgb = readonly [number, number, number];

export interface Particle {
  x: number;
  y: number;
  /** Velocity, tiles per second. */
  vx: number;
  vy: number;
  /** Gravity-like acceleration, tiles per second². */
  ay: number;
  /** Velocity damping per second (0 = none). */
  drag: number;
  /** Radius (or half length), tiles. */
  size: number;
  /** Radius change, tiles per second. */
  grow: number;
  /** Elapsed ms; negative while the particle waits for its delay. */
  age: number;
  ttl: number;
  color: Rgb;
  alpha: number;
  shape: ParticleShape;
  rot: number;
  /** Radians per second. */
  spin: number;
  /** Drawn with additive blending (light, sparks). */
  glow: boolean;
  /** 'out': fades over its life; 'swell': fades in, then out (smoke, fog). */
  fade: 'out' | 'swell';
}

/** A projectile (ember bolt, artillery shell) that sheds a trail as it flies. */
export interface Bolt {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Peak height of the arc, tiles (0 = straight line). */
  arc: number;
  duration: number;
  age: number;
  color: Rgb;
  /** Trail particles shed per second of flight. */
  trailRate: number;
  trailCarry: number;
}

export type Random = () => number;

export interface ParticleDraft extends Partial<Particle> {
  x: number;
  y: number;
  ttl: number;
  color: Rgb;
}

const DEFAULTS: Omit<Particle, 'x' | 'y' | 'ttl' | 'color'> = {
  vx: 0,
  vy: 0,
  ay: 0,
  drag: 0,
  size: 0.04,
  grow: 0,
  age: 0,
  alpha: 1,
  shape: 'dot',
  rot: 0,
  spin: 0,
  glow: false,
  fade: 'out',
};

export class ParticleSystem {
  readonly particles: Particle[] = [];
  readonly bolts: Bolt[] = [];
  readonly random: Random;

  constructor(random: Random = Math.random) {
    this.random = random;
  }

  get count(): number {
    return this.particles.length;
  }

  get idle(): boolean {
    return this.particles.length === 0 && this.bolts.length === 0;
  }

  /** Add particles until the cap; returns how many fit. */
  add(drafts: readonly ParticleDraft[]): number {
    let added = 0;
    for (const draft of drafts) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({ ...DEFAULTS, ...draft });
      added += 1;
    }
    return added;
  }

  addBolt(bolt: Omit<Bolt, 'age' | 'trailCarry'>): void {
    this.bolts.push({ ...bolt, age: 0, trailCarry: 0 });
  }

  clear(): void {
    this.particles.length = 0;
    this.bolts.length = 0;
  }

  /** Advance the simulation by `dt` ms. */
  step(dt: number): void {
    const s = dt / 1000;
    let live = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.ttl) continue;
      if (p.age > 0) {
        const damp = p.drag > 0 ? Math.exp(-p.drag * s) : 1;
        p.vx *= damp;
        p.vy = p.vy * damp + p.ay * s;
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.size = Math.max(0.005, p.size + p.grow * s);
        p.rot += p.spin * s;
      }
      this.particles[live++] = p;
    }
    this.particles.length = live;
    this.stepBolts(dt);
  }

  private stepBolts(dt: number): void {
    let live = 0;
    for (const bolt of this.bolts) {
      bolt.age += dt;
      this.shedTrail(bolt, dt);
      if (bolt.age >= bolt.duration) {
        const end = boltPoint(bolt, 1);
        this.add(impactSparks(end.x, end.y, bolt.color, this.random));
        continue;
      }
      this.bolts[live++] = bolt;
    }
    this.bolts.length = live;
  }

  private shedTrail(bolt: Bolt, dt: number): void {
    bolt.trailCarry += (bolt.trailRate * dt) / 1000;
    const r = this.random;
    while (bolt.trailCarry >= 1) {
      bolt.trailCarry -= 1;
      const at = boltPoint(bolt, Math.min(1, bolt.age / bolt.duration) - r() * 0.04);
      this.add([
        {
          x: at.x + (r() - 0.5) * 0.06,
          y: at.y + (r() - 0.5) * 0.06,
          vx: (r() - 0.5) * 0.3,
          vy: -0.2 - r() * 0.3,
          drag: 2,
          size: 0.035 + r() * 0.03,
          grow: -0.03,
          ttl: 260 + r() * 200,
          color: bolt.color,
          glow: true,
        },
      ]);
    }
  }
}

/** Where a bolt is at progress `t` (0–1), following its arc. */
export function boltPoint(bolt: Pick<Bolt, 'fromX' | 'fromY' | 'toX' | 'toY' | 'arc'>, t: number): { x: number; y: number } {
  const k = Math.max(0, Math.min(1, t));
  return {
    x: bolt.fromX + (bolt.toX - bolt.fromX) * k,
    y: bolt.fromY + (bolt.toY - bolt.fromY) * k - bolt.arc * 4 * k * (1 - k),
  };
}

// =============================================================================================
// Emitters: each returns drafts around a point (tile units, screen space)
// =============================================================================================

export const COLORS = {
  flameCore: [255, 243, 196],
  candleGold: [244, 185, 66],
  ember: [232, 116, 44],
  mothSilver: [201, 195, 230],
  snuffRim: [183, 156, 255],
  moonsilver: [217, 226, 242],
  smoke: [110, 100, 124],
  dust: [140, 126, 110],
  moonmoth: [159, 216, 232],
  ivory: [237, 227, 204],
  verdigris: [63, 162, 140],
  plume: [154, 92, 255],
  gloam: [126, 91, 194],
  sealRed: [142, 34, 40],
  sunrise: [255, 216, 107],
  white: [255, 255, 255],
} as const satisfies Record<string, Rgb>;

function pick<T>(items: readonly T[], r: Random): T {
  return items[Math.floor(r() * items.length) % items.length];
}

function radial(r: Random, min: number, max: number): { vx: number; vy: number } {
  const angle = r() * Math.PI * 2;
  const speed = min + r() * (max - min);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** Melee strike: a 12-spark burst of hot streaks around a brief white-hot flash. */
export function strikeSparks(x: number, y: number, r: Random = Math.random, count = 12): ParticleDraft[] {
  const flash: ParticleDraft = { x, y, size: 0.34, grow: 1.2, ttl: 150, color: COLORS.flameCore, alpha: 0.85, shape: 'puff', glow: true };
  const sparks = Array.from({ length: count }, () => ({
    x,
    y,
    ...radial(r, 3, 6.2),
    ay: 4,
    drag: 3,
    size: 0.13 + r() * 0.08,
    ttl: 300 + r() * 200,
    color: pick([COLORS.flameCore, COLORS.candleGold, COLORS.ember], r),
    shape: 'streak' as const,
    glow: true,
  }));
  return [flash, ...sparks];
}

/** A bolt landing: a small cluster of sparks in its own colour. */
export function impactSparks(x: number, y: number, color: Rgb, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 7 }, () => ({
    x,
    y,
    ...radial(r, 1.2, 3),
    drag: 4,
    size: 0.06 + r() * 0.04,
    ttl: 220 + r() * 140,
    color: r() < 0.4 ? COLORS.flameCore : color,
    shape: 'streak' as const,
    glow: true,
  }));
}

/** Snuff death: 24 particles of silver dust that drift up and out. */
export function silverDust(x: number, y: number, r: Random = Math.random, count = 24): ParticleDraft[] {
  return Array.from({ length: count }, () => ({
    x: x + (r() - 0.5) * 0.4,
    y: y + (r() - 0.5) * 0.5,
    ...radial(r, 0.8, 2.3),
    ay: -0.9,
    drag: 1.5,
    size: 0.04 + r() * 0.045,
    ttl: 500 + r() * 420,
    color: pick([COLORS.mothSilver, COLORS.snuffRim, COLORS.moonsilver], r),
    glow: true,
  }));
}

/** Wickfolk melt: smoke curls up from the puddle once the wax has run. */
export function meltSmoke(x: number, y: number, r: Random = Math.random, delay = 260): ParticleDraft[] {
  return Array.from({ length: 9 }, (_, i) => ({
    x: x + (r() - 0.5) * 0.35,
    y: y + 0.22,
    vx: (r() - 0.5) * 0.25,
    vy: -0.45 - r() * 0.4,
    drag: 0.6,
    size: 0.09 + r() * 0.06,
    grow: 0.22,
    age: -(delay + i * 45),
    ttl: 700 + r() * 400,
    color: COLORS.smoke,
    alpha: 0.55,
    shape: 'puff' as const,
    fade: 'swell' as const,
  }));
}

/** Landing or a push: a low puff of dust at the piece's feet. */
export function dustPuff(x: number, y: number, r: Random = Math.random, delay = 0): ParticleDraft[] {
  return Array.from({ length: 7 }, () => {
    const side = r() < 0.5 ? -1 : 1;
    return {
      x: x + side * (0.1 + r() * 0.15),
      y: y + 0.3 + (r() - 0.5) * 0.08,
      vx: side * (0.5 + r() * 0.7),
      vy: -0.15 - r() * 0.25,
      drag: 3,
      size: 0.06 + r() * 0.05,
      grow: 0.18,
      age: -delay,
      ttl: 380 + r() * 200,
      color: COLORS.dust,
      alpha: 0.5,
      shape: 'puff' as const,
      fade: 'swell' as const,
    };
  });
}

/** Ward breaking: the hex shell shatters into ivory and moonmoth shards. */
export function wardShards(x: number, y: number, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 12 }, () => ({
    x: x + (r() - 0.5) * 0.3,
    y: y + (r() - 0.5) * 0.3,
    ...radial(r, 1.4, 3),
    ay: 3.5,
    drag: 1.8,
    size: 0.05 + r() * 0.05,
    ttl: 420 + r() * 180,
    color: r() < 0.5 ? COLORS.ivory : COLORS.moonmoth,
    shape: 'shard' as const,
    rot: r() * Math.PI * 2,
    spin: (r() - 0.5) * 18,
  }));
}

/** A Ward forming: a quick inward glint of moonmoth light. */
export function wardGlint(x: number, y: number, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    return {
      x: x + Math.cos(angle) * 0.42,
      y: y + Math.sin(angle) * 0.42,
      vx: -Math.cos(angle) * 0.9,
      vy: -Math.sin(angle) * 0.9,
      drag: 2,
      size: 0.035,
      ttl: 260 + r() * 80,
      color: COLORS.moonmoth,
      glow: true,
    };
  });
}

/** Healing: verdigris motes rise and twinkle. */
export function healMotes(x: number, y: number, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 10 }, (_, i) => ({
    x: x + (r() - 0.5) * 0.6,
    y: y + 0.1 + (r() - 0.5) * 0.3,
    vx: (r() - 0.5) * 0.2,
    vy: -0.6 - r() * 0.5,
    drag: 0.4,
    size: 0.03 + r() * 0.03,
    age: -i * 30,
    ttl: 650 + r() * 350,
    color: r() < 0.3 ? COLORS.flameCore : COLORS.verdigris,
    glow: true,
    fade: 'swell' as const,
  }));
}

/** A Smoke Plume placed or rising: a column of violet smoke. */
export function plumeColumn(x: number, y: number, r: Random = Math.random, height = 1): ParticleDraft[] {
  return Array.from({ length: 14 }, (_, i) => ({
    x: x + (r() - 0.5) * 0.3,
    y: y + 0.25,
    vx: (r() - 0.5) * 0.3,
    vy: -(0.9 + r() * 0.8) * height,
    drag: 0.9,
    size: 0.08 + r() * 0.07,
    grow: 0.3,
    age: -i * 28,
    ttl: 600 + r() * 350,
    color: r() < 0.3 ? COLORS.snuffRim : COLORS.plume,
    alpha: 0.5,
    shape: 'puff' as const,
    fade: 'swell' as const,
  }));
}

/** Gloam: one slow fog puff drifting over a tile (ambient). */
export function gloamFog(x: number, y: number, r: Random = Math.random): ParticleDraft[] {
  return [
    {
      x: x + (r() - 0.5) * 0.8,
      y: y + (r() - 0.5) * 0.8,
      vx: (r() - 0.5) * 0.18,
      vy: -0.04 - r() * 0.08,
      size: 0.32 + r() * 0.26,
      grow: 0.1,
      ttl: 2600 + r() * 1800,
      color: r() < 0.45 ? COLORS.gloam : [104, 80, 140],
      alpha: 0.42,
      shape: 'puff',
      fade: 'swell',
    },
  ];
}

/** Slides leave a flame trail: embers dropped tile by tile along the path. */
export function flameTrail(points: ReadonlyArray<{ x: number; y: number }>, msPerTile: number, r: Random = Math.random): ParticleDraft[] {
  const out: ParticleDraft[] = [];
  points.forEach((pt, i) => {
    for (let k = 0; k < 4; k++) {
      out.push({
        x: pt.x + (r() - 0.5) * 0.25,
        y: pt.y + 0.2 + (r() - 0.5) * 0.12,
        vx: (r() - 0.5) * 0.2,
        vy: -0.35 - r() * 0.35,
        drag: 1.2,
        size: 0.04 + r() * 0.035,
        grow: -0.03,
        age: -(i * msPerTile + k * (msPerTile / 4)),
        ttl: 380 + r() * 220,
        color: pick([COLORS.flameCore, COLORS.candleGold, COLORS.ember], r),
        glow: true,
      });
    }
  });
  return out;
}

/** Summons: a ring of gold sparkles rising. */
export function summonSparkles(x: number, y: number, color: Rgb = COLORS.candleGold, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    return {
      x: x + Math.cos(angle) * 0.32,
      y: y + 0.18 + Math.sin(angle) * 0.12,
      vx: Math.cos(angle) * 0.2,
      vy: -0.7 - r() * 0.5,
      drag: 0.8,
      size: 0.03 + r() * 0.025,
      ttl: 520 + r() * 260,
      color: r() < 0.35 ? COLORS.flameCore : color,
      glow: true,
    };
  });
}

/** The cracked wax seal of a played card: chips of red wax. */
export function waxChips(x: number, y: number, r: Random = Math.random): ParticleDraft[] {
  return Array.from({ length: 10 }, () => ({
    x,
    y,
    ...radial(r, 1, 2.4),
    ay: 4.5,
    drag: 1.5,
    size: 0.04 + r() * 0.04,
    ttl: 420 + r() * 160,
    color: r() < 0.25 ? COLORS.candleGold : COLORS.sealRed,
    shape: 'chip' as const,
    rot: r() * Math.PI,
    spin: (r() - 0.5) * 14,
  }));
}

/** An expanding ring: the phase-change / CHECKMATE shockwave, or a ping. */
export function shockRing(x: number, y: number, color: Rgb, radius = 4, ttl = 700, delay = 0): ParticleDraft[] {
  return [{ x, y, size: 0.3, grow: (radius - 0.3) / (ttl / 1000), age: -delay, ttl, color, alpha: 0.9, shape: 'ring', glow: true }];
}
