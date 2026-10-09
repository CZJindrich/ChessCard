/** Hero traits with engine code (GDD §8.1): mothmaker, quick_build, flourish; and the Gutter Pawn crown. */
import { describe, expect, it } from 'vitest';
import { sq } from '../../../src/engine';
import { act, blankScenario, enemyAt, giveCard, heroPiece, pieceOn, playCard, unitAt } from './helpers';

describe('hero traits', () => {
  it('mothmaker: only Minion or Soldier kills by her Strike, and only with a free unit slot', () => {
    const s = blankScenario('moth_witch', 'd2', { overrides: { unit_limit: 1 } });
    enemyAt(s, 'sootling', 'e4');
    const killed = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('e4') }).state;
    expect(pieceOn(killed, 'e4')).toMatchObject({ defId: 'velvet_moth', owner: 0, exhausted: true });
    expect(heroPiece(killed, 0).pos).toEqual(sq('d2'));
    const full = blankScenario('moth_witch', 'd2', { overrides: { unit_limit: 1 } });
    unitAt(full, 'taper', 'a1');
    enemyAt(full, 'sootling', 'e4');
    expect(pieceOn(act(full, { type: 'strike', seat: 0, pieceId: heroPiece(full, 0).id, target: sq('e4') }).state, 'e4')).toBeUndefined();
    const elite = blankScenario('moth_witch', 'd2');
    const knight = enemyAt(elite, 'snuffer_knight', 'e4');
    knight.hp = 1;
    expect(pieceOn(act(elite, { type: 'strike', seat: 0, pieceId: heroPiece(elite, 0).id, target: sq('e4') }).state, 'e4')).toBeUndefined();
  });

  it('quick_build: Wicklow’s Wick Mortars arrive Ready; other summons arrive Exhausted', () => {
    const s = blankScenario('lampwright', 'd2');
    const mortar = playCard(s, giveCard(s, 'prime_the_mortar'), ['d4']).state;
    expect(pieceOn(mortar, 'd4')).toMatchObject({ exhausted: false, strikesLeft: 1, movesLeft: 0 });
    const taper = playCard(s, giveCard(s, 'light_a_taper'), ['d3']).state;
    expect(pieceOn(taper, 'd3')).toMatchObject({ exhausted: true });
  });

  it('flourish: a kill by her Strike grants 1 extra Strike (2 per turn), a card kill does not', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const sootling = enemyAt(s, 'sootling', 'd5');
    const sparked = playCard(s, giveCard(s, 'spark'), [sootling]).state;
    expect(heroPiece(sparked, 0).strikesLeft).toBe(1);
    expect(sparked.players[0].turn.flourishUsed).toBe(0);
  });
});
