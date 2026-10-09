import { describe, expect, it } from 'vitest';
import { legalMoves, legalStrikes, sq, sqName, validateAction } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { applyBurn, applyDaze, dealDamage, pushPiece, swapPieces } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import { act, blankScenario, candleAt, enemyAt, eventsOf, heroPiece, pieceOn, setTile, unitAt } from './helpers';

function names(list: Array<{ x: number; y: number }>): string[] {
  return list.map(sqName).sort();
}

describe('movement (§5.2)', () => {
  it('king step, one Move per turn', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hero = heroPiece(s, 0);
    expect(names(legalMoves(s, hero.id))).toEqual(['c1', 'c2', 'c3', 'd1', 'd3', 'e1', 'e2', 'e3']);
    const { state, events } = act(s, { type: 'move', seat: 0, pieceId: hero.id, to: sq('d3') });
    expect(eventsOf(events, 'piece_moved')[0]).toMatchObject({ kind: 'step', from: sq('d2'), to: sq('d3') });
    expect(validateAction(state, { type: 'move', seat: 0, pieceId: hero.id, to: sq('d4') })).toMatchObject({ ok: false, reason: 'NO_MOVE_LEFT' });
  });

  it('slides stop at blockers and in Rubble; leaps ignore pieces in between', () => {
    const s = blankScenario('lampwright', 'a1');
    setTile(s, 'a3', 'rubble');
    unitAt(s, 'taper', 'b1');
    const hero = heroPiece(s, 0);
    expect(names(legalMoves(s, hero.id))).toEqual(['a2', 'a3']);
    const witch = blankScenario('moth_witch', 'b1');
    unitAt(witch, 'taper', 'b2');
    unitAt(witch, 'taper', 'c2');
    expect(names(legalMoves(witch, heroPiece(witch, 0).id))).toEqual(['a3', 'c3', 'd2']);
  });

  it('a Wickfolk move into a Chimney ends on its pair, only while the pair is empty', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    setTile(s, 'd3', 'chimney', 0);
    setTile(s, 'g7', 'chimney', 0);
    const hero = heroPiece(s, 0);
    expect(names(legalMoves(s, hero.id))).toContain('g7');
    expect(names(legalMoves(s, hero.id))).not.toContain('d3');
    const { state, events } = act(s, { type: 'move', seat: 0, pieceId: hero.id, to: sq('g7') });
    expect(eventsOf(events, 'piece_moved')[0].kind).toBe('chimney');
    expect(sqName(heroPiece(state, 0).pos)).toBe('g7');

    const blocked = blankScenario('sconce_paladin', 'd2');
    setTile(blocked, 'd3', 'chimney', 0);
    setTile(blocked, 'g7', 'chimney', 0);
    enemyAt(blocked, 'sootling', 'g7');
    expect(names(legalMoves(blocked, heroPiece(blocked, 0).id))).not.toContain('d3');
    expect(validateAction(blocked, { type: 'move', seat: 0, pieceId: heroPiece(blocked, 0).id, to: sq('d3') })).toMatchObject({
      ok: false,
      reason: 'CHIMNEY_BLOCKED',
    });
    const sootling = enemyAt(blocked, 'sootling', 'c4');
    expect(names(legalMoves(blocked, sootling.id))).toContain('d3');
  });

  it('Hot Wax hurts on ending a move there, not when sliding through', () => {
    const s = blankScenario('ember_duelist', 'b2');
    setTile(s, 'c3', 'hot_wax');
    const hero = heroPiece(s, 0);
    const through = act(s, { type: 'move', seat: 0, pieceId: hero.id, to: sq('d4') });
    expect(heroPiece(through.state, 0).hp).toBe(6);
    const onto = act(s, { type: 'move', seat: 0, pieceId: hero.id, to: sq('c3') });
    expect(heroPiece(onto.state, 0).hp).toBe(5);
    expect(eventsOf(onto.events, 'damage')[0]).toMatchObject({ cause: 'hot_wax', amount: 1 });
  });

  it('moving onto a Plume is allowed (that is how you block it)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.plumes.push({ id: 'm999', pos: sq('d3'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    expect(names(legalMoves(s, heroPiece(s, 0).id))).toContain('d3');
  });
});

describe('strikes and Take (§6.2)', () => {
  it('melee as move: a kill takes the square', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    enemyAt(s, 'sootling', 'd3');
    const options = legalStrikes(s, heroPiece(s, 0).id);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ damage: 2, lethal: true, take: sq('d3') });
    const { state, events } = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('d3') });
    expect(events.map((e) => e.type).filter((t) => t !== 'log')).toEqual(['strike', 'damage', 'piece_died', 'piece_moved']);
    expect(sqName(heroPiece(state, 0).pos)).toBe('d3');
    expect(heroPiece(state, 0).movesLeft).toBe(1);
    expect(state.players[0].stats.kills).toBe(1);
  });

  it('pawns strike diagonally only, and Promotion makes a Taper Captain', () => {
    const s = blankScenario('sconce_paladin', 'a1');
    const taper = unitAt(s, 'taper', 'd4');
    enemyAt(s, 'sootling', 'd5');
    enemyAt(s, 'sootling', 'e5');
    expect(legalStrikes(s, taper.id).map((o) => sqName(o.target))).toEqual(['e5']);
    const { state, events } = act(s, { type: 'strike', seat: 0, pieceId: taper.id, target: sq('e5') });
    const promoted = state.pieces[taper.id];
    expect(promoted).toMatchObject({ defId: 'taper_captain', hp: 2, maxHp: 2, atk: 2 });
    expect(sqName(promoted.pos)).toBe('e5');
    expect(eventsOf(events, 'transformed')).toHaveLength(1);
  });

  it('ranged firstHit lines hit the first piece; allies block; a Plume before the blocker can be popped', () => {
    const s = blankScenario('lampwright', 'd1');
    unitAt(s, 'taper', 'd2');
    enemyAt(s, 'sootling', 'd4');
    enemyAt(s, 'ink_wretch', 'g1');
    s.plumes.push({ id: 'm998', pos: sq('f1'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    const options = legalStrikes(s, heroPiece(s, 0).id);
    expect(options.map((o) => [sqName(o.target), o.isPlume])).toEqual(
      expect.arrayContaining([
        ['g1', false],
        ['f1', true],
      ]),
    );
    expect(options.some((o) => sqName(o.target) === 'd4')).toBe(false);
    const popped = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('f1') });
    expect(popped.state.plumes).toHaveLength(0);
    expect(eventsOf(popped.events, 'plume_popped')).toHaveLength(1);
    expect(sqName(heroPiece(popped.state, 0).pos)).toBe('d1');
  });

  it('artillery ignores line of sight, respects minRange and never Takes', () => {
    const s = blankScenario('lampwright', 'a1');
    const mortar = unitAt(s, 'wick_mortar', 'd2');
    enemyAt(s, 'sootling', 'd3');
    enemyAt(s, 'sootling', 'd5');
    unitAt(s, 'taper', 'd4');
    expect(legalStrikes(s, mortar.id).map((o) => sqName(o.target))).toEqual(['d5']);
    const { state } = act(s, { type: 'strike', seat: 0, pieceId: mortar.id, target: sq('d5') });
    expect(pieceOn(state, 'd5')).toBeUndefined();
    expect(sqName(state.pieces[mortar.id].pos)).toBe('d2');
  });

  it('Velveteen never Takes; her Minion kills become Velvet Moths', () => {
    const s = blankScenario('moth_witch', 'e2');
    enemyAt(s, 'sootling', 'd4');
    const option = legalStrikes(s, heroPiece(s, 0).id)[0];
    expect(option.take).toBeNull();
    const { state } = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('d4') });
    expect(sqName(heroPiece(state, 0).pos)).toBe('e2');
    expect(pieceOn(state, 'd4')).toMatchObject({ defId: 'velvet_moth', owner: 0, exhausted: true });
  });

  it('Twin Knives hit twice; Ward absorbs one instance', () => {
    const s = blankScenario('ember_duelist', 'a1');
    const twin = unitAt(s, 'twinwick', 'd4');
    const smokehound = enemyAt(s, 'smokehound', 'e5');
    smokehound.ward = true;
    expect(legalStrikes(s, twin.id)[0]).toMatchObject({ damage: 2, lethal: false, blockedByWard: true });
    const { state, events } = act(s, { type: 'strike', seat: 0, pieceId: twin.id, target: sq('e5') });
    expect(state.pieces[smokehound.id].hp).toBe(1);
    expect(eventsOf(events, 'damage').map((e) => e.blockedByWard)).toEqual([true, false]);
  });

  it('Battering pushes a survivor 2; a blocked push bumps both pieces', () => {
    const s = blankScenario('sconce_paladin', 'a1');
    const ram = unitAt(s, 'brass_ram', 'd2');
    const drip = enemyAt(s, 'drip_hulk', 'd3');
    enemyAt(s, 'sootling', 'd5');
    const option = legalStrikes(s, ram.id).find((o) => sqName(o.target) === 'd3');
    expect(option?.push).toMatchObject({ path: [sq('d4')], bump: { at: sq('d5') } });
    const { state, events } = act(s, { type: 'strike', seat: 0, pieceId: ram.id, target: sq('d3') });
    expect(sqName(state.pieces[drip.id].pos)).toBe('d4');
    expect(state.pieces[drip.id].hp).toBe(6 - 2 - 1);
    expect(pieceOn(state, 'd5')).toBeUndefined();
    expect(eventsOf(events, 'damage').filter((e) => e.cause === 'bump')).toHaveLength(2);
    expect(state.pieces[drip.id].lastDisplacedBy).toBe(0);
  });

  it('Flourish grants an extra Strike on a kill, at most 2 per turn', () => {
    let s = blankScenario('ember_duelist', 'd4');
    for (const at of ['e5', 'f6', 'g7', 'h8']) enemyAt(s, 'sootling', at);
    const vey = heroPiece(s, 0).id;
    for (const target of ['e5', 'f6', 'g7']) {
      s = act(s, { type: 'strike', seat: 0, pieceId: vey, target: sq(target) }).state;
      expect(sqName(s.pieces[vey].pos)).toBe(target);
    }
    expect(s.pieces[vey].strikesLeft).toBe(0);
    expect(s.players[0].turn.flourishUsed).toBe(2);
    expect(validateAction(s, { type: 'strike', seat: 0, pieceId: vey, target: sq('h8') })).toMatchObject({ ok: false });
  });

  it('Webs: a Silkspinner hit Dazes, cancelling a locked intent', () => {
    let s = blankScenario('moth_witch', 'a1');
    const spinner = unitAt(s, 'silkspinner', 'd2');
    const hulk = enemyAt(s, 'drip_hulk', 'd5');
    s.intents.push(intentFor(s, hulk.id, sq('d4')));
    s = act(s, { type: 'strike', seat: 0, pieceId: spinner.id, target: sq('d5') }).state;
    expect(s.intents).toHaveLength(0);
  });
});

function intentFor(s: GameState, attackerId: string, tile: { x: number; y: number }) {
  const attacker = s.pieces[attackerId];
  return {
    id: `i${s.nextId++}`,
    attackerId,
    bossIntentId: null,
    kind: 'melee' as const,
    shape: 'single' as const,
    dir: { x: Math.sign(tile.x - attacker.pos.x), y: Math.sign(tile.y - attacker.pos.y) },
    offset: { x: tile.x - attacker.pos.x, y: tile.y - attacker.pos.y },
    range: null,
    minRange: 1,
    damage: attacker.atk,
    push: 0,
    pushMode: null,
    pull: 0,
    status: null,
    firstHit: false,
    pierce: false,
    centered: false,
    reversed: false,
    reversedBy: null,
    queue: s.intents.length + 1,
    tiles: [tile],
    targetId: null,
    global: null,
    createsTile: null,
    extra: null,
  };
}

describe('damage, displacement and statuses (§6.3-6.5)', () => {
  it('Ward cancels a whole instance, bumps included, then breaks', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hero = heroPiece(s, 0);
    hero.ward = true;
    const ctx = makeCtx(s);
    expect(dealDamage(ctx, hero, 3, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null })).toMatchObject({ blocked: true });
    expect(hero.hp).toBe(8);
    expect(hero.ward).toBe(false);
    dealDamage(ctx, hero, 3, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(hero.hp).toBe(5);
  });

  it('push stops at the edge with bump 1; Plumes do not block; stalwart and heavy are immune, structures too', () => {
    const s = blankScenario('sconce_paladin', 'h4');
    const ctx = makeCtx(s);
    const hound = enemyAt(s, 'smokehound', 'g2');
    s.plumes.push({ id: 'm997', pos: sq('h2'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    pushPiece(ctx, hound, { x: 1, y: 0 }, 3, { displacer: 0, credit: 0, sourceId: null });
    expect(sqName(hound.pos)).toBe('h2');
    expect(hound.hp).toBe(1);
    const hero = heroPiece(s, 0);
    pushPiece(ctx, hero, { x: -1, y: 0 }, 2, { displacer: null, credit: null, sourceId: null });
    expect(sqName(hero.pos)).toBe('h4');
    const golem = unitAt(s, 'bellows_golem', 'c3');
    pushPiece(ctx, golem, { x: 0, y: 1 }, 1, { displacer: null, credit: null, sourceId: null });
    expect(sqName(golem.pos)).toBe('c3');
    const candle = candleAt(s, 'e5');
    pushPiece(ctx, candle, { x: 0, y: 1 }, 1, { displacer: null, credit: null, sourceId: null });
    expect(sqName(candle.pos)).toBe('e5');
  });

  it('stalwart pieces can still be swapped; heavy pieces cannot', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const ctx = makeCtx(s);
    const hero = heroPiece(s, 0);
    const taper = unitAt(s, 'taper', 'f2');
    expect(swapPieces(ctx, hero, taper, { displacer: 0, credit: 0, sourceId: null })).toBe(true);
    expect([sqName(hero.pos), sqName(taper.pos)]).toEqual(['f2', 'd2']);
    const golem = unitAt(s, 'bellows_golem', 'a1');
    expect(swapPieces(ctx, hero, golem, { displacer: 0, credit: 0, sourceId: null })).toBe(false);
  });

  it('Burn deals 1 at each of the next 2 Tallies; Dazed costs a Wickfolk piece its next Strike', () => {
    let s = blankScenario('sconce_paladin', 'd2');
    const hero = heroPiece(s, 0);
    const ctx = makeCtx(s);
    applyBurn(ctx, hero);
    expect(hero.burn).toBe(2);
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    applyDaze(makeCtx(s), heroPiece(s, 0));
    expect(heroPiece(s, 0).dazed).toBe(true);
    for (let i = 0; i < 4; i++) s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('players');
    expect(heroPiece(s, 0).hp).toBe(7);
    expect(heroPiece(s, 0).burn).toBe(1);
    expect(heroPiece(s, 0).strikesLeft).toBe(0);
    expect(heroPiece(s, 0).dazed).toBe(false);
  });

  it('a hero at 0 HP smolders (Dread +1) and an adjacent ally relights it at the end of the turn', () => {
    let s = blankScenario('sconce_paladin', 'd2');
    const hero = heroPiece(s, 0);
    const ctx = makeCtx(s);
    const before = s.vigil?.dread ?? 0;
    dealDamage(ctx, hero, 8, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(hero.smoldering).toBe(true);
    expect(s.vigil?.dread).toBe(before + 1);
    expect(dealDamage(ctx, hero, 3, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null }).dealt).toBe(0);
    const squire = unitAt(s, 'sconce_squire', 'e3');
    expect(validateAction(s, { type: 'move', seat: 0, pieceId: hero.id, to: sq('d3') })).toMatchObject({ ok: false, reason: 'HERO_SMOLDERING' });
    s = act(s, { type: 'relight', seat: 0, pieceId: squire.id, wickId: hero.id }).state;
    expect(s.pieces[hero.id].smoldering).toBe(true);
    const ended = act(s, { type: 'end_turn', seat: 0 });
    expect(ended.state.pieces[hero.id]).toMatchObject({ smoldering: false, hp: 4, exhausted: true });
    expect(eventsOf(ended.events, 'hero_relit')[0].cause).toBe('relight');
  });

  it('Pop: a dying Cinderling hits each adjacent enemy for 1', () => {
    const s = blankScenario('ember_duelist', 'a1');
    const cinder = unitAt(s, 'cinderling', 'd4');
    const a = enemyAt(s, 'sootling', 'd5');
    const b = enemyAt(s, 'smokehound', 'e3');
    dealDamage(makeCtx(s), cinder, 1, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: a.id, seat: null });
    expect(s.pieces[cinder.id]).toBeUndefined();
    expect(s.pieces[a.id]).toBeUndefined();
    expect(s.pieces[b.id].hp).toBe(1);
  });

  it('Wax Pool: a Drip Hulk dies into Hot Wax', () => {
    const s = blankScenario('sconce_paladin', 'a1');
    const hulk = enemyAt(s, 'drip_hulk', 'e5');
    dealDamage(makeCtx(s), hulk, 6, { cause: 'card', sourceKind: 'card', sourceId: null, seat: 0 });
    expect(s.board.tiles[4 * s.board.w + 4].type).toBe('hot_wax');
  });

  it('light_shrine uses the Strike; a Lit Shrine heals Wickfolk on or next to it at Tally', () => {
    let s = blankScenario('sconce_paladin', 'd2');
    setTile(s, 'd3', 'votive_shrine');
    const hero = heroPiece(s, 0);
    hero.hp = 5;
    s = act(s, { type: 'light_shrine', seat: 0, pieceId: hero.id, shrine: sq('d3') }).state;
    expect(validateAction(s, { type: 'light_shrine', seat: 0, pieceId: hero.id, shrine: sq('d3') })).toMatchObject({ ok: false });
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('tally');
    s = act(s, { type: 'advance' }).state;
    expect(heroPiece(s, 0).hp).toBe(6);
  });

  it('free action melt dismisses a unit without credit', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const taper = unitAt(s, 'taper', 'e2');
    const { state, events } = act(s, { type: 'free_action', seat: 0, kind: 'melt', pieceId: taper.id });
    expect(state.pieces[taper.id]).toBeUndefined();
    expect(eventsOf(events, 'piece_died')[0]).toMatchObject({ cause: 'melt', killerSeat: null });
    expect(validateAction(s, { type: 'free_action', seat: 0, kind: 'melt', pieceId: heroPiece(s, 0).id })).toMatchObject({ ok: false });
  });
});
