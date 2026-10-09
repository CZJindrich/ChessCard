/**
 * Boss HP and phase thresholds (GDD §10.1, Appendix B.6): round_half_up((base + perPlayer × P)
 * × boss_hp_multiplier) for P = 1-4 and every difficulty, the phase thresholds ⌊max HP × 2/3⌋ and
 * ⌊max HP × 1/3⌋, and the HP a real Boss Night spawns with.
 */
import { describe, expect, it } from 'vitest';
import { bossMaxHp, bossPhaseForHp, getContent, phaseThreshold } from '../../../src/engine';
import type { DifficultyId } from '../../../src/engine';
import { BOSSES, bossNight } from './bossHelpers';

const reg = getContent();
const DIFFICULTIES: DifficultyId[] = ['candlelit', 'dusk', 'midnight', 'witching_hour'];

/** The formula in exact integer arithmetic: hundredths of the multiplier, half rounds up. */
function expectedHp(base: number, perPlayer: number, players: number, multiplierHundredths: number): number {
  const scaled = (base + perPlayer * players) * multiplierHundredths;
  return Math.floor(scaled / 100) + (scaled % 100 >= 50 ? 1 : 0);
}

describe('boss HP (§10.1)', () => {
  it('the GDD formula example: (18 + 12) × 1.15 = 34.5 → 35 (half rounds up)', () => {
    const king = { ...reg.bosses.byId.guttered_king, hp: { base: 18, perPlayer: 12 } };
    expect(bossMaxHp(king, 1, 1.15)).toBe(35);
  });

  for (const bossId of BOSSES) {
    for (const difficulty of DIFFICULTIES) {
      it(`${bossId} on ${difficulty} for P = 1..4`, () => {
        const def = reg.bosses.byId[bossId];
        const multiplier = reg.difficulty.byId[difficulty].values.boss_hp_multiplier;
        const hundredths = Math.round(multiplier * 100);
        for (let players = 1; players <= 4; players++) {
          const hp = bossMaxHp(def, players, multiplier);
          expect(hp).toBe(expectedHp(def.hp.base, def.hp.perPlayer, players, hundredths));
          expect(phaseThreshold(hp, [2, 3])).toBe(Math.floor((hp * 2) / 3));
          expect(phaseThreshold(hp, [1, 3])).toBe(Math.floor(hp / 3));
          const two = Math.floor((hp * 2) / 3);
          const three = Math.floor(hp / 3);
          expect(bossPhaseForHp(def, hp, hp)).toBe(1);
          expect(bossPhaseForHp(def, hp, two + 1)).toBe(1);
          expect(bossPhaseForHp(def, hp, two)).toBe(2);
          expect(bossPhaseForHp(def, hp, three + 1)).toBe(2);
          expect(bossPhaseForHp(def, hp, three)).toBe(3);
          expect(bossPhaseForHp(def, hp, 1)).toBe(3);
        }
      });
    }
  }

  it('every multiplier step from 0.50 to 2.00 rounds half up exactly', () => {
    const def = reg.bosses.byId.nocturna;
    for (let hundredths = 50; hundredths <= 200; hundredths += 5) {
      for (let players = 1; players <= 4; players++) {
        expect(bossMaxHp(def, players, hundredths / 100)).toBe(expectedHp(def.hp.base, def.hp.perPlayer, players, hundredths));
      }
    }
  });
});

describe('a Boss Night spawns the boss with P from the seats', () => {
  for (const players of [1, 2, 3, 4]) {
    it(`Vigil, ${players} seat(s), midnight`, () => {
      const s = bossNight({ boss: 'guttered_king', seats: players, overrides: { difficulty: 'midnight', boss_hp_multiplier: 1.15 } });
      const { base, perPlayer } = reg.bosses.byId.guttered_king.hp;
      expect(s.boss).toMatchObject({ id: 'guttered_king', phase: 1, crowns: 0, players, maxHp: expectedHp(base, perPlayer, players, 115) });
      expect(s.pieces[s.boss?.pieceId ?? '']).toMatchObject({ kind: 'boss', size: 2, hp: s.boss?.maxHp });
    });
  }

  it('Last Flame: P = heroes not eliminated at the start of the Boss Night (minimum 1)', () => {
    const s = bossNight({ boss: 'nocturna', seats: 3, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } });
    const { base, perPlayer } = reg.bosses.byId.nocturna.hp;
    expect(s.boss).toMatchObject({ players: 3, maxHp: base + perPlayer * 3 });
  });
});
