/**
 * Last Flame derived config beyond the §13.2.8 table (resolve.test.ts): the Gloam schedule rule
 * for every Night count and round count, and truce Nights agreeing with the engine.
 */
import { describe, expect, it } from 'vitest';
import { defaultRuleValues, deriveConfig, gloamSchedule } from '../../../src/config';
import { getContent, truceForNight } from '../../../src/engine';
import type { SeatConfig, TruceSetting } from '../../../src/engine';

const rules = getContent().rules;
const seats = (n: number): SeatConfig[] => Array.from({ length: n }, (_, i) => ({ kind: i === 0 ? 'human' : 'bot_warden', hero: null, name: `S${i}` }));

describe('Gloam schedule rule (§13.2.8)', () => {
  for (const size of ['10x10', '12x12'] as const) {
    it(`${size}: C − 1 closings at the last Dawns, the rest at boss rounds 1, 2, …, the last at boss round 3`, () => {
      const closings = rules.gloam.closings[size];
      const edge = size === '10x10' ? 10 : 12;
      for (let nights = 2; nights <= 8; nights++) {
        for (let turns = 3; turns <= 6; turns++) {
          const schedule = gloamSchedule(size, nights, turns, rules);
          const regular = nights - 1;
          const atDawn = Math.min(closings - 1, regular);
          expect(schedule).toHaveLength(closings);
          schedule.forEach((c, i) => {
            expect(c.ring).toBe(i);
            expect(c.openSize).toBe(edge - 2 * (i + 1));
            if (i < atDawn) expect(c).toMatchObject({ night: regular - atDawn + 1 + i, round: turns, atDawn: true });
            else if (i < closings - 1) expect(c).toMatchObject({ night: nights, round: i - atDawn + 1, atDawn: false });
            else expect(c).toMatchObject({ night: nights, round: rules.gloam.finalRound, atDawn: false });
          });
          expect(schedule.at(-1)?.openSize).toBe(4);
        }
      }
    });
  }
});

describe('truce Nights', () => {
  it('the Setup summary and the engine agree for every setting and Night count', () => {
    for (const truce of ['off', 'night_1', 'nights_1_2'] as TruceSetting[]) {
      for (let nights = 2; nights <= 8; nights++) {
        const values = { ...defaultRuleValues(), mode: 'last_flame' as const, seats: seats(2), truce, nights };
        const engineNights = Array.from({ length: nights }, (_, i) => i + 1).filter((n) => truceForNight(values, n));
        expect(deriveConfig(values).truceNights, `${truce} over ${nights}`).toEqual(engineNights);
      }
    }
  });
});
