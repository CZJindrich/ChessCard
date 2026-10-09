import { describe, expect, it } from 'vitest';
import { cardTargets, sq, sqName, validateAction } from '../../../src/engine';
import type { CardInstance, GameState } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import { act, blankScenario, candleAt, enemyAt, eventsOf, heroPiece, pieceOn, unitAt } from './helpers';

/** Put a specific card into seat 0's hand and return its uid. */
function give(s: GameState, id: string, tempered = false): string {
  const card: CardInstance = { uid: `c${s.nextId++}`, id, tempered };
  s.players[0].hand.push(card);
  return card.uid;
}

describe('summon cards (§7.1)', () => {
  it('summon onto an empty, non-Plume tile within 2 of the hero; the unit arrives Exhausted', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.plumes.push({ id: 'm1', pos: sq('d3'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    const uid = give(s, 'light_a_taper');
    const info = cardTargets(s, 0, uid);
    expect(info.playable).toBe(true);
    const tiles = info.targets.map((t) => sqName(t.pos));
    expect(tiles).not.toContain('d3');
    expect(tiles).not.toContain('d2');
    expect(tiles).toContain('f4');
    expect(tiles).not.toContain('g4');
    expect(info.targets.find((t) => sqName(t.pos) === 'f4')?.preview.summon).toEqual({ defId: 'taper', pos: sq('f4') });
    const { state, events } = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'tile', pos: sq('f4') }] });
    expect(pieceOn(state, 'f4')).toMatchObject({ defId: 'taper', owner: 0, exhausted: true });
    expect(state.players[0].flame).toBe(2);
    expect(state.players[0].discard.some((c) => c.uid === uid)).toBe(true);
    expect(eventsOf(events, 'card_played')[0]).toMatchObject({ cardId: 'light_a_taper', cost: 1 });
    const taper = pieceOn(state, 'f4');
    expect(validateAction(state, { type: 'move', seat: 0, pieceId: taper?.id ?? '', to: sq('f5') })).toMatchObject({ ok: false, reason: 'EXHAUSTED' });
    expect(validateAction(state, { type: 'play_card', seat: 0, cardUid: give(state, 'light_a_taper'), targets: [{ kind: 'tile', pos: sq('d3') }] })).toMatchObject({
      ok: false,
      reason: 'INVALID_TARGET',
    });
  });

  it('Shieldbearer arrives with Ward; quick_build Lanterns arrive Ready', () => {
    const paladin = blankScenario('sconce_paladin', 'd2');
    const squire = give(paladin, 'call_the_squire');
    const after = act(paladin, { type: 'play_card', seat: 0, cardUid: squire, targets: [{ kind: 'tile', pos: sq('e3') }] }).state;
    expect(pieceOn(after, 'e3')).toMatchObject({ ward: true, exhausted: true });

    const wicklow = blankScenario('lampwright', 'd2');
    const lantern = give(wicklow, 'hang_a_lantern');
    const built = act(wicklow, { type: 'play_card', seat: 0, cardUid: lantern, targets: [{ kind: 'tile', pos: sq('d3') }] }).state;
    expect(pieceOn(built, 'd3')).toMatchObject({ defId: 'lantern', exhausted: false, strikesLeft: 1 });
  });

  it('the unit limit makes summons unplayable (UNIT_LIMIT)', () => {
    const s = blankScenario('sconce_paladin', 'd2', { overrides: { unit_limit: 2 } });
    unitAt(s, 'taper', 'a1');
    unitAt(s, 'taper', 'b1');
    const uid = give(s, 'light_a_taper');
    expect(cardTargets(s, 0, uid)).toMatchObject({ playable: false, reason: 'UNIT_LIMIT', params: { n: 2, max: 2 } });
  });
});

describe('rites', () => {
  it('Spark hits an enemy or pops a Plume within 3', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const near = enemyAt(s, 'smokehound', 'd5');
    enemyAt(s, 'sootling', 'd6');
    s.plumes.push({ id: 'm1', pos: sq('f4'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    const uid = give(s, 'spark');
    const info = cardTargets(s, 0, uid);
    expect(info.targets.map((t) => sqName(t.pos)).sort()).toEqual(['d5', 'f4']);
    expect(info.rangeRing).toEqual({ centre: sq('d2'), radius: 3 });
    expect(info.targets.find((t) => sqName(t.pos) === 'd5')?.preview.damage).toEqual([{ pieceId: near.id, amount: 1, lethal: false, blockedByWard: false }]);
    const hit = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: near.id }] }).state;
    expect(hit.pieces[near.id].hp).toBe(1);
    const pop = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'tile', pos: sq('f4') }] }).state;
    expect(pop.plumes).toHaveLength(0);
    expect(pop.players[0].stats.plumesPopped).toBe(1);
  });

  it('Mend the Wick heals an ally or a Vigil Candle within 3, up to max HP', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const candle = candleAt(s, 'd4');
    candle.hp = 1;
    heroPiece(s, 0).hp = 7;
    const uid = give(s, 'mend_the_wick');
    const info = cardTargets(s, 0, uid);
    expect(info.targets.map((t) => (t.choice.kind === 'piece' ? t.choice.pieceId : '')).sort()).toEqual([candle.id, heroPiece(s, 0).id].sort());
    const healed = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: candle.id }] }).state;
    expect(healed.pieces[candle.id].hp).toBe(3);
    const hero = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: heroPiece(s, 0).id }] }).state;
    expect(heroPiece(hero, 0).hp).toBe(8);
  });

  it('Flare damages enemies in a 3×3 and pops its Plumes; Shield Bash pushes a survivor 2', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const a = enemyAt(s, 'smokehound', 'd4');
    const b = enemyAt(s, 'sootling', 'e5');
    s.plumes.push({ id: 'm1', pos: sq('c5'), enemyId: 'sootling', order: 1, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
    s.players[0].flame = 3;
    const flare = give(s, 'flare');
    const after = act(s, { type: 'play_card', seat: 0, cardUid: flare, targets: [{ kind: 'tile', pos: sq('d5') }] }).state;
    expect(after.pieces[a.id].hp).toBe(1);
    expect(after.pieces[b.id]).toBeUndefined();
    expect(after.plumes).toHaveLength(0);

    const bash = blankScenario('sconce_paladin', 'd2');
    const hulk = enemyAt(bash, 'drip_hulk', 'd3');
    const uid = give(bash, 'shield_bash');
    const pushed = act(bash, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: hulk.id }] }).state;
    expect(pushed.pieces[hulk.id]).toMatchObject({ hp: 4, lastDisplacedBy: 0 });
    expect(sqName(pushed.pieces[hulk.id].pos)).toBe('d5');
  });

  it('NEED_FLAME, NOT_IN_HAND, HERO_SMOLDERING, CARD_LIMIT and NOT_ENABLED', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    enemyAt(s, 'sootling', 'd3');
    s.players[0].flame = 0;
    const spark = give(s, 'spark');
    expect(cardTargets(s, 0, spark)).toMatchObject({ playable: false, reason: 'NEED_FLAME', params: { n: 1 } });
    expect(validateAction(s, { type: 'play_card', seat: 0, cardUid: 'c-none', targets: [] })).toMatchObject({ ok: false, reason: 'NOT_IN_HAND' });
    s.players[0].flame = 3;
    s.activeRules.push({ rule: 'card_limit', delta: 0, value: 1, seat: null, source: { kind: 'toll', id: 'muffled_nave' }, expires: 'night' });
    const once = act(s, { type: 'play_card', seat: 0, cardUid: spark, targets: [{ kind: 'piece', pieceId: pieceOn(s, 'd3')?.id ?? '' }] }).state;
    expect(cardTargets(once, 0, give(once, 'mend_the_wick'))).toMatchObject({ playable: false, reason: 'CARD_LIMIT', params: { source: 'Muffled Nave' } });
    const cocoon = give(s, 'cocoon');
    expect(cardTargets(s, 0, cocoon)).toMatchObject({ playable: false, reason: 'NOT_ENABLED' });
    dealDamage(makeCtx(s), heroPiece(s, 0), 8, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(cardTargets(s, 0, give(s, 'spark'))).toMatchObject({ playable: false, reason: 'HERO_SMOLDERING' });
  });

  it('tempered cards cost 1 less; Quickwick tempered gives 2 Moves', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const uid = give(s, 'mend_the_wick', true);
    expect(cardTargets(s, 0, uid).cost).toBe(0);
    const quick = give(s, 'quickwick', true);
    const after = act(s, { type: 'play_card', seat: 0, cardUid: quick, targets: [{ kind: 'piece', pieceId: heroPiece(s, 0).id }] }).state;
    expect(heroPiece(after, 0).movesLeft).toBe(3);
  });

  it('Searing Edge: this turn the hero strikes for +1 and burns', () => {
    let s = blankScenario('ember_duelist', 'd2');
    const hulk = enemyAt(s, 'drip_hulk', 'e3');
    s = act(s, { type: 'play_card', seat: 0, cardUid: give(s, 'searing_edge'), targets: [] }).state;
    expect(s.players[0].turn).toMatchObject({ heroDmgBonus: 1, heroBurn: true });
    s = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('e3') }).state;
    expect(s.pieces[hulk.id]).toMatchObject({ hp: 3, burn: 2 });
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s.players[0].turn.heroDmgBonus).toBe(0);
    expect(s.activeRules.some((r) => r.expires === 'turn')).toBe(false);
  });

  it('Turnabout reverses a locked intent; a centred intent has no direction (NO_DIRECTION)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const monk = enemyAt(s, 'hush_monk', 'd4');
    s.intents.push({
      id: 'i900',
      attackerId: monk.id,
      bossIntentId: null,
      kind: 'area',
      shape: 'ring8',
      dir: null,
      offset: { x: 0, y: 0 },
      range: null,
      minRange: 1,
      damage: 1,
      push: 0,
      pushMode: null,
      pull: 0,
      status: 'dazed',
      firstHit: false,
      pierce: false,
      centered: true,
      reversed: false,
      reversedBy: null,
      queue: 1,
      tiles: [],
      targetId: null,
      global: null,
      createsTile: null,
      extra: null,
    });
    const uid = give(s, 'turnabout');
    expect(cardTargets(s, 0, uid)).toMatchObject({ playable: false, reason: 'NO_DIRECTION' });
    const sootling = enemyAt(s, 'sootling', 'f4');
    s.intents.push({ ...s.intents[0], id: 'i901', attackerId: sootling.id, kind: 'melee', shape: 'single', dir: { x: 0, y: -1 }, offset: { x: 0, y: -1 }, centered: false, status: null, queue: 2 });
    const info = cardTargets(s, 0, uid);
    expect(info.targets.map((t) => sqName(t.pos))).toEqual(['f4']);
    expect(info.targets[0].preview.reversedIntentTiles).toEqual([sq('f5')]);
    const after = act(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: sootling.id }] }).state;
    expect(after.intents.find((i) => i.id === 'i901')).toMatchObject({ reversed: true, reversedBy: 0, tiles: [sq('f5')] });
  });
});
