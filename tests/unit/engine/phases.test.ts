import { describe, expect, it } from 'vitest';
import { activeSeats, getContent, pendingAutomation, validateAction } from '../../../src/engine';
import type { GameEvent, GameState } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { drawCards } from '../../../src/engine/decks';
import { draftOffer } from '../../../src/engine/phases';
import { makeCtx, unitsOf } from '../../../src/engine/state';
import { act, blankScenario, candleAt, eventsOf, heroPiece, newGame, toPlayers, unitAt } from './helpers';

const reg = getContent();

/** Jump to the last Tally of the Night and advance into dawn. */
function toDawn(s: GameState): GameState {
  s.round = s.roundsThisNight ?? 4;
  s.phase = 'tally';
  s.plumes = [];
  s.activeSeat = null;
  const next = act(s, { type: 'advance' }).state;
  expect(next.phase).toBe('dawn');
  return next;
}

describe('seat turns (§4.3)', () => {
  it('turn start draws to hand size, sets Flame and readies pieces; Flame is lost at the end', () => {
    let s = toPlayers(newGame({ seed: 'turns', overrides: { moth_die: false } }));
    const player = s.players[0];
    expect(player.flame).toBe(3);
    expect(player.hand).toHaveLength(5);
    expect(heroPiece(s, 0)).toMatchObject({ movesLeft: 1, strikesLeft: 1, exhausted: false });
    s.players[0].discard.push(...s.players[0].hand.splice(0, 2));
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s.players[0].flame).toBe(0);
    expect(heroPiece(s, 0).movesLeft).toBe(0);
    for (let i = 0; i < 20 && s.phase !== 'players' && !s.result; i++) s = act(s, { type: 'advance' }).state;
    if (!s.result) {
      expect(s.players[0].hand).toHaveLength(5);
      expect(s.players[0].flame).toBe(3);
    }
  });

  it('the hand limit is 8 and an empty deck reshuffles the discard pile (decks:<seat>)', () => {
    const s = blankScenario();
    const ctx = makeCtx(s);
    const player = s.players[0];
    player.discard.push(...player.deck.splice(0));
    expect(drawCards(ctx, 0, 10)).toBe(3);
    expect(player.hand).toHaveLength(8);
    expect(eventsOf(ctx.events, 'deck_shuffled')).toHaveLength(1);
    expect(drawCards(ctx, 0, 1)).toBe(0);
  });

  it('Flame bonuses add up but are capped at 6', () => {
    let s = blankScenario('sconce_paladin', 'd2', { overrides: { flame_per_turn: 5 } });
    s.activeRules.push({ rule: 'flame_per_turn', delta: 3, value: null, seat: null, source: { kind: 'toll', id: 'peddler_of_wicks' }, expires: 'night' });
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    for (let i = 0; i < 10 && s.phase !== 'players'; i++) s = act(s, { type: 'advance' }).state;
    expect(s.players[0].flame).toBe(6);
  });
});

describe('Vigil claims (§11.3)', () => {
  it('claims queue FIFO; AI allies act once every human has ended; humans may run an ally early', () => {
    let s = toPlayers(
      newGame({
        seed: 'claims',
        seats: [
          { kind: 'human', hero: 'sconce_paladin' },
          { kind: 'human', hero: 'moth_witch' },
          { kind: 'bot_warden', hero: 'lampwright' },
          { kind: 'bot_warden', hero: 'ember_duelist' },
        ],
        overrides: { moth_die: false },
      }),
    );
    expect(s.activeSeat).toBeNull();
    expect(activeSeats(s)).toEqual([0, 1, 2, 3]);
    expect(validateAction(s, { type: 'end_turn', seat: 0 })).toMatchObject({ ok: false, reason: 'NOT_YOUR_TURN' });
    s = act(s, { type: 'claim_turn', seat: 1 }).state;
    expect(s.activeSeat).toBe(1);
    s = act(s, { type: 'claim_turn', seat: 3 }).state;
    s = act(s, { type: 'claim_turn', seat: 0 }).state;
    expect(s.claimQueue).toEqual([3, 0]);
    s = act(s, { type: 'end_turn', seat: 1 }).state;
    expect(s.activeSeat).toBe(3);
    s = act(s, { type: 'end_turn', seat: 3 }).state;
    expect(s.activeSeat).toBe(0);
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    expect(s.activeSeat).toBe(2);
    const { state, events } = act(s, { type: 'end_turn', seat: 2 });
    expect(state.phase).toBe('snuff_strike');
    expect(eventsOf(events, 'phase_changed').map((e) => e.phase)).toEqual(['snuff_strike']);
  });

  it('solo claims automatically; the last human still to act is claimed automatically', () => {
    const solo = toPlayers(newGame({ overrides: { moth_die: false } }));
    expect(solo.activeSeat).toBe(0);
    let duo = toPlayers(newGame({ seats: [{ kind: 'human', hero: 'sconce_paladin' }, { kind: 'human', hero: 'moth_witch' }], overrides: { moth_die: false } }));
    duo = act(duo, { type: 'claim_turn', seat: 0 }).state;
    duo = act(duo, { type: 'end_turn', seat: 0 }).state;
    expect(duo.activeSeat).toBe(1);
  });
});

describe('Moth Die and Tolls (§13.4-13.5)', () => {
  it('rolls the omen stream every round and applies flag faces', () => {
    let s = newGame({ seed: 'omen', overrides: { moth_die: true } });
    s = act(s, { type: 'ready', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('omen');
    const { state, events } = act(s, { type: 'advance' });
    const rolled = eventsOf(events, 'omen_rolled')[0];
    expect(rolled.face).toBeGreaterThanOrEqual(1);
    expect(rolled.face).toBeLessThanOrEqual(6);
    expect(state.omen).toEqual({ face: rolled.face, omenId: rolled.effectiveId });
    expect(state.phase).toBe('snuff_move');
    const again = act(s, { type: 'advance' });
    expect(eventsOf(again.events, 'omen_rolled')[0].face).toBe(rolled.face);
  });

  it('every Moth Die face applies its effect for the round', () => {
    const faces = new Map<string, { after: GameState; events: GameEvent[] }>();
    for (let i = 0; i < 300 && faces.size < 6; i++) {
      let s = newGame({ seed: `face-${i}`, overrides: { moth_die: true } });
      s = act(s, { type: 'ready', seat: 0 }).state;
      s = act(s, { type: 'advance' }).state;
      const r = act(s, { type: 'advance' });
      const id = r.state.omen.omenId ?? '';
      if (!faces.has(id)) faces.set(id, { after: r.state, events: r.events });
    }
    expect([...faces.keys()].sort()).toEqual(['bright_wings', 'eclipse', 'kindling', 'long_shadows', 'smoke', 'stillness']);
    const rule = (id: string) => faces.get(id)?.after.activeRules.map((r) => [r.rule, r.delta, r.expires]);
    expect(rule('eclipse')).toEqual([['snuff_damage', 1, 'round']]);
    expect(rule('long_shadows')).toEqual([['snuff_move_range', -1, 'round']]);
    expect(rule('kindling')).toEqual([['flame_per_turn', 1, 'round']]);
    expect(rule('bright_wings')).toEqual([['draw_extra', 1, 'round']]);
    expect(rule('stillness')).toEqual([]);
    const smoke = faces.get('smoke');
    expect(smoke && eventsOf(smoke.events, 'plume_placed').map((e) => [e.source, e.enemyId])).toEqual([['smoke', 'sootling']]);
    let kindled = faces.get('kindling')?.after as GameState;
    kindled = act(kindled, { type: 'advance' }).state;
    expect(kindled.players[0].flame).toBe(4);
    kindled = act(kindled, { type: 'end_turn', seat: 0 }).state;
    for (let i = 0; i < 3 && !kindled.result; i++) kindled = act(kindled, { type: 'advance' }).state;
    if (!kindled.result) expect(kindled.activeRules).toEqual([]);
  });

  it('Night 2 reveals a Blessing and a Curse; a Curse lets every seat take 2 cards at the next Chandlery', () => {
    let s = toPlayers(newGame({ seed: 'toll', overrides: { tolls: true, moth_die: false, length: 'standard', nights: 4 } }));
    s = toDawn(s);
    s = act(s, { type: 'advance' }).state;
    s = act(s, { type: 'skip_pick', seat: 0 }).state;
    s = act(s, { type: 'boon_pick', seat: 0, boon: null, args: {} }).state;
    s = act(s, { type: 'advance' }).state;
    expect(s.night).toBe(2);
    s = act(s, { type: 'ready', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('toll');
    expect(pendingAutomation(s)).toBeNull();
    const offer = s.toll.offer;
    expect(offer && reg.tolls.byId[offer.blessing].kind).toBe('blessing');
    expect(offer && reg.tolls.byId[offer.curse].kind).toBe('curse');
    expect(validateAction(s, { type: 'choose_toll', seat: 0, tollId: 'nonsense' })).toMatchObject({ ok: false, reason: 'NOT_OFFERED' });
    s = act(s, { type: 'choose_toll', seat: 0, tollId: offer?.curse ?? '' }).state;
    expect(s.toll.active).toBe(offer?.curse);
    expect(s.toll.curseReward).toBe(true);
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('snuff_move');
    s = toDawn(toPlayers(s));
    s = act(s, { type: 'advance' }).state;
    expect(s.players[0].chandlery?.picksLeft).toBe(2);
    expect(s.toll.active).toBeNull();
  });
});

describe('Tally: self-relight (§13.1.3)', () => {
  it('a hero Smoldering since the end of the players phase relights with 1 HP at Tally, Dread +1', () => {
    let s = blankScenario('sconce_paladin', 'd2');
    dealDamage(makeCtx(s), heroPiece(s, 0), 8, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: null, seat: null });
    const dread = s.vigil?.dread ?? 0;
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    s = act(s, { type: 'advance' }).state;
    s = act(s, { type: 'advance' }).state;
    const { state, events } = act(s, { type: 'advance' });
    expect(heroPiece(state, 0)).toMatchObject({ smoldering: false, hp: 1 });
    expect(eventsOf(events, 'hero_relit')[0].cause).toBe('self');
    expect(state.vigil?.dread).toBe(dread + 1);
  });
});

describe('Dawn and the Chandlery (§13.6)', () => {
  it('Dawn: Snuff vanish, Dread recovers per Candle, heroes relight and heal, carry-over keeps 2 units', () => {
    let s = blankScenario('sconce_paladin', 'd2', { overrides: { starting_dread: 5, heal_between_nights: 4 } });
    candleAt(s, 'c3');
    candleAt(s, 'f3');
    const hero = heroPiece(s, 0);
    hero.hp = 2;
    hero.ward = true;
    const a = unitAt(s, 'taper', 'a1');
    const b = unitAt(s, 'wickhorse', 'b1');
    const c = unitAt(s, 'sconce_squire', 'c1');
    c.hp = 2;
    s = toDawn(s);
    expect(s.players[0].carryOver?.defaults).toEqual([c.id, b.id]);
    expect(pendingAutomation(s)).toBeNull();
    expect(validateAction(s, { type: 'carry_over', seat: 0, keep: [a.id, b.id, c.id] })).toMatchObject({ ok: false, reason: 'TOO_MANY' });
    s = act(s, { type: 'carry_over', seat: 0, keep: [a.id] }).state;
    const { state, events } = act(s, { type: 'advance' });
    expect(Object.values(state.pieces).some((p) => p.side === 'snuff')).toBe(false);
    expect(state.vigil?.dread).toBe(3);
    expect(unitsOf(state, 0).map((u) => u.id)).toEqual([a.id]);
    expect(heroPiece(state, 0)).toMatchObject({ hp: 6, ward: false });
    expect(state.players[0].hand).toHaveLength(0);
    expect(eventsOf(events, 'dawn')[0]).toMatchObject({ candlesLit: 2 });
    expect(state.phase).toBe('chandlery');
  });

  it('Chandlery offers 3 different class/neutral cards (≥1 class), picks and Boons, then the next Night', () => {
    let s = toDawn(toPlayers(newGame({ seed: 'draft', seats: [{ kind: 'human', hero: 'lampwright' }, { kind: 'bot_warden', hero: 'moth_witch' }], overrides: { moth_die: false } })));
    s = act(s, { type: 'advance' }).state;
    for (const p of s.players) {
      const offer = p.chandlery?.offer ?? [];
      expect(new Set(offer).size).toBe(3);
      expect(offer.every((id) => [null, p.hero].includes(reg.cards.byId[id].class))).toBe(true);
      expect(offer.some((id) => reg.cards.byId[id].class === p.hero)).toBe(true);
      expect(p.chandlery?.heirloomOffer).toHaveLength(2);
    }
    expect(activeSeats(s)).toEqual([0, 1]);
    const pick = s.players[0].chandlery?.offer[0] ?? '';
    const deckBefore = s.players[0].deck.length;
    s = act(s, { type: 'draft_pick', seat: 0, cardId: pick }).state;
    expect(s.players[0].deck.length).toBe(deckBefore + 1);
    expect(validateAction(s, { type: 'draft_pick', seat: 0, cardId: pick })).toMatchObject({ ok: false, reason: 'NO_PICKS_LEFT' });
    const heirloom = s.players[0].chandlery?.heirloomOffer[0] ?? '';
    s = act(s, { type: 'boon_pick', seat: 0, boon: 'heirloom', args: { heirloomId: heirloom } }).state;
    expect(s.players[0].heirlooms).toEqual([heirloom]);
    expect(pendingAutomation(s)).toBeNull();
    s = act(s, { type: 'skip_pick', seat: 1 }).state;
    const card = s.players[1].deck[0].uid;
    s = act(s, { type: 'boon_pick', seat: 1, boon: 'temper', args: { cardUid: card } }).state;
    expect(s.players[1].deck[0].tempered).toBe(true);
    expect(pendingAutomation(s)).toEqual({ phase: 'chandlery' });
    s = act(s, { type: 'advance' }).state;
    expect(s.phase).toBe('night_setup');
    expect(s.night).toBe(2);
    expect([...s.players[0].deck, ...s.players[0].hand].some((c) => c.id === pick)).toBe(true);
  });

  it('draft offers are deterministic per seat stream and rarity-weighted', () => {
    const s = blankScenario('ember_duelist');
    const counts: Record<string, number> = { common: 0, rare: 0, mythic: 0 };
    for (let i = 0; i < 300; i++) for (const id of draftOffer(makeCtx(s), 0)) counts[reg.cards.byId[id].rarity] += 1;
    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.mythic);
    const a = blankScenario('ember_duelist');
    const b = blankScenario('ember_duelist');
    expect(draftOffer(makeCtx(a), 0)).toEqual(draftOffer(makeCtx(b), 0));
  });

  it('prune cannot take the deck below 8 cards', () => {
    let s = toDawn(toPlayers(newGame({ seed: 'prune', overrides: { moth_die: false } })));
    s = act(s, { type: 'advance' }).state;
    const uids = s.players[0].deck.slice(0, 3).map((c) => c.uid);
    expect(validateAction(s, { type: 'boon_pick', seat: 0, boon: 'prune', args: { cardUids: uids } })).toMatchObject({ ok: false, reason: 'TOO_MANY' });
    s = act(s, { type: 'boon_pick', seat: 0, boon: 'prune', args: { cardUids: uids.slice(0, 2) } }).state;
    const owned = [...s.players[0].deck, ...s.players[0].discard, ...s.players[0].hand];
    expect(owned).toHaveLength(reg.rules.deckMin);
    expect(owned.some((c) => uids.slice(0, 2).includes(c.uid))).toBe(false);
  });
});

describe('Retry snapshot (§13.1.7)', () => {
  it('is captured at night_setup with RNG positions and without history', () => {
    const s = newGame({ seed: 'retry' });
    const snap = s.nightSnapshot;
    expect(snap).not.toBeNull();
    expect(snap && 'undo' in snap).toBe(false);
    expect(snap?.rng).toEqual(s.rng);
    expect(snap?.pieces).toEqual(s.pieces);
  });
});
