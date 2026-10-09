import { describe, expect, it } from 'vitest';
import { dangerMap, intentQueue, legalMoves, sq, sqName } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { applyDaze, pushPiece } from '../../../src/engine/combat';
import { canReverse, legalPlumeTiles, reverseIntent } from '../../../src/engine/snuff';
import { addRule, makeCtx } from '../../../src/engine/state';
import { getContent } from '../../../src/engine';
import { act, blankScenario, candleAt, enemyAt, eventsOf, heroPiece, pieceOn, setTile, unitAt } from './helpers';

const reg = getContent();

/** Run a Snuff Move from the current position (the state is put into the snuff_move phase). */
function snuffMove(s: GameState) {
  s.phase = 'snuff_move';
  return act(s, { type: 'advance' });
}

/** Resolve the locked intents now. */
function snuffStrike(s: GameState) {
  s.phase = 'snuff_strike';
  s.activeSeat = null;
  return act(s, { type: 'advance' });
}

describe('target choice and movement (§12.1-12.2)', () => {
  it('lethal targets first, then path, HP and reading order', () => {
    const s = blankScenario('sconce_paladin', 'h1');
    candleAt(s, 'c3');
    const weak = candleAt(s, 'e3');
    enemyAt(s, 'sootling', 'd5');
    weak.hp = 1;
    const lethal = snuffMove(s).state;
    expect(lethal.intents[0].targetId).toBe(weak.id);
    expect(sqName(pieceOn(lethal, 'd4')?.pos ?? { x: -1, y: -1 })).toBe('d4');

    const even = blankScenario('sconce_paladin', 'h1');
    const left = candleAt(even, 'c3');
    candleAt(even, 'e3');
    enemyAt(even, 'sootling', 'd5');
    expect(snuffMove(even).state.intents[0].targetId).toBe(left.id);
  });

  it('Snuff avoid Hot Wax and never end a move on a Plume', () => {
    const plain = blankScenario('sconce_paladin', 'h1');
    candleAt(plain, 'd3');
    const a = enemyAt(plain, 'sootling', 'd5');
    expect(sqName(snuffMove(plain).state.pieces[a.id].pos)).toBe('c4');

    const waxed = blankScenario('sconce_paladin', 'h1');
    candleAt(waxed, 'd3');
    setTile(waxed, 'c4', 'hot_wax');
    const b = enemyAt(waxed, 'sootling', 'd5');
    expect(sqName(snuffMove(waxed).state.pieces[b.id].pos)).toBe('d4');

    const plumed = blankScenario('sconce_paladin', 'h1');
    candleAt(plumed, 'd3');
    for (const at of ['c4', 'd4']) plumed.plumes.push({ id: `m${at}`, pos: sq(at), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    const c = enemyAt(plumed, 'sootling', 'd5');
    expect(sqName(snuffMove(plumed).state.pieces[c.id].pos)).toBe('e4');
  });

  it('Snuff treat Chimneys as flagstone; Long Shadows shortens slides', () => {
    const s = blankScenario('sconce_paladin', 'h1');
    setTile(s, 'd4', 'chimney', 0);
    setTile(s, 'h8', 'chimney', 0);
    candleAt(s, 'c3');
    candleAt(s, 'e3').hp = 1;
    const sootling = enemyAt(s, 'sootling', 'd5');
    expect(sqName(snuffMove(s).state.pieces[sootling.id].pos)).toBe('d4');

    const slow = blankScenario('sconce_paladin', 'h1');
    const hound = enemyAt(slow, 'smokehound', 'd5');
    expect(legalMoves(slow, hound.id)).toHaveLength(16);
    addRule(slow, { rule: 'snuff_move_range', delta: -1, value: null, seat: null, source: { kind: 'omen', id: 'long_shadows' }, expires: 'round' });
    expect(legalMoves(slow, hound.id)).toHaveLength(8);
  });

  it('Crown: a Gutter Pawn ending its Snuff Move on rank 1 becomes a Drip Hulk', () => {
    const s = blankScenario('sconce_paladin', 'h4');
    candleAt(s, 'e2');
    setTile(s, 'd3', 'pillar');
    const pawn = enemyAt(s, 'gutter_pawn', 'd2');
    const moved = snuffMove(s).state.pieces[pawn.id];
    expect(sqName(moved.pos)).toBe('d1');
    expect(moved).toMatchObject({ defId: 'drip_hulk', hp: 6, maxHp: 6 });
  });
});

describe('intents (§6.8, §12.3)', () => {
  it('declares in initiative order with queue numbers, text and danger tiles', () => {
    const s = blankScenario('sconce_paladin', 'h1');
    candleAt(s, 'c3');
    enemyAt(s, 'ink_wretch', 'c7');
    enemyAt(s, 'sootling', 'b4');
    const { state, events } = snuffMove(s);
    expect(state.intents.map((i) => i.queue)).toEqual([1, 2]);
    expect(eventsOf(events, 'intent_declared').map((e) => e.queue)).toEqual([1, 2]);
    const queue = intentQueue(state);
    expect(queue[0].text).toBe('Ink Wretch → lances c3 Vigil Candle for 1 (Dread +1)');
    expect(queue[1].text).toBe('Sootling → strikes c3 Vigil Candle for 1 (Dread +1)');
    const danger = dangerMap(state);
    expect(danger['2,2']).toBe(2);
    expect(danger['2,4']).toBe(1);
  });

  it('Eclipse adds 1 to every Snuff intent', () => {
    const s = blankScenario('sconce_paladin', 'h1');
    candleAt(s, 'c3');
    enemyAt(s, 'sootling', 'b4');
    addRule(s, { rule: 'snuff_damage', delta: 1, value: null, seat: null, source: { kind: 'omen', id: 'eclipse' }, expires: 'round' });
    expect(snuffMove(s).state.intents[0].damage).toBe(2);
  });

  it('an aimed intent moves with its attacker when displaced', () => {
    let s = blankScenario('sconce_paladin', 'h1');
    const candle = candleAt(s, 'd3');
    const sootling = enemyAt(s, 'sootling', 'd4');
    s = snuffMove(s).state;
    expect(s.intents[0].tiles).toEqual([sq('d3')]);
    pushPiece(makeCtx(s), s.pieces[sootling.id], { x: 1, y: 0 }, 1, { displacer: 0, credit: 0, sourceId: null });
    const struck = snuffStrike(s).state;
    expect(struck.pieces[candle.id].hp).toBe(3);
    expect(eventsOf(snuffStrike(s).events, 'strike')[0].tiles).toEqual([sq('e3')]);
  });

  it('firstHit lines are retraced at strike time', () => {
    let s = blankScenario('sconce_paladin', 'h1');
    const candle = candleAt(s, 'd3');
    enemyAt(s, 'ink_wretch', 'd7');
    s = snuffMove(s).state;
    expect(intentQueue(s)[0].text).toContain('d3 Vigil Candle');
    const taper = unitAt(s, 'taper', 'd5');
    const after = snuffStrike(s).state;
    expect(after.pieces[taper.id]).toBeUndefined();
    expect(after.pieces[candle.id].hp).toBe(3);
  });

  it('Snuff attacks hit Snuff too (friendly fire); a ring Dazes', () => {
    let s = blankScenario('sconce_paladin', 'd4');
    const monk = enemyAt(s, 'hush_monk', 'd5');
    s = snuffMove(s).state;
    expect(sqName(s.pieces[monk.id].pos)).toBe('d5');
    expect(s.intents[0]).toMatchObject({ kind: 'area', shape: 'ring8', centered: true });
    const ally = enemyAt(s, 'sootling', 'e5');
    const after = snuffStrike(s).state;
    expect(after.pieces[ally.id]).toBeUndefined();
    expect(heroPiece(after, 0)).toMatchObject({ hp: 7, dazed: true });
  });

  it('Ink Wretch pushes its victim 1 along the line; stalwart Brannoc stands firm', () => {
    let s = blankScenario('ember_duelist', 'd3');
    enemyAt(s, 'ink_wretch', 'd6');
    s = snuffMove(s).state;
    const after = snuffStrike(s).state;
    expect(sqName(heroPiece(after, 0).pos)).toBe('d2');
    expect(heroPiece(after, 0).hp).toBe(5);

    let firm = blankScenario('sconce_paladin', 'd3');
    enemyAt(firm, 'ink_wretch', 'd6');
    firm = snuffStrike(snuffMove(firm).state).state;
    expect(sqName(heroPiece(firm, 0).pos)).toBe('d3');
  });

  it('reversal flips melee aims and mirrors artillery; centred intents cannot be reversed', () => {
    let s = blankScenario('sconce_paladin', 'h1');
    candleAt(s, 'd3');
    const sootling = enemyAt(s, 'sootling', 'd4');
    const monk = enemyAt(s, 'hush_monk', 'a8');
    s = snuffMove(s).state;
    expect(canReverse(s, s.pieces[monk.id])).toBe(false);
    expect(canReverse(s, s.pieces[sootling.id])).toBe(true);
    reverseIntent(makeCtx(s), s.pieces[sootling.id], 0);
    const intent = s.intents.find((i) => i.attackerId === sootling.id);
    expect(intent?.tiles).toEqual([sq('d5')]);
    expect(intent?.reversedBy).toBe(0);
  });

  it('a Dazed Snuff loses its locked intent, or declares none at its next Snuff Move', () => {
    let s = blankScenario('sconce_paladin', 'h1');
    candleAt(s, 'd3');
    const sootling = enemyAt(s, 'sootling', 'd4');
    applyDaze(makeCtx(s), s.pieces[sootling.id]);
    expect(s.pieces[sootling.id].dazed).toBe(true);
    s = snuffMove(s).state;
    expect(s.intents).toHaveLength(0);
    expect(s.pieces[sootling.id].dazed).toBe(false);
    s = snuffMove(s).state;
    expect(s.intents).toHaveLength(1);
    applyDaze(makeCtx(s), s.pieces[sootling.id]);
    expect(s.intents).toHaveLength(0);
  });
});

describe('Dread and defeat (§13.1.2, §13.1.5)', () => {
  it('a Candle hit adds 1, a snuffed Candle 1 more; full Dread ends the game at once', () => {
    let s = blankScenario('sconce_paladin', 'h1', { overrides: { dread_max: 8, starting_dread: 6 } });
    const candle = candleAt(s, 'd3');
    candle.hp = 1;
    enemyAt(s, 'sootling', 'd4');
    enemyAt(s, 'sootling', 'h3');
    s = snuffMove(s).state;
    expect(s.intents).toHaveLength(2);
    const { state, events } = snuffStrike(s);
    expect(eventsOf(events, 'dread_changed').map((e) => [e.cause, e.to])).toEqual([
      ['candle_hit', 7],
      ['candle_snuffed', 8],
    ]);
    expect(state.result).toMatchObject({ mode: 'vigil', outcome: 'defeat', finalDread: 8 });
    expect(state.phase).toBe('game_over');
    expect(heroPiece(state, 0).hp).toBe(8);
    expect(eventsOf(events, 'dread_changed')[1].threshold).toBe('long_night_falls');
  });

  it('Dread thresholds are crossed going up', () => {
    let s = blankScenario('sconce_paladin', 'h1', { overrides: { dread_max: 12, starting_dread: 3 } });
    candleAt(s, 'd3');
    enemyAt(s, 'sootling', 'd4');
    s = snuffMove(s).state;
    const events = snuffStrike(s).events;
    expect(eventsOf(events, 'dread_changed')[0]).toMatchObject({ from: 3, to: 4, threshold: 'dimming' });
  });
});

describe('Plumes (§9.4)', () => {
  it('legal tiles: empty flagstone or rubble in the Plume zone, at least 2 from every hero', () => {
    const s = blankScenario('sconce_paladin', 'd4');
    const tiles = legalPlumeTiles(s, reg);
    expect(tiles.every((t) => t.y >= 3)).toBe(true);
    expect(tiles.some((t) => Math.max(Math.abs(t.x - 3), Math.abs(t.y - 3)) < 2)).toBe(false);
    setTile(s, 'h8', 'hot_wax');
    expect(tiles.some((t) => sqName(t) === 'h8')).toBe(true);
    expect(legalPlumeTiles(s, reg).some((t) => sqName(t) === 'h8')).toBe(false);
  });

  it('rise: blocked by a Wickfolk piece (1 damage), smothered by a Snuff, otherwise an enemy rises', () => {
    let s = blankScenario('sconce_paladin', 'a1');
    const squire = unitAt(s, 'sconce_squire', 'c6');
    squire.ward = false;
    const sootling = enemyAt(s, 'sootling', 'e6');
    const old = enemyAt(s, 'ink_wretch', 'h8');
    for (const [id, at] of [
      ['m1', 'c6'],
      ['m2', 'e6'],
      ['m3', 'g6'],
    ]) {
      s.plumes.push({ id, pos: sq(at), enemyId: 'smokehound', order: s.plumes.length + 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    }
    s.phase = 'rise';
    const { state, events } = act(s, { type: 'advance' });
    expect(state.plumes).toHaveLength(0);
    expect(state.pieces[squire.id].hp).toBe(2);
    expect(state.pieces[sootling.id].hp).toBe(1);
    const riser = pieceOn(state, 'g6');
    expect(riser?.defId).toBe('smokehound');
    expect(riser && riser.initiative > state.pieces[old.id].initiative).toBe(true);
    expect(state.intents.some((i) => i.attackerId === riser?.id)).toBe(false);
    expect(eventsOf(events, 'plume_blocked')).toHaveLength(1);
    expect(eventsOf(events, 'plume_rose')).toHaveLength(1);
    expect(state.players[0].stats.plumesBlocked).toBe(1);
  });

  it('Plumes are placed at setup and at the Tallies of rounds 1 to T-2', () => {
    let s = blankScenario('sconce_paladin', 'a1');
    const placedAt: number[] = [];
    for (let round = 1; round <= 4; round++) {
      s.round = round;
      s.plumes = [];
      s.phase = 'tally';
      const r = act(s, { type: 'advance' });
      if (eventsOf(r.events, 'plume_placed').length > 0) placedAt.push(round);
      s = r.state;
      if (s.phase !== 'omen' && s.phase !== 'snuff_move') break;
    }
    expect(placedAt).toEqual([1, 2]);
  });
});
