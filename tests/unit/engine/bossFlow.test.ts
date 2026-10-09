/**
 * The Boss Night (GDD §4.1, §10.1, §13.1, §13.2.9): spawn and the boss arena, boss_intro, the
 * boss choice, no round cap with the boss toll and Plumes at every Tally, movement, victory on
 * boss death (victory beats defeat in one atomic effect), Retry, previews, determinism and whole
 * simulated Boss Nights for every boss and 1-4 seats.
 */
import { describe, expect, it } from 'vitest';
import { bossForSeed } from '../../../src/config';
import { applyAction, bossFallen, bossGlory, dangerMap, intentQueue, posKey, previewSnuffStrike, sq, sqName } from '../../../src/engine';
import type { Action, GameState } from '../../../src/engine';
import { spawnBoss } from '../../../src/engine/bosses';
import { bossIntentFrom, planBossIntents } from '../../../src/engine/bossIntents';
import { getContent } from '../../../src/engine/content';
import { makeCtx } from '../../../src/engine/state';
import { dealDamage } from '../../../src/engine/combat';
import { BOSSES, blankBoss, bossNight, bossPiece, playOut, toBossPlayers } from './bossHelpers';
import { act, blankScenario, candleAt, enemyAt, eventsOf, heroPiece, lockMelee, plumeAt, setTile, unitAt } from './helpers';

const reg = getContent();

function advanceTo(s: GameState, phase: GameState['phase']): GameState {
  let state = s;
  for (let guard = 0; guard < 20 && state.phase !== phase; guard++) state = act(state, { type: 'advance' }).state;
  expect(state.phase).toBe(phase);
  return state;
}

describe('spawn (§10.1, §13.3.4, §13.2.9)', () => {
  it('Vigil: the boss rises on hollow_nave at night_setup (d6 on 8×8, e7 on 10×10), before enemies and Plumes', () => {
    for (const [seats, anchor] of [
      [1, 'd6'],
      [3, 'e7'],
    ] as const) {
      const s = bossNight({ boss: 'nocturna', seats });
      expect(s.siteId).toBe('hollow_nave');
      const boss = bossPiece(s);
      expect([sqName(boss.pos), boss.size, boss.kind, boss.side, boss.flying]).toEqual([anchor, 2, 'boss', 'snuff', true]);
      const footprint = new Set([0, 1].flatMap((dx) => [0, 1].map((dy) => posKey({ x: boss.pos.x + dx, y: boss.pos.y + dy }))));
      expect(s.plumes.some((m) => footprint.has(posKey(m.pos)))).toBe(false);
      expect(Object.values(s.pieces).filter((p) => p.kind === 'enemy')).toHaveLength(seats + s.config.initial_enemies_mod);
      expect(s.roundsThisNight).toBeNull();
    }
  });

  it('Last Flame: the boss rises on the board centre (e5 on 10×10, f6 on 12×12)', () => {
    expect(sqName(bossPiece(bossNight({ boss: 'guttered_king', seats: 2, mode: 'last_flame' })).pos)).toBe('e5');
    expect(sqName(bossPiece(bossNight({ boss: 'guttered_king', seats: 4, mode: 'last_flame' })).pos)).toBe('f6');
  });

  it('pieces on the footprint are moved off it by the placement routine', () => {
    const s = blankScenario('sconce_paladin', 'a1', { overrides: { boss_choice: 'guttered_king' } });
    const taper = unitAt(s, 'taper', 'e5');
    plumeAt(s, 'd4');
    const ctx = makeCtx(s);
    spawnBoss(ctx, sq('d4'));
    expect(sqName(s.pieces[taper.id].pos)).toBe('c6');
    expect(s.plumes).toHaveLength(0);
    expect(eventsOf(ctx.events, 'piece_moved')).toEqual([expect.objectContaining({ pieceId: taper.id, kind: 'teleport' })]);
    expect(eventsOf(ctx.events, 'boss_spawned')).toEqual([{ type: 'boss_spawned', bossId: 'guttered_king', pieceId: bossPiece(s).id, anchor: sq('d4'), maxHp: s.boss?.maxHp }]);
  });

  it('boss_intro follows night_setup and is advanced like any automated phase', () => {
    let s = bossNight({ boss: 'hush_hierophant' });
    s = act(s, { type: 'ready', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('boss_intro');
    s = act(s, { type: 'advance' }).state;
    expect(s.round).toBe(1);
    expect(['omen', 'snuff_move']).toContain(s.phase);
  });

  it('boss_choice random draws from the setup stream (deterministic per seed); the Daily uses bossForSeed', () => {
    const drawn = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const id = bossNight({ boss: 'random', seed: `choice-${i}` }).boss?.id ?? '';
      expect(bossNight({ boss: 'random', seed: `choice-${i}` }).boss?.id).toBe(id);
      drawn.add(id);
    }
    expect(drawn).toEqual(new Set(BOSSES));
    const daily = blankScenario('sconce_paladin', 'a1', { seed: 'daily:2026-10-09', overrides: { boss_choice: 'random' }, flags: { daily: true } });
    spawnBoss(makeCtx(daily), sq('d4'));
    expect(daily.boss?.id).toBe(bossForSeed('daily:2026-10-09'));
  });
});

describe('the uncapped Vigil Boss Night (§4.1, §4.4, §13.1.2)', () => {
  it('has no round cap; the boss tolls Dread +1 at every Tally and Plumes are placed at every Tally', () => {
    let s = toBossPlayers(bossNight({ boss: 'hush_hierophant', overrides: { dread_max: 16, starting_dread: 0, plumes_mod: 0 } }));
    let tolls = 0;
    let tallyPlumes = 0;
    for (let round = 1; round <= 5 && !s.result; round++) {
      // Only the boss toll moves Dread here: every attack is called off.
      s.intents = [];
      for (const p of Object.values(s.pieces)) if (p.kind === 'enemy') delete s.pieces[p.id];
      s = act(s, { type: 'end_turn', seat: 0 }).state;
      s = advanceTo(s, 'tally');
      const { state, events } = act(s, { type: 'advance' });
      tolls += eventsOf(events, 'dread_changed').filter((e) => e.cause === 'boss_toll').length;
      tallyPlumes += Math.min(1, eventsOf(events, 'plume_placed').length);
      s = state;
      if (s.result) break;
      s = advanceTo(s, 'players');
    }
    expect(s.result).toBeNull();
    expect(s.round).toBe(6);
    expect(s.roundsThisNight).toBeNull();
    expect(tolls).toBe(5);
    expect(s.vigil?.dread).toBe(5);
    expect(tallyPlumes).toBe(5);
  });

  it('the boss moves toward the nearest hero, without trampling, crushing the Plumes it enters', () => {
    const s = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'd2');
    plumeAt(s, 'd5');
    s.phase = 'snuff_move';
    s.activeSeat = null;
    const { state, events } = act(s, { type: 'advance' });
    expect(sqName(bossPiece(state).pos)).toBe('d5');
    expect(state.plumes).toHaveLength(0);
    expect(eventsOf(events, 'piece_moved')[0]).toMatchObject({ pieceId: bossPiece(s).id, kind: 'boss_step', from: sq('d6'), to: sq('d5') });
  });

  it('a boss with every step blocked stays put; Nocturna’s moves are flights', () => {
    const walker = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'd1');
    for (const t of ['c5', 'd5', 'e5', 'f5', 'c6', 'f6', 'c7', 'f7', 'c8', 'd8', 'e8', 'f8']) setTile(walker, t, 'pillar');
    walker.phase = 'snuff_move';
    walker.activeSeat = null;
    expect(sqName(bossPiece(act(walker, { type: 'advance' }).state).pos)).toBe('d6');

    const s = blankBoss('nocturna', 'e7', 'sconce_paladin', 'a1');
    s.phase = 'snuff_move';
    s.activeSeat = null;
    const flown = act(s, { type: 'advance' });
    expect(eventsOf(flown.events, 'piece_moved')[0]).toMatchObject({ pieceId: bossPiece(s).id, kind: 'fly' });
  });

  it('Hot Wax: a Hierophant walks around it when it can, takes 1 when it must step in, and 1 more at Tally; the King is immune', () => {
    const around = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'd2');
    setTile(around, 'd5', 'hot_wax');
    around.phase = 'snuff_move';
    around.activeSeat = null;
    expect(sqName(bossPiece(act(around, { type: 'advance' }).state).pos)).toBe('e6');

    const forced = blankBoss('hush_hierophant', 'd6', 'sconce_paladin', 'd2');
    for (const t of ['c5', 'f5', 'c6', 'f6', 'c7', 'f7', 'c8', 'd8', 'e8', 'f8']) setTile(forced, t, 'pillar');
    setTile(forced, 'd5', 'hot_wax');
    forced.phase = 'snuff_move';
    forced.activeSeat = null;
    const moved = act(forced, { type: 'advance' });
    expect(sqName(bossPiece(moved.state).pos)).toBe('d5');
    expect(eventsOf(moved.events, 'damage').find((e) => e.cause === 'hot_wax')).toMatchObject({ amount: 1, pieceId: bossPiece(forced).id });

    const king = blankBoss('guttered_king', 'd5', 'sconce_paladin', 'a1');
    const hierophant = blankBoss('hush_hierophant', 'd5', 'sconce_paladin', 'a1');
    for (const t of [king, hierophant]) {
      setTile(t, 'e6', 'hot_wax');
      t.phase = 'tally';
      t.activeSeat = null;
    }
    const kingHp = bossPiece(king).hp;
    const hierophantHp = bossPiece(hierophant).hp;
    expect(bossPiece(act(king, { type: 'advance' }).state).hp).toBe(kingHp);
    expect(bossPiece(act(hierophant, { type: 'advance' }).state).hp).toBe(hierophantHp - 1);
  });
});

describe('victory and defeat (§13.1.5)', () => {
  it('the boss falling wins at once: every Snuff and Plume vanishes, stars are scored', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'sconce_paladin', 'd3');
    enemyAt(s, 'sootling', 'a8');
    plumeAt(s, 'h8');
    bossPiece(s).hp = 3;
    const { state, events } = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('d4') });
    expect(state.result).toMatchObject({ mode: 'vigil', outcome: 'victory', stars: 3 });
    expect(state.phase).toBe('game_over');
    expect(Object.values(state.pieces).some((p) => p.side === 'snuff')).toBe(false);
    expect(state.plumes).toHaveLength(0);
    expect(bossFallen(state)).toBe(true);
    expect(state.boss?.killerSeat).toBe(0);
    expect(eventsOf(events, 'piece_died').map((e) => [e.defId, e.cause])).toEqual([
      ['hush_hierophant', 'strike'],
      ['sootling', 'boss_death'],
    ]);
  });

  it('victory beats defeat in the same atomic effect: Riposte fells the boss on the hit that fills Dread', () => {
    const setup = (riposte: boolean) => {
      const s = blankBoss('guttered_king', 'd4', 'ember_duelist', 'd3');
      const hero = heroPiece(s, 0);
      hero.hp = 1;
      if (riposte) {
        hero.charm = { uid: `c${s.nextId++}`, id: 'riposte', tempered: false };
        hero.charmSeat = 0;
      }
      if (s.vigil) s.vigil.dread = s.vigil.dreadMax - 1;
      bossPiece(s).hp = 1;
      const boss = bossPiece(s);
      const plan = planBossIntents(s, reg, boss, boss.pos, ['ladle_slam']);
      s.intents = plan.map((p) => bossIntentFrom(s, boss, p.def, p.choice));
      s.phase = 'snuff_strike';
      s.activeSeat = null;
      return act(s, { type: 'advance' }).state;
    };
    const won = setup(true);
    expect(won.vigil?.dread).toBe(won.vigil?.dreadMax);
    expect(won.result).toMatchObject({ outcome: 'victory', stars: 1 });
    expect(setup(false).result).toMatchObject({ outcome: 'defeat' });
  });

  it('a Dread defeat lands after the hit that caused it: the struck Candle is snuffed first', () => {
    const s = blankScenario('sconce_paladin', 'h1');
    const candle = candleAt(s, 'd3');
    candle.hp = 1;
    if (s.vigil) s.vigil.dread = s.vigil.dreadMax - 1;
    lockMelee(s, enemyAt(s, 'sootling', 'd4'), 'd3');
    s.phase = 'snuff_strike';
    s.activeSeat = null;
    const { state, events } = act(s, { type: 'advance' });
    expect(state.result).toMatchObject({ outcome: 'defeat', finalDread: state.vigil?.dreadMax });
    expect(state.pieces[candle.id]).toBeUndefined();
    const order = events.map((e) => e.type).filter((t) => t === 'piece_died' || t === 'game_over');
    expect(order).toEqual(['piece_died', 'game_over']);
  });
});

describe('Retry and Last Flame data', () => {
  it('Retry this Night on the Boss Night restores the boss exactly as it rose', () => {
    const setup = bossNight({ boss: 'guttered_king', overrides: { retry_night: true } });
    const risen = setup.boss;
    let s = toBossPlayers(setup);
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    s = advanceTo(s, 'players');
    s = act(s, { type: 'retry_night', seat: 0 }).state;
    expect(s.phase).toBe('night_setup');
    expect(s.boss).toEqual(risen);
    expect(bossPiece(s).hp).toBe(s.boss?.maxHp);
  });

  it('Last Flame: Glory data per seat (+1 per full 10% of max HP, +2 for the killing blow)', () => {
    const s = bossNight({ boss: 'nocturna', seats: 2, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } });
    const state = s.boss;
    if (!state) throw new Error('no boss');
    const { base, perPlayer } = getContent().bosses.byId.nocturna.hp;
    expect(state.maxHp).toBe(base + perPlayer * 2);
    // A 38-HP Nocturna (the original 16 + 11 × 2) keeps the tenths below easy to follow.
    state.maxHp = 38;
    state.damageBySeat = [7.6, 3.7];
    expect(bossGlory(s, 0)).toEqual({ damage: 7.6, damageGlory: 2, killingBlow: 0 });
    expect(bossGlory(s, 1).damageGlory).toBe(0);
  });

  it('Last Flame: the boss falling clears the Snuff but leaves the end of the game to the round’s Tally', () => {
    const s = bossNight({ boss: 'hush_hierophant', seats: 2, mode: 'last_flame' });
    const ctx = makeCtx(s);
    dealDamage(ctx, bossPiece(s), 999, { cause: 'card', sourceKind: 'card', sourceId: null, seat: 1 });
    expect(s.result).toBeNull();
    expect(bossFallen(s)).toBe(true);
    expect(s.boss?.killerSeat).toBe(1);
    expect(bossGlory(s, 1)).toMatchObject({ damageGlory: 10, killingBlow: 2 });
    expect(Object.values(s.pieces).some((p) => p.side === 'snuff')).toBe(false);
  });
});

describe('queue, danger map and previews include the boss', () => {
  it('intentQueue lists boss intents first with readable text; dangerMap covers their tiles', () => {
    let s = toBossPlayers(bossNight({ boss: 'hush_hierophant', seed: 'queue' }));
    const queue = intentQueue(s);
    expect(queue[0].text).toMatch(/^Hush Hierophant → Bell Drop /);
    expect(queue[1].text).toMatch(/^Hush Hierophant → Hushwave around it for \d/);
    const danger = dangerMap(s);
    for (const t of queue[0].tiles) expect(danger[posKey(t)]).toBeGreaterThanOrEqual(3);
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s.phase).toBe('snuff_strike');
    const preview = previewSnuffStrike(s);
    const real = applyAction(s, { type: 'advance' });
    if (!real.ok) throw new Error(real.reason);
    expect(preview.state).toEqual(real.state);
    expect(preview.events).toEqual(real.events);
  });
});

describe('whole Boss Nights (scripted greedy players)', () => {
  it('every boss, 1-4 seats: no exceptions, preview parity at every Snuff Strike, victory and defeat both reachable', () => {
    let victories = 0;
    let defeats = 0;
    let parity = 0;
    const checkParity = (s: GameState) => {
      if (s.phase !== 'snuff_strike') return;
      const preview = previewSnuffStrike(s);
      const real = applyAction(s, { type: 'advance' });
      if (!real.ok) throw new Error(real.reason);
      expect(preview.state).toEqual(real.state);
      expect(preview.events).toEqual(real.events);
      parity += 1;
    };
    for (const boss of BOSSES) {
      for (let seats = 1; seats <= 4; seats++) {
        const winnable = bossNight({ boss, seats, seed: `win-${boss}-${seats}`, overrides: { boss_hp_multiplier: 0.5, dread_max: 16, moth_die: true } });
        const won = playOut(winnable, 'greedy', 6000, checkParity);
        expect(won.result, `${boss} ${seats}`).not.toBeNull();
        if (won.result?.mode === 'vigil' && won.result.outcome === 'victory') {
          victories += 1;
          expect(bossFallen(won)).toBe(true);
        }
        const lost = playOut(bossNight({ boss, seats, seed: `lose-${boss}-${seats}` }), 'pass', 6000);
        expect(lost.result, `${boss} ${seats} passive`).toMatchObject({ mode: 'vigil', outcome: 'defeat', finalDread: lost.config.dread_max });
        defeats += 1;
      }
    }
    expect(victories).toBeGreaterThanOrEqual(9);
    expect(defeats).toBe(12);
    expect(parity).toBeGreaterThan(30);
  }, 240_000);

  it('determinism: the same seed and action list give the same Boss Night', () => {
    for (const boss of BOSSES) {
      const make = () => bossNight({ boss, seats: 2, seed: `det-${boss}`, overrides: { moth_die: true, boss_hp_multiplier: 0.6 } });
      const actions: Action[] = [];
      const end = playOut(make(), 'greedy', 3000, undefined, actions);
      let replayed = make();
      for (const action of actions) replayed = act(replayed, action).state;
      expect(JSON.stringify(replayed)).toBe(JSON.stringify(end));
      expect(JSON.parse(JSON.stringify(end))).toEqual(end);
    }
  }, 120_000);
});
