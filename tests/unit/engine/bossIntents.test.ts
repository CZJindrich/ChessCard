/**
 * The 9 boss intents (GDD §10.5): areas, reach, targeting, resolution, duplicates, queue order,
 * Dazed and reversal (§6.8.4), and the intent-queue text.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, cardTargets, getContent, intentQueue, sq, sqName } from '../../../src/engine';
import type { GameState, Intent, Piece } from '../../../src/engine';
import { bossIntentFrom, planBossIntents } from '../../../src/engine/bossIntents';
import { bossSnuffMove } from '../../../src/engine/bosses';
import { applyDaze } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import { blankBoss, bossPiece } from './bossHelpers';
import { act, candleAt, enemyAt, eventsOf, giveCard, heroPiece, playCard, setTile, unitAt } from './helpers';

const reg = getContent();

/** Lock the given intents from the boss's current tile (planned exactly as at a Snuff Move). */
function lock(s: GameState, ...ids: string[]): Intent[] {
  const boss = bossPiece(s);
  const intents = planBossIntents(s, reg, boss, boss.pos, ids).map((p) => bossIntentFrom(s, boss, p.def, p.choice));
  s.intents.push(...intents);
  s.intents.forEach((intent, i) => (intent.queue = i + 1));
  return intents;
}

function squares(tiles: readonly { x: number; y: number }[]): string[] {
  return tiles.map(sqName).sort();
}

/** Resolve the locked intents (the Snuff Strike). */
function snuffStrike(s: GameState) {
  s.phase = 'snuff_strike';
  s.activeSeat = null;
  return act(s, { type: 'advance' });
}

function litShrine(s: GameState, square: string): void {
  setTile(s, square, 'votive_shrine');
  const p = sq(square);
  s.board.tiles[p.y * s.board.w + p.x].shrineLit = true;
}

function hp(s: GameState, piece: Piece): number {
  return s.pieces[piece.id]?.hp ?? 0;
}

describe('Bell Drop (block2x2, artillery within 5, 3 damage)', () => {
  it('drops on the block with the most heroes, then Wickfolk, then Candles', () => {
    const s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'a1');
    unitAt(s, 'taper', 'g2');
    unitAt(s, 'taper', 'h2');
    unitAt(s, 'taper', 'g3');
    const [bell] = lock(s, 'bell_drop');
    expect(squares(bell.tiles)).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(bell).toMatchObject({ kind: 'artillery', shape: 'block2x2', damage: 3, targetId: heroPiece(s, 0).id });
  });

  it('with no hero in reach the most Wickfolk wins; with none, the Candles', () => {
    const s = blankBoss('hush_hierophant', 'e7', 'sconce_paladin', 'a1');
    unitAt(s, 'taper', 'g4');
    unitAt(s, 'taper', 'h4');
    unitAt(s, 'taper', 'c4');
    // g3-h4 and g4-h5 both cover the two Tapers: reading order takes the higher block.
    expect(squares(lock(s, 'bell_drop')[0].tiles)).toEqual(['g4', 'g5', 'h4', 'h5']);
    const t = blankBoss('hush_hierophant', 'e7', 'sconce_paladin', 'a1');
    candleAt(t, 'c3');
    expect(lock(t, 'bell_drop')[0].tiles.map(sqName)).toContain('c3');
  });

  it('reaches only blocks anchored within 5 of the footprint (a1 is 6 from e7)', () => {
    const s = blankBoss('hush_hierophant', 'e7', 'sconce_paladin', 'a1');
    const [bell] = lock(s, 'bell_drop');
    expect(bell.tiles.map(sqName)).not.toContain('a1');
  });

  it('a duplicate Bell Drop picks a different target when it can', () => {
    const s = blankBoss('hush_hierophant', 'e7', 'sconce_paladin', 'a1');
    unitAt(s, 'taper', 'a3');
    unitAt(s, 'taper', 'h3');
    const [first, second] = lock(s, 'bell_drop', 'bell_drop');
    expect(squares(first.tiles)).toEqual(['a3', 'a4', 'b3', 'b4']);
    expect(squares(second.tiles)).toEqual(['g3', 'g4', 'h3', 'h4']);
    const [, again] = lock(s, 'bell_drop', 'bell_drop').map((i) => squares(i.tiles));
    expect(again).toEqual(['g3', 'g4', 'h3', 'h4']);
  });

  it('hits every piece in the block for 3, Snuff included, never the boss; ignores line of sight', () => {
    const s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'a1');
    const taper = unitAt(s, 'taper', 'b2');
    const hulk = enemyAt(s, 'drip_hulk', 'b1');
    setTile(s, 'c3', 'pillar');
    lock(s, 'bell_drop');
    const bossHp = bossPiece(s).hp;
    const { state } = snuffStrike(s);
    expect(heroPiece(state, 0).hp).toBe(5);
    expect(state.pieces[taper.id]).toBeUndefined();
    expect(hp(state, hulk)).toBe(3);
    expect(bossPiece(state).hp).toBe(bossHp);
  });
});

describe('Hushwave (ring12, 1 damage, push 1 outward, centred)', () => {
  it('hits the 12 tiles around the footprint and pushes outward, diagonally at the corners', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'sconce_paladin', 'h8');
    const north = unitAt(s, 'sconce_squire', 'd6');
    const corner = unitAt(s, 'sconce_squire', 'c3');
    north.ward = false;
    corner.ward = false;
    const [wave] = lock(s, 'hushwave');
    expect(squares(wave.tiles)).toEqual(['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6']);
    expect(wave.centered).toBe(true);
    const { state } = snuffStrike(s);
    expect(sqName(state.pieces[north.id].pos)).toBe('d7');
    expect(sqName(state.pieces[corner.id].pos)).toBe('b2');
    expect(state.pieces[north.id].hp).toBe(2);
  });
});

describe('Silencing Peal (global: 1 card per seat during the next players phase)', () => {
  it('sets the card limit for the next players phase only, with the reason source', () => {
    let s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'a1');
    const [peal] = lock(s, 'silencing_peal');
    expect(peal).toMatchObject({ kind: 'global', shape: 'global', damage: 0, tiles: [] });
    s = snuffStrike(s).state;
    expect(s.activeRules).toContainEqual(expect.objectContaining({ rule: 'card_limit', value: 1, source: { kind: 'boss', id: 'silencing_peal' }, expires: 'next_players_phase' }));
    while (s.phase !== 'players') s = act(s, { type: 'advance' }).state;
    expect(s.players[0].turn.cardLimit).toBe(1);
    const first = giveCard(s, 'quickwick');
    const second = giveCard(s, 'quickwick');
    s = playCard(s, first, [heroPiece(s, 0)]).state;
    const blocked = applyAction(s, { type: 'play_card', seat: 0, cardUid: second, targets: [{ kind: 'piece', pieceId: heroPiece(s, 0).id }] });
    expect(blocked).toMatchObject({ ok: false, reason: 'CARD_LIMIT', params: { source: 'Silencing Peal' } });
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s.activeRules.some((r) => r.source.id === 'silencing_peal')).toBe(false);
  });
});

describe('Ladle Slam (side2, 3 damage, push 1 away)', () => {
  it('slams the side with the most heroes, then the most Wickfolk', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'd3');
    unitAt(s, 'taper', 'f4');
    unitAt(s, 'taper', 'f5');
    const [ladle] = lock(s, 'ladle_slam');
    expect(squares(ladle.tiles)).toEqual(['d3', 'e3']);
    const t = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'h8');
    unitAt(t, 'taper', 'f4');
    unitAt(t, 'taper', 'f5');
    unitAt(t, 'taper', 'c4');
    expect(squares(lock(t, 'ladle_slam')[0].tiles)).toEqual(['f4', 'f5']);
  });

  it('deals 3 and pushes the survivor 1 away from the footprint', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'h8');
    const ram = unitAt(s, 'brass_ram', 'e3');
    lock(s, 'ladle_slam');
    const { state } = snuffStrike(s);
    expect(state.pieces[ram.id]).toMatchObject({ hp: 1, pos: sq('e2') });
  });
});

describe('Sceptre Sweep (beam2, 4 tiles, 2 damage, pierce)', () => {
  it('sweeps the orthogonal direction with the most Wickfolk and hits every piece in the beam', () => {
    const s = blankBoss('guttered_king', 'b4', 'sconce_paladin', 'b7');
    const near = unitAt(s, 'brass_ram', 'd4');
    const far = unitAt(s, 'brass_ram', 'g5');
    const [sweep] = lock(s, 'sceptre_sweep');
    expect(squares(sweep.tiles)).toEqual(['d4', 'd5', 'e4', 'e5', 'f4', 'f5', 'g4', 'g5']);
    expect(sweep).toMatchObject({ kind: 'area', shape: 'beam2', dir: { x: 1, y: 0 }, pierce: true, damage: 2 });
    const { state } = snuffStrike(s);
    expect([state.pieces[near.id].hp, state.pieces[far.id].hp]).toEqual([2, 2]);
  });

  it('a Pillar stops its lane; the other lane runs on', () => {
    const s = blankBoss('guttered_king', 'b4', 'sconce_paladin', 'h1');
    unitAt(s, 'brass_ram', 'd4');
    unitAt(s, 'brass_ram', 'd5');
    setTile(s, 'e5', 'pillar');
    expect(squares(lock(s, 'sceptre_sweep')[0].tiles)).toEqual(['d4', 'd5', 'e4', 'f4', 'g4']);
  });

  it('two Sceptre Sweeps take different directions when they can', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'd7');
    unitAt(s, 'taper', 'g4');
    const [a, b] = lock(s, 'sceptre_sweep', 'sceptre_sweep');
    expect(a.dir).not.toEqual(b.dir);
  });
});

describe('Wax Spit (single, artillery 2-4, 1 damage, leaves Hot Wax)', () => {
  it('spits at a hero in reach, else any Wickfolk piece, and the tile turns to Hot Wax', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'd1');
    unitAt(s, 'taper', 'b4');
    const [spit] = lock(s, 'wax_spit');
    expect(spit.tiles.map(sqName)).toEqual(['d1']);
    const { state } = snuffStrike(s);
    expect(heroPiece(state, 0).hp).toBe(7);
    expect(state.board.tiles[0 * 8 + 3].type).toBe('hot_wax');
  });

  it('a hero within 1 is out of reach (minimum 2): the spit goes to another Wickfolk piece', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'c3');
    unitAt(s, 'taper', 'a1');
    expect(lock(s, 'wax_spit')[0].tiles.map(sqName)).toEqual(['a1']);
  });
});

describe('Wing Gust (beam2, 3 tiles, 1 damage, pierce, push 2 along)', () => {
  it('blows every piece in the gust 2 tiles along it, the farthest first', () => {
    const s = blankBoss('nocturna', 'c3', 'sconce_paladin', 'a8');
    const near = unitAt(s, 'brass_ram', 'e3');
    const far = unitAt(s, 'brass_ram', 'f3');
    const [gust] = lock(s, 'wing_gust');
    expect(squares(gust.tiles)).toEqual(['e3', 'e4', 'f3', 'f4', 'g3', 'g4']);
    const { state } = snuffStrike(s);
    expect([sqName(state.pieces[far.id].pos), sqName(state.pieces[near.id].pos)]).toEqual(['h3', 'g3']);
    expect([state.pieces[far.id].hp, state.pieces[near.id].hp]).toEqual([3, 3]);
  });
});

describe('Hunger (single, within 6, 3 damage, devour_light)', () => {
  function hungerScene(): GameState {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    candleAt(s, 'h1');
    unitAt(s, 'lantern', 'b8');
    litShrine(s, 'a8');
    return s;
  }

  it('bites the brightest light: Lit Shrine > Lantern > Vigil Candle > hero', () => {
    const s = hungerScene();
    expect(lock(s, 'hunger')[0].tiles.map(sqName)).toEqual(['a8']);
    s.board.tiles[7 * 8].shrineLit = false;
    expect(lock(s, 'hunger').at(-1)?.tiles.map(sqName)).toEqual(['b8']);
    const t = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    candleAt(t, 'h1');
    expect(lock(t, 'hunger')[0].tiles.map(sqName)).toEqual(['h1']);
    const u = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    expect(lock(u, 'hunger')[0].tiles.map(sqName)).toEqual(['a1']);
  });

  it('ties go to the nearest light, and two Hungers bite two different lights', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    candleAt(s, 'h1');
    candleAt(s, 'b3');
    const [a, b] = lock(s, 'hunger', 'hunger');
    expect([sqName(a.tiles[0]), sqName(b.tiles[0])]).toEqual(['b3', 'h1']);
  });

  it('heals 3 when it snuffs a Candle or puts out a Lit Shrine; not when the hero survives', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    candleAt(s, 'h1');
    bossPiece(s).hp -= 5;
    lock(s, 'hunger');
    const candleBite = snuffStrike(s);
    expect(bossPiece(candleBite.state).hp).toBe(bossPiece(s).hp + 3);
    expect(eventsOf(candleBite.events, 'heal')).toHaveLength(1);

    const shrine = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    litShrine(shrine, 'a8');
    bossPiece(shrine).hp -= 5;
    lock(shrine, 'hunger');
    const dark = snuffStrike(shrine).state;
    expect(dark.board.tiles[7 * 8].shrineLit).toBe(false);
    expect(bossPiece(dark).hp).toBe(bossPiece(shrine).hp + 3);

    const hero = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    bossPiece(hero).hp -= 5;
    lock(hero, 'hunger');
    const bitten = snuffStrike(hero).state;
    expect(heroPiece(bitten, 0).hp).toBe(5);
    expect(bossPiece(bitten).hp).toBe(bossPiece(hero).hp);
  });

  it('heals when the bite fells a piece; the heal never goes above max HP', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    heroPiece(s, 0).hp = 2;
    bossPiece(s).hp -= 1;
    lock(s, 'hunger');
    const { state } = snuffStrike(s);
    expect(heroPiece(state, 0).smoldering).toBe(true);
    expect(bossPiece(state).hp).toBe(state.boss?.maxHp);
  });
});

describe('Dust Storm (square3 centred within 4, 1 damage, Dazed)', () => {
  it('centres on the tile hitting the most Wickfolk and Dazes the survivors', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'h1');
    const a = unitAt(s, 'brass_ram', 'b1');
    const b = unitAt(s, 'brass_ram', 'c1');
    const c = unitAt(s, 'brass_ram', 'c2');
    const [storm] = lock(s, 'dust_storm');
    expect(squares(storm.tiles)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
    const { state, events } = snuffStrike(s);
    for (const p of [a, b, c]) expect(state.pieces[p.id]).toMatchObject({ hp: 3, dazed: true });
    expect(eventsOf(events, 'status_changed').filter((e) => e.status === 'dazed')).toHaveLength(3);
  });
});

describe('boss intents in the Snuff Strike (§6.8)', () => {
  it('boss intents are declared and resolve before every enemy intent', () => {
    const s = blankBoss('guttered_king', 'd5', 'sconce_paladin', 'd2');
    enemyAt(s, 'sootling', 'a8');
    s.phase = 'snuff_move';
    s.activeSeat = null;
    const { state } = act(s, { type: 'advance' });
    const bossId = state.boss?.pieceId;
    const owners = state.intents.map((i) => i.attackerId === bossId);
    expect(owners.slice(0, 2)).toEqual([true, true]);
    expect(owners.slice(2).every((o) => !o)).toBe(true);
    expect(state.intents.map((i) => i.queue)).toEqual(state.intents.map((_, i) => i + 1));
  });

  it('Dazed cancels the boss’s last intent; a Dazed boss without intents drops its last one next time', () => {
    const s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'a1');
    lock(s, 'bell_drop', 'hushwave');
    const ctx = makeCtx(s);
    applyDaze(ctx, bossPiece(s));
    expect(s.intents.map((i) => i.bossIntentId)).toEqual(['bell_drop']);
    expect(eventsOf(ctx.events, 'intent_cancelled')).toEqual([expect.objectContaining({ reason: 'dazed' })]);
    expect(bossPiece(s).dazed).toBe(false);

    const t = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'a1');
    applyDaze(makeCtx(t), bossPiece(t));
    expect(bossPiece(t).dazed).toBe(true);
    bossSnuffMove(makeCtx(t));
    expect(t.intents.map((i) => i.bossIntentId)).toEqual(['bell_drop']);
    expect(bossPiece(t).dazed).toBe(false);
  });

  it('Turnabout mirrors a Bell Drop through the boss and flips sides and beams; Hushwave stays', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'sconce_paladin', 'c3');
    const [bell, wave] = lock(s, 'bell_drop', 'hushwave');
    expect(squares(bell.tiles)).toEqual(['b3', 'b4', 'c3', 'c4']);
    const { state, events } = playCard(s, giveCard(s, 'turnabout'), [bossPiece(s)]);
    const after = Object.fromEntries(state.intents.map((i) => [i.bossIntentId, squares(i.tiles)]));
    expect(after.bell_drop).toEqual(['f5', 'f6', 'g5', 'g6']);
    expect(after.hushwave).toEqual(squares(wave.tiles));
    expect(eventsOf(events, 'intent_reversed')).toHaveLength(1);

    const k = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'd3');
    unitAt(k, 'taper', 'f4');
    unitAt(k, 'taper', 'f5');
    const [ladle, sweep] = lock(k, 'ladle_slam', 'sceptre_sweep');
    expect([squares(ladle.tiles), sweep.dir]).toEqual([['d3', 'e3'], { x: 1, y: 0 }]);
    const flipped = playCard(k, giveCard(k, 'turnabout'), [bossPiece(k)]).state;
    expect(squares(flipped.intents[0].tiles)).toEqual(['d6', 'e6']);
    expect(squares(flipped.intents[1].tiles)).toEqual(['a4', 'a5', 'b4', 'b5', 'c4', 'c5']);
  });

  it('a boss with only centred or global intents gives Turnabout NO_DIRECTION', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'sconce_paladin', 'c3');
    lock(s, 'hushwave', 'silencing_peal');
    const info = cardTargets(s, 0, giveCard(s, 'turnabout'));
    expect(info.playable).toBe(false);
    expect(info.reason).toBe('NO_DIRECTION');
  });
});

describe('intent queue text (§15.4)', () => {
  it('names the boss, the intent, its tiles and damage, then who it hits', () => {
    const s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'h8');
    s.pieces[heroPiece(s, 0).id].pos = sq('d3');
    lock(s, 'bell_drop', 'hushwave', 'silencing_peal');
    const texts = intentQueue(s).map((v) => v.text);
    expect(texts[0]).toMatch(/^Hush Hierophant → Bell Drop on [a-h]\d-[a-h]\d for 3: d3 Brannoc$/);
    expect(texts[1]).toBe('Hush Hierophant → Hushwave around it for 1, push 1 outward');
    expect(texts[2]).toBe('Hush Hierophant → Silencing Peal: each seat may play at most 1 card next turn');
  });

  it('beams name their direction; Candles add the Dread note', () => {
    const s = blankBoss('guttered_king', 'b4', 'sconce_paladin', 'h8');
    candleAt(s, 'e4');
    lock(s, 'sceptre_sweep');
    expect(intentQueue(s)[0].text).toBe('The Guttered King → Sceptre Sweep east on d4-g5 for 2: e4 Vigil Candle (Dread +1)');
  });
});
