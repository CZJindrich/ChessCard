/**
 * Shared engine internals: the mutation context, ids, piece and tile lookups, side relations,
 * the GameState -> BoardQuery adapter and active-rule lookups.
 *
 * Every rules module mutates a cloned state through a `Ctx` and appends `GameEvent`s in the
 * order the UI should animate them. Nothing here is exported from index.ts.
 */
import { getContent } from './content';
import { footprint, inBounds, inFootprint, posKey, TERRAIN_OPEN, TERRAIN_PILLAR, TERRAIN_RUBBLE } from './geometry';
import type { BoardQuery, OccupantInfo, TerrainInfo } from './geometry';
import type {
  ActiveRule,
  ContentRegistry,
  Duration,
  GameEvent,
  GameState,
  Piece,
  PlayerState,
  Plume,
  Pos,
  RuleModId,
  RuleSource,
  Tile,
} from './types';

/**
 * Smoldering Wicks and line of sight: GDD §5.3 lists them as blockers, the overlay table (§5.4)
 * says "blocks movement but not line of sight". The engine follows the more specific overlay
 * rule, so a fallen hero is not a free shield against lines. Flip here if the design changes.
 */
export const SMOLDERING_WICK_BLOCKS_LOS = false;

/** Log entries kept in the state (older ones are dropped; the server keeps the full action log). */
export const LOG_LIMIT = 300;

export interface Ctx {
  s: GameState;
  reg: ContentRegistry;
  events: GameEvent[];
  /**
   * Open atomic effects (GDD §13.1.5, modes/vigil `atomicEffect`): a Dread defeat reached inside
   * one is held until the outermost one ends, so a victory in the same effect wins.
   */
  atomic?: { depth: number; defeat: string | null };
  /**
   * Open elimination-band scope (Last Flame, §13.2.6): eliminations inside one player action,
   * one intent or one Tally step share the band allocated on the first of them.
   */
  band?: { value: number | null };
}

export function makeCtx(s: GameState, reg: ContentRegistry = getContent()): Ctx {
  return { s, reg, events: [] };
}

/**
 * Deep copy for `applyAction` (the state is plain JSON). The config, the Retry snapshot and undo
 * frames are never mutated once made, so clones share them (the frame list itself is copied);
 * log entries are immutable, so the log array is copied shallowly.
 */
export function cloneState(s: GameState): GameState {
  const { config, log, nightSnapshot, undo, ...rest } = s;
  const copy = copyJson(rest);
  return { ...copy, config, log: log.slice(), nightSnapshot, undo: { frames: undo.frames.slice(), depth: undo.depth } };
}

/**
 * Deep copy of plain JSON data: the same result as `JSON.parse(JSON.stringify(value))` (undefined
 * object fields dropped, undefined array slots and non-finite numbers become null) without the
 * string round trip, which makes it several times faster (bot planners clone thousands of times).
 */
export function copyJson<T>(value: T): T {
  return copyValue(value) as T;
}

function copyValue(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = value[i] === undefined ? null : copyValue(value[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  for (const key in record) {
    const field = record[key];
    if (field !== undefined && typeof field !== 'function') out[key] = copyValue(field);
  }
  return out;
}

/** Drop every undo frame (seat-turn start and end, commit points, Retry). */
export function clearUndo(s: GameState): void {
  s.undo = { frames: [], depth: 0 };
}

export function emit(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
}

export function newId(s: GameState, prefix: 'p' | 'c' | 'i' | 'm'): string {
  return `${prefix}${s.nextId++}`;
}

/** A fresh monotonic number (initiative, summon order). Shares the id counter. */
export function nextOrder(s: GameState): number {
  return s.nextId++;
}

export function isOver(s: GameState): boolean {
  return s.result !== null;
}

// =============================================================================================
// Pieces
// =============================================================================================

export function pieceList(s: GameState): Piece[] {
  return Object.values(s.pieces);
}

export function getPiece(s: GameState, id: string | null | undefined): Piece | null {
  if (!id) return null;
  return s.pieces[id] ?? null;
}

/** The piece covering a tile (any tile of a multi-tile footprint). */
export function pieceAt(s: GameState, p: Pos): Piece | null {
  for (const piece of Object.values(s.pieces)) if (inFootprint(p, piece.pos, piece.size)) return piece;
  return null;
}

export function heroOf(s: GameState, seat: number): Piece | null {
  const player = s.players[seat];
  return player ? getPiece(s, player.heroPieceId) : null;
}

export function heroPieces(s: GameState): Piece[] {
  return pieceList(s).filter((p) => p.kind === 'hero');
}

/** Wickfolk heroes and units (not Vigil Candles). */
export function isWickfolk(p: Piece): boolean {
  return p.side === 'wick' && p.kind !== 'candle';
}

/** Non-hero Wickfolk pieces a seat owns (the unit limit counts these, structures and Moths included). */
export function unitsOf(s: GameState, seat: number): Piece[] {
  return pieceList(s).filter((p) => p.owner === seat && p.kind === 'unit');
}

/**
 * Is `p` an enemy of the acting seat? Snuff always; in Last Flame rival Wickfolk too.
 * Vigil Candles are never enemies.
 */
export function isEnemyOfSeat(s: GameState, seat: number | null, p: Piece): boolean {
  if (p.side === 'snuff') return true;
  if (p.kind === 'candle') return false;
  return s.config.mode === 'last_flame' && seat !== null && p.owner !== null && p.owner !== seat;
}

/** A Last Flame rival of the acting seat: another seat's hero or unit. */
export function isRivalOf(s: GameState, seat: number | null, p: Piece): boolean {
  return s.config.mode === 'last_flame' && seat !== null && p.side === 'wick' && p.kind !== 'candle' && p.owner !== null && p.owner !== seat;
}

/** Allied to the acting seat: every Wickfolk piece in Vigil, own pieces in Last Flame. Candles only on request. */
export function isAllyOfSeat(s: GameState, seat: number | null, p: Piece, includeCandles = false): boolean {
  if (p.kind === 'candle') return includeCandles && s.config.mode === 'vigil';
  if (p.side !== 'wick') return false;
  return s.config.mode === 'vigil' || seat === null || p.owner === seat;
}

export function removePiece(s: GameState, id: string): void {
  delete s.pieces[id];
  s.intents = s.intents.filter((i) => i.attackerId !== id);
}

// =============================================================================================
// Tiles and Plumes
// =============================================================================================

export function tileAt(s: GameState, p: Pos): Tile | null {
  if (!inBounds(p, s.board.w, s.board.h)) return null;
  return s.board.tiles[p.y * s.board.w + p.x];
}

export function setTileType(s: GameState, p: Pos, type: Tile['type']): void {
  const tile = tileAt(s, p);
  if (!tile) return;
  tile.type = type;
  if (type !== 'chimney') tile.chimneyPair = null;
  if (type !== 'votive_shrine') tile.shrineLit = false;
}

export function allTiles(s: GameState): Pos[] {
  const out: Pos[] = [];
  for (let y = s.board.h - 1; y >= 0; y--) for (let x = 0; x < s.board.w; x++) out.push({ x, y });
  return out;
}

export function plumeAt(s: GameState, p: Pos): Plume | null {
  return s.plumes.find((m) => m.pos.x === p.x && m.pos.y === p.y) ?? null;
}

export function terrainOf(tile: Tile): TerrainInfo {
  if (tile.type === 'pillar') return TERRAIN_PILLAR;
  if (tile.type === 'rubble') return TERRAIN_RUBBLE;
  return TERRAIN_OPEN;
}

/** The other end of a Chimney pair, or null. */
export function chimneyPartner(s: GameState, p: Pos): Pos | null {
  const tile = tileAt(s, p);
  if (!tile || tile.type !== 'chimney' || tile.chimneyPair === null) return null;
  for (let i = 0; i < s.board.tiles.length; i++) {
    const other = s.board.tiles[i];
    const pos = { x: i % s.board.w, y: Math.floor(i / s.board.w) };
    if (other.type === 'chimney' && other.chimneyPair === tile.chimneyPair && (pos.x !== p.x || pos.y !== p.y)) return pos;
  }
  return null;
}

export interface QueryOptions {
  /** Pieces treated as absent. */
  ignoreIds?: readonly string[];
}

/**
 * BoardQuery over a GameState. Occupancy is computed once, so build a fresh query after the
 * board changes. A Chimney works only while its pair is empty and neither end is in Gloam.
 */
export function boardQuery(s: GameState, opts: QueryOptions = {}): BoardQuery {
  const ignore = new Set(opts.ignoreIds ?? []);
  const occupants = new Map<string, OccupantInfo>();
  for (const piece of Object.values(s.pieces)) {
    if (ignore.has(piece.id)) continue;
    const blocksLos = !(piece.smoldering && !SMOLDERING_WICK_BLOCKS_LOS);
    for (const t of footprint(piece.pos, piece.size)) occupants.set(posKey(t), { id: piece.id, blocksLos });
  }
  const plumes = new Set(s.plumes.map((m) => posKey(m.pos)));
  const query: BoardQuery = {
    w: s.board.w,
    h: s.board.h,
    tileAt: (p) => {
      const tile = tileAt(s, p);
      return tile ? terrainOf(tile) : null;
    },
    pieceAt: (p) => occupants.get(posKey(p)) ?? null,
    plumeAt: (p) => plumes.has(posKey(p)),
    chimneyAt: (p) => {
      const partner = chimneyPartner(s, p);
      if (!partner) return null;
      if (tileAt(s, p)?.gloam || tileAt(s, partner)?.gloam) return null;
      return { exit: occupants.has(posKey(partner)) ? null : partner };
    },
  };
  return query;
}

// =============================================================================================
// Active rules (modify_rule)
// =============================================================================================

function ruleApplies(rule: ActiveRule, id: RuleModId, seat: number | null): boolean {
  return rule.rule === id && (rule.seat === null || seat === null || rule.seat === seat);
}

/** Sum of the `delta`s of every active rule `id` that applies to `seat`. */
export function ruleDelta(s: GameState, id: RuleModId, seat: number | null): number {
  return s.activeRules.reduce((sum, r) => (ruleApplies(r, id, seat) ? sum + r.delta : sum), 0);
}

/** The most recently added `value` of rule `id` that applies to `seat`, or null. */
export function ruleValue(s: GameState, id: RuleModId, seat: number | null): number | boolean | string | null {
  let value: number | boolean | string | null = null;
  for (const r of s.activeRules) if (ruleApplies(r, id, seat) && r.value !== null) value = r.value;
  return value;
}

export function addRule(s: GameState, rule: ActiveRule): void {
  s.activeRules.push(rule);
  if (rule.seat !== null) syncTurnState(s, rule.seat);
  else s.players.forEach((p) => syncTurnState(s, p.seat));
}

/**
 * A card limit for every seat during the next players phase (Silencing Peal, for the boss
 * engineer). Added before or during a players phase it applies to that phase; added during a
 * Snuff Strike it applies to the following round's players phase. It ends with that phase.
 */
export function setPlayersPhaseCardLimit(s: GameState, limit: number, source: RuleSource): void {
  addRule(s, { rule: 'card_limit', delta: 0, value: limit, seat: null, source, expires: 'next_players_phase' });
}

/** Drop rules with this duration (optionally only one seat's). */
export function expireRules(s: GameState, duration: Duration, seat?: number): void {
  s.activeRules = s.activeRules.filter((r) => !(r.expires === duration && (seat === undefined || r.seat === seat)));
  s.players.forEach((p) => syncTurnState(s, p.seat));
}

/** Mirror the turn-scoped rules into PlayerTurnState (read by the UI). */
export function syncTurnState(s: GameState, seat: number): void {
  const player = s.players[seat];
  if (!player) return;
  const rules = getContent().rules;
  player.turn.heroDmgBonus = ruleDelta(s, 'hero_strike_damage', seat);
  player.turn.heroBurn = ruleValue(s, 'hero_strike_burn', seat) === true;
  const cap = ruleValue(s, 'flourish_cap', seat);
  player.turn.flourishCap = typeof cap === 'number' ? cap : rules.flourishPerTurn;
  player.turn.cardLimit = cardLimitOf(s, seat);
}

/** The tightest active card limit for a seat, or null. */
export function cardLimitOf(s: GameState, seat: number): number | null {
  let limit: number | null = null;
  for (const r of s.activeRules) {
    if (r.rule !== 'card_limit' || typeof r.value !== 'number') continue;
    if (r.seat !== null && r.seat !== seat) continue;
    limit = limit === null ? r.value : Math.min(limit, r.value);
  }
  return limit;
}

// =============================================================================================
// Players
// =============================================================================================

export function livingPlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.eliminated);
}
