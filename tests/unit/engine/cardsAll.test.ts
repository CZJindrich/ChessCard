/**
 * One behaviour test (at least) for each of the 40 cards (GDD §7.3), played through the public
 * API on hand-built positions.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, cardTargets, legalStrikes, previewSnuffStrike, sq, sqName, validateAction } from '../../../src/engine';
import type { GameState, Piece } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import {
  act,
  blankScenario,
  candleAt,
  enemyAt,
  eventsOf,
  giveCard,
  heroPiece,
  lockMelee,
  optionSquares,
  pieceOn,
  playCard,
  plumeAt,
  setTile,
  unitAt,
} from './helpers';

function hero(s: GameState): Piece {
  return heroPiece(s, 0);
}

/** Two human seats, seat 0 claimed and acting; seat 1's hero stands on `allyAt`. */
function coop(heroId: string, at: string, allyHero: string, allyAt: string): GameState {
  const s = blankScenario(heroId, at, { seats: [{ kind: 'human', hero: heroId }, { kind: 'human', hero: allyHero }] });
  heroPiece(s, 1).pos = sq(allyAt);
  const claimed = act(s, { type: 'claim_turn', seat: 0 }).state;
  return claimed;
}

/** End seat 0's turn and advance through the Tally of this round. */
function throughTally(s: GameState): GameState {
  let state = act(s, { type: 'end_turn', seat: 0 }).state;
  const round = state.round;
  for (let i = 0; i < 10 && state.round === round && !state.result; i++) state = act(state, { type: 'advance' }).state;
  return state;
}

describe('neutral cards', () => {
  it('spark deals 1 to an enemy within 3 or pops a Plume', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd5');
    plumeAt(s, 'f4');
    const uid = giveCard(s, 'spark');
    expect(optionSquares(cardTargets(s, 0, uid))).toEqual(['d5', 'f4']);
    expect(playCard(s, uid, [hound]).state.pieces[hound.id].hp).toBe(1);
    expect(playCard(s, uid, ['f4']).state.plumes).toHaveLength(0);
  });

  it('light_a_taper summons an Exhausted Taper within 2', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const after = playCard(s, giveCard(s, 'light_a_taper'), ['b3']).state;
    expect(pieceOn(after, 'b3')).toMatchObject({ defId: 'taper', owner: 0, exhausted: true });
  });

  it('mend_the_wick heals 2, up to max HP, an ally or a Candle', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const candle = candleAt(s, 'c4');
    candle.hp = 1;
    expect(playCard(s, giveCard(s, 'mend_the_wick'), [candle]).state.pieces[candle.id].hp).toBe(3);
  });

  it('quickwick gives 1 extra Move (2 when tempered)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(hero(playCard(s, giveCard(s, 'quickwick'), [hero(s)]).state).movesLeft).toBe(2);
    expect(hero(playCard(s, giveCard(s, 'quickwick', { tempered: true }), [hero(s)]).state).movesLeft).toBe(3);
  });

  it('beeswax_seal attaches: +1 max HP, +1 HP and Ward; it returns to the discard pile when replaced or when the piece dies', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.players[0].flame = 6;
    const taper = unitAt(s, 'taper', 'd3');
    const seal = giveCard(s, 'beeswax_seal');
    const info = cardTargets(s, 0, seal);
    expect(info.targets.find((t) => t.choice.kind === 'piece' && t.choice.pieceId === taper.id)?.preview.charm).toEqual({ pieceId: taper.id, cardId: 'beeswax_seal' });
    let state = playCard(s, seal, [taper]).state;
    expect(state.pieces[taper.id]).toMatchObject({ maxHp: 2, hp: 2, ward: true, charm: { uid: seal, id: 'beeswax_seal' } });
    expect(state.players[0].discard.some((c) => c.uid === seal)).toBe(false);
    const cocoon = giveCard(state, 'cocoon');
    state = playCard(state, cocoon, [state.pieces[taper.id]]).state;
    expect(state.pieces[taper.id]).toMatchObject({ maxHp: 1, hp: 1, charm: { id: 'cocoon' } });
    expect(state.players[0].discard.map((c) => c.uid)).toContain(seal);
    dealDamage(makeCtx(state), state.pieces[taper.id], 1, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    dealDamage(makeCtx(state), state.pieces[taper.id], 1, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(state.pieces[taper.id]).toBeUndefined();
    expect(state.players[0].discard.map((c) => c.uid)).toContain(cocoon);
  });

  it('saddle_the_wickhorse summons a Wickhorse', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'saddle_the_wickhorse'), ['e3']).state, 'e3')?.defId).toBe('wickhorse');
  });

  it('ordain_an_acolyte summons an Incense Acolyte whose Censer heals neighbours at Tally', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    hero(s).hp = 5;
    const state = throughTally(playCard(s, giveCard(s, 'ordain_an_acolyte'), ['d3']).state);
    expect(pieceOn(state, 'd3')?.defId).toBe('incense_acolyte');
    expect(hero(state).hp).toBe(6);
  });

  it('flare hits every enemy in a 3×3 and pops its Plumes', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const a = enemyAt(s, 'smokehound', 'd4');
    const b = enemyAt(s, 'sootling', 'e5');
    plumeAt(s, 'c5');
    const uid = giveCard(s, 'flare');
    const option = cardTargets(s, 0, uid).targets.find((t) => sqName(t.pos) === 'd5');
    expect(option?.preview.area).toHaveLength(9);
    const after = playCard(s, uid, ['d5']).state;
    expect(after.pieces[a.id].hp).toBe(1);
    expect(after.pieces[b.id]).toBeUndefined();
    expect(after.plumes).toHaveLength(0);
  });

  it('rally_the_captain summons a Taper Captain', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'rally_the_captain'), ['c2']).state, 'c2')?.defId).toBe('taper_captain');
  });

  it('turnabout reverses an enemy intent within 4', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const sootling = enemyAt(s, 'sootling', 'f4');
    lockMelee(s, sootling, 'f3');
    const after = playCard(s, giveCard(s, 'turnabout'), [sootling]).state;
    expect(after.intents[0]).toMatchObject({ reversed: true, reversedBy: 0, tiles: [sq('f5')] });
  });

  it('kindle_hope: relight an allied Wick within 3, or heal an allied hero 3', () => {
    const s = coop('sconce_paladin', 'd2', 'moth_witch', 'e4');
    const ally = heroPiece(s, 1);
    dealDamage(makeCtx(s), ally, 20, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    expect(ally.smoldering).toBe(true);
    const uid = giveCard(s, 'kindle_hope');
    const modes = cardTargets(s, 0, uid);
    expect(modes.modes).toEqual(['Relight', 'Heal']);
    expect(modes.modeOptions?.map((m) => m.playable)).toEqual([true, true]);
    const relight = cardTargets(s, 0, uid, { mode: 0 });
    expect(relight.targets.map((t) => (t.choice.kind === 'piece' ? t.choice.pieceId : ''))).toEqual([ally.id]);
    expect(relight.targets[0].preview.relit).toEqual([ally.id]);
    expect(validateAction(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: ally.id }] })).toMatchObject({ ok: false, reason: 'INVALID_ACTION' });
    const relit = playCard(s, uid, [ally], { mode: 0 }).state;
    expect(heroPiece(relit, 1)).toMatchObject({ smoldering: false, hp: 3, exhausted: true });
    hero(s).hp = 3;
    expect(hero(playCard(s, uid, [hero(s)], { mode: 1 }).state).hp).toBe(6);
  });

  it('dawnbreak pops every Plume and heals every ally and Candle 1', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    s.players[0].flame = 4;
    plumeAt(s, 'a8');
    plumeAt(s, 'h7');
    const candle = candleAt(s, 'h1');
    candle.hp = 2;
    hero(s).hp = 5;
    const after = playCard(s, giveCard(s, 'dawnbreak'), []).state;
    expect(after.plumes).toHaveLength(0);
    expect(after.pieces[candle.id].hp).toBe(3);
    expect(hero(after).hp).toBe(6);
  });
});

describe('Sconce Paladin cards', () => {
  it('shield_bash deals 2 to an adjacent enemy and pushes a survivor 2', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hulk = enemyAt(s, 'drip_hulk', 'd3');
    const after = playCard(s, giveCard(s, 'shield_bash'), [hulk]).state;
    expect(after.pieces[hulk.id]).toMatchObject({ hp: 4, pos: sq('d5') });
  });

  it('waxen_ward gives Ward to an ally or a Candle within 3', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const candle = candleAt(s, 'c4');
    expect(playCard(s, giveCard(s, 'waxen_ward'), [candle]).state.pieces[candle.id].ward).toBe(true);
  });

  it('call_the_squire summons a Sconce Squire with Ward', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'call_the_squire'), ['e3']).state, 'e3')).toMatchObject({ defId: 'sconce_squire', ward: true });
  });

  it('sunshield_charge: slide up to 3 in a line, then 2 damage to an adjacent enemy; the Move is kept', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hound = enemyAt(s, 'smokehound', 'e6');
    unitAt(s, 'taper', 'f4');
    const uid = giveCard(s, 'sunshield_charge');
    const first = cardTargets(s, 0, uid);
    expect(first).toMatchObject({ playable: true, step: 0, steps: 2 });
    const slides = optionSquares(first);
    expect(slides).toContain('d5');
    expect(slides).toContain('e3');
    expect(slides).not.toContain('f4');
    expect(slides).not.toContain('g5');
    const second = cardTargets(s, 0, uid, { chosen: [{ kind: 'tile', pos: sq('d5') }] });
    expect(second).toMatchObject({ step: 1, optional: true, complete: false });
    expect(optionSquares(second)).toEqual(['e6']);
    expect(second.targets[0].preview.damage).toEqual([{ pieceId: hound.id, amount: 2, lethal: true, blockedByWard: false }]);
    const { state, events } = playCard(s, uid, ['d5', hound]);
    expect(hero(state)).toMatchObject({ pos: sq('d5'), movesLeft: 1 });
    expect(state.pieces[hound.id]).toBeUndefined();
    expect(eventsOf(events, 'piece_moved')[0]).toMatchObject({ kind: 'slide', path: [sq('d3'), sq('d4'), sq('d5')] });
    // No enemy next to b2: the follow-up is skipped.
    expect(cardTargets(s, 0, uid, { chosen: [{ kind: 'tile', pos: sq('b2') }] })).toMatchObject({ playable: true, complete: true, targets: [] });
    expect(hero(playCard(s, uid, ['b2']).state).pos).toEqual(sq('b2'));
    // With an enemy next to the slide tile, the hit is not optional.
    expect(validateAction(s, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'tile', pos: sq('d5') }] })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('muster_the_ram summons a Brass Ram', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'muster_the_ram'), ['c3']).state, 'c3')?.defId).toBe('brass_ram');
  });

  it('oath_of_tallow: the hero gets +1 ATK and pushes surviving targets 1', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hulk = enemyAt(s, 'drip_hulk', 'd3');
    let state = playCard(s, giveCard(s, 'oath_of_tallow'), [hero(s)]).state;
    expect(hero(state)).toMatchObject({ atk: 3, charm: { id: 'oath_of_tallow' } });
    expect(legalStrikes(state, hero(state).id)[0]).toMatchObject({ damage: 3, push: { path: [sq('d4')] } });
    state = act(state, { type: 'strike', seat: 0, pieceId: hero(state).id, target: sq('d3') }).state;
    expect(state.pieces[hulk.id]).toMatchObject({ hp: 3, pos: sq('d4') });
  });

  it('aegis_of_dawn: every ally and Candle gains Ward, the hero heals 2', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const taper = unitAt(s, 'taper', 'h8');
    const candle = candleAt(s, 'a8');
    hero(s).hp = 4;
    const after = playCard(s, giveCard(s, 'aegis_of_dawn'), []).state;
    expect([after.pieces[taper.id].ward, after.pieces[candle.id].ward, hero(after).ward]).toEqual([true, true, true]);
    expect(hero(after).hp).toBe(6);
  });
});

describe('Moth Witch cards', () => {
  it('loose_a_moth summons a Velvet Moth', () => {
    const s = blankScenario('moth_witch', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'loose_a_moth'), ['d4']).state, 'd4')?.defId).toBe('velvet_moth');
  });

  it('velvet_pull pulls an enemy within 4 up to 3 toward the hero', () => {
    const s = blankScenario('moth_witch', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd6');
    const after = playCard(s, giveCard(s, 'velvet_pull'), [hound]).state;
    expect(after.pieces[hound.id]).toMatchObject({ pos: sq('d3'), lastDisplacedBy: 0 });
  });

  it('moth_dust Dazes an enemy: its locked intent is cancelled', () => {
    const s = blankScenario('moth_witch', 'd2');
    const sootling = enemyAt(s, 'sootling', 'd4');
    lockMelee(s, sootling, 'd3');
    const { state, events } = playCard(s, giveCard(s, 'moth_dust'), [sootling]);
    expect(state.intents).toHaveLength(0);
    expect(eventsOf(events, 'intent_cancelled')[0]).toMatchObject({ reason: 'dazed' });
  });

  it('cocoon heals its bearer 1 at every Tally', () => {
    const s = blankScenario('moth_witch', 'd2');
    hero(s).hp = 3;
    const state = throughTally(playCard(s, giveCard(s, 'cocoon'), [hero(s)]).state);
    expect(hero(state)).toMatchObject({ hp: 4, charm: { id: 'cocoon' } });
  });

  it('spin_the_silk summons a Silkspinner', () => {
    const s = blankScenario('moth_witch', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'spin_the_silk'), ['c3']).state, 'c3')?.defId).toBe('silkspinner');
  });

  it('moonlit_hex turns a Minion or Soldier into an Exhausted Velvet Moth you own; Elites are RANK_RESTRICTED', () => {
    const s = blankScenario('moth_witch', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd4');
    lockMelee(s, hound, 'd3');
    enemyAt(s, 'snuffer_knight', 'f4');
    const uid = giveCard(s, 'moonlit_hex');
    expect(cardTargets(s, 0, uid).targets.map((t) => sqName(t.pos))).toEqual(['d4']);
    const { state, events } = playCard(s, uid, [hound]);
    expect(state.pieces[hound.id]).toMatchObject({ defId: 'velvet_moth', side: 'wick', owner: 0, kind: 'unit', exhausted: true, hp: 1 });
    expect(state.intents).toHaveLength(0);
    expect(state.players[0].stats.kills).toBe(1);
    expect(eventsOf(events, 'transformed')).toHaveLength(1);
    const elite = blankScenario('moth_witch', 'd2');
    enemyAt(elite, 'snuffer_knight', 'd4');
    expect(cardTargets(elite, 0, giveCard(elite, 'moonlit_hex'))).toMatchObject({ playable: false, reason: 'RANK_RESTRICTED' });
    const full = blankScenario('moth_witch', 'd2', { overrides: { unit_limit: 2 } });
    enemyAt(full, 'sootling', 'd4');
    unitAt(full, 'taper', 'a1');
    unitAt(full, 'taper', 'b1');
    expect(cardTargets(full, 0, giveCard(full, 'moonlit_hex'))).toMatchObject({ playable: false, reason: 'UNIT_LIMIT' });
  });

  it('swarm_of_wings summons up to 2 Moths and readies every Moth you own', () => {
    const s = blankScenario('moth_witch', 'd2', { overrides: { unit_limit: 3 } });
    s.players[0].flame = 4;
    const old = unitAt(s, 'velvet_moth', 'h8');
    old.movesLeft = 0;
    old.strikesLeft = 0;
    unitAt(s, 'taper', 'a8');
    const after = playCard(s, giveCard(s, 'swarm_of_wings'), []).state;
    const moths = Object.values(after.pieces).filter((p) => p.defId === 'velvet_moth');
    expect(moths).toHaveLength(2);
    for (const moth of moths) expect(moth).toMatchObject({ exhausted: false, movesLeft: 1, strikesLeft: 1 });
  });
});

describe('Lampwright cards', () => {
  it('tinder_bolt hits the first enemy or Plume on an orthogonal line within 4', () => {
    const s = blankScenario('lampwright', 'd2');
    const near = enemyAt(s, 'smokehound', 'd5');
    enemyAt(s, 'sootling', 'd6');
    plumeAt(s, 'b2');
    enemyAt(s, 'sootling', 'a2');
    const uid = giveCard(s, 'tinder_bolt');
    expect(optionSquares(cardTargets(s, 0, uid))).toEqual(['a2', 'b2', 'd5']);
    expect(playCard(s, uid, [near]).state.pieces[near.id]).toBeUndefined();
  });

  it('hang_a_lantern summons a Lantern that arrives Ready (quick_build)', () => {
    const s = blankScenario('lampwright', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'hang_a_lantern'), ['d3']).state, 'd3')).toMatchObject({ defId: 'lantern', exhausted: false, strikesLeft: 1 });
  });

  it('trim_the_wicks gives each Lantern and Wick Mortar 1 extra Strike', () => {
    const s = blankScenario('lampwright', 'd2');
    const lantern = unitAt(s, 'lantern', 'a1');
    const mortar = unitAt(s, 'wick_mortar', 'h1');
    const after = playCard(s, giveCard(s, 'trim_the_wicks'), []).state;
    expect([after.pieces[lantern.id].strikesLeft, after.pieces[mortar.id].strikesLeft]).toEqual([2, 2]);
  });

  it('prime_the_mortar summons a Ready Wick Mortar', () => {
    const s = blankScenario('lampwright', 'd2');
    expect(pieceOn(playCard(s, giveCard(s, 'prime_the_mortar'), ['f2']).state, 'f2')).toMatchObject({ defId: 'wick_mortar', exhausted: false });
  });

  it('lens_of_brass attaches to a Lantern anywhere: +1 ATK, +2 range', () => {
    const s = blankScenario('lampwright', 'd2');
    const lantern = unitAt(s, 'lantern', 'a1');
    const far = enemyAt(s, 'drip_hulk', 'a7');
    expect(legalStrikes(s, lantern.id)).toHaveLength(0);
    const after = playCard(s, giveCard(s, 'lens_of_brass'), [lantern]).state;
    expect(after.pieces[lantern.id]).toMatchObject({ atk: 2, charm: { id: 'lens_of_brass' } });
    expect(legalStrikes(after, lantern.id)).toMatchObject([{ targetPieceId: far.id, damage: 2 }]);
  });

  it('stoke_the_golem summons a Bellows Golem', () => {
    const s = blankScenario('lampwright', 'd2');
    s.players[0].flame = 4;
    expect(pieceOn(playCard(s, giveCard(s, 'stoke_the_golem'), ['c2']).state, 'c2')).toMatchObject({ defId: 'bellows_golem', exhausted: true });
  });

  it('grand_illumination: each Lantern hits every enemy on its 4 lines (through pieces, not Pillars) and pops Plumes', () => {
    const s = blankScenario('lampwright', 'a1');
    s.players[0].flame = 4;
    unitAt(s, 'lantern', 'd4');
    unitAt(s, 'taper', 'd5');
    const behind = enemyAt(s, 'smokehound', 'd6');
    const east = enemyAt(s, 'drip_hulk', 'g4');
    setTile(s, 'b4', 'pillar');
    const shielded = enemyAt(s, 'sootling', 'a4');
    plumeAt(s, 'd8');
    const offLine = enemyAt(s, 'sootling', 'e5');
    const after = playCard(s, giveCard(s, 'grand_illumination'), []).state;
    expect(after.pieces[behind.id]).toBeUndefined();
    expect(after.pieces[east.id].hp).toBe(4);
    expect(after.pieces[shielded.id]).toBeDefined();
    expect(after.pieces[offLine.id]).toBeDefined();
    expect(after.plumes).toHaveLength(0);
  });
});

describe('Ember Duelist cards', () => {
  it('strike_a_cinder summons a Cinderling whose death burns adjacent enemies (pop)', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const after = playCard(s, giveCard(s, 'strike_a_cinder'), ['d3']).state;
    const cinder = pieceOn(after, 'd3');
    expect(cinder?.defId).toBe('cinderling');
    const sootling = enemyAt(after, 'sootling', 'e4');
    if (cinder) dealDamage(makeCtx(after), cinder, 1, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: sootling.id, seat: null });
    expect(after.pieces[sootling.id]).toBeUndefined();
  });

  it('feint swaps the hero with an adjacent enemy; its locked intent moves with it', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const sootling = enemyAt(s, 'sootling', 'e3');
    lockMelee(s, sootling, 'e2');
    const smokestack = enemyAt(s, 'smokestack', 'c3');
    const uid = giveCard(s, 'feint');
    expect(optionSquares(cardTargets(s, 0, uid))).toEqual(['e3']);
    expect(smokestack.structure).toBe(true);
    const after = playCard(s, uid, [sootling]).state;
    expect(hero(after).pos).toEqual(sq('e3'));
    expect(after.pieces[sootling.id]).toMatchObject({ pos: sq('d2'), lastDisplacedBy: 0 });
    expect(after.intents[0].tiles).toEqual([sq('d1')]);
  });

  it('searing_edge: +1 damage and Burn on the hero strikes this turn', () => {
    let s = blankScenario('ember_duelist', 'd2');
    const hulk = enemyAt(s, 'drip_hulk', 'e3');
    s = playCard(s, giveCard(s, 'searing_edge'), []).state;
    s = act(s, { type: 'strike', seat: 0, pieceId: hero(s).id, target: sq('e3') }).state;
    expect(s.pieces[hulk.id]).toMatchObject({ hp: 3, burn: 2 });
  });

  it('hire_a_twinwick summons a Twinwick that strikes twice', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const after = playCard(s, giveCard(s, 'hire_a_twinwick'), ['c3']).state;
    const twin = pieceOn(after, 'c3');
    expect(twin?.defId).toBe('twinwick');
    if (!twin) return;
    twin.exhausted = false;
    twin.strikesLeft = 1;
    const hound = enemyAt(after, 'smokehound', 'b4');
    expect(legalStrikes(after, twin.id)[0]).toMatchObject({ damage: 2, lethal: true });
    expect(act(after, { type: 'strike', seat: 0, pieceId: twin.id, target: sq('b4') }).state.pieces[hound.id]).toBeUndefined();
  });

  it('ember_waltz swaps the hero with one of your units within 3; the hero gets 1 extra Strike', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const taper = unitAt(s, 'taper', 'f4');
    unitAt(s, 'lantern', 'b2');
    const uid = giveCard(s, 'ember_waltz');
    expect(optionSquares(cardTargets(s, 0, uid))).toEqual(['f4']);
    const after = playCard(s, uid, [taper]).state;
    expect(hero(after)).toMatchObject({ pos: sq('f4'), strikesLeft: 2 });
    expect(after.pieces[taper.id].pos).toEqual(sq('d2'));
  });

  it('riposte: a Snuff attack that damages the hero deals 1 back to the attacker (preview included)', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const after = playCard(s, giveCard(s, 'riposte'), [hero(s)]).state;
    expect(hero(after).charm?.id).toBe('riposte');
    const hound = enemyAt(after, 'smokehound', 'd3');
    lockMelee(after, hound, 'd2');
    const ended = act(after, { type: 'end_turn', seat: 0 }).state;
    expect(ended.phase).toBe('snuff_strike');
    const preview = previewSnuffStrike(ended);
    expect(preview.state.pieces[hound.id].hp).toBe(1);
    const real = applyAction(ended, { type: 'advance' });
    if (!real.ok) throw new Error(real.reason);
    expect(real.state.pieces[hound.id].hp).toBe(1);
    expect(heroPiece(real.state, 0).hp).toBe(5);
    expect(preview.state).toEqual(real.state);
  });

  it('crimson_finale: +1 damage and Flourish up to 4 times this turn', () => {
    const line = ['e3', 'f4', 'g5', 'h6'];
    const run = (withFinale: boolean): GameState => {
      let s = blankScenario('ember_duelist', 'd2');
      for (const at of line) enemyAt(s, 'smokehound', at);
      if (withFinale) s = playCard(s, giveCard(s, 'crimson_finale'), []).state;
      for (const at of line) {
        if (hero(s).strikesLeft === 0) break;
        s = act(s, { type: 'strike', seat: 0, pieceId: hero(s).id, target: sq(at) }).state;
      }
      return s;
    };
    const plain = run(false);
    expect(Object.values(plain.pieces).filter((p) => p.side === 'snuff')).toHaveLength(1);
    expect(plain.players[0].turn.flourishUsed).toBe(2);
    const finale = run(true);
    expect(Object.values(finale.pieces).filter((p) => p.side === 'snuff')).toHaveLength(0);
    expect(finale.players[0].turn).toMatchObject({ flourishUsed: 4, flourishCap: 4, heroDmgBonus: 1 });
  });
});
