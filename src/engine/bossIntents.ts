/**
 * Boss intents (GDD §10.5, §6.8): candidate aims, the targeting rule of each intent, planning a
 * phase's intents (a repeated intent picks different targets when possible), resolution
 * (Silencing Peal, pushes, Hot Wax, devour_light) and the intent-queue text.
 *
 * Boss intents are ordinary `Intent`s with `bossIntentId` set, stored relative to the boss anchor
 * like every aimed intent: `snuff.intentHits` recomputes their tiles, so previews, the danger map
 * and the queue include them, and Turnabout reverses them (artillery mirrors through the boss,
 * sides and beams flip; centred and global intents cannot be reversed).
 */
import { applyBurn, applyDaze, dealDamage, pushPiece } from './combat';
import { baseEnv, runEffects } from './effects';
import { DIRS_ORTH, addPos, artilleryTiles, compareReadingOrder, footprintDistance, posKey, pushDirection, sortPositions, sqName, subPos } from './geometry';
import type { BoardQuery } from './geometry';
import { addLog, pieceName, squarePieceText } from './log';
import { aimHits, dreadNote, effectiveAim, intentHits, putOutShrine, snuffCredit } from './snuff';
import type { AimGeom, AimHit } from './snuff';
import { boardQuery, emit, isOver, isWickfolk, newId, ruleDelta, ruleValue, tileAt } from './state';
import type { Ctx } from './state';
import { createTiles } from './tileOps';
import type { BossIntentDef, BossTargetingRule, ContentRegistry, Dir, EffectOp, GameState, Intent, Piece, Pos } from './types';

// =============================================================================================
// Aims
// =============================================================================================

/** Pieces and lights an aim covers. Smoldering Wicks and bosses are never targets. */
interface AimCounts {
  heroes: number;
  /** Heroes and units (Vigil Candles are not Wickfolk pieces). */
  wickfolk: number;
  candles: number;
  lanterns: number;
  litShrines: number;
}

interface ScoredAim {
  geom: AimGeom;
  hit: AimHit;
  /** Identity of the aim (a repeated intent prefers another one). */
  key: string;
  /** What this aim targets: victim ids and lit-Shrine keys. */
  targets: string[];
  /** Counts over every target, and over the targets earlier copies of the intent did not take. */
  all: AimCounts;
  fresh: AimCounts;
  /** Single-tile aims: distance from the boss footprint ("nearest" tie-break). */
  distance: number;
  /** Reading-order tie-breaks: the area's first tile, then the aimed tile. */
  first: Pos;
  aimed: Pos;
}

export interface BossAimChoice {
  geom: AimGeom;
  hit: AimHit;
  /** The aim hits at least one target of its rule ("most intents hit their targets", §12.4). */
  hits: boolean;
  key: string;
  targets: string[];
  /** The main piece aimed at (intent text, `Intent.targetId`). */
  targetId: string | null;
}

export interface PlannedIntent {
  def: BossIntentDef;
  /** null for a global intent (Silencing Peal). */
  choice: BossAimChoice | null;
}

function shrineKey(p: Pos): string {
  return `shrine:${posKey(p)}`;
}

function isLitShrine(s: GameState, p: Pos): boolean {
  const tile = tileAt(s, p);
  return tile?.type === 'votive_shrine' && tile.shrineLit;
}

/** Beam length for `beam2` intents (Sceptre Sweep 4, Wing Gust 3); null otherwise. */
function aimRange(def: BossIntentDef): number | null {
  return def.reach.kind === 'beam' ? def.reach.length : null;
}

/** A 2×2 bell must land whole on the board; other areas may hang over the edge (that part fizzles). */
function areaFits(def: BossIntentDef, anchor: Pos, q: BoardQuery): boolean {
  return def.area !== 'block2x2' || (anchor.x + 1 < q.w && anchor.y + 1 < q.h);
}

/** Every aim a boss intent can take from anchor `at` (§10.5 "Reach"). */
function candidateAims(q: BoardQuery, def: BossIntentDef, at: Pos, size: number): AimGeom[] {
  const shape = def.area;
  if (shape === 'global') return [];
  switch (def.reach.kind) {
    case 'around':
      return [{ kind: 'area', shape, dir: null, offset: { x: 0, y: 0 } }];
    case 'side':
    case 'beam':
      return DIRS_ORTH.map((dir) => ({ kind: 'area', shape, dir, offset: null }));
    case 'within':
      return artilleryTiles(q, at, size, def.reach.min, def.reach.max)
        .filter((anchor) => areaFits(def, anchor, q))
        .map((anchor) => ({ kind: 'artillery', shape, dir: null, offset: subPos(anchor, at) }));
    case 'global':
      return [];
  }
}

function countAim(s: GameState, hit: AimHit, exclude: ReadonlySet<string>): AimCounts {
  const counts: AimCounts = { heroes: 0, wickfolk: 0, candles: 0, lanterns: 0, litShrines: 0 };
  for (const id of hit.victimIds) {
    const p = s.pieces[id];
    if (!p || p.smoldering || exclude.has(id)) continue;
    if (p.kind === 'candle') counts.candles += 1;
    if (!isWickfolk(p)) continue;
    counts.wickfolk += 1;
    if (p.kind === 'hero') counts.heroes += 1;
    if (p.defId === 'lantern') counts.lanterns += 1;
  }
  for (const t of hit.tiles) if (isLitShrine(s, t) && !exclude.has(shrineKey(t))) counts.litShrines += 1;
  return counts;
}

function targetsOf(s: GameState, hit: AimHit): string[] {
  const victims = hit.victimIds.filter((id) => {
    const p = s.pieces[id];
    return p !== undefined && !p.smoldering && p.side === 'wick';
  });
  return [...victims, ...hit.tiles.filter((t) => isLitShrine(s, t)).map(shrineKey)];
}

function aimKey(g: AimGeom): string {
  return `${g.kind}:${g.dir ? posKey(g.dir) : '-'}:${g.offset ? posKey(g.offset) : '-'}`;
}

function scoreAim(s: GameState, q: BoardQuery, def: BossIntentDef, at: Pos, size: number, geom: AimGeom, taken: ReadonlySet<string>): ScoredAim {
  const hit = aimHits(s, q, at, size, { geom, range: aimRange(def), firstHit: false });
  const aimed = geom.offset ? addPos(at, geom.offset) : at;
  return {
    geom,
    hit,
    key: aimKey(geom),
    targets: targetsOf(s, hit),
    all: countAim(s, hit, new Set()),
    fresh: countAim(s, hit, taken),
    distance: geom.kind === 'artillery' && geom.shape === 'single' ? footprintDistance(at, size, aimed, 1) : 0,
    first: sortPositions(hit.tiles)[0] ?? aimed,
    aimed,
  };
}

// =============================================================================================
// Targeting rules (§10.5 "Targeting")
// =============================================================================================

/** Higher is better, compared left to right; reading order breaks the remaining ties. */
function targetingValue(rule: BossTargetingRule, c: AimCounts, distance: number): number[] {
  switch (rule) {
    case 'block_most_heroes':
    case 'side_most_heroes':
      return [c.heroes, c.wickfolk, c.candles];
    case 'dir_most_wickfolk':
    case 'square_most_wickfolk':
      return [c.wickfolk, c.heroes, c.candles];
    case 'hero_else_wickfolk':
      return [c.heroes, c.wickfolk, c.candles, -distance];
    case 'brightest_light':
      return [c.litShrines, c.lanterns, c.candles, c.heroes, c.wickfolk, -distance];
    case 'fixed':
    case 'none':
      return [c.wickfolk + c.candles];
  }
}

function hitsTarget(rule: BossTargetingRule, c: AimCounts): boolean {
  const pieces = c.wickfolk + c.candles;
  return rule === 'brightest_light' ? pieces + c.litShrines > 0 : pieces > 0;
}

function compareValues(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The main piece aimed at: Hunger bites lights first, every other rule heroes first. */
function mainTarget(s: GameState, rule: BossTargetingRule, hit: AimHit): string | null {
  const victims = hit.victimIds
    .map((id) => s.pieces[id])
    .filter((p): p is Piece => p !== undefined && !p.smoldering && p.side === 'wick')
    .sort((a, b) => compareReadingOrder(a.pos, b.pos));
  const rank = (p: Piece): number => {
    if (rule === 'brightest_light') return p.defId === 'lantern' ? 0 : p.kind === 'candle' ? 1 : p.kind === 'hero' ? 2 : 3;
    return p.kind === 'hero' ? 0 : p.kind === 'candle' ? 2 : 1;
  };
  return victims.sort((a, b) => rank(a) - rank(b))[0]?.id ?? null;
}

/**
 * The best aim under the intent's rule. A repeated intent counts only targets the earlier copies
 * did not take; when no aim reaches a new target it may take an old one again.
 */
function chooseAim(s: GameState, def: BossIntentDef, scored: ScoredAim[], takenKeys: ReadonlySet<string>): BossAimChoice | null {
  const rule = def.targeting;
  const fresh = scored.filter((a) => hitsTarget(rule, a.fresh));
  const pool = fresh.length > 0 ? fresh : scored;
  const counts = (a: ScoredAim) => (fresh.length > 0 ? a.fresh : a.all);
  const best = pool
    .slice()
    .sort(
      (a, b) =>
        compareValues(targetingValue(rule, counts(a), a.distance), targetingValue(rule, counts(b), b.distance)) ||
        Number(takenKeys.has(a.key)) - Number(takenKeys.has(b.key)) ||
        compareReadingOrder(a.first, b.first) ||
        compareReadingOrder(a.aimed, b.aimed),
    )[0];
  if (!best) return null;
  return { geom: best.geom, hit: best.hit, hits: hitsTarget(rule, best.all), key: best.key, targets: best.targets, targetId: mainTarget(s, rule, best.hit) };
}

/**
 * Plan a phase's intents as if the boss stood on `at` (pure): in listed order, each takes its
 * best aim; a repeated intent prefers targets its earlier copies did not take (§10.1).
 */
export function planBossIntents(s: GameState, reg: ContentRegistry, boss: Piece, at: Pos, intentIds: readonly string[]): PlannedIntent[] {
  const q = boardQuery(s, { ignoreIds: [boss.id] });
  const taken = new Map<string, { keys: Set<string>; targets: Set<string> }>();
  const plan: PlannedIntent[] = [];
  for (const id of intentIds) {
    const def = reg.bossIntents.byId[id];
    if (!def) continue;
    if (def.area === 'global') {
      plan.push({ def, choice: null });
      continue;
    }
    const used = taken.get(id) ?? { keys: new Set<string>(), targets: new Set<string>() };
    taken.set(id, used);
    const scored = candidateAims(q, def, at, boss.size).map((geom) => scoreAim(s, q, def, at, boss.size, geom, used.targets));
    const choice = chooseAim(s, def, scored, used.keys);
    if (!choice) continue;
    used.keys.add(choice.key);
    for (const t of choice.targets) used.targets.add(t);
    plan.push({ def, choice });
  }
  return plan;
}

/** How many planned intents hit their targets (a global intent always counts). */
export function plannedHits(plan: readonly PlannedIntent[]): number {
  return plan.filter((p) => p.choice === null || p.choice.hits).length;
}

// =============================================================================================
// Declaration
// =============================================================================================

/** Listed damage plus Eclipse; a 0-damage intent (Silencing Peal) stays 0. */
function bossIntentDamage(s: GameState, def: BossIntentDef): number {
  return def.damage > 0 ? Math.max(0, def.damage + ruleDelta(s, 'snuff_damage', null)) : 0;
}

/** A locked boss intent from a planned aim (no aim: the global intent). */
export function bossIntentFrom(s: GameState, boss: Piece, def: BossIntentDef, choice: BossAimChoice | null): Intent {
  return {
    id: newId(s, 'i'),
    attackerId: boss.id,
    bossIntentId: def.id,
    kind: choice ? choice.geom.kind : 'global',
    shape: choice ? choice.geom.shape : 'global',
    dir: choice?.geom.dir ?? null,
    offset: choice?.geom.offset ?? null,
    range: aimRange(def),
    minRange: def.reach.kind === 'within' ? def.reach.min : 0,
    damage: bossIntentDamage(s, def),
    push: def.push,
    pushMode: def.push > 0 ? (def.pushMode ?? 'away') : null,
    pull: 0,
    status: def.status,
    firstHit: false,
    pierce: def.pierce,
    centered: def.centered || !def.reversible,
    reversed: false,
    reversedBy: null,
    queue: 0,
    tiles: choice ? choice.hit.tiles : [],
    targetId: choice?.targetId ?? null,
    global: def.global,
    createsTile: def.createsTile,
    extra: def.extra,
  };
}

// =============================================================================================
// Resolution (§6.8)
// =============================================================================================

function bossEnv(boss: Piece, defId: string) {
  return baseEnv({
    seat: null,
    self: boss,
    attackerId: boss.id,
    cause: 'intent',
    damageKind: 'snuff_attack',
    ruleSource: { kind: 'boss', id: defId },
    defaultDuration: 'next_players_phase',
    summonSource: 'boss',
  });
}

function isDevourLight(op: EffectOp | null): boolean {
  return op?.op === 'custom' && op.id === 'devour_light';
}

/** Hunger: the intent carries `devour_light` (Nocturna's abdomen glows while one is locked). */
export function isDevourIntent(intent: Intent): boolean {
  return isDevourLight(intent.extra);
}

/** Silencing Peal: its global effect (a card limit for the next players phase). */
function resolveGlobal(ctx: Ctx, intent: Intent, boss: Piece, def: BossIntentDef | undefined): void {
  emit(ctx, { type: 'strike', attackerId: boss.id, kind: 'boss', from: { ...boss.pos }, tiles: [], intentId: intent.id });
  if (intent.global) runEffects(ctx, [intent.global], bossEnv(boss, intent.bossIntentId ?? 'boss'));
  addLog(ctx, `${pieceName(ctx.reg, boss)} sounds ${def?.name ?? 'its peal'}: ${globalText(intent, def)}.`);
}

/** Pushes "along" the gust start with the farthest piece, so the near ones are not blocked by it. */
function pushOrder(victims: Piece[], along: Dir | null): Piece[] {
  if (!along) return victims;
  const reach = (p: Piece) => p.pos.x * along.x + p.pos.y * along.y;
  return victims.slice().sort((a, b) => reach(b) - reach(a) || compareReadingOrder(a.pos, b.pos));
}

function applyStatuses(ctx: Ctx, intent: Intent, survivors: Piece[]): void {
  const extra = ruleValue(ctx.s, 'snuff_attack_status', null);
  for (const victim of survivors) {
    if (isOver(ctx.s)) return;
    if (intent.status === 'dazed') applyDaze(ctx, victim);
    if (intent.status === 'burn' || extra === 'burn') applyBurn(ctx, victim);
  }
}

function applyPushes(ctx: Ctx, intent: Intent, boss: Piece, survivors: Piece[]): void {
  if (intent.push <= 0) return;
  const aim = effectiveAim(intent, boss.size);
  const along = intent.pushMode === 'along' ? aim.dir : null;
  for (const victim of pushOrder(survivors, along)) {
    if (isOver(ctx.s) || ctx.s.pieces[victim.id] !== victim) continue;
    const dir = along ?? pushDirection(boss.pos, boss.size, victim.pos);
    pushPiece(ctx, victim, dir, intent.push, { displacer: null, credit: snuffCredit(victim, boss, intent), sourceId: boss.id });
  }
}

/**
 * Resolve one boss intent: lights on its tiles go out, every piece there is hit (Snuff included,
 * never a boss), then statuses, pushes, Hot Wax and its extra rule. `devour_light` heals the boss
 * only if the bite put out a Lit Shrine, snuffed a Candle, destroyed a Lantern or felled a piece.
 */
export function resolveBossIntent(ctx: Ctx, intent: Intent, boss: Piece): void {
  const { s, reg } = ctx;
  const def = intent.bossIntentId ? reg.bossIntents.byId[intent.bossIntentId] : undefined;
  if (intent.kind === 'global') {
    resolveGlobal(ctx, intent, boss, def);
    emit(ctx, { type: 'intent_resolved', intentId: intent.id, tiles: [] });
    return;
  }
  const hit = intentHits(s, intent);
  const label = `${pieceName(reg, boss)}'s ${def?.name ?? 'attack'}`;
  emit(ctx, { type: 'strike', attackerId: boss.id, kind: 'boss', from: { ...boss.pos }, tiles: hit.tiles, intentId: intent.id });
  let devoured = hit.tiles.some((t) => isLitShrine(s, t));
  for (const t of hit.tiles) putOutShrine(ctx, t);
  const victims = hit.victimIds
    .map((id) => s.pieces[id])
    .filter((p): p is Piece => p !== undefined)
    .sort((a, b) => compareReadingOrder(a.pos, b.pos));
  if (victims.length === 0) addLog(ctx, `${label} hits empty stone.`);
  for (const victim of victims) {
    if (isOver(s)) return;
    if (!victim.smoldering) addLog(ctx, `${label} hits ${squarePieceText(reg, victim)} for ${intent.damage}.`);
    const outcome = dealDamage(ctx, victim, intent.damage, { cause: 'intent', sourceKind: 'snuff_attack', sourceId: boss.id, seat: snuffCredit(victim, boss, intent) });
    if (outcome.killed) devoured = true;
  }
  if (isOver(s)) return;
  const survivors = victims.filter((v) => s.pieces[v.id] === v && !v.smoldering);
  applyStatuses(ctx, intent, survivors);
  applyPushes(ctx, intent, boss, survivors);
  if (isOver(s)) return;
  if (intent.createsTile) createTiles(ctx, hit.tiles, intent.createsTile, false);
  const extra = intent.extra;
  if (extra && s.pieces[boss.id] === boss && (!isDevourLight(extra) || devoured)) runEffects(ctx, [extra], bossEnv(boss, def?.id ?? 'boss'));
  emit(ctx, { type: 'intent_resolved', intentId: intent.id, tiles: hit.tiles });
}

// =============================================================================================
// Queue text (§15.4)
// =============================================================================================

const DIR_WORDS: Record<string, string> = { '0,1': 'north', '1,0': 'east', '0,-1': 'south', '-1,0': 'west' };

/** "d3-e4": the corners of the tiles' bounding box (one tile: its name). */
function spanText(tiles: readonly Pos[]): string {
  if (tiles.length === 0) return 'off the board';
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  const lo = { x: Math.min(...xs), y: Math.min(...ys) };
  const hi = { x: Math.max(...xs), y: Math.max(...ys) };
  return lo.x === hi.x && lo.y === hi.y ? sqName(lo) : `${sqName(lo)}-${sqName(hi)}`;
}

function whereText(intent: Intent, aim: AimGeom, tiles: readonly Pos[]): string {
  if (intent.shape === 'ring12' || intent.shape === 'ring8') return 'around it';
  const span = tiles.length > 0 ? spanText(tiles) : 'off the board';
  if (intent.shape === 'beam2' && aim.dir) return `${DIR_WORDS[posKey(aim.dir)] ?? ''} on ${span}`.trim();
  return tiles.length > 0 ? `on ${span}` : span;
}

function extrasText(intent: Intent): string {
  const parts: string[] = [];
  if (intent.push > 0) parts.push(intent.pushMode === 'outward' ? `push ${intent.push} outward` : `push ${intent.push}`);
  if (intent.status === 'dazed') parts.push('Dazes');
  if (intent.createsTile === 'hot_wax') parts.push('leaves Hot Wax');
  if (isDevourLight(intent.extra) && intent.extra?.op === 'custom') {
    const heal = intent.extra.args.heal;
    parts.push(`heals ${typeof heal === 'number' ? heal : 3} if it puts out a light or fells a piece`);
  }
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

function globalText(intent: Intent, def: BossIntentDef | undefined): string {
  const g = intent.global;
  if (g?.op === 'modify_rule' && g.rule === 'card_limit' && typeof g.value === 'number') {
    return `each seat may play at most ${g.value} card${g.value === 1 ? '' : 's'} next turn`;
  }
  return def?.text ?? 'a dark peal';
}

/** "Hush Hierophant → Bell Drop on d3-e4 for 3: d3 Brannoc (Dread +1)". */
export function bossIntentText(s: GameState, reg: ContentRegistry, intent: Intent): { name: string; text: string } {
  const boss = s.pieces[intent.attackerId];
  const name = boss ? pieceName(reg, boss) : 'The boss';
  const def = intent.bossIntentId ? reg.bossIntents.byId[intent.bossIntentId] : undefined;
  const label = def?.name ?? 'Boss attack';
  if (intent.kind === 'global') return { name, text: `${name} → ${label}: ${globalText(intent, def)}` };
  const hit = intentHits(s, intent);
  const aim = effectiveAim(intent, boss?.size ?? 2);
  const victims = hit.victimIds.map((id) => s.pieces[id]).filter((p): p is Piece => p !== undefined && !p.smoldering);
  const hits = victims.length > 0 ? `: ${victims.map((v) => squarePieceText(reg, v)).join(', ')}` : '';
  const extras = extrasText(intent);
  return { name, text: `${name} → ${label} ${whereText(intent, aim, hit.tiles)} for ${intent.damage}${extras}${hits}${dreadNote(s, victims, intent.damage)}` };
}
