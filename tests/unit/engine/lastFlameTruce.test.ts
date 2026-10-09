/**
 * The truce (GDD §13.2.3, §6.4, §7.1) with the real truce state: which Nights it covers, and the
 * matrix of what a player may not do to a rival during it (target, damage, push, pull, swap,
 * Daze, Burn, bump), while area effects skip rivals and a Snuff redirected onto a rival is
 * allowed but earns no Glory and no Bounty.
 */
import { describe, expect, it } from 'vitest';
import { cardTargets, isTruceActive, legalStrikes, powerTargets, sq, truceForNight, validateAction } from '../../../src/engine';
import type { GameState, TruceSetting } from '../../../src/engine';
import { act, enemyAt, eventsOf, giveCard, heroPiece, lockMelee, optionSquares, playCard } from './helpers';
import { advanceUntil, lfGame, lfScenario } from './lastFlameHelpers';

/** End every remaining seat turn of the players phase, then resolve the Snuff Strike. */
function strikeOut(s: GameState): ReturnType<typeof act> {
  let state = s;
  while (state.phase === 'players' && state.activeSeat !== null) state = act(state, { type: 'end_turn', seat: state.activeSeat }).state;
  expect(state.phase).toBe('snuff_strike');
  return act(state, { type: 'advance' });
}

describe('truce Nights', () => {
  const cases: Array<[TruceSetting, number, boolean[]]> = [
    ['off', 4, [false, false, false, false]],
    ['night_1', 4, [true, false, false, false]],
    ['nights_1_2', 4, [true, true, false, false]],
    ['nights_1_2', 2, [true, false]],
  ];
  for (const [truce, nights, expected] of cases) {
    it(`${truce} over ${nights} Nights (the Boss Night never has one)`, () => {
      const config = { mode: 'last_flame' as const, truce, nights };
      expect(expected.map((_, i) => truceForNight(config, i + 1))).toEqual(expected);
    });
  }

  it('the state follows the Nights of a real game', () => {
    let s = lfGame({ seats: 2, length: 'standard', overrides: { truce: 'nights_1_2', neutrals: 'off' } });
    const seen: boolean[] = [isTruceActive(s)];
    for (const night of [2, 3, 4]) {
      s = advanceUntil(s, (q) => q.night === night && q.phase === 'night_setup');
      seen.push(isTruceActive(s));
    }
    expect(seen).toEqual([true, true, false, false]);
    expect(s.isBossNight).toBe(true);
  });
});

describe('truce matrix (Night 1, truce night_1)', () => {
  it('no targeting: strikes and single-target cards refuse rivals with TRUCE', () => {
    const s = lfScenario(['d4', 'e5']);
    expect(isTruceActive(s)).toBe(true);
    const brannoc = heroPiece(s, 0);
    expect(legalStrikes(s, brannoc.id)).toHaveLength(0);
    expect(validateAction(s, { type: 'strike', seat: 0, pieceId: brannoc.id, target: sq('e5') })).toMatchObject({ ok: false, reason: 'TRUCE' });
    expect(cardTargets(s, 0, giveCard(s, 'spark'))).toMatchObject({ playable: false, reason: 'TRUCE' });
    expect(cardTargets(s, 0, giveCard(s, 'shield_bash'))).toMatchObject({ playable: false, reason: 'TRUCE' });
  });

  it('no pull, Daze or swap: Velvet Pull, Moth Dust and Flutterswap skip rivals', () => {
    const s = lfScenario(['d4', 'f5'], { overrides: { truce: 'night_1' } });
    // Seat 1 (the Moth Witch) acts against seat 0 (Brannoc).
    const s1 = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s1.activeSeat).toBe(1);
    s1.players[1].flame = 5;
    expect(cardTargets(s1, 1, giveCard(s1, 'velvet_pull', { seat: 1 }))).toMatchObject({ playable: false, reason: 'TRUCE' });
    expect(cardTargets(s1, 1, giveCard(s1, 'moth_dust', { seat: 1 }))).toMatchObject({ playable: false, reason: 'TRUCE' });
    const sootling = enemyAt(s1, 'sootling', 'g6');
    expect(optionSquares(powerTargets(s1, 1))).toEqual(['f5', 'g6']);
    expect(optionSquares(cardTargets(s1, 1, giveCard(s1, 'moth_dust', { seat: 1 })))).toEqual(['g6']);
    expect(s1.pieces[sootling.id]).toBeDefined();
  });

  it('area effects skip rivals (no damage) and still hit Snuff and Plumes', () => {
    const s = lfScenario(['d2', 'd4']);
    const sootling = enemyAt(s, 'sootling', 'e4');
    const { state, events } = playCard(s, giveCard(s, 'flare'), ['d4']);
    expect(state.pieces[sootling.id]).toBeUndefined();
    expect(heroPiece(state, 1).hp).toBe(heroPiece(s, 1).maxHp);
    expect(eventsOf(events, 'damage').map((e) => e.pieceId)).toEqual([sootling.id]);
  });

  it('no bump: a push that would bump a rival stops one tile short', () => {
    const s = lfScenario(['d2', 'd5']);
    const hulk = enemyAt(s, 'drip_hulk', 'd3');
    const { state, events } = playCard(s, giveCard(s, 'shield_bash'), [hulk]);
    expect(state.pieces[hulk.id]).toMatchObject({ pos: sq('d4'), hp: 4 });
    expect(heroPiece(state, 1).hp).toBe(heroPiece(s, 1).maxHp);
    expect(eventsOf(events, 'damage').filter((e) => e.cause === 'bump')).toHaveLength(0);
  });

  it('after the truce the same push bumps the rival', () => {
    const s = lfScenario(['d2', 'd5'], { overrides: { truce: 'off' } });
    const hulk = enemyAt(s, 'drip_hulk', 'd3');
    const { state, events } = playCard(s, giveCard(s, 'shield_bash'), [hulk]);
    expect(eventsOf(events, 'damage').filter((e) => e.cause === 'bump').map((e) => e.pieceId)).toEqual([hulk.id, heroPiece(s, 1).id]);
    expect(heroPiece(state, 1).hp).toBe(heroPiece(s, 1).maxHp - 1);
  });

  it('redirecting a Snuff onto a rival is allowed but earns no Glory and no Bounty', () => {
    const s = lfScenario(['b2', 'f4'], { overrides: { bounty: true } });
    s.players[1].glory = 6;
    const sootling = enemyAt(s, 'sootling', 'e4');
    lockMelee(s, sootling, 'd4');
    heroPiece(s, 1).hp = 1;
    const turned = playCard(s, giveCard(s, 'turnabout'), [sootling]).state;
    const { state, events } = strikeOut(turned);
    expect(heroPiece(state, 1).smoldering).toBe(true);
    expect(eventsOf(events, 'glory_changed')).toEqual([{ type: 'glory_changed', seat: 1, from: 6, to: 4, reason: 'hero_fell' }]);
    expect(state.players[0].glory).toBe(0);
    expect(state.lastFlame?.bountiesPaid).toEqual([]);
  });

  it('without a truce the same redirect is a rival kill with the Bounty', () => {
    const s = lfScenario(['b2', 'f4'], { overrides: { truce: 'off', bounty: true } });
    s.players[1].glory = 6;
    const sootling = enemyAt(s, 'sootling', 'e4');
    lockMelee(s, sootling, 'd4');
    heroPiece(s, 1).hp = 1;
    const turned = playCard(s, giveCard(s, 'turnabout'), [sootling]).state;
    const { state, events } = strikeOut(turned);
    expect(eventsOf(events, 'glory_changed').map((e) => [e.seat, e.reason, e.to - e.from])).toEqual([
      [0, 'rival_hero', 3],
      [0, 'bounty', 3],
      [1, 'hero_fell', -2],
    ]);
    expect(state.lastFlame?.bountiesPaid).toEqual([{ victimSeat: 1, night: 1 }]);
  });
});
