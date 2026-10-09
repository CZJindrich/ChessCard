/**
 * Randomised fuzz: many seeds, both modes, random legal actions (cards, Powers, free actions,
 * undo, choices, Retry votes). Every action must apply without throwing, and every state must
 * keep the engine's invariants.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, footprint, getContent, inBounds, posKey, previewSnuffStrike } from '../../../src/engine';
import type { Action, GameState, ModeId, RuleValues, SeatConfig } from '../../../src/engine';
import { newGame } from './helpers';
import { Rand, randomAction } from './fuzzDriver';

interface Scenario {
  mode: ModeId;
  seats: Array<Partial<SeatConfig>>;
  overrides: Partial<RuleValues>;
}

const HEROES = ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist'];

function scenario(i: number, r: Rand): Scenario {
  const lastFlame = i % 4 === 3;
  const count = lastFlame ? 2 + r.int(2) : 1 + r.int(3);
  const heroes = HEROES.slice(i % 4).concat(HEROES.slice(0, i % 4));
  const seats = Array.from({ length: count }, (_, k) => ({ kind: (k === 0 || r.chance(0.5) ? 'human' : 'bot_warden') as SeatConfig['kind'], hero: heroes[k] }));
  return {
    mode: lastFlame ? 'last_flame' : 'vigil',
    seats,
    overrides: {
      length: 'short',
      tolls: true,
      moth_die: true,
      boons: true,
      retry_night: !lastFlame,
      dread_max: 16,
      initial_enemies_mod: -r.int(2),
      plumes_mod: -r.int(2),
      flame_per_turn: 3 + r.int(3),
      unit_limit: 2 + r.int(4),
      hand_size: 4 + r.int(4),
      ...(lastFlame ? { neutrals: r.chance(0.2) ? 'off' : 'normal' } : {}),
    },
  };
}

/** Cards each seat owns (deck, hand, discard and attached Charms). */
function ownedCards(s: GameState): number[] {
  return s.players.map((p) => {
    const charms = Object.values(s.pieces).filter((piece) => piece.charm && (piece.charmSeat ?? piece.owner) === p.seat).length;
    return p.deck.length + p.hand.length + p.discard.length + charms;
  });
}

function expectedCards(before: GameState, action: Action): number[] {
  const counts = ownedCards(before);
  if (action.type === 'draft_pick') counts[action.seat] += 1;
  if (action.type === 'boon_pick' && action.boon === 'prune') counts[action.seat] -= action.args.cardUids?.length ?? 0;
  return counts;
}

function checkInvariants(s: GameState, label: string): void {
  const occupied = new Map<string, string>();
  for (const piece of Object.values(s.pieces)) {
    for (const t of footprint(piece.pos, piece.size)) {
      expect(inBounds(t, s.board.w, s.board.h), `${label}: ${piece.id} off board`).toBe(true);
      const key = posKey(t);
      expect(occupied.get(key), `${label}: ${piece.id} overlaps ${occupied.get(key)} at ${key}`).toBeUndefined();
      occupied.set(key, piece.id);
    }
    expect(piece.hp, `${label}: ${piece.id} hp`).toBeLessThanOrEqual(piece.maxHp);
    expect(piece.hp, `${label}: ${piece.id} hp`).toBeGreaterThanOrEqual(0);
    // A hit that ends the game (Dread full) leaves its victim standing on the final board.
    expect(piece.hp > 0 || (piece.kind === 'hero' && piece.smoldering) || s.result !== null, `${label}: ${piece.id} at 0 HP`).toBe(true);
    expect(piece.movesLeft >= 0 && piece.strikesLeft >= 0, `${label}: pips`).toBe(true);
    if (piece.charm) expect(piece.side, `${label}: Snuff with a Charm`).toBe('wick');
  }
  for (const player of s.players) {
    const units = Object.values(s.pieces).filter((p) => p.owner === player.seat && p.kind === 'unit');
    expect(units.length, `${label}: unit limit`).toBeLessThanOrEqual(s.config.unit_limit);
    expect(player.hand.length, `${label}: hand`).toBeLessThanOrEqual(8);
    expect(player.flame >= 0 && player.flame <= 6, `${label}: flame ${player.flame}`).toBe(true);
  }
  const uids = s.players.flatMap((p) => [...p.deck, ...p.hand, ...p.discard].map((c) => c.uid));
  uids.push(...Object.values(s.pieces).flatMap((p) => (p.charm ? [p.charm.uid] : [])));
  expect(new Set(uids).size, `${label}: duplicate card uids`).toBe(uids.length);
  if (s.vigil) expect(s.vigil.dread >= 0 && s.vigil.dread <= s.vigil.dreadMax, `${label}: dread`).toBe(true);
  for (const intent of s.intents) expect(s.pieces[intent.attackerId], `${label}: intent ${intent.id} without attacker`).toBeDefined();
  const plumeTiles = s.plumes.map((m) => posKey(m.pos));
  expect(new Set(plumeTiles).size, `${label}: stacked Plumes`).toBe(plumeTiles.length);
  for (const m of s.plumes) expect(s.board.tiles[m.pos.y * s.board.w + m.pos.x].type, `${label}: Plume on a Pillar`).not.toBe('pillar');
  expect(s.undo.depth, `${label}: undo depth`).toBe(s.undo.frames.length);
}

/** Six random cards from the whole pool on top of each deck, so every card gets played. */
function seedDecks(s: GameState, r: Rand): void {
  const pool = getContent().cards.list.map((c) => c.id);
  for (const player of s.players) {
    for (let k = 0; k < 6; k++) player.deck.unshift({ uid: `c${s.nextId++}`, id: pool[r.int(pool.length)], tempered: r.chance(0.2) });
  }
}

interface RunStats {
  actions: number;
  byType: Record<string, number>;
  cards: Set<string>;
  powers: number;
  undos: number;
  retries: number;
  parity: number;
}

function fuzzGame(i: number, maxSteps: number, stats: RunStats): GameState {
  const r = new Rand(0x9e3779b9 ^ (i * 7919));
  const sc = scenario(i, r);
  let s = newGame({ seed: `fuzz-${i}`, mode: sc.mode, seats: sc.seats, overrides: sc.overrides });
  seedDecks(s, r);
  checkInvariants(s, `game ${i} start`);
  let retries = 0;
  for (let step = 0; step < maxSteps; step++) {
    const action = randomAction(r, s, retries, { retryChance: 0.002, maxRetries: 2 });
    if (!action) break;
    const label = `game ${i} step ${step} ${action.type} (${s.phase})`;
    if (s.phase === 'snuff_strike' && action.type === 'advance' && r.chance(0.2)) {
      const preview = previewSnuffStrike(s);
      const real = applyAction(s, action);
      if (real.ok) expect(preview.state, `${label}: preview parity`).toEqual(real.state);
      stats.parity += 1;
    }
    const before = expectedCards(s, action);
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`${label}: rejected ${result.reason}`);
    s = result.state;
    stats.actions += 1;
    stats.byType[action.type] = (stats.byType[action.type] ?? 0) + 1;
    if (action.type === 'play_card') for (const e of result.events) if (e.type === 'card_played') stats.cards.add(e.cardId);
    if (action.type === 'use_power') stats.powers += 1;
    if (action.type === 'undo') stats.undos += 1;
    if (action.type === 'retry_night' && result.events.some((e) => e.type === 'night_retried')) {
      retries += 1;
      stats.retries += 1;
    } else if (action.type !== 'undo') {
      expect(ownedCards(s), `${label}: cards owned`).toEqual(before);
    }
    checkInvariants(s, label);
    if (step % 25 === 0) expect(JSON.parse(JSON.stringify(s)), `${label}: JSON round trip`).toEqual(s);
  }
  return s;
}

describe('fuzz: random legal play never breaks the engine', () => {
  it('many seeds, both modes, cards, Powers, undo and Retry', () => {
    const stats: RunStats = { actions: 0, byType: {}, cards: new Set(), powers: 0, undos: 0, retries: 0, parity: 0 };
    let finished = 0;
    for (let i = 0; i < 60; i++) {
      const end = fuzzGame(i, 1500, stats);
      if (end.result) finished += 1;
    }
    if (process.env.FUZZ_STATS) writeFileSync(process.env.FUZZ_STATS, JSON.stringify({ ...stats, cards: [...stats.cards].sort(), finished }, null, 1));
    expect(stats.actions).toBeGreaterThan(10_000);
    expect(stats.cards.size).toBe(getContent().cards.list.length);
    expect(stats.powers).toBeGreaterThan(50);
    expect(stats.undos).toBeGreaterThan(50);
    expect(stats.parity).toBeGreaterThan(20);
    expect(stats.retries).toBeGreaterThan(5);
    expect(finished).toBeGreaterThan(20);
  }, 300_000);
});
