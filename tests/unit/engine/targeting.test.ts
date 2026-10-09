/** Card targeting rules: card limits, Smoldering heroes, choice normalisation, Gloam, ranges. */
import { describe, expect, it } from 'vitest';
import { cardTargets, freeActionTargets, previewMoveDanger, sq, sqName, validateAction } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { makeCtx, setPlayersPhaseCardLimit } from '../../../src/engine/state';
import { act, blankScenario, enemyAt, giveCard, heroPiece, lockMelee, optionSquares, playCard, unitAt } from './helpers';

function fell(s: GameState): void {
  dealDamage(makeCtx(s), heroPiece(s, 0), 50, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
}

describe('card limits', () => {
  it('Silencing Peal (a boss rule for the next players phase) limits each seat to 1 card, then expires', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    setPlayersPhaseCardLimit(s, 1, { kind: 'boss', id: 'silencing_peal' });
    const after = playCard(s, giveCard(s, 'quickwick'), [heroPiece(s, 0)]).state;
    expect(cardTargets(after, 0, giveCard(after, 'quickwick'))).toMatchObject({ playable: false, reason: 'CARD_LIMIT', params: { source: 'Silencing Peal' } });
    const ended = act(after, { type: 'end_turn', seat: 0 }).state;
    expect(ended.activeRules.some((r) => r.rule === 'card_limit')).toBe(false);
  });

  it('Hero Powers and free actions do not count toward the card limit', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.activeRules.push({ rule: 'card_limit', delta: 0, value: 1, seat: null, source: { kind: 'toll', id: 'muffled_nave' }, expires: 'night' });
    const after = playCard(s, giveCard(s, 'quickwick'), [heroPiece(s, 0)]).state;
    expect(validateAction(after, { type: 'use_power', seat: 0, targets: [] })).toEqual({ ok: true });
    unitAt(after, 'taper', 'a1');
    expect(freeActionTargets(after, 0, 'melt').playable).toBe(true);
  });
});

describe('Smoldering heroes (§7.1)', () => {
  it('cards counting from the hero, Charms on the hero and summons next to it are blocked; board-wide cards are not', () => {
    const s = blankScenario('moth_witch', 'd2');
    unitAt(s, 'velvet_moth', 'h8');
    fell(s);
    expect(cardTargets(s, 0, giveCard(s, 'spark'))).toMatchObject({ playable: false, reason: 'HERO_SMOLDERING' });
    expect(cardTargets(s, 0, giveCard(s, 'cocoon'))).toMatchObject({ playable: false, reason: 'HERO_SMOLDERING' });
    s.players[0].flame = 4;
    expect(cardTargets(s, 0, giveCard(s, 'swarm_of_wings'))).toMatchObject({ playable: false, reason: 'HERO_SMOLDERING' });
    const paladin = blankScenario('sconce_paladin', 'd2');
    fell(paladin);
    expect(cardTargets(paladin, 0, giveCard(paladin, 'oath_of_tallow'))).toMatchObject({ playable: false, reason: 'HERO_SMOLDERING' });
    expect(cardTargets(paladin, 0, giveCard(paladin, 'aegis_of_dawn')).playable).toBe(true);
    const wicklow = blankScenario('lampwright', 'd2');
    const lantern = unitAt(wicklow, 'lantern', 'h8');
    fell(wicklow);
    expect(cardTargets(wicklow, 0, giveCard(wicklow, 'lens_of_brass')).targets.map((t) => t.choice)).toEqual([{ kind: 'piece', pieceId: lantern.id }]);
  });
});

describe('choices', () => {
  it('a tile choice on a target piece is accepted; extra or missing choices are not', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd4');
    const uid = giveCard(s, 'spark');
    const viaTile = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'tile', pos: sq('d4') }] }).state;
    expect(viaTile.pieces[hound.id].hp).toBe(1);
    expect(validateAction(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [] })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
    expect(
      validateAction(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: hound.id }, { kind: 'piece', pieceId: hound.id }] }),
    ).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
    const board = giveCard(s, 'aegis_of_dawn');
    expect(validateAction(s, { type: 'play_card', seat: 0, cardUid: board, targets: [{ kind: 'piece', pieceId: hound.id }] })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('summons never land in the Gloam or on a Plume; Velvet Pull cannot target a piece immune to pulls', () => {
    const s = blankScenario('moth_witch', 'd2');
    s.board.tiles[sq('d3').y * s.board.w + sq('d3').x].gloam = true;
    const summon = optionSquares(cardTargets(s, 0, giveCard(s, 'loose_a_moth')));
    expect(summon).not.toContain('d3');
    expect(summon).toContain('e3');
    enemyAt(s, 'smokestack', 'd5');
    expect(cardTargets(s, 0, giveCard(s, 'velvet_pull'))).toMatchObject({ playable: false, reason: 'IMMUNE' });
  });

  it('multi-step answers report the step, the remaining picks and the range ring of the current pick', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    enemyAt(s, 'sootling', 'b4');
    const uid = giveCard(s, 'sunshield_charge');
    const first = cardTargets(s, 0, uid);
    expect(first).toMatchObject({ step: 0, steps: 2, optional: false, complete: false, rangeRing: { centre: sq('d2'), radius: 3 } });
    const second = cardTargets(s, 0, uid, { chosen: [{ kind: 'tile', pos: sq('c3') }] });
    expect(second).toMatchObject({ step: 1, steps: 2, optional: true, complete: false, rangeRing: { centre: sq('c3'), radius: 1 } });
    expect(second.targets.map((t) => sqName(t.pos))).toEqual(['b4']);
    expect(cardTargets(s, 0, uid, { chosen: [{ kind: 'tile', pos: sq('h8') }] })).toMatchObject({ playable: false, reason: 'INVALID_TARGET' });
  });
});

describe('previewMoveDanger', () => {
  it('runs the Snuff Strike preview with the piece on the hypothetical tile (Ward included)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd4');
    lockMelee(s, hound, 'd3');
    const hero = heroPiece(s, 0).id;
    expect(previewMoveDanger(s, hero, sq('d3'))).toEqual({ damage: 1, blockedByWard: false, lethal: false });
    expect(previewMoveDanger(s, hero, sq('c2'))).toEqual({ damage: 0, blockedByWard: false, lethal: false });
    heroPiece(s, 0).ward = true;
    expect(previewMoveDanger(s, hero, sq('d3'))).toEqual({ damage: 0, blockedByWard: true, lethal: false });
  });
});
