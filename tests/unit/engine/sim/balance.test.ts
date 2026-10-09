/**
 * Balance sweep (E5, E6): whole games with bot_warden in every seat. Skipped unless WW_SIM=1 — it
 * plays hundreds of games. WW_SIM_GAMES sets the games per (difficulty, hero) cell (default 6;
 * the hand-off numbers used 42, bosses rotated evenly) and per (difficulty, seat count) co-op cell
 * (× 2). It prints the tables and checks only what must always hold: every game finishes, no plan
 * action is ever illegal, and the difficulties keep their order. The win-rate targets (solo and
 * every co-op seat count: candlelit ≥ 85%, dusk 55-70%, midnight 30-45%, witching hour 15-30%)
 * need far more games than a test run.
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
/** Hero line-ups per co-op seat count: the 6 pairs, the 4 trios, the 4 rotations of all four. */
const LINEUPS: Record<number, string[][]> = {
  2: HEROES.flatMap((a, i) => HEROES.slice(i + 1).map((b) => [a, b])),
  3: HEROES.map((_, skip) => HEROES.filter((__, i) => i !== skip)),
  4: HEROES.map((_, r) => [...HEROES.slice(r), ...HEROES.slice(0, r)]),
};

function rate(results: readonly SimGameResult[], won: (r: SimGameResult) => boolean): number {
  return results.length === 0 ? 0 : Math.round((100 * results.filter(won).length) / results.length);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round((10 * values.reduce((a, b) => a + b, 0)) / values.length) / 10;
}

/** A solo row; `carried` = games whose regular Nights left Dread on the Hour Candle for the Boss Night (§13.6). */
function soloRow(difficulty: DifficultyId, hero: string, games: readonly SimGameResult[]): Record<string, string | number> {
  return {
    difficulty,
    hero,
    games: games.length,
    win: rate(games, (g) => g.outcome === 'victory'),
    dreadIntoBoss: mean(games.map((g) => g.dreadAtBossNight ?? 0)),
    carried: rate(games, (g) => (g.dreadAtBossNight ?? 0) > 0),
    rounds: mean(games.map((g) => g.rounds)),
    actions: mean(games.map((g) => g.actions)),
  };
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
        table.push(soloRow(difficulty, hero, games));
      }
      byDifficulty.push(rate(all, (g) => g.outcome === 'victory'));
      table.push(soloRow(difficulty, 'ALL', all));
    }
    console.table(table);
    // A harder difficulty never wins clearly more often: two standard errors of the difference
    // between two win rates of 4 × GAMES games each (≈ 140 / √n points).
    const tolerance = 140 / Math.sqrt(4 * GAMES);
    for (let i = 1; i < byDifficulty.length; i++) expect(byDifficulty[i]).toBeLessThanOrEqual(byDifficulty[i - 1] + tolerance);
  }, 3_600_000);

  it('Vigil co-op, 2-4 bot_warden seats, short: win rate, Boss Night rounds, Dread carried into it', () => {
    const table: Array<Record<string, string | number>> = [];
    for (const seats of [2, 3, 4]) {
      const lineups = LINEUPS[seats];
      for (const difficulty of DIFFICULTIES) {
        // Bosses rotate fastest, so every line-up meets every boss.
        const games = Array.from({ length: GAMES * 2 }, (_, i) =>
          simulateGame({
            mode: 'vigil',
            length: 'short',
            difficulty,
            seats: lineups[Math.floor(i / BOSSES.length) % lineups.length].map((hero) => ({ kind: 'bot_warden' as const, hero })),
            seed: `co${seats}-${difficulty}-${i}`,
            overrides: { boss_choice: BOSSES[i % BOSSES.length] },
          }),
        );
        for (const g of games) expect(g.finished && g.replans === 0).toBe(true);
        table.push({
          seats,
          difficulty,
          games: games.length,
          win: rate(games, (g) => g.outcome === 'victory'),
          bossRounds: mean(games.map((g) => g.bossRounds)),
          dreadIntoBoss: mean(games.map((g) => g.dreadAtBossNight ?? 0)),
          rounds: mean(games.map((g) => g.rounds)),
          actions: mean(games.map((g) => g.actions)),
        });
      }
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
