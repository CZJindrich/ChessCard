/** Hero Powers (GDD §6.6, §8.1): cost, once per seat turn, not while Smoldering, targeting. */
import { describe, expect, it } from 'vitest';
import { powerTargets, sq, validateAction } from '../../../src/engine';
import type { CardTargetChoice, GameState } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import { act, blankScenario, candleAt, enemyAt, eventsOf, heroPiece, lockMelee, optionSquares, unitAt } from './helpers';

function piece(id: string): CardTargetChoice {
  return { kind: 'piece', pieceId: id };
}

function usePower(s: GameState, targets: CardTargetChoice[]) {
  return act(s, { type: 'use_power', seat: 0, targets });
}

describe('lantern_oath (Brannoc, 2 Flame)', () => {
  it('Brannoc and every adjacent ally gain Ward; once per seat turn; costs 2', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const near = unitAt(s, 'taper', 'd3');
    const far = unitAt(s, 'taper', 'f5');
    const candle = candleAt(s, 'c3');
    const info = powerTargets(s, 0);
    expect(info).toMatchObject({ playable: true, cost: 2, steps: 0 });
    expect(info.preview?.statuses?.map((st) => st.pieceId).sort()).toEqual([heroPiece(s, 0).id, near.id].sort());
    const { state, events } = usePower(s, []);
    expect(heroPiece(state, 0).ward).toBe(true);
    expect(state.pieces[near.id].ward).toBe(true);
    expect(state.pieces[far.id].ward).toBe(false);
    expect(state.pieces[candle.id].ward).toBe(false);
    expect(state.players[0].flame).toBe(1);
    expect(eventsOf(events, 'power_used')[0]).toMatchObject({ powerId: 'lantern_oath', cost: 2 });
    expect(powerTargets(state, 0)).toMatchObject({ playable: false, reason: 'POWER_USED' });
    expect(heroPiece(state, 0).movesLeft).toBe(1);
  });

  it('needs the Flame and a standing hero', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.players[0].flame = 1;
    expect(powerTargets(s, 0)).toMatchObject({ playable: false, reason: 'NEED_FLAME', params: { n: 2 } });
    s.players[0].flame = 3;
    dealDamage(makeCtx(s), heroPiece(s, 0), 20, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(validateAction(s, { type: 'use_power', seat: 0, targets: [] })).toMatchObject({ ok: false, reason: 'HERO_SMOLDERING' });
  });
});

describe('flutterswap (Velveteen, 2 Flame)', () => {
  it('two picks within 3 (single-tile, non-structure, swappable); swaps them; intents move with attackers', () => {
    const s = blankScenario('moth_witch', 'd2');
    const sootling = enemyAt(s, 'sootling', 'd4');
    lockMelee(s, sootling, 'd3');
    const taper = unitAt(s, 'taper', 'f3');
    unitAt(s, 'lantern', 'c2');
    unitAt(s, 'bellows_golem', 'b3');
    enemyAt(s, 'sootling', 'h8');
    const first = powerTargets(s, 0);
    expect(first).toMatchObject({ playable: true, step: 0, steps: 2, cost: 2 });
    expect(optionSquares(first)).toEqual(['d2', 'd4', 'f3']);
    const second = powerTargets(s, 0, { chosen: [piece(sootling.id)] });
    expect(second).toMatchObject({ step: 1, steps: 2 });
    expect(optionSquares(second)).toEqual(['d2', 'f3']);
    expect(second.targets.find((t) => t.choice.kind === 'piece' && t.choice.pieceId === taper.id)?.preview.swap).toEqual([sq('d4'), sq('f3')]);
    const after = usePower(s, [piece(sootling.id), piece(taper.id)]).state;
    expect(after.pieces[sootling.id]).toMatchObject({ pos: sq('f3'), lastDisplacedBy: 0 });
    expect(after.pieces[taper.id].pos).toEqual(sq('d4'));
    expect(after.intents[0].tiles).toEqual([sq('f2')]);
    expect(validateAction(s, { type: 'use_power', seat: 0, targets: [piece(sootling.id)] })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('is not playable when Velveteen is the only piece in reach', () => {
    const s = blankScenario('moth_witch', 'd2');
    enemyAt(s, 'sootling', 'h8');
    expect(powerTargets(s, 0)).toMatchObject({ playable: false, reason: 'NO_TARGET' });
  });
});

describe('castle (Wicklow, 1 Flame)', () => {
  it('swaps Wicklow with one of his Lanterns or Wick Mortars anywhere on the board', () => {
    const s = blankScenario('lampwright', 'd2');
    const lantern = unitAt(s, 'lantern', 'h8');
    const mortar = unitAt(s, 'wick_mortar', 'a7');
    unitAt(s, 'taper', 'e2');
    const info = powerTargets(s, 0);
    expect(info.cost).toBe(1);
    expect(optionSquares(info)).toEqual(['a7', 'h8']);
    const after = usePower(s, [piece(lantern.id)]).state;
    expect(heroPiece(after, 0).pos).toEqual(sq('h8'));
    expect(after.pieces[lantern.id].pos).toEqual(sq('d2'));
    expect(after.pieces[mortar.id].pos).toEqual(sq('a7'));
    expect(after.players[0].flame).toBe(2);
  });
});

describe('shadowstep (Vey, 1 Flame)', () => {
  it('moves Vey to an empty tile next to an enemy within 4, keeping her Move', () => {
    const s = blankScenario('ember_duelist', 'd2');
    enemyAt(s, 'sootling', 'd6');
    enemyAt(s, 'sootling', 'h8');
    const info = powerTargets(s, 0);
    const tiles = optionSquares(info);
    expect(tiles).toContain('d5');
    expect(tiles).toContain('e7');
    expect(tiles).not.toContain('g8');
    const { state, events } = usePower(s, [{ kind: 'tile', pos: sq('d5') }]);
    expect(heroPiece(state, 0)).toMatchObject({ pos: sq('d5'), movesLeft: 1, strikesLeft: 1 });
    expect(eventsOf(events, 'piece_moved')[0]).toMatchObject({ kind: 'teleport' });
    expect(info.targets.find((t) => t.pos.x === 3 && t.pos.y === 4)?.preview.moves).toEqual([{ pieceId: heroPiece(s, 0).id, from: sq('d2'), to: sq('d5'), kind: 'teleport' }]);
  });

  it('Soot Fog shortens the reach to 3', () => {
    const s = blankScenario('ember_duelist', 'd2');
    enemyAt(s, 'sootling', 'd6');
    s.activeRules.push({ rule: 'wickfolk_range', delta: -1, value: null, seat: null, source: { kind: 'toll', id: 'soot_fog' }, expires: 'night' });
    expect(powerTargets(s, 0)).toMatchObject({ playable: false, reason: 'NO_TILE' });
  });
});
