/**
 * Cosmetic, seeded randomness for art (pre-baked smoke edges, flicker phases,
 * window patterns). Never used for game state; the engine has its own streams.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Rand = () => number;

/** mulberry32 generator returning floats in [0, 1). */
export function mulberry32(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: string): Rand {
  return mulberry32(hashString(seed));
}

/** Uniform float in [min, max). */
export function between(rand: Rand, min: number, max: number): number {
  return min + rand() * (max - min);
}
