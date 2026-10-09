/**
 * The scripted first Night (GDD §15.2, §13.3.4 first_vigil, §14.3 first-ever Quick Play) and the
 * Appendix B.6 tutorial-line test: for each hero the guaranteed line, replayed through the
 * reducer, ends in a double kill with Dread +0 and at most 3 Flame spent.
 */
import { describe, expect, it } from 'vitest';
import { concreteSeed, quickPlaySelection, resolveConfig } from '../../../src/config';
import { applyAction, createGame, getContent, intentQueue, matchesTutorialStep, sq, sqName, tutorialAction, tutorialScript, tutorialTurnActive } from '../../../src/engine';
import type { GameConfig, GameEvent, GameState } from '../../../src/engine';
import { act, eventsOf, heroPiece } from './helpers';
import { HEROES } from './bossHelpers';

const reg = getContent();
/** "Flame used" column of the §15.2 table. */
const FLAME_USED: Record<string, number> = { sconce_paladin: 3, moth_witch: 2, lampwright: 3, ember_duelist: 1 };

function firstEverConfig(hero: string, seed = 'tutorial-seed'): GameConfig {
  const { config } = resolveConfig(quickPlaySelection({ gamesCompleted: 0, lastQuickPlayLost: false, firstLastFlameDone: false }, hero));
  return { ...config, seed: concreteSeed(seed, { now: new Date(0), random: () => seed }) };
}

/** The tutorial game in round 1's players phase (Ready, then the automated beats). */
function openingTurn(hero: string, seed?: string): GameState {
  let s = createGame(firstEverConfig(hero, seed));
  s = act(s, { type: 'ready', seat: 0 }).state;
  while (s.phase !== 'players') s = act(s, { type: 'advance' }).state;
  return s;
}

describe('tutorial config (§14.3, §13.3.1)', () => {
  it('forces first_vigil, then cathedral_of_tallow, the Hush Hierophant, and no Tolls / Moth Die / Boons', () => {
    const given = { ...firstEverConfig('lampwright'), boss_choice: 'random', tolls: true, moth_die: true, boons: true, firstGame: false };
    const s = createGame(given);
    expect(s.config).toMatchObject({ tutorial: true, firstGame: true, boss_choice: 'hush_hierophant', tolls: false, moth_die: false, boons: false });
    expect(s.siteId).toBe('first_vigil');
    expect(s.tutorial).toEqual({ heroId: 'lampwright', step: 0, scripted: true, skipped: false });
  });

  it('Night 2 is cathedral_of_tallow', () => {
    let s = createGame(firstEverConfig('sconce_paladin'));
    s = act(s, { type: 'ready', seat: 0 }).state;
    while (s.phase !== 'players') s = act(s, { type: 'advance' }).state;
    s.round = s.roundsThisNight ?? 4;
    s.phase = 'tally';
    for (const [id, p] of Object.entries(s.pieces)) if (p.side === 'snuff') delete s.pieces[id];
    s.plumes = [];
    s.intents = [];
    s = act(act(s, { type: 'advance' }).state, { type: 'advance' }).state;
    s = act(s, { type: 'skip_pick', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    expect([s.night, s.siteId]).toEqual([2, 'cathedral_of_tallow']);
  });
});

describe('the scripted opening (§15.2)', () => {
  for (const hero of HEROES) {
    it(`${hero}: start tile, locked Sootling intents, fixed hand, Flame 3, Plume at c6`, () => {
      const opening = reg.maps.byId.first_vigil.tutorial?.[hero];
      const s = openingTurn(hero);
      expect(sqName(heroPiece(s, 0).pos)).toBe(opening?.heroStart);
      const sootlings = Object.values(s.pieces).filter((p) => p.defId === 'sootling');
      expect(sootlings.map((p) => sqName(p.pos)).sort()).toEqual(opening?.sootlings.map((t) => t.at).sort());
      expect(s.intents).toHaveLength(2);
      for (const sootling of opening?.sootlings ?? []) {
        const intent = s.intents.find((i) => sqName(s.pieces[i.attackerId].pos) === sootling.at);
        expect(intent?.tiles.map(sqName)).toEqual([sootling.aim]);
        expect(s.pieces[intent?.targetId ?? '']?.kind).toBe('candle');
      }
      const texts = intentQueue(s).map((v) => v.text);
      for (const t of opening?.sootlings ?? []) expect(texts.some((text) => text.includes(`${t.aim} Vigil Candle for 1 (Dread +1)`))).toBe(true);
      expect(s.players[0].hand.map((c) => c.id)).toEqual(opening?.hand);
      expect(s.players[0].flame).toBe(3);
      expect(s.plumes.map((m) => [sqName(m.pos), m.enemyId])).toEqual([['c6', 'sootling']]);
      expect(tutorialTurnActive(s)).toBe(true);
    });
  }

  it('the Sootlings did not move: the scripted placement replaced the round-1 Snuff Move', () => {
    let s = createGame(firstEverConfig('moth_witch'));
    const before = Object.values(s.pieces).filter((p) => p.defId === 'sootling').map((p) => sqName(p.pos)).sort();
    s = act(s, { type: 'ready', seat: 0 }).state;
    const events: GameEvent[] = [];
    while (s.phase !== 'players') {
      const step = act(s, { type: 'advance' });
      events.push(...step.events);
      s = step.state;
    }
    expect(Object.values(s.pieces).filter((p) => p.defId === 'sootling').map((p) => sqName(p.pos)).sort()).toEqual(before);
    expect(eventsOf(events, 'piece_moved')).toHaveLength(0);
    expect(eventsOf(events, 'intent_declared').map((e) => e.queue)).toEqual([1, 2]);
  });

  it('the Plume schedule: c6 at setup, f6 at Tally 1, b6 (Ink Wretch) at Tally 2; round 2 is a normal Snuff Move', () => {
    let s = openingTurn('sconce_paladin');
    const placed: Array<[string, string]> = [];
    for (let round = 1; round <= 2; round++) {
      s.intents = [];
      s = act(s, { type: 'end_turn', seat: 0 }).state;
      while (s.phase !== 'players' && !s.result) {
        const step = act(s, { type: 'advance' });
        for (const e of eventsOf(step.events, 'plume_placed')) placed.push([sqName(e.pos), e.enemyId]);
        s = step.state;
      }
    }
    expect(placed).toEqual([
      ['f6', 'sootling'],
      ['b6', 'ink_wretch'],
    ]);
    expect(s.tutorial?.scripted).toBe(false);
    expect(tutorialTurnActive(s)).toBe(false);
  });
});

describe('tutorialScript (coach-mark data)', () => {
  it('lists the guaranteed line per hero with its coach marks and tiles', () => {
    const paladin = tutorialScript('sconce_paladin');
    expect(paladin?.steps.map((st) => [st.markId, st.action, st.target ? sqName(st.target) : null, st.cardId])).toEqual([
      [1, 'select', 'd2', null],
      [2, 'move', 'd3', null],
      [2, 'strike', 'c4', null],
      [3, 'info', null, null],
      [4, 'play_card', 'f5', 'spark'],
      [5, 'play_card', null, 'call_the_squire'],
      [6, 'end_turn', null, null],
    ]);
    expect(paladin?.steps[2]).toMatchObject({ take: sq('c4'), text: 'Strike c4; Take to c4.' });
    expect(paladin).toMatchObject({ heroStart: sq('d2'), flame: 3, hand: ['light_a_taper', 'spark', 'shield_bash', 'waxen_ward', 'call_the_squire'] });
    expect(tutorialScript('lampwright')?.steps.filter((st) => st.markId === 4).map((st) => st.action)).toEqual(['move', 'play_card']);
    expect(tutorialScript('ember_duelist')?.steps.filter((st) => st.action === 'strike').map((st) => [sqName(st.target ?? sq('a1')), sqName(st.take ?? sq('a1'))])).toEqual([
      ['f4', 'f4'],
      ['g3', 'g3'],
    ]);
    expect(tutorialScript('moth_witch')?.steps[1]).toMatchObject({ action: 'strike', target: sq('d4'), take: null });
    expect(tutorialScript('not_a_hero')).toBeNull();
  });

  it('matchesTutorialStep accepts only the step’s action (a summon on any tile)', () => {
    const s = openingTurn('sconce_paladin');
    const steps = tutorialScript('sconce_paladin')?.steps ?? [];
    const hero = heroPiece(s, 0).id;
    expect(matchesTutorialStep(s, steps[1], { type: 'move', seat: 0, pieceId: hero, to: sq('d3') })).toBe(true);
    expect(matchesTutorialStep(s, steps[1], { type: 'move', seat: 0, pieceId: hero, to: sq('e3') })).toBe(false);
    expect(matchesTutorialStep(s, steps[1], { type: 'end_turn', seat: 0 })).toBe(false);
    const squire = s.players[0].hand.find((c) => c.id === 'call_the_squire');
    const spark = s.players[0].hand.find((c) => c.id === 'spark');
    expect(matchesTutorialStep(s, steps[5], { type: 'play_card', seat: 0, cardUid: squire?.uid ?? '', targets: [{ kind: 'tile', pos: sq('b5') }] })).toBe(true);
    expect(matchesTutorialStep(s, steps[5], { type: 'play_card', seat: 0, cardUid: spark?.uid ?? '', targets: [] })).toBe(false);
    expect(matchesTutorialStep(s, steps[0], { type: 'end_turn', seat: 0 })).toBe(false);
    expect(matchesTutorialStep(s, steps[6], { type: 'end_turn', seat: 0 })).toBe(true);
  });
});

describe('Appendix B.6: every guaranteed line ends in a double kill, Dread +0, Flame spent ≤ 3', () => {
  for (const hero of HEROES) {
    it(hero, () => {
      const script = tutorialScript(hero);
      if (!script) throw new Error('no script');
      let s = openingTurn(hero);
      const dread = s.vigil?.dread ?? -1;
      const events: GameEvent[] = [];
      for (const step of script.steps) {
        const action = tutorialAction(s, step);
        if (!action) continue;
        expect(matchesTutorialStep(s, step, action)).toBe(true);
        const result = applyAction(s, action);
        if (!result.ok) throw new Error(`${hero}: ${step.action} ${step.cardId ?? ''} rejected: ${result.reason}`);
        events.push(...result.events);
        s = result.state;
        if (step.take) expect(sqName(heroPiece(s, 0).pos)).toBe(sqName(step.take));
      }
      while (s.phase !== 'rise' && !s.result) {
        const step = act(s, { type: 'advance' });
        events.push(...step.events);
        s = step.state;
      }
      const kills = eventsOf(events, 'piece_died').filter((e) => e.defId === 'sootling' && e.killerSeat === 0);
      expect(kills).toHaveLength(2);
      expect(Object.values(s.pieces).some((p) => p.defId === 'sootling')).toBe(false);
      expect(s.vigil?.dread).toBe(dread);
      expect(eventsOf(events, 'dread_changed')).toHaveLength(0);
      const spent = eventsOf(events, 'card_played').reduce((sum, e) => sum + e.cost, 0);
      expect(spent).toBeLessThanOrEqual(3);
      expect(spent).toBe(FLAME_USED[hero]);
      expect(eventsOf(events, 'card_played').map((e) => e.cardId)).toEqual(script.steps.filter((st) => st.action === 'play_card').map((st) => st.cardId));
    });
  }
});
