/** Heirlooms (GDD §13.6) and the Chandlery's Boons: heirloom, temper, prune, and the Curse reward. */
import { describe, expect, it } from 'vitest';
import { applyAction, cardTargets, freeActionTargets, legalMoves, sq, validateAction } from '../../../src/engine';
import type { GameState, RuleValues } from '../../../src/engine';
import { gainHeirloom } from '../../../src/engine/heirlooms';
import { makeCtx } from '../../../src/engine/state';
import { act, blankScenario, enemyAt, giveCard, heroPiece, lockMelee, newGame, optionSquares, playCard, setTile, unitAt } from './helpers';
import { runGame } from './driver';

const GENTLE: Partial<RuleValues> = { dread_max: 16, starting_dread: 0, initial_enemies_mod: -2, plumes_mod: -2, boons: true, tolls: false, moth_die: false };

/** Solo game stopped at the first phase matching `phase` (seeds tried in order until one gets there). */
function reach(phase: 'dawn' | 'chandlery', overrides: Partial<RuleValues> = {}): GameState {
  for (let i = 0; i < 12; i++) {
    const start = newGame({ seed: `boon-${i}`, overrides: { ...GENTLE, ...overrides } });
    const { state } = runGame(start, { policy: 'pass', maxSteps: 600, stopWhen: (s) => s.phase === phase });
    if (state.phase === phase && !state.result) return state;
  }
  throw new Error(`no seed reached ${phase}`);
}

function grant(s: GameState, id: string, seat = 0): GameState {
  gainHeirloom(makeCtx(s), seat, id);
  return s;
}

function deckSize(s: GameState, seat = 0): number {
  const p = s.players[seat];
  return p.deck.length + p.hand.length + p.discard.length;
}

describe('Heirlooms', () => {
  it('ever_burning_wick: the hero starts every Night with Ward', () => {
    const s = grant(newGame({ seed: 'wick', overrides: { moth_die: false } }), 'ever_burning_wick');
    expect(heroPiece(s, 0).ward).toBe(false);
    const ready = act(s, { type: 'ready', seat: 0 }).state;
    const started = act(ready, { type: 'advance' }).state;
    expect(heroPiece(started, 0).ward).toBe(true);
  });

  it('brass_thimble: +2 max HP (and HP) for the hero, for the rest of the game', () => {
    const s = blankScenario('moth_witch', 'd2');
    heroPiece(s, 0).hp = 4;
    grant(s, 'brass_thimble');
    expect(heroPiece(s, 0)).toMatchObject({ maxHp: 8, hp: 6 });
    expect(s.activeRules.some((r) => r.rule === 'hero_max_hp' && r.expires === 'game')).toBe(true);
  });

  it("lamplighters_hook: +1 range on cards that count from the hero (not Powers)", () => {
    const s = blankScenario('moth_witch', 'd2');
    const far = enemyAt(s, 'sootling', 'd6');
    const spark = giveCard(s, 'spark');
    expect(cardTargets(s, 0, spark)).toMatchObject({ playable: false, reason: 'NO_TARGET' });
    grant(s, 'lamplighters_hook');
    const info = cardTargets(s, 0, spark);
    expect(info.rangeRing).toEqual({ centre: sq('d2'), radius: 4 });
    expect(info.targets.map((t) => (t.choice.kind === 'piece' ? t.choice.pieceId : ''))).toEqual([far.id]);
    expect(optionSquares(cardTargets(s, 0, giveCard(s, 'loose_a_moth')))).toContain('d5');
  });

  it('moth_velvet_cloak: the hero flies (passes over pieces, ignores Hot Wax)', () => {
    const s = blankScenario('lampwright', 'd2');
    unitAt(s, 'taper', 'd3');
    setTile(s, 'd4', 'hot_wax');
    expect(legalMoves(s, heroPiece(s, 0).id).map((p) => `${p.x},${p.y}`)).not.toContain('3,3');
    grant(s, 'moth_velvet_cloak');
    expect(heroPiece(s, 0).flying).toBe(true);
    const moves = legalMoves(s, heroPiece(s, 0).id);
    expect(moves).toContainEqual(sq('d4'));
    expect(moves).toContainEqual(sq('d5'));
    const landed = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d4') }).state;
    expect(heroPiece(landed, 0).hp).toBe(6);
  });

  it("candlemakers_mold: the first Summon each seat turn costs 1 less", () => {
    const s = blankScenario('sconce_paladin', 'd2');
    grant(s, 'candlemakers_mold');
    const horse = giveCard(s, 'saddle_the_wickhorse');
    expect(cardTargets(s, 0, horse).cost).toBe(1);
    const after = playCard(s, horse, ['d3']).state;
    expect(after.players[0].flame).toBe(2);
    expect(cardTargets(after, 0, giveCard(after, 'saddle_the_wickhorse')).cost).toBe(2);
    expect(cardTargets(after, 0, giveCard(after, 'light_a_taper')).cost).toBe(1);
  });

  it('bell_of_saint_tallow: once per Night, Daze an enemy within 4 of the hero (free action)', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const near = enemyAt(s, 'smokehound', 'd6');
    lockMelee(s, near, 'd5');
    enemyAt(s, 'sootling', 'h8');
    expect(validateAction(s, { type: 'free_action', seat: 0, kind: 'ring_bell', target: sq('d6') })).toMatchObject({ ok: false, reason: 'NOT_OWNED' });
    grant(s, 'bell_of_saint_tallow');
    const info = freeActionTargets(s, 0, 'ring_bell');
    expect(optionSquares(info)).toEqual(['d6']);
    const { state } = act(s, { type: 'free_action', seat: 0, kind: 'ring_bell', target: sq('d6') });
    expect(state.intents).toHaveLength(0);
    expect(state.players[0]).toMatchObject({ bellUsedThisNight: true, flame: 3 });
    expect(validateAction(state, { type: 'free_action', seat: 0, kind: 'ring_bell', target: sq('d6') })).toMatchObject({ ok: false, reason: 'ONCE_PER_NIGHT' });
    expect(validateAction(s, { type: 'free_action', seat: 0, kind: 'ring_bell', target: sq('h8') })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });
});

describe('Boons and the Chandlery', () => {
  it('heirloom: choose 1 of 2 random Heirlooms you do not own (draft stream)', () => {
    const s = reach('chandlery');
    const ch = s.players[0].chandlery;
    expect(ch?.heirloomOffer).toHaveLength(2);
    const offered = ch?.heirloomOffer ?? [];
    const other = ['ever_burning_wick', 'brass_thimble', 'lamplighters_hook', 'moth_velvet_cloak', 'candlemakers_mold', 'bell_of_saint_tallow'].find((h) => !offered.includes(h)) ?? '';
    expect(validateAction(s, { type: 'boon_pick', seat: 0, boon: 'heirloom', args: { heirloomId: other } })).toMatchObject({ ok: false, reason: 'NOT_OFFERED' });
    const after = act(s, { type: 'boon_pick', seat: 0, boon: 'heirloom', args: { heirloomId: offered[0] } }).state;
    expect(after.players[0].heirlooms).toEqual([offered[0]]);
    expect(after.players[0].chandlery?.boonDone).toBe(true);
    expect(validateAction(after, { type: 'boon_pick', seat: 0, boon: null, args: {} })).toMatchObject({ ok: false, reason: 'NO_PICKS_LEFT' });
  });

  it('temper: a card costs 1 less from then on; a card is tempered once', () => {
    const s = reach('chandlery');
    const card = s.players[0].discard.find((c) => c.id === 'call_the_squire') ?? s.players[0].deck[0];
    const after = act(s, { type: 'boon_pick', seat: 0, boon: 'temper', args: { cardUid: card.uid } }).state;
    const tempered = [...after.players[0].deck, ...after.players[0].discard].find((c) => c.uid === card.uid);
    expect(tempered?.tempered).toBe(true);
    const again = structuredClone(after);
    const ch = again.players[0].chandlery;
    if (ch) ch.boonDone = false;
    expect(validateAction(again, { type: 'boon_pick', seat: 0, boon: 'temper', args: { cardUid: card.uid } })).toMatchObject({ ok: false, reason: 'ALREADY_TEMPERED' });
  });

  it('prune: remove up to 2 cards; the deck never goes below 8', () => {
    const s = reach('chandlery');
    const owned = [...s.players[0].deck, ...s.players[0].discard, ...s.players[0].hand];
    expect(deckSize(s)).toBe(10);
    const three = owned.slice(0, 3).map((c) => c.uid);
    expect(validateAction(s, { type: 'boon_pick', seat: 0, boon: 'prune', args: { cardUids: three } })).toMatchObject({ ok: false, reason: 'TOO_MANY' });
    const after = act(s, { type: 'boon_pick', seat: 0, boon: 'prune', args: { cardUids: three.slice(0, 2) } }).state;
    expect(deckSize(after)).toBe(8);
    const small = structuredClone(s);
    small.players[0].deck = small.players[0].deck.slice(1);
    small.players[0].discard = small.players[0].discard.slice(0, Math.max(0, 9 - small.players[0].deck.length));
    expect(deckSize(small)).toBe(9);
    const uids = [...small.players[0].deck, ...small.players[0].discard].slice(0, 2).map((c) => c.uid);
    expect(validateAction(small, { type: 'boon_pick', seat: 0, boon: 'prune', args: { cardUids: uids } })).toMatchObject({ ok: false, reason: 'DECK_MIN' });
  });

  it('after a Curse every seat takes 2 of the 3 offered cards', () => {
    const atDawn = reach('dawn');
    const plain = applyAction(atDawn, { type: 'advance' });
    if (!plain.ok) throw new Error(plain.reason);
    expect(plain.state.players[0].chandlery?.picksLeft).toBe(1);
    const cursed = structuredClone(atDawn);
    cursed.toll.curseReward = true;
    let s = act(cursed, { type: 'advance' }).state;
    const offer = s.players[0].chandlery?.offer ?? [];
    expect(offer).toHaveLength(3);
    expect(s.players[0].chandlery?.picksLeft).toBe(2);
    s = act(s, { type: 'draft_pick', seat: 0, cardId: offer[0] }).state;
    s = act(s, { type: 'draft_pick', seat: 0, cardId: offer[1] }).state;
    expect(validateAction(s, { type: 'draft_pick', seat: 0, cardId: offer[2] })).toMatchObject({ ok: false, reason: 'NO_PICKS_LEFT' });
    expect(deckSize(s)).toBe(12);
    expect(s.toll.curseReward).toBe(false);
  });
});
