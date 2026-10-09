/** Tolls (GDD §13.4: all 14, eligibility, chooser) and the Moth Die (§13.5: all 6 faces, Ill Omen). */
import { describe, expect, it } from 'vitest';
import { cardTargets, dangerMap, getContent, legalMoves, legalStrikes, previewSnuffStrike, sq, streamDie, validateAction } from '../../../src/engine';
import type { GameEvent, GameState } from '../../../src/engine';
import { applyToll, tollChooser, tollEligible } from '../../../src/engine/phases';
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
  newGame,
  playCard,
  setTile,
  unitAt,
} from './helpers';
import { runGame } from './driver';

function toll(s: GameState, id: string): GameState {
  applyToll(makeCtx(s), 0, id);
  return s;
}

/** End seat 0's turn and advance until its next seat turn starts (events collected). */
function nextTurn(s: GameState): { state: GameState; events: GameEvent[] } {
  let r = act(s, { type: 'end_turn', seat: 0 });
  const events = [...r.events];
  for (let i = 0; i < 20 && r.state.phase !== 'players'; i++) {
    r = act(r.state, { type: 'advance' });
    events.push(...r.events);
  }
  return { state: r.state, events };
}

function tiles(s: GameState, type: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  s.board.tiles.forEach((t, i) => {
    if (t.type === type) out.push({ x: i % s.board.w, y: Math.floor(i / s.board.w) });
  });
  return out;
}

describe('Blessings', () => {
  it('candlemas_blessing: every hero and Vigil Candle starts the Night with Ward', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const candle = candleAt(s, 'c4');
    const taper = unitAt(s, 'taper', 'e2');
    toll(s, 'candlemas_blessing');
    expect([heroPiece(s, 0).ward, s.pieces[candle.id].ward, s.pieces[taper.id].ward]).toEqual([true, true, false]);
  });

  it('lucky_wick: hands draw up to 6', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'lucky_wick');
    expect(nextTurn(s).state.players[0].hand).toHaveLength(6);
  });

  it('hearthwind: every Wickfolk piece heals 1 at every Tally', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'hearthwind');
    heroPiece(s, 0).hp = 3;
    const squire = unitAt(s, 'sconce_squire', 'h8');
    squire.hp = 1;
    const candle = candleAt(s, 'a8');
    candle.hp = 2;
    const after = nextTurn(s).state;
    expect([heroPiece(after, 0).hp, after.pieces[squire.id].hp, after.pieces[candle.id].hp]).toEqual([4, 2, 2]);
  });

  it('peddler_of_wicks: +1 Flame at the start of every seat turn', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'peddler_of_wicks');
    expect(nextTurn(s).state.players[0].flame).toBe(4);
  });

  it('moth_migration: each hero starts the Night with a free Velvet Moth next to it', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'moth_migration');
    const moths = Object.values(s.pieces).filter((p) => p.defId === 'velvet_moth');
    expect(moths).toHaveLength(1);
    expect(moths[0]).toMatchObject({ owner: 0, pos: sq('c3') });
    const full = blankScenario('sconce_paladin', 'd2', { overrides: { unit_limit: 2 } });
    unitAt(full, 'taper', 'a1');
    unitAt(full, 'taper', 'b1');
    toll(full, 'moth_migration');
    expect(Object.values(full.pieces).some((p) => p.defId === 'velvet_moth')).toBe(false);
  });
});

describe('Curses', () => {
  it('soot_fog: every Wickfolk range is 1 shorter (minimum 1)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    enemyAt(s, 'sootling', 'd5');
    const lantern = unitAt(s, 'lantern', 'a1');
    enemyAt(s, 'drip_hulk', 'a5');
    expect(cardTargets(s, 0, giveCard(s, 'spark')).playable).toBe(true);
    expect(legalStrikes(s, lantern.id)).toHaveLength(1);
    toll(s, 'soot_fog');
    expect(cardTargets(s, 0, giveCard(s, 'spark'))).toMatchObject({ playable: false, rangeRing: { radius: 2 } });
    expect(legalStrikes(s, lantern.id)).toHaveLength(0);
    expect(cardTargets(s, 0, giveCard(s, 'shield_bash')).rangeRing?.radius).toBe(1);
  });

  it('bell_of_embers: Snuff attacks also apply Burn', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'bell_of_embers');
    const hound = enemyAt(s, 'smokehound', 'd3');
    lockMelee(s, hound, 'd2');
    const ended = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(dangerMap(ended)).toEqual({ '3,1': 1 });
    expect(heroPiece(previewSnuffStrike(ended).state, 0)).toMatchObject({ hp: 7, burn: 2 });
    const struck = act(ended, { type: 'advance' }).state;
    expect(heroPiece(struck, 0)).toMatchObject({ hp: 7, burn: 2 });
  });

  it('waxen_rain: every Plume placement adds 2 Hot Wax pools on empty flagstones at least 2 from every hero', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'waxen_rain');
    const after = nextTurn(s).state;
    const wax = tiles(after, 'hot_wax');
    expect(wax).toHaveLength(2);
    for (const p of wax) expect(Math.max(Math.abs(p.x - 3), Math.abs(p.y - 1))).toBeGreaterThanOrEqual(2);
  });

  it('crumbling_nave: Pillars crumble into Rubble and 4 more Rubble tiles appear', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    setTile(s, 'b6', 'pillar');
    setTile(s, 'g6', 'pillar');
    toll(s, 'crumbling_nave');
    expect(tiles(s, 'pillar')).toHaveLength(0);
    expect(tiles(s, 'rubble')).toHaveLength(6);
  });

  it('restless_soot: Snuff steps and slides move 1 farther', () => {
    const s = blankScenario('sconce_paladin', 'a1');
    const hound = enemyAt(s, 'smokehound', 'd4');
    expect(legalMoves(s, hound.id)).not.toContainEqual(sq('d7'));
    toll(s, 'restless_soot');
    expect(legalMoves(s, hound.id)).toContainEqual(sq('d7'));
  });

  it('shifting_chimneys: at every Tally each Chimney pair moves to new empty flagstones at least 2 from every hero', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    setTile(s, 'c5', 'chimney', 0);
    setTile(s, 'g7', 'chimney', 0);
    toll(s, 'shifting_chimneys');
    const after = nextTurn(s).state;
    const chimneys = tiles(after, 'chimney');
    expect(chimneys).toHaveLength(2);
    expect(chimneys).not.toContainEqual(sq('c5'));
    expect(chimneys).not.toContainEqual(sq('g7'));
    for (const p of chimneys) expect(after.board.tiles[p.y * after.board.w + p.x].chimneyPair).toBe(0);
  });

  it('muffled_nave: each seat may play at most 2 cards per seat turn', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'muffled_nave');
    const hulk = enemyAt(s, 'drip_hulk', 'd4');
    let state = playCard(s, giveCard(s, 'spark'), [hulk]).state;
    state = playCard(state, giveCard(state, 'spark'), [state.pieces[hulk.id]]).state;
    expect(state.players[0].turn).toMatchObject({ cardsPlayed: 2, cardLimit: 2 });
    expect(cardTargets(state, 0, giveCard(state, 'quickwick'))).toMatchObject({ playable: false, reason: 'CARD_LIMIT', params: { source: 'Muffled Nave' } });
    const next = nextTurn(state).state;
    expect(cardTargets(next, 0, giveCard(next, 'quickwick')).playable).toBe(true);
  });

  it('black_sun: +1 Plume at every Plume placement', () => {
    const plain = nextTurn(blankScenario('sconce_paladin', 'd2')).events;
    const cursed = nextTurn(toll(blankScenario('sconce_paladin', 'd2'), 'black_sun')).events;
    const scheduled = (events: GameEvent[]) => eventsOf(events, 'plume_placed').filter((e) => e.source === 'schedule').length;
    expect(scheduled(cursed)).toBe(scheduled(plain) + 1);
  });

  it('a Curse sets the Chandlery reward (take 2)', () => {
    const s = toll(blankScenario('sconce_paladin', 'd2'), 'black_sun');
    expect(s.toll).toMatchObject({ active: 'black_sun', curseReward: true });
    expect(toll(blankScenario('sconce_paladin', 'd2'), 'lucky_wick').toll.curseReward).toBe(false);
  });
});

describe('Toll eligibility and chooser', () => {
  it('requires: Moth Die on, a Pillar, a Chimney pair, Plumes placed', () => {
    const reg = getContent();
    const s = blankScenario('sconce_paladin', 'd2', { overrides: { moth_die: false } });
    expect(tollEligible(s, reg.tolls.byId.ill_omen)).toBe(false);
    expect(tollEligible(s, reg.tolls.byId.crumbling_nave)).toBe(false);
    expect(tollEligible(s, reg.tolls.byId.shifting_chimneys)).toBe(false);
    expect(tollEligible(s, reg.tolls.byId.black_sun)).toBe(true);
    setTile(s, 'b6', 'pillar');
    setTile(s, 'c5', 'chimney', 0);
    expect(tollEligible(s, reg.tolls.byId.crumbling_nave)).toBe(true);
    expect(tollEligible(s, reg.tolls.byId.shifting_chimneys)).toBe(true);
    s.config = { ...s.config, moth_die: true };
    expect(tollEligible(s, reg.tolls.byId.ill_omen)).toBe(true);
    const lf = newGame({ mode: 'last_flame', seats: [{ kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden' }], overrides: { neutrals: 'off' } });
    expect(tollEligible(lf, reg.tolls.byId.black_sun)).toBe(false);
  });

  it('Vigil: the First Light holder chooses at the start of Nights 2+; Last Flame: the lowest Glory', () => {
    const start = newGame({ seed: 'toll-flow', seats: [{ kind: 'human', hero: 'sconce_paladin' }, { kind: 'human', hero: 'moth_witch' }], overrides: { tolls: true, moth_die: false, dread_max: 16, initial_enemies_mod: -2, plumes_mod: -2 } });
    const { state } = runGame(start, { policy: 'pass', maxSteps: 800, stopWhen: (s) => s.phase === 'toll' });
    expect(state.phase).toBe('toll');
    expect(state.night).toBe(2);
    expect(state.toll.chooser).toBe(state.firstLight);
    const offer = state.toll.offer;
    expect(offer && getContent().tolls.byId[offer.blessing].kind).toBe('blessing');
    expect(offer && getContent().tolls.byId[offer.curse].kind).toBe('curse');
    const other = state.firstLight === 0 ? 1 : 0;
    expect(validateAction(state, { type: 'choose_toll', seat: other, tollId: offer?.curse ?? '' })).toMatchObject({ ok: false, reason: 'NOT_YOUR_TURN' });
    const chosen = act(state, { type: 'choose_toll', seat: state.firstLight, tollId: offer?.curse ?? '' }).state;
    expect(chosen.toll).toMatchObject({ active: offer?.curse, curseReward: true });

    const lf = newGame({ mode: 'last_flame', seats: [{ kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden' }, { kind: 'bot_warden' }] });
    lf.players[0].glory = 4;
    lf.players[1].glory = 2;
    lf.players[2].glory = 2;
    lf.firstLight = 2;
    expect(tollChooser(lf)).toBe(2);
    lf.firstLight = 0;
    expect(tollChooser(lf)).toBe(1);
  });
});

// =============================================================================================
// Moth Die
// =============================================================================================

/** A solo game in the omen phase of round 1 with the next roll forced to `face`. */
function rollFace(face: number, opts: Parameters<typeof newGame>[0] = {}): GameState {
  let s = newGame({ seed: 'omen', ...opts, overrides: { moth_die: true, tolls: false, ...(opts.overrides ?? {}) } });
  for (const p of s.players) if (!p.ready) s = act(s, { type: 'ready', seat: p.seat }).state;
  s = act(s, { type: 'advance' }).state;
  expect(s.phase).toBe('omen');
  for (let seed = 1; seed < 10_000; seed++) {
    if (streamDie({ rng: { omen: seed } }, 'omen', 6) === face) {
      s.rng.omen = seed;
      return s;
    }
  }
  throw new Error(`no seed rolls ${face}`);
}

function toPlayersPhase(s: GameState): GameState {
  let state = s;
  for (let i = 0; i < 6 && state.phase !== 'players'; i++) state = act(state, { type: 'advance' }).state;
  return state;
}

describe('Moth Die faces', () => {
  it('1 eclipse: every Snuff intent deals +1 this round', () => {
    const rolled = act(rollFace(1), { type: 'advance' });
    expect(eventsOf(rolled.events, 'omen_rolled')[0]).toMatchObject({ face: 1, omenId: 'eclipse', effectiveId: 'eclipse' });
    const moved = act(rolled.state, { type: 'advance' }).state;
    expect(moved.intents.length).toBeGreaterThan(0);
    for (const intent of moved.intents) expect(intent.damage).toBe(moved.pieces[intent.attackerId].atk + 1);
  });

  it('2 smoke: a Sootling Plume appears now (not with Last Flame neutrals off)', () => {
    const rolled = act(rollFace(2), { type: 'advance' });
    expect(eventsOf(rolled.events, 'plume_placed')).toMatchObject([{ source: 'smoke', enemyId: 'sootling' }]);
    const lf = rollFace(2, { mode: 'last_flame', seats: [{ kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden' }], overrides: { neutrals: 'off' } });
    expect(eventsOf(act(lf, { type: 'advance' }).events, 'plume_placed')).toHaveLength(0);
  });

  it('3 stillness: no effect', () => {
    const s = rollFace(3);
    const rolled = act(s, { type: 'advance' });
    expect(rolled.state.activeRules).toEqual(s.activeRules);
    expect(rolled.state.plumes).toEqual(s.plumes);
  });

  it('4 long_shadows: Snuff steps and slides move 1 less (minimum 1); leaps are unchanged', () => {
    const s = act(rollFace(4), { type: 'advance' }).state;
    const hound = enemyAt(s, 'smokehound', 'd5');
    const knight = enemyAt(s, 'snuffer_knight', 'a8');
    const reach = legalMoves(s, hound.id).map((p) => Math.max(Math.abs(p.x - 3), Math.abs(p.y - 4)));
    expect(Math.max(...reach)).toBe(1);
    expect(legalMoves(s, knight.id).length).toBeGreaterThan(0);
  });

  it('5 kindling: +1 Flame at the start of every seat turn', () => {
    expect(toPlayersPhase(rollFace(5)).players[0].flame).toBe(4);
  });

  it('6 bright_wings: every seat draws 1 extra card at the start of its seat turn', () => {
    expect(toPlayersPhase(rollFace(6)).players[0].hand).toHaveLength(6);
  });

  it('ill_omen: faces 5 and 6 count as 3 (Stillness)', () => {
    for (const face of [5, 6]) {
      const s = rollFace(face);
      applyToll(makeCtx(s), 0, 'ill_omen');
      const rolled = act(s, { type: 'advance' });
      expect(eventsOf(rolled.events, 'omen_rolled')[0]).toMatchObject({ face, effectiveId: 'stillness' });
      expect(rolled.state.omen.omenId).toBe('stillness');
      const players = toPlayersPhase(rolled.state);
      expect(players.players[0]).toMatchObject({ flame: 3 });
      expect(players.players[0].hand).toHaveLength(5);
    }
  });
});
