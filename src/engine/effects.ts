/**
 * Effect-op interpreter (GDD A.2). Cards, Powers, traits, Charms, Tolls, Moth Die faces and
 * boss phases all express their behaviour as `EffectOp` lists; this module runs them.
 *
 * E1b implements the ops the core loop and the starter content need. `runOp` returns false for
 * an op without a handler, and `effectsSupported` lets card validation refuse such cards until
 * a later module (E2) adds the handler here.
 */
import {
  applyBurn,
  applyDaze,
  dealDamage,
  giveWard,
  halfMaxHp,
  healPiece,
  pullPiece,
  pushPiece,
  relightHero,
} from './combat';
import { drawCards } from './decks';
import { areaTiles, chebyshev, clipToBoard, footprint, pushDirection, sortReadingOrder, sqName } from './geometry';
import { addLog, pieceName } from './log';
import { streamPick } from './rng';
import { placePlumes, popPlume, reverseIntent } from './snuff';
import { createUnit, enemyHp, placeNear, spawnEnemy, summonTileTest, unitLimitReached } from './spawn';
import type { SummonSource } from './spawn';
import {
  addRule,
  allTiles,
  emit,
  getPiece,
  heroOf,
  heroPieces,
  isAllyOfSeat,
  isEnemyOfSeat,
  isOver,
  pieceAt,
  pieceList,
  plumeAt,
  setTileType,
  tileAt,
} from './state';
import type { Ctx } from './state';
import type {
  ContentRegistry,
  DamageCause,
  DamageSourceKind,
  Duration,
  EffectCentre,
  EffectOfOp,
  EffectOp,
  EffectOpName,
  Piece,
  PieceFilter,
  PlumeSource,
  Pos,
  RankId,
  RuleSource,
  TileWhere,
  TriggerId,
} from './types';

export interface EffectTarget {
  pieceId: string | null;
  pos: Pos;
}

export interface EffectEnv {
  /** Acting seat: kill credit, side relations, flame/draw. Null for Snuff and global sources. */
  seat: number | null;
  /** The piece owning the trait, Charm or intent (`self`). */
  self: Piece | null;
  /** The damage source (`attacker`, riposte). */
  attackerId: string | null;
  /** Chosen targets: index 0 = `target`, 1 = `target2`. */
  targets: EffectTarget[];
  cause: DamageCause;
  damageKind: DamageSourceKind;
  ruleSource: RuleSource;
  defaultDuration: Duration;
  plumeSource: PlumeSource;
  summonSource: SummonSource;
}

export function baseEnv(partial: Partial<EffectEnv> & Pick<EffectEnv, 'ruleSource'>): EffectEnv {
  return {
    seat: null,
    self: null,
    attackerId: null,
    targets: [],
    cause: 'card',
    damageKind: 'card',
    defaultDuration: 'turn',
    plumeSource: 'card',
    summonSource: 'card',
    ...partial,
  };
}

/** Ops with a handler below. Keep in sync with `runOp`. */
export const SUPPORTED_OPS: ReadonlySet<EffectOpName> = new Set<EffectOpName>([
  'damage',
  'heal',
  'ward',
  'burn',
  'daze',
  'push',
  'pull',
  'summon',
  'transform',
  'extra_move',
  'extra_strike',
  'gain_flame',
  'draw',
  'create_tile',
  'reverse_intent',
  'modify_rule',
  'relight',
  'place_plume',
  'remove_plume',
]);

export function effectsSupported(effects: readonly EffectOp[]): boolean {
  return effects.every((op) => SUPPORTED_OPS.has(op.op));
}

// =============================================================================================
// Running
// =============================================================================================

export function runEffects(ctx: Ctx, effects: readonly EffectOp[], env: EffectEnv): void {
  for (const op of effects) {
    if (isOver(ctx.s)) return;
    if (op.mode && op.mode !== ctx.s.config.mode) continue;
    runOp(ctx, op, env);
  }
}

/** Run only the effects whose `trigger` matches. */
export function runTriggered(ctx: Ctx, effects: readonly EffectOp[], trigger: TriggerId, env: EffectEnv): void {
  runEffects(
    ctx,
    effects.filter((op) => op.trigger === trigger),
    env,
  );
}

/** Dispatch one op. Returns false when E1b has no handler for it (the op is skipped). */
export function runOp(ctx: Ctx, op: EffectOp, env: EffectEnv): boolean {
  switch (op.op) {
    case 'damage':
      opDamage(ctx, op, env);
      return true;
    case 'heal':
      for (const p of subjects(ctx, op, env)) healPiece(ctx, p, healAmount(p, op.amount));
      return true;
    case 'ward':
      for (const p of subjects(ctx, op, env)) giveWard(ctx, p);
      return true;
    case 'burn':
      for (const p of subjects(ctx, op, env)) applyBurn(ctx, p);
      return true;
    case 'daze':
      for (const p of subjects(ctx, op, env)) applyDaze(ctx, p);
      return true;
    case 'push':
      opPush(ctx, op, env);
      return true;
    case 'pull':
      opPull(ctx, op, env);
      return true;
    case 'summon':
      opSummon(ctx, op, env);
      return true;
    case 'transform':
      for (const p of subjects(ctx, op, env)) transformPiece(ctx, p, op, env);
      return true;
    case 'extra_move':
    case 'extra_strike':
      opExtraActions(ctx, op, env);
      return true;
    case 'gain_flame':
      opGainFlame(ctx, op.amount, env);
      return true;
    case 'draw':
      if (env.seat !== null) drawCards(ctx, env.seat, op.amount);
      return true;
    case 'create_tile':
      opCreateTile(ctx, op, env);
      return true;
    case 'reverse_intent':
      for (const p of subjects(ctx, op, env)) reverseIntent(ctx, p, env.seat);
      return true;
    case 'modify_rule':
      addRule(ctx.s, {
        rule: op.rule,
        delta: op.delta ?? 0,
        value: op.value ?? null,
        seat: env.seat,
        source: env.ruleSource,
        expires: op.duration ?? env.defaultDuration,
      });
      return true;
    case 'relight':
      for (const p of subjects(ctx, op, env, { includeSmoldering: true })) {
        if (p.smoldering) relightHero(ctx, p, healAmount(p, op.hp), 'card', true);
      }
      return true;
    case 'place_plume':
      opPlacePlume(ctx, op, env);
      return true;
    case 'remove_plume':
      opRemovePlume(ctx, op, env);
      return true;
    default:
      return false;
  }
}

// =============================================================================================
// Subjects
// =============================================================================================

/** A piece's rank (A.1): Snuff ranks for enemies, hero / unit / structure for Wickfolk, boss. */
export function pieceRank(reg: ContentRegistry, p: Piece): RankId {
  if (p.kind === 'hero') return 'hero';
  if (p.kind === 'boss') return 'boss';
  if (p.kind === 'candle') return 'structure';
  if (p.kind === 'unit') return reg.units.byId[p.defId]?.rank ?? 'unit';
  return reg.enemies.byId[p.defId]?.rank ?? 'minion';
}

/** Piece filters are relative to the acting seat (GDD A.2). Candles only when asked for. */
export function matchesFilter(ctx: Ctx, seat: number | null, p: Piece, filter: PieceFilter | undefined): boolean {
  const f = filter ?? {};
  const wantsCandles = f.includeCandles === true || (f.kinds?.includes('candle') ?? false);
  if (p.kind === 'candle' && !wantsCandles) return false;
  if (f.side === 'enemy' && !isEnemyOfSeat(ctx.s, seat, p)) return false;
  if (f.side === 'ally' && !isAllyOfSeat(ctx.s, seat, p, wantsCandles)) return false;
  if (f.side === 'own' && (seat === null || p.owner !== seat)) return false;
  if (f.faction === 'wickfolk' && (p.side !== 'wick' || p.kind === 'candle')) return false;
  if (f.faction === 'snuff' && p.side !== 'snuff') return false;
  if (f.kinds && !f.kinds.includes(p.kind)) return false;
  if (f.units && !f.units.includes(p.defId)) return false;
  if (f.ranks && !f.ranks.includes(pieceRank(ctx.reg, p))) return false;
  return true;
}

function targetPiece(ctx: Ctx, env: EffectEnv, index: number): Piece | null {
  const t = env.targets[index];
  if (!t) return null;
  return t.pieceId ? getPiece(ctx.s, t.pieceId) : pieceAt(ctx.s, t.pos);
}

function centreOf(ctx: Ctx, env: EffectEnv, at: EffectCentre | undefined): { pos: Pos; size: number } | null {
  switch (at ?? 'target') {
    case 'target':
    case 'target2': {
      const index = at === 'target2' ? 1 : 0;
      const piece = targetPiece(ctx, env, index);
      if (piece) return { pos: piece.pos, size: piece.size };
      const t = env.targets[index];
      return t ? { pos: t.pos, size: 1 } : null;
    }
    case 'hero': {
      const hero = env.seat !== null ? heroOf(ctx.s, env.seat) : null;
      return hero ? { pos: hero.pos, size: hero.size } : null;
    }
    case 'self':
      return env.self ? { pos: env.self.pos, size: env.self.size } : null;
  }
}

/** Tiles an `area` op covers, clipped to the board. */
function opAreaTiles(ctx: Ctx, op: EffectOp, env: EffectEnv): Pos[] {
  const centre = centreOf(ctx, env, op.at);
  if (!centre || !op.area) return [];
  return clipToBoard(areaTiles(op.area, centre.pos, { size: centre.size }), ctx.s.board.w, ctx.s.board.h);
}

/**
 * Who an op applies to (`to`, default `target`), in reading order. Smoldering Wicks are left out
 * unless asked for (only `relight` wants them).
 */
export function subjects(ctx: Ctx, op: EffectOp, env: EffectEnv, opts: { includeSmoldering?: boolean } = {}): Piece[] {
  const { s } = ctx;
  let list: Piece[] = [];
  switch (op.to ?? 'target') {
    case 'target':
    case 'target2': {
      const piece = targetPiece(ctx, env, op.to === 'target2' ? 1 : 0);
      list = piece ? [piece] : [];
      break;
    }
    case 'hero':
      list = env.seat !== null ? [heroOf(s, env.seat)].filter((p): p is Piece => p !== null) : heroPieces(s);
      break;
    case 'self':
      list = env.self && s.pieces[env.self.id] === env.self ? [env.self] : [];
      break;
    case 'attacker': {
      const attacker = getPiece(s, env.attackerId);
      list = attacker ? [attacker] : [];
      break;
    }
    case 'all':
      list = pieceList(s).filter((p) => matchesFilter(ctx, env.seat, p, op.filter));
      break;
    case 'area': {
      const keys = new Set(opAreaTiles(ctx, op, env).map((t) => `${t.x},${t.y}`));
      list = pieceList(s).filter(
        (p) => footprint(p.pos, p.size).some((t) => keys.has(`${t.x},${t.y}`)) && matchesFilter(ctx, env.seat, p, op.filter),
      );
      break;
    }
  }
  const alive = list.filter((p) => s.pieces[p.id] === p && (opts.includeSmoldering || !p.smoldering));
  return sortReadingOrder(alive, (p) => p.pos);
}

function healAmount(p: Piece, amount: number | 'half' | 'full'): number {
  if (amount === 'half') return halfMaxHp(p);
  if (amount === 'full') return p.maxHp;
  return amount;
}

// =============================================================================================
// Op handlers
// =============================================================================================

/** Player damage pops the Plumes on the tiles it covers (§9.4). */
function popCoveredPlumes(ctx: Ctx, op: EffectOfOp<'damage'>, env: EffectEnv): void {
  if (env.seat === null) return;
  const to = op.to ?? 'target';
  let tiles: Pos[] = [];
  if (to === 'area') tiles = opAreaTiles(ctx, op, env);
  else if (to === 'target' || to === 'target2') {
    const t = env.targets[to === 'target2' ? 1 : 0];
    if (t && !pieceAt(ctx.s, t.pos)) tiles = [t.pos];
  }
  for (const tile of tiles) {
    const plume = plumeAt(ctx.s, tile);
    if (plume) popPlume(ctx, plume, env.seat);
  }
}

function opDamage(ctx: Ctx, op: EffectOfOp<'damage'>, env: EffectEnv): void {
  const amount = op.amount === 'atk' ? (env.self?.atk ?? 0) : op.amount;
  const times = op.times ?? 1;
  const victims = subjects(ctx, op, env);
  popCoveredPlumes(ctx, op, env);
  for (const victim of victims) {
    for (let i = 0; i < times && ctx.s.pieces[victim.id] === victim && !isOver(ctx.s); i++) {
      dealDamage(ctx, victim, amount, {
        cause: env.cause,
        sourceKind: env.damageKind,
        sourceId: env.self?.id ?? null,
        seat: env.seat,
        ignoreWard: op.ignoreWard,
      });
    }
  }
}

function survived(ctx: Ctx, p: Piece): boolean {
  return ctx.s.pieces[p.id] === p && !p.smoldering;
}

function opPush(ctx: Ctx, op: EffectOfOp<'push'>, env: EffectEnv): void {
  const centre = centreOf(ctx, env, op.from);
  if (!centre) return;
  for (const p of subjects(ctx, op, env)) {
    if (op.ifSurvives && !survived(ctx, p)) continue;
    pushPiece(ctx, p, pushDirection(centre.pos, centre.size, p.pos), op.distance, {
      displacer: env.seat,
      credit: env.seat,
      sourceId: env.self?.id ?? null,
    });
  }
}

function opPull(ctx: Ctx, op: EffectOfOp<'pull'>, env: EffectEnv): void {
  const centre = centreOf(ctx, env, op.toward);
  if (!centre) return;
  const anchor = pieceAt(ctx.s, centre.pos);
  for (const p of subjects(ctx, op, env)) {
    if (op.ifSurvives && !survived(ctx, p)) continue;
    const source = anchor ?? p;
    if (source === p) continue;
    pullPiece(ctx, p, source, op.distance, { displacer: env.seat, credit: env.seat, sourceId: env.self?.id ?? null });
  }
}

function summonCount(ctx: Ctx, count: EffectOfOp<'summon'>['count']): number {
  if (count === undefined) return 1;
  if (typeof count === 'number') return count;
  const players = ctx.s.players.length;
  return count.byPlayers[Math.min(players, count.byPlayers.length) - 1] ?? 1;
}

function summonAnchor(ctx: Ctx, op: EffectOfOp<'summon'>, env: EffectEnv, seat: number | null): Pos | null {
  if (!op.near) return null;
  switch (op.near.anchor) {
    case 'hero': {
      const hero = seat !== null ? heroOf(ctx.s, seat) : null;
      return hero ? hero.pos : null;
    }
    case 'self':
      return env.self?.pos ?? null;
    case 'target':
      return env.targets[0]?.pos ?? null;
    case 'board_centre':
      return { x: Math.floor((ctx.s.board.w - 1) / 2), y: Math.floor((ctx.s.board.h - 1) / 2) };
  }
}

function summonOne(ctx: Ctx, op: EffectOfOp<'summon'>, env: EffectEnv, seat: number | null, unitId: string): boolean {
  const { s, reg } = ctx;
  const forPlayer = (op.owner ?? (seat !== null ? 'player' : 'snuff')) === 'player';
  if (forPlayer && (seat === null || unitLimitReached(s, seat))) {
    addLog(ctx, `The summon fizzles: unit limit ${s.config.unit_limit}.`, seat ?? undefined);
    return false;
  }
  const legal = summonTileTest(s);
  let pos: Pos | null;
  if (op.near) {
    const anchor = summonAnchor(ctx, op, env, seat);
    pos = anchor ? placeNear(s, anchor, op.near.max ?? reg.rules.placementMaxDistance, legal) : null;
  } else {
    const target = env.targets[0]?.pos ?? null;
    pos = target && legal(target) ? target : null;
  }
  if (!pos) {
    addLog(ctx, 'The summon fizzles: no free tile.', seat ?? undefined);
    return false;
  }
  if (forPlayer && seat !== null) {
    createUnit(ctx, unitId, seat, pos, env.summonSource);
    s.players[seat].stats.summons += 1;
  } else {
    spawnEnemy(ctx, unitId, pos, env.summonSource);
  }
  return true;
}

function opSummon(ctx: Ctx, op: EffectOfOp<'summon'>, env: EffectEnv): void {
  const unitId = op.modeOverrides?.[ctx.s.config.mode]?.unit ?? op.unit;
  const count = summonCount(ctx, op.count);
  const forEveryHero = env.seat === null && op.near?.anchor === 'hero' && (op.owner ?? 'player') === 'player';
  const seats: Array<number | null> = forEveryHero ? heroPieces(ctx.s).filter((h) => !h.smoldering).map((h) => h.owner) : [env.seat];
  for (const seat of seats) {
    for (let i = 0; i < count && !isOver(ctx.s); i++) if (!summonOne(ctx, op, env, seat, unitId)) break;
  }
}

/** Promotion (owner `same`) and Moonlit Hex (owner `player`): the piece keeps its id and tile. */
export function transformPiece(ctx: Ctx, p: Piece, op: EffectOfOp<'transform'>, env: EffectEnv): void {
  const { s, reg } = ctx;
  const toPlayer = op.owner === 'player' && env.seat !== null;
  const unit = reg.units.byId[op.into];
  const enemy = reg.enemies.byId[op.into];
  const def = unit ?? enemy;
  if (!def) return;
  const fromDefId = p.defId;
  const fromName = pieceName(reg, p);
  const charm = p.charm ? reg.cards.byId[p.charm.id]?.charm : null;
  const baseHp = enemy && !toPlayer ? enemyHp(s.config, enemy) : def.hp;
  p.defId = op.into;
  p.maxHp = baseHp + (charm?.maxHp ?? 0);
  p.atk = def.atk + (charm?.atk ?? 0);
  p.flying = def.move.flying;
  p.structure = def.structure;
  if (op.fullHp || toPlayer) p.hp = p.maxHp;
  else p.hp = Math.min(p.hp, p.maxHp);
  if (toPlayer && env.seat !== null) {
    s.intents = s.intents.filter((i) => i.attackerId !== p.id);
    p.kind = 'unit';
    p.side = 'wick';
    p.owner = env.seat;
    p.initiative = 0;
    if (op.countsAsKill) s.players[env.seat].stats.kills += 1;
  }
  if (op.exhausted) {
    p.exhausted = true;
    p.movesLeft = 0;
    p.strikesLeft = 0;
  }
  emit(ctx, { type: 'transformed', pieceId: p.id, fromDefId, toDefId: op.into, seat: p.owner });
  addLog(ctx, `${fromName} at ${sqName(p.pos)} becomes a ${pieceName(reg, p)}.`);
}

function opExtraActions(ctx: Ctx, op: EffectOfOp<'extra_move'> | EffectOfOp<'extra_strike'>, env: EffectEnv): void {
  const moves = op.op === 'extra_move' ? op.amount : 0;
  const strikes = op.op === 'extra_strike' ? op.amount : 0;
  for (const p of subjects(ctx, op, env)) {
    p.movesLeft += moves;
    p.strikesLeft += strikes;
    emit(ctx, { type: 'actions_granted', pieceId: p.id, moves, strikes, source: env.ruleSource.id });
  }
}

function opGainFlame(ctx: Ctx, amount: number, env: EffectEnv): void {
  if (env.seat === null) return;
  const player = ctx.s.players[env.seat];
  player.flame = Math.min(ctx.reg.rules.flameCap, player.flame + amount);
}

function whereMatches(ctx: Ctx, p: Pos, where: TileWhere): boolean {
  const tile = tileAt(ctx.s, p);
  if (!tile) return false;
  if (!(where.base ?? ['flagstone']).includes(tile.type)) return false;
  if (where.empty && (pieceAt(ctx.s, p) || plumeAt(ctx.s, p))) return false;
  if (where.notGloam && (tile.gloam || tile.gloamWarning)) return false;
  const minHero = where.minHeroDistance ?? 0;
  if (minHero > 0 && heroPieces(ctx.s).some((h) => chebyshev(h.pos, p) < minHero)) return false;
  return true;
}

function changeTile(ctx: Ctx, p: Pos, to: EffectOfOp<'create_tile'>['tile']): void {
  const tile = tileAt(ctx.s, p);
  if (!tile || tile.type === to) return;
  const from = tile.type;
  setTileType(ctx.s, p, to);
  emit(ctx, { type: 'tile_changed', pos: p, from, to });
}

/** `create_tile`: at a centre (`at`, optionally an `area`), or on random / all tiles matching `where`. */
function opCreateTile(ctx: Ctx, op: EffectOfOp<'create_tile'>, env: EffectEnv): void {
  let tiles: Pos[];
  if (op.where) {
    const where = op.where;
    const candidates = allTiles(ctx.s).filter((p) => whereMatches(ctx, p, where));
    if (op.count === undefined) tiles = candidates;
    else {
      tiles = [];
      for (let i = 0; i < op.count && candidates.length > 0; i++) {
        const pick = streamPick(ctx.s, 'spawn', candidates);
        tiles.push(pick);
        candidates.splice(candidates.indexOf(pick), 1);
      }
    }
  } else if (op.area) {
    tiles = opAreaTiles(ctx, op, env);
  } else {
    const centre = centreOf(ctx, env, op.at);
    tiles = centre ? [centre.pos] : [];
  }
  for (const p of tiles) {
    if (op.onlyEmpty && pieceAt(ctx.s, p)) continue;
    if (tileAt(ctx.s, p)?.type === 'pillar' && op.tile !== 'rubble') continue;
    changeTile(ctx, p, op.tile);
  }
}

function opPlacePlume(ctx: Ctx, op: EffectOfOp<'place_plume'>, env: EffectEnv): void {
  let near: { anchor: Pos; max: number } | undefined;
  if (op.near) {
    const anchor = op.near.anchor === 'self' ? env.self?.pos : op.near.anchor === 'target' ? env.targets[0]?.pos : undefined;
    if (!anchor) return;
    near = { anchor, max: op.near.max ?? ctx.reg.rules.placementMaxDistance };
  }
  placePlumes(ctx, { count: op.count ?? 1, source: env.plumeSource, enemyId: op.enemy, near });
}

function opRemovePlume(ctx: Ctx, op: EffectOfOp<'remove_plume'>, env: EffectEnv): void {
  let plumes = ctx.s.plumes.slice();
  if (op.scope !== 'board') {
    const tiles = op.scope === 'area' ? opAreaTiles(ctx, op, env) : env.targets[0] ? [env.targets[0].pos] : [];
    const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
    plumes = plumes.filter((m) => keys.has(`${m.pos.x},${m.pos.y}`));
  }
  for (const plume of plumes) popPlume(ctx, plume, env.seat);
}

// =============================================================================================
// Traits and Charms
// =============================================================================================

export function traitIdsOf(ctx: Ctx, p: Piece): string[] {
  switch (p.kind) {
    case 'hero': {
      const trait = ctx.reg.heroes.byId[p.defId]?.trait;
      return trait ? [trait] : [];
    }
    case 'unit':
      return ctx.reg.units.byId[p.defId]?.traits.slice() ?? [];
    case 'enemy':
      return ctx.reg.enemies.byId[p.defId]?.traits.slice() ?? [];
    default:
      return [];
  }
}

export function hasTrait(ctx: Ctx, p: Piece, trait: string): boolean {
  return traitIdsOf(ctx, p).includes(trait);
}

/** Run a piece's `effects`-implemented traits for one trigger (promotion, censer, pop, wax_pool, belch). */
export function runTraitTrigger(ctx: Ctx, p: Piece, trigger: TriggerId): void {
  for (const id of traitIdsOf(ctx, p)) {
    const def = ctx.reg.traits.byId[id];
    if (!def || def.impl !== 'effects' || (def.mode && def.mode !== ctx.s.config.mode)) continue;
    runTriggered(
      ctx,
      def.effects,
      trigger,
      baseEnv({
        seat: p.owner,
        self: p,
        cause: id === 'pop' ? 'pop' : 'strike',
        damageKind: 'hazard',
        ruleSource: { kind: 'card', id },
        defaultDuration: 'turn',
        plumeSource: id === 'belch' ? 'smokestack' : 'card',
        summonSource: 'trait',
      }),
    );
  }
}

/** Run an attached Charm's triggered effects (cocoon at Tally, riposte when damaged, oath on hits). */
export function runCharmTrigger(
  ctx: Ctx,
  p: Piece,
  trigger: TriggerId,
  extra: { attackerId?: string | null; sourceKind?: DamageSourceKind; targetId?: string | null } = {},
): void {
  if (!p.charm || ctx.s.pieces[p.id] !== p) return;
  const charm = ctx.reg.cards.byId[p.charm.id]?.charm;
  if (!charm) return;
  const ops = charm.triggers.filter(
    (op) => op.trigger === trigger && (trigger !== 'damaged' || !op.sources || (extra.sourceKind !== undefined && op.sources.includes(extra.sourceKind))),
  );
  if (ops.length === 0) return;
  const target = extra.targetId ? getPiece(ctx.s, extra.targetId) : null;
  runEffects(
    ctx,
    ops,
    baseEnv({
      seat: p.owner,
      self: p,
      attackerId: extra.attackerId ?? null,
      targets: target ? [{ pieceId: target.id, pos: target.pos }] : [],
      cause: trigger === 'damaged' ? 'riposte' : 'card',
      damageKind: 'card',
      ruleSource: { kind: 'card', id: p.charm.id },
    }),
  );
}
