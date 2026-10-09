/**
 * Deterministic, serializable PRNG (mulberry32).
 *
 * The engine keeps the generator state as a plain uint32 inside the game state,
 * so the same seed + the same action log always reproduces the same game. This is
 * what lets the online server, replays and tests agree on every die roll.
 */
export interface RngHolder {
  rng: number;
}

/** Advance the holder's generator and return a float in [0, 1). */
export function nextFloat(holder: RngHolder): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(holder: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextFloat(holder) * (max - min + 1));
}

/** Roll one die with `sides` faces (1..sides). */
export function rollDie(holder: RngHolder, sides = 6): number {
  return nextInt(holder, 1, sides);
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(nextFloat(holder) * items.length)];
}

/** Fisher-Yates shuffle into a new array. */
export function shuffled<T>(holder: RngHolder, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(holder) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Turn any string (e.g. a room code or "daily" date) into a uint32 seed. */
export function seedFromString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
