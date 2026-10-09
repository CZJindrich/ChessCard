/**
 * Last Flame truce (§13.2.3) as the player-side rules see it. The Last Flame engineer owns the
 * truce state; here `isTruceActive` is mocked to true for the whole file.
 */
import { describe, expect, it, vi } from 'vitest';
import { cardTargets, legalStrikes, powerTargets, sq, validateAction } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { removePiece } from '../../../src/engine/state';
import { act, enemyAt, giveCard, heroPiece, newGame, optionSquares, playCard, toPlayers, unitAt } from './helpers';

vi.mock('../../../src/engine/modes/lastFlame', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/engine/modes/lastFlame')>();
  return { ...original, isTruceActive: () => true };
});

/** Last Flame, 2 humans, seat 0 acting, empty flagstone board; heroes on the given squares. */
function lfScenario(hero0: string, at0: string, hero1: string, at1: string): GameState {
  const s = toPlayers(newGame({ mode: 'last_flame', seats: [{ kind: 'human', hero: hero0 }, { kind: 'human', hero: hero1 }], overrides: { moth_die: false } }));
  for (const p of Object.values(s.pieces)) if (p.kind !== 'hero') removePiece(s, p.id);
  s.plumes = [];
  s.intents = [];
  for (const t of s.board.tiles) {
    t.type = 'flagstone';
    t.chimneyPair = null;
  }
  heroPiece(s, 0).pos = sq(at0);
  heroPiece(s, 1).pos = sq(at1);
  Object.assign(heroPiece(s, 0), { movesLeft: 1, strikesLeft: 1, exhausted: false });
  expect(s.activeSeat).toBe(0);
  return s;
}

describe('truce', () => {
  it('rivals cannot be chosen as card targets (TRUCE) and area effects skip them', () => {
    const s = lfScenario('ember_duelist', 'd2', 'sconce_paladin', 'd4');
    expect(cardTargets(s, 0, giveCard(s, 'spark'))).toMatchObject({ playable: false, reason: 'TRUCE' });
    const sootling = enemyAt(s, 'sootling', 'e4');
    expect(optionSquares(cardTargets(s, 0, giveCard(s, 'spark')))).toEqual(['e4']);
    s.players[0].flame = 3;
    const flared = playCard(s, giveCard(s, 'flare'), ['d4']).state;
    expect(flared.pieces[sootling.id]).toBeUndefined();
    expect(heroPiece(flared, 1).hp).toBe(8);
  });

  it('strikes cannot hit rivals', () => {
    const s = lfScenario('ember_duelist', 'd2', 'sconce_paladin', 'e3');
    expect(legalStrikes(s, heroPiece(s, 0).id)).toHaveLength(0);
    expect(validateAction(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('e3') })).toMatchObject({ ok: false, reason: 'TRUCE' });
  });

  it('a push that would bump a rival stops short without the bump', () => {
    const s = lfScenario('sconce_paladin', 'd2', 'ember_duelist', 'd5');
    const hulk = enemyAt(s, 'drip_hulk', 'd3');
    const after = playCard(s, giveCard(s, 'shield_bash'), [hulk]).state;
    expect(after.pieces[hulk.id]).toMatchObject({ pos: sq('d4'), hp: 4 });
    expect(heroPiece(after, 1).hp).toBe(6);
  });

  it('Flutterswap cannot pick a rival; own pieces and Snuff are fine', () => {
    const s = lfScenario('moth_witch', 'd2', 'sconce_paladin', 'd3');
    const taper = unitAt(s, 'taper', 'e2');
    enemyAt(s, 'sootling', 'f4');
    const info = powerTargets(s, 0);
    expect(optionSquares(info)).toEqual(['d2', 'e2', 'f4']);
    expect(act(s, { type: 'use_power', seat: 0, targets: [{ kind: 'piece', pieceId: heroPiece(s, 0).id }, { kind: 'piece', pieceId: taper.id }] }).state.pieces[taper.id].pos).toEqual(sq('d2'));
  });
});
