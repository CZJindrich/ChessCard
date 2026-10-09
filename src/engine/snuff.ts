/**
 * The Snuff (GDD §9, §12, §6.8): target choice, movement over AI tile costs, intent declaration
 * and aim, aimed-intent recomputation, Snuff Strike resolution, and Smoke Plumes (placement,
 * popping and rising).
 *
 * Intents are stored relative to their attacker (direction / offset). `intentHits` recomputes
 * the covered tiles and victims from the attacker's CURRENT position, so displacing an attacker
 * moves its attack, and `firstHit` lines are retraced at strike time.
 */
import { bossIntentText, resolveBossIntent } from './bossIntents';
import { bossSnuffMove } from './bosses';
import { afterMoveEnd, applyBurn, applyDaze, dealDamage, pushPiece, takesHotWax } from './combat';
import { baseEnv, hasTrait, runTraitTrigger, transformPiece } from './effects';
import {
  addPos,
  areaAnchorSize,
  areaTiles,
  artilleryTiles,
  beamTiles,
  chebyshev,
  clipToBoard,
  compareReadingOrder,
  dirsFor,
  effectiveRange,
  inBounds,
  leapOffsetsOf,
  mirrorOffset,
  patternMoves,
  posKey,
  pushDirection,
  quadrantOf,
  rectContains,
  reverseDir,
  samePos,
  signDir,
  sortPositions,
  sqName,
  subPos,
  traceLine,
} from './geometry';
import type { BoardQuery } from './geometry';
import { addLog, pieceAtText, pieceName, squarePieceText } from './log';
import { bandScope, creditTick } from './modes/lastFlame';
import { streamPick, streamWeighted } from './rng';
import { spawnEnemy } from './spawn';
import { boardQuery, emit, heroPieces, isOver, isWickfolk, newId, nextOrder, pieceAt, pieceList, plumeAt, ruleDelta, ruleValue, tileAt } from './state';
import type { Ctx } from './state';
import type {
  AreaShape,
  AttackDef,
  ContentRegistry,
  Dir,
  EnemyDef,
  GameState,
  Intent,
  IntentKind,
  IntentView,
  Pattern,
  Piece,
  Plume,
  PlumeSource,
  Pos,
} from './types';

// =============================================================================================
// Definitions
// =============================================================================================

export function enemyDefOf(reg: ContentRegistry, p: Piece): EnemyDef | null {
  return p.kind === 'enemy' ? (reg.enemies.byId[p.defId] ?? null) : null;
}

/** Restless Soot (+1) and Long Shadows (−1) change Snuff step and slide ranges. */
export function snuffRangeDelta(s: GameState): number {
  return ruleDelta(s, 'snuff_move_range', null);
}

/** An enemy's intent damage: its ATK (or a fixed number) plus Eclipse (§9.2). */
export function intentDamage(s: GameState, attack: AttackDef, p: Piece): number {
  const base = attack.damage === 'atk' ? p.atk : attack.damage;
  return Math.max(0, base + ruleDelta(s, 'snuff_damage', null));
}

// =============================================================================================
// Aims and covered tiles
// =============================================================================================

export interface AimGeom {
  kind: IntentKind;
  shape: AreaShape;
  dir: Dir | null;
  offset: Pos | null;
}

export interface AimHit {
  tiles: Pos[];
  victimIds: string[];
}

export interface AimSpec {
  geom: AimGeom;
  range: number | null;
  firstHit: boolean;
}

/** Tiles a melee reach pattern could strike if they were empty (slides stop at the first blocker). */
function reachTiles(q: BoardQuery, at: Pos, pattern: Pattern): Pos[] {
  if (pattern.type === 'immobile') return [];
  if (pattern.type === 'leap') {
    return leapOffsetsOf(pattern.offsets ?? 'knight')
      .map((o) => addPos(at, o))
      .filter((t) => q.tileAt(t)?.enterable === true);
  }
  const range = effectiveRange(pattern) ?? Math.max(q.w, q.h);
  const out: Pos[] = [];
  for (const d of dirsFor(pattern.dirs)) {
    for (let t = 1; t <= range; t++) {
      const tile = addPos(at, d, t);
      const terrain = q.tileAt(tile);
      if (!terrain) break;
      if (!terrain.enterable) {
        if (pattern.flying) continue;
        break;
      }
      out.push(tile);
      if (q.pieceAt(tile) && !pattern.flying) break;
      if (terrain.endsSlide && !pattern.flying) break;
    }
  }
  return out;
}

/** Every aim an attack can take from `at` (§12.3). */
export function aimsFor(attack: AttackDef, move: Pattern, q: BoardQuery, at: Pos, size: number): AimGeom[] {
  switch (attack.kind) {
    case 'melee': {
      if (attack.centered || attack.reach === null) return [{ kind: 'area', shape: attack.area, dir: null, offset: { x: 0, y: 0 } }];
      const pattern = attack.reach === 'as_move' ? move : attack.reach;
      return reachTiles(q, at, pattern).map((t) => ({ kind: 'melee', shape: 'single', dir: signDir(at, t), offset: subPos(t, at) }));
    }
    case 'ranged':
      return dirsFor(attack.dirs).map((d) => ({ kind: 'ranged', shape: 'line', dir: d, offset: null }));
    case 'artillery':
      return artilleryTiles(q, at, size, attack.minRange, attack.range ?? Math.max(q.w, q.h)).map((c) => ({
        kind: 'artillery',
        shape: attack.area,
        dir: null,
        offset: subPos(c, at),
      }));
    case 'none':
      return [];
  }
}

function piecesOn(s: GameState, q: BoardQuery, tiles: readonly Pos[]): string[] {
  const ids: string[] = [];
  for (const t of tiles) {
    const id = q.pieceAt(t)?.id;
    if (id && !ids.includes(id) && s.pieces[id]) ids.push(id);
  }
  return ids;
}

/** Tiles and victims of one aim from `at`. Bosses are never hit by Snuff attacks (§6.8). */
export function aimHits(s: GameState, q: BoardQuery, at: Pos, size: number, spec: AimSpec): AimHit {
  const { w, h } = s.board;
  const g = spec.geom;
  let tiles: Pos[] = [];
  let victimIds: string[] = [];
  if (g.kind === 'ranged' && g.dir) {
    const trace = traceLine(q, at, g.dir, spec.range, spec.firstHit ? 'firstHit' : 'pierce');
    tiles = trace.tiles;
    victimIds = (spec.firstHit ? trace.hits.slice(0, 1) : trace.hits).map((hit) => hit.pieceId);
  } else {
    if (g.kind === 'melee' && g.offset) tiles = [addPos(at, g.offset)];
    else if (g.kind === 'area' && g.dir && (g.shape === 'beam2' || g.shape === 'side2')) {
      tiles = beamTiles(q, at, size, g.dir, g.shape === 'side2' ? 1 : (spec.range ?? 1));
    } else if (g.kind === 'area') tiles = areaTiles(g.shape, at, { size });
    else if (g.kind === 'artillery' && g.offset) tiles = areaTiles(g.shape, addPos(at, g.offset));
    tiles = clipToBoard(tiles, w, h);
    victimIds = piecesOn(s, q, tiles);
  }
  return { tiles, victimIds: victimIds.filter((id) => s.pieces[id]?.kind !== 'boss') };
}

/** An intent's geometry after any reversal (§6.8 step 4). */
export function effectiveAim(intent: Intent, attackerSize: number): AimGeom {
  const shape = intent.shape === 'global' ? 'single' : intent.shape;
  if (!intent.reversed) return { kind: intent.kind, shape, dir: intent.dir, offset: intent.offset };
  return {
    kind: intent.kind,
    shape,
    dir: intent.dir ? reverseDir(intent.dir) : null,
    offset: intent.offset && !intent.centered ? mirrorOffset(intent.offset, attackerSize, areaAnchorSize(shape)) : intent.offset,
  };
}

/** Tiles and victims of a locked intent, recomputed from its attacker's current position. */
export function intentHits(s: GameState, intent: Intent): AimHit {
  const attacker = s.pieces[intent.attackerId];
  if (!attacker || intent.kind === 'global') return { tiles: [], victimIds: [] };
  const q = boardQuery(s, { ignoreIds: [attacker.id] });
  return aimHits(s, q, attacker.pos, attacker.size, {
    geom: effectiveAim(intent, attacker.size),
    range: intent.range,
    firstHit: intent.firstHit,
  });
}

/** Refresh the cached display tiles of every intent (after any displacement or board change). */
export function refreshIntentTiles(s: GameState): void {
  for (const intent of s.intents) intent.tiles = intentHits(s, intent).tiles;
}

/**
 * Reverse a locked intent (Turnabout, §6.8): lines and melee flip direction, artillery mirrors
 * its offset through the attacker. Centred intents cannot be reversed (reason NO_DIRECTION).
 */
export function canReverse(s: GameState, p: Piece): boolean {
  return s.intents.some((i) => i.attackerId === p.id && !i.centered && i.kind !== 'global');
}

export function reverseIntent(ctx: Ctx, p: Piece, seat: number | null): void {
  for (const intent of ctx.s.intents) {
    if (intent.attackerId !== p.id || intent.centered || intent.kind === 'global') continue;
    intent.reversed = !intent.reversed;
    intent.reversedBy = seat;
    const at = seat !== null ? creditTick(ctx.s) : 0;
    if (at > 0) intent.reversedAt = at;
    else delete intent.reversedAt;
    intent.tiles = intentHits(ctx.s, intent).tiles;
    if (seat !== null) emit(ctx, { type: 'intent_reversed', intentId: intent.id, tiles: intent.tiles, seat });
    addLog(ctx, `${pieceAtText(ctx.reg, p)} turns its attack around.`, seat ?? undefined);
  }
}

// =============================================================================================
// Target choice (§12.1)
// =============================================================================================

export interface SnuffTarget {
  pos: Pos;
  piece: Piece | null;
}

function litShrineTiles(s: GameState): Pos[] {
  const out: Pos[] = [];
  s.board.tiles.forEach((t, i) => {
    if (t.type === 'votive_shrine' && t.shrineLit) out.push({ x: i % s.board.w, y: Math.floor(i / s.board.w) });
  });
  return out;
}

export function candidateTargets(s: GameState, def: EnemyDef): SnuffTarget[] {
  const wick = pieceList(s).filter((p) => isWickfolk(p) && !p.smoldering);
  const candles = pieceList(s).filter((p) => p.kind === 'candle');
  const asTargets = (list: Piece[]): SnuffTarget[] => list.map((p) => ({ pos: p.pos, piece: p }));
  let preferred: SnuffTarget[];
  switch (def.ai.prefers) {
    case null:
      return [];
    case 'candles':
      preferred = asTargets(candles);
      break;
    case 'heroes':
      preferred = asTargets(wick.filter((p) => p.kind === 'hero'));
      break;
    case 'light':
      preferred = [
        ...litShrineTiles(s).map((pos) => ({ pos, piece: null })),
        ...asTargets(wick.filter((p) => p.defId === 'lantern')),
        ...asTargets(candles),
      ];
      break;
    case 'clusters':
    case 'nearest':
      preferred = asTargets([...wick, ...candles]);
      break;
  }
  return preferred.length > 0 ? preferred : asTargets(wick);
}

function covers(hit: AimHit, target: SnuffTarget): boolean {
  return target.piece ? hit.victimIds.includes(target.piece.id) : hit.tiles.some((t) => samePos(t, target.pos));
}

function isLethal(target: SnuffTarget, damage: number): boolean {
  if (!target.piece) return true;
  return !target.piece.ward && target.piece.hp <= damage;
}

/** Wickfolk pieces and Candles an area centred near the target would hit (`clusters`). */
function clusterValue(s: GameState, target: SnuffTarget, shape: AreaShape): number {
  let best = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const centre = { x: target.pos.x + dx, y: target.pos.y + dy };
      const tiles = clipToBoard(areaTiles(shape, centre), s.board.w, s.board.h);
      if (!tiles.some((t) => samePos(t, target.pos))) continue;
      const count = tiles.filter((t) => {
        const p = pieceAt(s, t);
        return p !== null && p.side === 'wick' && !p.smoldering;
      }).length;
      best = Math.max(best, count);
    }
  }
  return best;
}

// =============================================================================================
// Movement (§12.2)
// =============================================================================================

interface ReachNode {
  pos: Pos;
  cost: number;
  moves: number;
  /** First move of the cheapest path (null = stay). */
  first: Pos | null;
}

function tileCost(ctx: Ctx, enemy: Piece, p: Pos): number {
  const tile = tileAt(ctx.s, p);
  if (!tile) return Infinity;
  const def = ctx.reg.tiles.byId[tile.type];
  if (tile.type === 'hot_wax' && !takesHotWax(ctx.reg, enemy)) return def?.aiCostImmune ?? 1;
  return def?.aiCost ?? 1;
}

function better(a: ReachNode, b: ReachNode): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.moves !== b.moves) return a.moves < b.moves;
  if (a.first && b.first) return compareReadingOrder(a.first, b.first) < 0;
  return false;
}

/** Dijkstra over the enemy's move pattern; never ends a move on a Plume; Chimneys are flagstone. */
function moveGraph(ctx: Ctx, enemy: Piece, def: EnemyDef, q: BoardQuery): ReachNode[] {
  const start: ReachNode = { pos: enemy.pos, cost: 0, moves: 0, first: null };
  const best = new Map<string, ReachNode>([[posKey(enemy.pos), start]]);
  const done = new Set<string>();
  const plumes = new Set(ctx.s.plumes.map((m) => posKey(m.pos)));
  const rangeDelta = snuffRangeDelta(ctx.s);
  let frontier: ReachNode[] = [start];
  while (frontier.length > 0) {
    let index = 0;
    for (let i = 1; i < frontier.length; i++) if (better(frontier[i], frontier[index])) index = i;
    const current = frontier[index];
    frontier.splice(index, 1);
    const currentKey = posKey(current.pos);
    if (done.has(currentKey) || best.get(currentKey) !== current) continue;
    done.add(currentKey);
    for (const dest of patternMoves(q, current.pos, def.move, { size: enemy.size, rangeDelta, useChimneys: false })) {
      const key = posKey(dest.to);
      if (plumes.has(key) || done.has(key)) continue;
      const node: ReachNode = {
        pos: dest.to,
        cost: current.cost + tileCost(ctx, enemy, dest.to),
        moves: current.moves + 1,
        first: current.first ?? dest.to,
      };
      const existing = best.get(key);
      if (existing && !better(node, existing)) continue;
      best.set(key, node);
      frontier = frontier.filter((n) => n !== existing);
      frontier.push(node);
    }
  }
  return [...best.values()];
}

function compareNodes(a: ReachNode, b: ReachNode): number {
  return a.cost - b.cost || a.moves - b.moves || compareReadingOrder(a.pos, b.pos);
}

interface TargetChoice {
  target: SnuffTarget;
  node: ReachNode | null;
}

/** Last Flame tie-break (§12.1 step 5): the Glory of the target's owner (0 for Vigil, Shrines and Snuff). */
function ownerGlory(s: GameState, target: SnuffTarget): number {
  const owner = target.piece?.owner;
  if (s.config.mode !== 'last_flame' || owner === null || owner === undefined) return 0;
  return s.players[owner]?.glory ?? 0;
}

/** §12.1 ordering: (clusters) → lethal → path distance → lowest HP → (Last Flame) highest owner Glory → reading order. */
function chooseTarget(ctx: Ctx, enemy: Piece, def: EnemyDef, nodes: ReachNode[], q: BoardQuery): TargetChoice | null {
  const candidates = candidateTargets(ctx.s, def);
  if (candidates.length === 0) return null;
  const damage = intentDamage(ctx.s, def.attack, enemy);
  const bestNode = new Map<SnuffTarget, ReachNode>();
  for (const node of nodes.slice().sort(compareNodes)) {
    if (bestNode.size === candidates.length) break;
    const hits = aimsFor(def.attack, def.move, q, node.pos, enemy.size).map((geom) =>
      aimHits(ctx.s, q, node.pos, enemy.size, { geom, range: def.attack.range, firstHit: def.attack.firstHit }),
    );
    for (const target of candidates) if (!bestNode.has(target) && hits.some((hit) => covers(hit, target))) bestNode.set(target, node);
  }
  const scored = candidates.map((target) => ({
    target,
    node: bestNode.get(target) ?? null,
    lethal: isLethal(target, damage),
    cluster: def.ai.prefers === 'clusters' ? clusterValue(ctx.s, target, def.attack.area) : 0,
    hp: target.piece?.hp ?? 1,
    glory: ownerGlory(ctx.s, target),
  }));
  scored.sort(
    (a, b) =>
      b.cluster - a.cluster ||
      Number(b.lethal) - Number(a.lethal) ||
      (a.node?.cost ?? Infinity) - (b.node?.cost ?? Infinity) ||
      (a.node?.moves ?? Infinity) - (b.node?.moves ?? Infinity) ||
      a.hp - b.hp ||
      b.glory - a.glory ||
      compareReadingOrder(a.target.pos, b.target.pos),
  );
  return { target: scored[0].target, node: scored[0].node };
}

function moveKindOf(pattern: Pattern, from: Pos, to: Pos): 'step' | 'slide' | 'leap' | 'fly' {
  if (pattern.type === 'leap') return 'leap';
  if (pattern.flying) return 'fly';
  return chebyshev(from, to) === 1 ? 'step' : 'slide';
}

/** A Snuff ending a move on, or attacking, a Lit Shrine puts it out (§5.4). */
export function putOutShrine(ctx: Ctx, p: Pos): void {
  const tile = tileAt(ctx.s, p);
  if (!tile || tile.type !== 'votive_shrine' || !tile.shrineLit) return;
  tile.shrineLit = false;
  emit(ctx, { type: 'shrine_changed', pos: p, lit: false, seat: null });
  addLog(ctx, `The Shrine at ${sqName(p)} goes dark.`);
}

/** Crown (Vigil only): a Gutter Pawn ending its Snuff Move on rank 1 becomes a Drip Hulk at full HP. */
function applyCrown(ctx: Ctx, enemy: Piece): void {
  if (ctx.s.config.mode !== 'vigil' || enemy.pos.y !== 0 || !hasTrait(ctx, enemy, 'crown')) return;
  transformPiece(
    ctx,
    enemy,
    { op: 'transform', into: 'drip_hulk', owner: 'same', fullHp: true },
    baseEnv({ ruleSource: { kind: 'boss', id: 'crown' } }),
  );
}

function moveEnemy(ctx: Ctx, enemy: Piece, def: EnemyDef, to: Pos): void {
  const q = boardQuery(ctx.s);
  const dest = patternMoves(q, enemy.pos, def.move, { size: enemy.size, rangeDelta: snuffRangeDelta(ctx.s), useChimneys: false }).find((d) =>
    samePos(d.to, to),
  );
  if (!dest) return;
  const from = enemy.pos;
  enemy.pos = { ...to };
  emit(ctx, { type: 'piece_moved', pieceId: enemy.id, from, to: enemy.pos, kind: moveKindOf(def.move, from, to), path: dest.path });
  afterMoveEnd(ctx, enemy, null);
  if (ctx.s.pieces[enemy.id] !== enemy) return;
  putOutShrine(ctx, enemy.pos);
  applyCrown(ctx, enemy);
}

// =============================================================================================
// Intent declaration (§12.3)
// =============================================================================================

interface ScoredAim {
  geom: AimGeom;
  hit: AimHit;
  hitsTarget: boolean;
  wick: number;
  snuff: number;
  distance: number;
  key: Pos;
}

function scoreAim(s: GameState, geom: AimGeom, hit: AimHit, target: SnuffTarget | null, at: Pos): ScoredAim {
  const victims = hit.victimIds.map((id) => s.pieces[id]).filter((p): p is Piece => p !== undefined);
  const key = sortPositions(hit.tiles)[0] ?? (geom.dir ? addPos(at, geom.dir) : at);
  return {
    geom,
    hit,
    hitsTarget: target !== null && covers(hit, target),
    wick: victims.filter((p) => p.side === 'wick' && !p.smoldering).length,
    snuff: victims.filter((p) => p.side === 'snuff').length,
    distance: target ? Math.min(Infinity, ...hit.tiles.map((t) => chebyshev(t, target.pos))) : 0,
    key,
  };
}

function compareAims(a: ScoredAim, b: ScoredAim): number {
  return (
    Number(b.hitsTarget) - Number(a.hitsTarget) ||
    Number(b.snuff === 0) - Number(a.snuff === 0) ||
    b.wick - a.wick ||
    a.snuff - b.snuff ||
    a.distance - b.distance ||
    compareReadingOrder(a.key, b.key)
  );
}

/** The enemy's intent for this Snuff Move: the best aim at `target` (§12.3); null when Dazed or unarmed. */
export function declareIntent(ctx: Ctx, enemy: Piece, def: EnemyDef, target: SnuffTarget | null): Intent | null {
  const { s } = ctx;
  if (enemy.dazed) {
    enemy.dazed = false;
    emit(ctx, { type: 'status_changed', pieceId: enemy.id, status: 'dazed', active: false, value: 0 });
    addLog(ctx, `${pieceAtText(ctx.reg, enemy)} is Dazed and declares nothing.`);
    return null;
  }
  const attack = def.attack;
  if (attack.kind === 'none') return null;
  const q = boardQuery(s, { ignoreIds: [enemy.id] });
  const aims = aimsFor(attack, def.move, q, enemy.pos, enemy.size).map((geom) =>
    scoreAim(s, geom, aimHits(s, q, enemy.pos, enemy.size, { geom, range: attack.range, firstHit: attack.firstHit }), target, enemy.pos),
  );
  if (aims.length === 0) return null;
  aims.sort(compareAims);
  const best = aims[0];
  return {
    id: newId(s, 'i'),
    attackerId: enemy.id,
    bossIntentId: null,
    kind: best.geom.kind,
    shape: best.geom.shape,
    dir: best.geom.dir,
    offset: best.geom.offset,
    range: attack.range,
    minRange: attack.minRange,
    damage: intentDamage(s, attack, enemy),
    push: attack.push,
    pushMode: attack.push > 0 ? 'away' : null,
    pull: attack.pull,
    status: attack.status,
    firstHit: attack.firstHit,
    pierce: attack.pierce,
    centered: attack.centered || best.geom.kind === 'area',
    reversed: false,
    reversedBy: null,
    queue: 0,
    tiles: best.hit.tiles,
    targetId: best.hitsTarget ? (target?.piece?.id ?? null) : null,
    global: null,
    createsTile: null,
    extra: null,
  };
}

/** Snuff turn order: bosses first, then enemies by initiative. */
export function snuffInOrder(s: GameState): Piece[] {
  return pieceList(s)
    .filter((p) => p.side === 'snuff')
    .sort((a, b) => Number(b.kind === 'boss') - Number(a.kind === 'boss') || a.initiative - b.initiative);
}

/** One enemy's Snuff Move: move toward its target, then declare (§4.2, §12). */
function snuffMoveOne(ctx: Ctx, enemy: Piece): void {
  const def = enemyDefOf(ctx.reg, enemy);
  if (!def) return;
  const q = boardQuery(ctx.s, { ignoreIds: [enemy.id] });
  const nodes = def.move.type === 'immobile' ? [{ pos: enemy.pos, cost: 0, moves: 0, first: null }] : moveGraph(ctx, enemy, def, q);
  const choice = chooseTarget(ctx, enemy, def, nodes, q);
  let node = choice?.node ?? null;
  if (choice && !node) {
    const target = choice.target;
    node = nodes.slice().sort((a, b) => chebyshev(a.pos, target.pos) - chebyshev(b.pos, target.pos) || compareNodes(a, b))[0] ?? null;
  }
  if (node?.first) moveEnemy(ctx, enemy, def, node.first);
  if (isOver(ctx.s) || ctx.s.pieces[enemy.id] !== enemy) return;
  const liveDef = enemyDefOf(ctx.reg, enemy) ?? def;
  const intent = declareIntent(ctx, enemy, liveDef, choice?.target ?? null);
  if (intent) ctx.s.intents.push(intent);
}

/** The whole Snuff Move: bosses (hook), then every enemy in initiative order; then number the queue. */
export function runSnuffMovement(ctx: Ctx): void {
  const { s } = ctx;
  s.intents = [];
  bossSnuffMove(ctx);
  for (const enemy of snuffInOrder(s)) {
    if (isOver(s)) return;
    if (enemy.kind === 'boss' || s.pieces[enemy.id] !== enemy) continue;
    snuffMoveOne(ctx, enemy);
  }
  numberIntents(ctx);
}

/** Number the locked intents in queue (resolution) order and announce them. */
export function numberIntents(ctx: Ctx): void {
  const { s } = ctx;
  s.intents.forEach((intent, i) => {
    intent.queue = i + 1;
    emit(ctx, {
      type: 'intent_declared',
      intentId: intent.id,
      attackerId: intent.attackerId,
      queue: intent.queue,
      tiles: intent.tiles,
      damage: intent.damage,
    });
  });
  refreshIntentTiles(s);
}

// =============================================================================================
// Snuff Strike (§6.8)
// =============================================================================================

/**
 * Kill credit for a Snuff hit (§6.3): the last player who displaced the victim or the attacker
 * this round, or reversed the intent. Last Flame orders them by the credit clock; without clock
 * readings (Vigil) the victim's displacer comes first, then the attacker's, then the reverser.
 */
export function snuffCredit(victim: Piece, attacker: Piece, intent: Intent): number | null {
  const marks = [
    { seat: victim.lastDisplacedBy, at: victim.lastDisplacedAt ?? 0 },
    { seat: attacker.lastDisplacedBy, at: attacker.lastDisplacedAt ?? 0 },
    { seat: intent.reversedBy, at: intent.reversedAt ?? 0 },
  ];
  let best: { seat: number; at: number } | null = null;
  for (const mark of marks) {
    if (mark.seat === null) continue;
    if (!best || mark.at > best.at) best = { seat: mark.seat, at: mark.at };
  }
  return best?.seat ?? null;
}

function resolveIntent(ctx: Ctx, intent: Intent): void {
  const { s, reg } = ctx;
  const attacker = s.pieces[intent.attackerId];
  if (!attacker) {
    emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'attacker_died' });
    return;
  }
  if (attacker.kind === 'boss' && intent.bossIntentId) {
    resolveBossIntent(ctx, intent, attacker);
    return;
  }
  const hit = intentHits(s, intent);
  emit(ctx, { type: 'strike', attackerId: attacker.id, kind: 'snuff', from: attacker.pos, tiles: hit.tiles, intentId: intent.id });
  for (const t of hit.tiles) putOutShrine(ctx, t);
  const victims = hit.victimIds
    .map((id) => s.pieces[id])
    .filter((p): p is Piece => p !== undefined)
    .sort((a, b) => compareReadingOrder(a.pos, b.pos));
  if (victims.length === 0) addLog(ctx, `${pieceAtText(reg, attacker)} strikes at empty stone.`);
  for (const victim of victims) {
    if (isOver(s)) return;
    if (!victim.smoldering) addLog(ctx, `${pieceName(reg, attacker)} strikes ${squarePieceText(reg, victim)} for ${intent.damage}.`);
    dealDamage(ctx, victim, intent.damage, {
      cause: 'intent',
      sourceKind: 'snuff_attack',
      sourceId: attacker.id,
      seat: snuffCredit(victim, attacker, intent),
    });
  }
  const survivors = victims.filter((v) => s.pieces[v.id] === v && !v.smoldering);
  const extraStatus = ruleValue(s, 'snuff_attack_status', null);
  for (const victim of survivors) {
    if (isOver(s)) return;
    if (intent.status === 'dazed') applyDaze(ctx, victim);
    if (intent.status === 'burn' || extraStatus === 'burn') applyBurn(ctx, victim);
  }
  if (intent.push > 0) {
    const aim = effectiveAim(intent, attacker.size);
    for (const victim of survivors) {
      if (isOver(s) || s.pieces[victim.id] !== victim) continue;
      const dir = intent.pushMode === 'along' && aim.dir ? aim.dir : pushDirection(attacker.pos, attacker.size, victim.pos);
      const credit = snuffCredit(victim, attacker, intent);
      pushPiece(ctx, victim, dir, intent.push, { displacer: null, credit, sourceId: attacker.id });
    }
  }
  emit(ctx, { type: 'intent_resolved', intentId: intent.id, tiles: hit.tiles });
}

/**
 * Resolve every intent in queue order; each finishes before the next starts (its tiles are
 * recomputed from the attacker's position at that moment). The cached display tiles of the
 * intents still queued are not refreshed in between: the queue is empty when this returns.
 */
export function resolveSnuffStrike(ctx: Ctx): void {
  const { s } = ctx;
  for (const id of s.intents.map((i) => i.id)) {
    if (isOver(s)) break;
    const intent = s.intents.find((i) => i.id === id);
    if (!intent) continue;
    bandScope(ctx, () => resolveIntent(ctx, intent));
    s.intents = s.intents.filter((i) => i.id !== id);
  }
  s.intents = [];
}

// =============================================================================================
// Plumes (§9.4)
// =============================================================================================

export interface PlumeRequest {
  count: number;
  source: PlumeSource;
  /** Fixed contents (Smoke, Smokestack and Haunt Plumes are Sootlings); default: tier weights. */
  enemyId?: string;
  near?: { anchor: Pos; max: number };
  /** Last Flame quadrant (0-3, geometry.quadrantOf). */
  quadrant?: number;
}

/** Draw an enemy from the Night tier's weights (`spawn` stream). */
export function drawTierEnemy(ctx: Ctx): string {
  const tier = String(ctx.s.tier) as '1' | '2' | '3';
  const entries = ctx.reg.enemies.list.filter((e) => !e.summonOnly).map((e) => ({ item: e.id, weight: e.weight[tier] }));
  return streamWeighted(ctx.s, 'spawn', entries);
}

function inPlumeZone(s: GameState, p: Pos): boolean {
  return s.board.zones.plume.some((r) => rectContains(r, p));
}

/** A legal Plume tile (§9.4): empty flagstone/rubble, ≥2 from every hero, in the zone, outside the Gloam. */
export function isLegalPlumeTile(s: GameState, reg: ContentRegistry, p: Pos): boolean {
  const tile = tileAt(s, p);
  if (!tile || !reg.rules.plumeLegalTiles.includes(tile.type)) return false;
  if (tile.gloam || tile.gloamWarning || pieceAt(s, p) || plumeAt(s, p)) return false;
  if (!inPlumeZone(s, p)) return false;
  return heroPieces(s).every((h) => chebyshev(h.pos, p) >= reg.rules.plumeMinHeroDistance);
}

export function legalPlumeTiles(s: GameState, reg: ContentRegistry, req: Pick<PlumeRequest, 'near' | 'quadrant'> = {}): Pos[] {
  const out: Pos[] = [];
  for (let y = s.board.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.board.w; x++) {
      const p = { x, y };
      if (req.near && chebyshev(req.near.anchor, p) > req.near.max) continue;
      if (req.quadrant !== undefined && quadrantOf(p, s.board.w, s.board.h) !== req.quadrant) continue;
      if (isLegalPlumeTile(s, reg, p)) out.push(p);
    }
  }
  return out;
}

export function createPlume(ctx: Ctx, pos: Pos, enemyId: string, source: PlumeSource): Plume {
  const plume: Plume = { id: newId(ctx.s, 'm'), pos: { ...pos }, enemyId, order: nextOrder(ctx.s), source, hauntSeat: null, hauntedHeroId: null };
  ctx.s.plumes.push(plume);
  emit(ctx, { type: 'plume_placed', plumeId: plume.id, pos: plume.pos, enemyId, source });
  return plume;
}

/** Place Plumes on random legal tiles (`spawn` stream: tile first, then contents). */
export function placePlumes(ctx: Ctx, req: PlumeRequest): number {
  let placed = 0;
  for (let i = 0; i < req.count; i++) {
    const tiles = legalPlumeTiles(ctx.s, ctx.reg, req);
    if (tiles.length === 0) {
      emit(ctx, { type: 'plume_skipped', reason: 'no_tile' });
      addLog(ctx, 'A Plume finds no legal tile and fades.');
      continue;
    }
    const pos = streamPick(ctx.s, 'spawn', tiles);
    createPlume(ctx, pos, req.enemyId ?? drawTierEnemy(ctx), req.source);
    placed += 1;
  }
  return placed;
}

/** A player strike or damaging effect pops a Plume (§9.4). */
export function popPlume(ctx: Ctx, plume: Plume, seat: number | null): void {
  if (!ctx.s.plumes.includes(plume)) return;
  ctx.s.plumes = ctx.s.plumes.filter((m) => m !== plume);
  emit(ctx, { type: 'plume_popped', plumeId: plume.id, pos: plume.pos, seat });
  if (seat !== null && ctx.s.players[seat]) ctx.s.players[seat].stats.plumesPopped += 1;
  addLog(ctx, `The Plume at ${sqName(plume.pos)} is popped.`, seat ?? undefined);
}

/** Rise (§9.4): in creation order, blocked by a standing piece, otherwise the enemy rises. */
export function riseAll(ctx: Ctx): void {
  const { s, reg } = ctx;
  for (const plume of s.plumes.slice().sort((a, b) => a.order - b.order)) {
    if (isOver(s)) return;
    s.plumes = s.plumes.filter((m) => m !== plume);
    const occupant = pieceAt(s, plume.pos);
    if (occupant && occupant.side === 'wick') {
      emit(ctx, { type: 'plume_blocked', plumeId: plume.id, pos: plume.pos, blockerId: occupant.id, damaged: !occupant.smoldering });
      addLog(ctx, `${pieceAtText(reg, occupant)} blocks a Plume.`);
      if (occupant.owner !== null && s.players[occupant.owner]) s.players[occupant.owner].stats.plumesBlocked += 1;
      dealDamage(ctx, occupant, reg.rules.plumeBlockDamage, { cause: 'plume_block', sourceKind: 'hazard', sourceId: null, seat: null });
      continue;
    }
    if (occupant) {
      addLog(ctx, `The Plume at ${sqName(plume.pos)} is smothered by ${pieceName(reg, occupant)}.`);
      continue;
    }
    const enemy = spawnEnemy(ctx, plume.enemyId, plume.pos, 'rise');
    emit(ctx, { type: 'plume_rose', plumeId: plume.id, pos: plume.pos, pieceId: enemy.id, enemyId: plume.enemyId });
    addLog(ctx, `${pieceAtText(reg, enemy)} rises from the smoke.`);
  }
}

// =============================================================================================
// Placement schedule and setup spawns
// =============================================================================================

/**
 * Plumes per Vigil placement (§13.3.2): max(1, 1 + k × (P − 1) + plumes_mod) for P seats
 * (k = `coopScaling.plumesPerExtraSeat`), +1 with Black Sun.
 */
export function vigilPlumeCount(s: GameState, reg: ContentRegistry): number {
  const base = Math.max(1, 1 + reg.rules.coopScaling.plumesPerExtraSeat * (s.players.length - 1) + s.config.plumes_mod);
  return base + ruleDelta(s, 'plumes_per_placement', null);
}

/** Smokestack Belch: each Smokestack adds a Sootling Plume within 2 at every Plume placement. */
export function belchAll(ctx: Ctx): void {
  for (const stack of snuffInOrder(ctx.s)) {
    if (isOver(ctx.s)) return;
    runTraitTrigger(ctx, stack, 'plume_placement');
  }
}

/** Legal tiles for a starting enemy in the Snuff zone: open, Plume- and wax-free, not within 2 of a hero start. */
export function initialEnemyTiles(s: GameState, reg: ContentRegistry, heroStarts: readonly Pos[]): Pos[] {
  const out: Pos[] = [];
  const minDistance = reg.rules.siteGeneration.enemyMinHeroDistance;
  for (let y = s.board.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.board.w; x++) {
      const p = { x, y };
      const tile = tileAt(s, p);
      if (!tile || tile.type === 'pillar' || tile.type === 'hot_wax') continue;
      if (!s.board.zones.snuff.some((r) => rectContains(r, p))) continue;
      if (pieceAt(s, p) || plumeAt(s, p)) continue;
      if (heroStarts.some((h) => chebyshev(h, p) <= minDistance)) continue;
      if (heroPieces(s).some((h) => chebyshev(h.pos, p) <= minDistance)) continue;
      out.push(p);
    }
  }
  return out;
}

/** Initial enemies on random legal Snuff-zone tiles (`spawn` stream: tile, then type). */
export function placeInitialEnemies(ctx: Ctx, count: number, heroStarts: readonly Pos[]): void {
  for (let i = 0; i < count; i++) {
    const tiles = initialEnemyTiles(ctx.s, ctx.reg, heroStarts);
    if (tiles.length === 0) return;
    const pos = streamPick(ctx.s, 'spawn', tiles);
    const enemy = spawnEnemy(ctx, drawTierEnemy(ctx), pos, 'setup');
    addLog(ctx, `${pieceAtText(ctx.reg, enemy)} lurks in the dark.`);
  }
}

// =============================================================================================
// Views
// =============================================================================================

function verbFor(intent: Intent): string {
  if (intent.kind === 'ranged') return intent.pierce ? 'wails through' : 'lances';
  if (intent.kind === 'artillery') return 'lobs ash at';
  if (intent.kind === 'area') return 'rings';
  return 'strikes';
}

/** " (Dread +n)" for the Vigil Candles an intent would hit (Ward absorbs a hit). */
export function dreadNote(s: GameState, victims: Piece[], damage: number): string {
  if (!s.vigil) return '';
  const candles = victims.filter((p) => p.kind === 'candle' && !p.ward);
  if (candles.length === 0) return '';
  const dread = candles.reduce((sum, c) => sum + 1 + (c.hp <= damage ? 1 : 0), 0);
  return ` (Dread +${dread})`;
}

/** "1 · Ink Wretch → lances c3 Vigil Candle for 1 (Dread +1)" (§15.4). */
export function intentText(s: GameState, reg: ContentRegistry, intent: Intent): { name: string; text: string } {
  if (intent.bossIntentId) return bossIntentText(s, reg, intent);
  const attacker = s.pieces[intent.attackerId];
  const name = attacker ? pieceName(reg, attacker) : 'Snuff';
  const hit = intentHits(s, intent);
  const victims = hit.victimIds.map((id) => s.pieces[id]).filter((p): p is Piece => p !== undefined && !p.smoldering);
  const what =
    victims.length > 0
      ? victims.map((v) => squarePieceText(reg, v)).join(', ')
      : hit.tiles.length > 0
        ? sortPositions(hit.tiles).map(sqName).join(' ')
        : 'nothing';
  return { name, text: `${name} → ${verbFor(intent)} ${what} for ${intent.damage}${dreadNote(s, victims, intent.damage)}` };
}

export function intentViews(s: GameState, reg: ContentRegistry): IntentView[] {
  return s.intents.map((intent) => {
    const { name, text } = intentText(s, reg, intent);
    return { queue: intent.queue, intentId: intent.id, attackerId: intent.attackerId, attackerName: name, text, tiles: intentHits(s, intent).tiles, damage: intent.damage };
  });
}

/**
 * Incoming damage per tile from the locked intents (current geometry). Line intents count every
 * traced tile up to the first blocker: a piece stepping onto the line becomes the one hit.
 */
export function dangerTiles(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const intent of s.intents) {
    for (const t of intentHits(s, intent).tiles) {
      if (!inBounds(t, s.board.w, s.board.h)) continue;
      out[posKey(t)] = (out[posKey(t)] ?? 0) + intent.damage;
    }
  }
  return out;
}
