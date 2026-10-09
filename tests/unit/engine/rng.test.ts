import { describe, expect, it } from 'vitest';
import {
  GLOBAL_STREAMS,
  initStreams,
  nextFloat,
  rollDie,
  seatStream,
  seedFromString,
  standardStreamNames,
  streamDie,
  streamFloat,
  streamInt,
  streamPick,
  streamSeed,
  streamShuffle,
  streamWeighted,
} from '../../../src/engine/rng';

const holder = (seed: string, seats = 2) => ({ rng: initStreams(seed, standardStreamNames(seats)) });

describe('existing generator', () => {
  it('keeps FNV-1a seedFromString and mulberry32', () => {
    expect(seedFromString('')).toBe(2166136261);
    expect(seedFromString('a')).toBe(0xe40c292c);
    const a = { rng: 42 };
    const b = { rng: 42 };
    expect([nextFloat(a), nextFloat(a)]).toEqual([nextFloat(b), nextFloat(b)]);
    const dice = { rng: 7 };
    for (let i = 0; i < 200; i++) expect(rollDie(dice)).toBeGreaterThanOrEqual(1);
  });
});

describe('named streams (GDD B.3)', () => {
  it('names every global and per-seat stream', () => {
    expect(GLOBAL_STREAMS).toEqual(['setup', 'map', 'spawn', 'omen', 'toll']);
    expect(seatStream('decks', 0)).toBe('decks:0');
    expect(standardStreamNames(2)).toEqual(['setup', 'map', 'spawn', 'omen', 'toll', 'decks:0', 'draft:0', 'bot:0', 'decks:1', 'draft:1', 'bot:1']);
  });

  it('seeds each stream with seedFromString(seed + NUL + name)', () => {
    const streams = initStreams('KWTR', ['omen', 'decks:1']);
    expect(streams).toEqual({ omen: seedFromString('KWTR\u0000omen'), 'decks:1': seedFromString('KWTR\u0000decks:1') });
    expect(streamSeed('KWTR', 'omen')).toBe(streams.omen);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const roll = (seed: string) => {
      const h = holder(seed);
      return Array.from({ length: 20 }, () => streamDie(h, 'omen'));
    };
    expect(roll('daily:2026-10-09')).toEqual(roll('daily:2026-10-09'));
    expect(roll('daily:2026-10-09')).not.toEqual(roll('daily:2026-10-10'));
  });

  it('keeps streams independent: drawing from one never shifts another', () => {
    const a = holder('seed');
    const b = holder('seed');
    for (let i = 0; i < 50; i++) streamFloat(a, 'spawn');
    expect(streamInt(a, 'omen', 1, 100)).toBe(streamInt(b, 'omen', 1, 100));
    expect(a.rng['decks:0']).toBe(b.rng['decks:0']);
    expect(a.rng.spawn).not.toBe(b.rng.spawn);
  });

  it('survives a JSON round trip mid-sequence', () => {
    const h = holder('replay');
    streamShuffle(h, 'decks:0', [1, 2, 3, 4, 5]);
    const copy = JSON.parse(JSON.stringify(h)) as typeof h;
    expect(streamPick(copy, 'map', ['a', 'b', 'c', 'd'])).toBe(streamPick(h, 'map', ['a', 'b', 'c', 'd']));
    expect(copy).toEqual(h);
  });

  it('draws ints, dice, picks and shuffles in range', () => {
    const h = holder('ranges');
    for (let i = 0; i < 300; i++) {
      const n = streamInt(h, 'setup', -2, 2);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
      const d = streamDie(h, 'omen');
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
    const deck = Array.from({ length: 10 }, (_, i) => i);
    const shuffled = streamShuffle(h, 'decks:1', deck);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(deck);
    expect(deck).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });

  it('weighted picks follow the weights and never pick weight 0', () => {
    const h = holder('weights');
    const counts: Record<string, number> = { sootling: 0, gnawmoth: 0, knell_banshee: 0 };
    const entries = [
      { item: 'sootling', weight: 4 },
      { item: 'gnawmoth', weight: 2 },
      { item: 'knell_banshee', weight: 0 },
    ];
    for (let i = 0; i < 3000; i++) counts[streamWeighted(h, 'spawn', entries)] += 1;
    expect(counts.knell_banshee).toBe(0);
    expect(counts.sootling / counts.gnawmoth).toBeGreaterThan(1.7);
    expect(counts.sootling / counts.gnawmoth).toBeLessThan(2.3);
    expect(() => streamWeighted(h, 'spawn', [{ item: 'x', weight: 0 }])).toThrow();
  });

  it('rejects unknown streams', () => {
    expect(() => streamFloat(holder('x'), 'decks:7')).toThrow('unknown RNG stream "decks:7"');
  });
});
