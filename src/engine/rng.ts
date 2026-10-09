import type { RngStreams } from './types';

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

// ---------------------------------------------------------------------------------------------
// Named streams (GDD B.3): one mulberry32 state per stream, kept in `state.rng[name]`.
// ---------------------------------------------------------------------------------------------

/** Anything holding named streams (GameState, or a test fixture). */
export interface StreamHolder {
  rng: RngStreams;
}

/** Streams shared by the whole game. */
export const GLOBAL_STREAMS = ['setup', 'map', 'spawn', 'omen', 'toll'] as const;
export type GlobalStream = (typeof GLOBAL_STREAMS)[number];

/** Streams owned by one seat (seat index, 0-based). */
export const SEAT_STREAM_KINDS = ['decks', 'draft', 'bot'] as const;
export type SeatStreamKind = (typeof SEAT_STREAM_KINDS)[number];

/** "decks:0", "draft:2", "bot:1". Always build seat stream names with this. */
export function seatStream(kind: SeatStreamKind, seat: number): string {
  return `${kind}:${seat}`;
}

/** Every stream a game with `seatCount` seats uses. */
export function standardStreamNames(seatCount: number): string[] {
  const names: string[] = [...GLOBAL_STREAMS];
  for (let seat = 0; seat < seatCount; seat++) for (const kind of SEAT_STREAM_KINDS) names.push(seatStream(kind, seat));
  return names;
}

/** Initial state of one stream: seedFromString(seed + "\u0000" + name). */
export function streamSeed(seed: string, name: string): number {
  return seedFromString(`${seed}\u0000${name}`);
}

export function initStreams(seed: string, names: readonly string[]): RngStreams {
  const streams: RngStreams = {};
  for (const name of names) streams[name] = streamSeed(seed, name);
  return streams;
}

/** Run `draw` against one stream of `holder`, writing the advanced state back. */
function withStream<T>(holder: StreamHolder, name: string, draw: (h: RngHolder) => T): T {
  const current = holder.rng[name];
  if (current === undefined) throw new Error(`unknown RNG stream "${name}"`);
  const h: RngHolder = { rng: current };
  const value = draw(h);
  holder.rng[name] = h.rng;
  return value;
}

/** Float in [0, 1) from a named stream (mutates holder.rng[name]). */
export function streamFloat(holder: StreamHolder, name: string): number {
  return withStream(holder, name, nextFloat);
}

/** Integer in [min, max] inclusive from a named stream. */
export function streamInt(holder: StreamHolder, name: string, min: number, max: number): number {
  return withStream(holder, name, (h) => nextInt(h, min, max));
}

/** One die roll (1..sides) from a named stream. */
export function streamDie(holder: StreamHolder, name: string, sides = 6): number {
  return withStream(holder, name, (h) => rollDie(h, sides));
}

export function streamPick<T>(holder: StreamHolder, name: string, items: readonly T[]): T {
  return withStream(holder, name, (h) => pick(h, items));
}

/** Fisher-Yates shuffle into a new array, from a named stream. */
export function streamShuffle<T>(holder: StreamHolder, name: string, items: readonly T[]): T[] {
  return withStream(holder, name, (h) => shuffled(h, items));
}

/**
 * Weighted pick (enemy tier weights, Chandlery rarity weights). Entries with weight <= 0 are
 * never chosen; throws if no entry has positive weight. Always consumes exactly one draw.
 */
export function streamWeighted<T>(holder: StreamHolder, name: string, entries: ReadonlyArray<{ item: T; weight: number }>): T {
  const live = entries.filter((e) => e.weight > 0);
  if (live.length === 0) throw new Error('streamWeighted() with no positive weights');
  const total = live.reduce((sum, e) => sum + e.weight, 0);
  let roll = streamFloat(holder, name) * total;
  for (const entry of live) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return live[live.length - 1].item;
}
