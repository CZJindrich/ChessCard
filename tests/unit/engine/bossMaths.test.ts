/**
 * Boss HP and phase thresholds (GDD §10.1, Appendix B.6) for P = 1-4 and every difficulty:
 * Vigil round_half_up(solo HP × P × boss_hp_multiplier) with solo HP = base + perPlayer, Last
 * Flame round_half_up((base + perPlayer × P) × boss_hp_multiplier); the phase thresholds
 * ⌊max HP × 2/3⌋ and ⌊max HP × 1/3⌋; and the HP a real Boss Night spawns with.
 */
import { describe, expect, it } from 'vitest';
import { bossMaxHp, bossPhaseForHp, getContent, mergeMod, phaseThreshold } from '../../../src/engine';
import type { DifficultyId } from '../../../src/engine';
import { bossSoloHp, vigilBossMaxHp } from '../../../src/engine/bosses';
import { BOSSES, bossNight } from './bossHelpers';

const reg = getContent();
const DIFFICULTIES: DifficultyId[] = ['candlelit', 'dusk', 'midnight', 'witching_hour'];

/** round_half_up(raw × multiplier) in exact integer arithmetic: hundredths of the multiplier. */
function scaled(raw: number, multiplierHundredths: number): number {
  const total = raw * multiplierHundredths;
  return Math.floor(total / 100) + (total % 100 >= 50 ? 1 : 0);
}

/** Last Flame: (base + perPlayer × P) × multiplier. */
function expectedHp(base: number, perPlayer: number, players: number, multiplierHundredths: number): number {
  return scaled(base + perPlayer * players, multiplierHundredths);
}

/** Vigil: solo HP × P × multiplier (each seat adds the whole solo HP, `coopScaling.bossHpPerExtraSeat` = 1). */
function expectedVigilHp(base: number, perPlayer: number, seats: number, multiplierHundredths: number): number {
  return scaled((base + perPlayer) * seats, multiplierHundredths);
}

describe('boss HP (§10.1)', () => {
  it('the GDD examples: (25 + 10) × 1.3 = 45.5 → 46 (half rounds up); 2 seats at dusk = 70', () => {
    const bell = reg.bosses.byId.hush_hierophant;
    expect(bossSoloHp(bell)).toBe(35);
    expect(vigilBossMaxHp(bell, 1, reg.rules.coopScaling.bossHpPerExtraSeat, 1.3)).toBe(46);
    expect(bossMaxHp(bell, 1, 1.3)).toBe(46);
    expect(vigilBossMaxHp(bell, 2, reg.rules.coopScaling.bossHpPerExtraSeat, 1)).toBe(70);
  });

  it('Vigil co-op share: each extra seat adds that share of the solo HP (0 = no growth, 0.5 = half)', () => {
    const king = reg.bosses.byId.guttered_king;
    expect([1, 2, 3, 4].map((p) => vigilBossMaxHp(king, p, 0, 1))).toEqual([60, 60, 60, 60]);
    expect([1, 2, 3, 4].map((p) => vigilBossMaxHp(king, p, 0.5, 1))).toEqual([60, 90, 120, 150]);
    expect([1, 2, 3, 4].map((p) => vigilBossMaxHp(king, p, 0.75, 1.15))).toEqual([69, 121, 173, 224]);
  });

  for (const bossId of BOSSES) {
    for (const difficulty of DIFFICULTIES) {
      it(`${bossId} on ${difficulty} for P = 1..4`, () => {
        const def = reg.bosses.byId[bossId];
        const multiplier = reg.difficulty.byId[difficulty].values.boss_hp_multiplier;
        const hundredths = Math.round(multiplier * 100);
        for (let players = 1; players <= 4; players++) {
          expect(vigilBossMaxHp(def, players, reg.rules.coopScaling.bossHpPerExtraSeat, multiplier)).toBe(expectedVigilHp(def.hp.base, def.hp.perPlayer, players, hundredths));
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
      expect(s.boss).toMatchObject({ id: 'guttered_king', phase: 1, crowns: 0, players, maxHp: expectedVigilHp(base, perPlayer, players, 115) });
      expect(s.pieces[s.boss?.pieceId ?? '']).toMatchObject({ kind: 'boss', size: 2, hp: s.boss?.maxHp });
    });
  }

  it('Vigil: a mod can change the co-op share (rules.coopScaling.bossHpPerExtraSeat)', () => {
    const modded = mergeMod(reg, { rules: { coopScaling: { bossHpPerExtraSeat: 0.5 } } });
    expect(modded.errors).toEqual([]);
    const king = modded.registry.bosses.byId.guttered_king;
    expect(vigilBossMaxHp(king, 3, modded.registry.rules.coopScaling.bossHpPerExtraSeat, 1)).toBe(120);
  });

  it('Last Flame: P = heroes not eliminated at the start of the Boss Night (minimum 1)', () => {
    const s = bossNight({ boss: 'nocturna', seats: 3, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } });
    const { base, perPlayer } = reg.bosses.byId.nocturna.hp;
    expect(s.boss).toMatchObject({ players: 3, maxHp: base + perPlayer * 3 });
  });
});
