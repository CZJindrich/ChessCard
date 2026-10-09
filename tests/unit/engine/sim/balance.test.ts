/**
 * Balance sweep (E5): whole games with bot_warden in every seat. Skipped unless WW_SIM=1 — it
 * plays hundreds of games. WW_SIM_GAMES sets the games per (difficulty, hero) cell (default 6;
 * the hand-off numbers used 42, bosses rotated evenly). It prints the tables and checks only
 * what must always hold: every game finishes, no plan action is ever illegal, and the
 * difficulties keep their order. The win-rate targets (GDD §12.5 hand-off: candlelit ≥ 85%,
 * dusk 55-70%, midnight 30-45%, witching hour 15-30%) need far more games than a test run.
 */
import { describe, expect, it } from 'vitest';
import type { DifficultyId } from '../../../../src/engine';
import { simulateGame } from './simulate';
import type { SimGameResult } from './simulate';

const ENABLED = process.env.WW_SIM === '1';
const GAMES = Number(process.env.WW_SIM_GAMES ?? 6);
const HEROES = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'];
const BOSSES = ['hush_hierophant', 'guttered_king', 'nocturna'];
const DIFFICULTIES: DifficultyId[] = ['candlelit', 'dusk', 'midnight', 'witching_hour'];
/** The six hero pairs for 2-seat co-op. */
const PAIRS = HEROES.flatMap((a, i) => HEROES.slice(i + 1).map((b) => [a, b]));

function rate(results: readonly SimGameResult[], won: (r: SimGameResult) => boolean): number {
  return results.length === 0 ? 0 : Math.round((100 * results.filter(won).length) / results.length);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round((10 * values.reduce((a, b) => a + b, 0)) / values.length) / 10;
}

describe.skipIf(!ENABLED)('balance sweep (WW_SIM=1)', () => {
  it('Vigil solo, bot_warden, short: win rate per difficulty and hero', () => {
    const table: Array<Record<string, string | number>> = [];
    const byDifficulty: number[] = [];
    for (const difficulty of DIFFICULTIES) {
      const all: SimGameResult[] = [];
      for (const hero of HEROES) {
        const games = Array.from({ length: GAMES }, (_, i) =>
          simulateGame({
            mode: 'vigil',
            length: 'short',
            difficulty,
            seats: [{ kind: 'bot_warden', hero }],
            seed: `sim-${difficulty}-${hero}-${i}`,
            overrides: { boss_choice: BOSSES[i % BOSSES.length] },
          }),
        );
        for (const g of games) expect(g.finished && g.replans === 0).toBe(true);
        all.push(...games);
        table.push({ difficulty, hero, games: games.length, win: rate(games, (g) => g.outcome === 'victory'), rounds: mean(games.map((g) => g.rounds)), actions: mean(games.map((g) => g.actions)) });
      }
      byDifficulty.push(rate(all, (g) => g.outcome === 'victory'));
      table.push({ difficulty, hero: 'ALL', games: all.length, win: byDifficulty.at(-1) ?? 0, rounds: mean(all.map((g) => g.rounds)), actions: mean(all.map((g) => g.actions)) });
    }
    console.table(table);
    // A harder difficulty never wins clearly more often: two standard errors of the difference
    // between two win rates of 4 × GAMES games each (≈ 140 / √n points).
    const tolerance = 140 / Math.sqrt(4 * GAMES);
    for (let i = 1; i < byDifficulty.length; i++) expect(byDifficulty[i]).toBeLessThanOrEqual(byDifficulty[i - 1] + tolerance);
  }, 3_600_000);

  it('Vigil 2-seat co-op, bot_warden, short', () => {
    const table: Array<Record<string, string | number>> = [];
    for (const difficulty of DIFFICULTIES) {
      const games = Array.from({ length: GAMES * 2 }, (_, i) =>
        simulateGame({
          mode: 'vigil',
          length: 'short',
          difficulty,
          seats: PAIRS[i % PAIRS.length].map((hero) => ({ kind: 'bot_warden' as const, hero })),
          seed: `sim-coop-${difficulty}-${i}`,
          overrides: { boss_choice: BOSSES[i % BOSSES.length] },
        }),
      );
      for (const g of games) expect(g.finished && g.replans === 0).toBe(true);
      table.push({ difficulty, games: games.length, win: rate(games, (g) => g.outcome === 'victory'), rounds: mean(games.map((g) => g.rounds)), actions: mean(games.map((g) => g.actions)) });
    }
    console.table(table);
  }, 3_600_000);

  it('Last Flame, 2-4 bot_warden seats, short: placements by seat and hero, end reasons', () => {
    const table: Array<Record<string, string | number>> = [];
    for (const seats of [2, 3, 4]) {
      const games = Array.from({ length: GAMES * 2 }, (_, i) =>
        simulateGame({
          mode: 'last_flame',
          length: 'short',
          difficulty: 'dusk',
          seats: Array.from({ length: seats }, (_, k) => ({ kind: 'bot_warden' as const, hero: HEROES[(i + k) % 4] })),
          seed: `sim-lf-${seats}-${i}`,
        }),
      );
      for (const g of games) expect(g.finished && g.replans === 0).toBe(true);
      const bySeat = Array.from({ length: seats }, (_, seat) => mean(games.map((g) => g.seatsResult[seat].placement ?? seats)));
      const byHero = HEROES.map((hero) => mean(games.flatMap((g) => g.seatsResult.filter((r) => r.hero === hero).map((r) => r.placement ?? seats))));
      const reasons = ['boss_rounds', 'boss_fell', 'last_standing'].map((reason) => `${reason} ${rate(games, (g) => g.outcome === reason)}%`).join(', ');
      table.push({ seats, games: games.length, placeBySeat: bySeat.join(' / '), placeByHero: byHero.join(' / '), reasons, rounds: mean(games.map((g) => g.rounds)), actions: mean(games.map((g) => g.actions)) });
    }
    console.table(table);
  }, 3_600_000);
});
