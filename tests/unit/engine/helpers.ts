/**
 * Test helpers for engine scenarios: resolved configs, games advanced to the players phase, and
 * hand-built positions on a blank board.
 */
import { expect } from 'vitest';
import { customSelection, NO_FLAGS, resolveConfig } from '../../../src/config';
import { applyAction, createGame, getContent, pendingAutomation, sq, sqName } from '../../../src/engine';
import type { Action, GameConfig, GameEvent, GameState, ModeId, Piece, RuleValues, SeatConfig, TileId } from '../../../src/engine';
import { createCandle, createUnit, spawnEnemy } from '../../../src/engine/spawn';
import { makeCtx, removePiece } from '../../../src/engine/state';

export interface GameOptions {
  seed?: string;
  mode?: ModeId;
  seats?: Array<Partial<SeatConfig>>;
  overrides?: Partial<RuleValues>;
  flags?: Partial<Pick<GameConfig, 'tutorial' | 'firstGame' | 'daily' | 'modded'>>;
}

export function configFor(opts: GameOptions = {}): GameConfig {
  const seats = (opts.seats ?? [{ kind: 'human', hero: 'sconce_paladin' }]).map((seat) => ({ kind: seat.kind ?? 'human', hero: seat.hero ?? null, name: seat.name ?? '' }));
  const selection = customSelection({
    mode: opts.mode ?? 'vigil',
    overrides: { seed: opts.seed ?? 'test-seed', seats, ...(opts.overrides ?? {}) },
    flags: { ...NO_FLAGS, ...opts.flags },
  });
  const resolved = resolveConfig(selection);
  return resolved.config;
}

export function newGame(opts: GameOptions = {}): GameState {
  return createGame(configFor(opts));
}

/** Apply an action that must be legal. */
export function act(s: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = applyAction(s, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.reason} ${JSON.stringify(result.params ?? {})}`);
  return { state: result.state, events: result.events };
}

/** Ready every seat and advance until the players phase of the first round. */
export function toPlayers(s: GameState): GameState {
  let state = s;
  for (const p of state.players) if (!p.ready) state = act(state, { type: 'ready', seat: p.seat }).state;
  for (let i = 0; i < 20 && state.phase !== 'players'; i++) {
    expect(pendingAutomation(state)).not.toBeNull();
    state = act(state, { type: 'advance' }).state;
  }
  expect(state.phase).toBe('players');
  return state;
}

/**
 * A solo Vigil game in the players phase with the seat-0 turn running, on an all-flagstone board
 * with no Snuff, Plumes, intents or Candles. The hero stands on `heroAt` and is Ready.
 */
export function blankScenario(hero = 'sconce_paladin', heroAt = 'd2', opts: GameOptions = {}): GameState {
  const s = toPlayers(newGame({ seats: [{ kind: 'human', hero }], ...opts, overrides: { moth_die: false, ...(opts.overrides ?? {}) } }));
  for (const p of Object.values(s.pieces)) if (p.kind !== 'hero') removePiece(s, p.id);
  s.plumes = [];
  s.intents = [];
  for (const t of s.board.tiles) {
    t.type = 'flagstone';
    t.chimneyPair = null;
    t.shrineLit = false;
  }
  const h = heroPiece(s, 0);
  h.pos = sq(heroAt);
  h.movesLeft = 1;
  h.strikesLeft = 1;
  h.exhausted = false;
  return s;
}

export function heroPiece(s: GameState, seat: number): Piece {
  return s.pieces[s.players[seat].heroPieceId];
}

export function setTile(s: GameState, square: string, type: TileId, chimneyPair: number | null = null): void {
  const p = sq(square);
  const tile = s.board.tiles[p.y * s.board.w + p.x];
  tile.type = type;
  tile.chimneyPair = chimneyPair;
}

/** Place an enemy (no events kept). */
export function enemyAt(s: GameState, id: string, square: string): Piece {
  return spawnEnemy(makeCtx(s), id, sq(square), 'setup');
}

/** Place a Ready unit for a seat. */
export function unitAt(s: GameState, id: string, square: string, seat = 0): Piece {
  const unit = createUnit(makeCtx(s), id, seat, sq(square), 'card');
  unit.exhausted = false;
  unit.movesLeft = getContent().units.byId[id].move.type === 'immobile' ? 0 : 1;
  unit.strikesLeft = 1;
  return unit;
}

export function candleAt(s: GameState, square: string): Piece {
  return createCandle(s, getContent(), sq(square));
}

export function pieceOn(s: GameState, square: string): Piece | undefined {
  const p = sq(square);
  return Object.values(s.pieces).find((q) => q.pos.x === p.x && q.pos.y === p.y);
}

export function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): Array<Extract<GameEvent, { type: T }>> {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** Put a card into a seat's hand and return its uid. */
export function giveCard(s: GameState, id: string, opts: { tempered?: boolean; seat?: number } = {}): string {
  const card = { uid: `c${s.nextId++}`, id, tempered: opts.tempered ?? false };
  s.players[opts.seat ?? 0].hand.push(card);
  return card.uid;
}

/** Play a card (seat 0 by default) with piece / tile choices; must be legal. */
export function playCard(
  s: GameState,
  uid: string,
  targets: Array<Piece | string>,
  opts: { seat?: number; mode?: number } = {},
): { state: GameState; events: GameEvent[] } {
  const choices = targets.map((t) => (typeof t === 'string' ? { kind: 'tile' as const, pos: sq(t) } : { kind: 'piece' as const, pieceId: t.id }));
  return act(s, { type: 'play_card', seat: opts.seat ?? 0, cardUid: uid, targets: choices, ...(opts.mode !== undefined ? { mode: opts.mode } : {}) });
}

/** Lock a melee intent of `attacker` aimed at the adjacent tile `at`. */
export function lockMelee(s: GameState, attacker: Piece, at: string, damage = attacker.atk): void {
  const p = sq(at);
  const offset = { x: p.x - attacker.pos.x, y: p.y - attacker.pos.y };
  s.intents.push({
    id: `i${s.nextId++}`,
    attackerId: attacker.id,
    bossIntentId: null,
    kind: 'melee',
    shape: 'single',
    dir: { x: Math.sign(offset.x), y: Math.sign(offset.y) },
    offset,
    range: null,
    minRange: 1,
    damage,
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
    tiles: [p],
    targetId: null,
    global: null,
    createsTile: null,
    extra: null,
  });
}

/** Add a Plume (contents: Sootling) on a tile. */
export function plumeAt(s: GameState, square: string, enemyId = 'sootling'): void {
  s.plumes.push({ id: `m${s.nextId++}`, pos: sq(square), enemyId, order: s.nextId++, source: 'schedule', hauntSeat: null, hauntedHeroId: null });
}

/** Squares of a CardTargetInfo's options, sorted. */
export function optionSquares(info: { targets: Array<{ pos: { x: number; y: number } }> }): string[] {
  return info.targets.map((t) => sqName(t.pos)).sort();
}
