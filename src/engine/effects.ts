/**
 * Effect-op interpreter (GDD A.2). Cards, Powers, traits, Charms, Tolls, Moth Die faces,
 * Heirlooms and boss phases all express their behaviour as `EffectOp` lists; this module runs
 * them. Every op of the registry has a handler; the boss-only `custom` ops are delegated to
 * bosses.ts.
 *
 * During a Last Flame truce, player effects skip rival pieces (`subjects`).
 */
import { runBossCustomOp } from './bosses';
import { attachCharm } from './charms';
import {
  applyBurn,
  applyDaze,
  dealDamage,
  afterMoveEnd,
  dismissUnit,
  giveWard,
  halfMaxHp,
  healPiece,
  pullPiece,
  pushPiece,
  relightHero,
  swapPieces,
} from './combat';
import { lanternVolley, rouse } from './customOps';
import { drawCards } from './decks';
import { addPos, areaTiles, clipToBoard, footprint, isOpenTile, lineDir, pushDirection, samePos, sortReadingOrder, sqName } from './geometry';
import { addLog, pieceName } from './log';
import { awardGlory, gloryForSnuffKill, isTruceActive } from './modes/lastFlame';
import { changeDread } from './modes/vigil';
import { placePlumes, popPlume, reverseIntent } from './snuff';
import { createUnit, enemyHp, placeNear, spawnEnemy, summonTileTest, unitLimitReached } from './spawn';
import type { SummonSource } from './spawn';
import {
  addRule,
  boardQuery,
  emit,
  getPiece,
  heroOf,
  heroPieces,
  isAllyOfSeat,
  isEnemyOfSeat,
  isOver,
  isRivalOf,
  nextOrder,
  pieceAt,
  pieceList,
  plumeAt,
} from './state';
import type { Ctx } from './state';
import { createTiles, moveTiles, tilesWhere } from './tileOps';
import type {
  CardInstance,
  ContentRegistry,
  DamageCause,
  DamageSourceKind,
  Duration,
  EffectCentre,
  EffectOfOp,
  EffectOp,
  EffectSubject,
  MoveKind,
  Piece,
  PieceFilter,
  PlumeSource,
  Pos,
  RankId,
  RuleSource,
  TriggerId,
} from './types';

export interface EffectTarget {
  pieceId: string | null;
  pos: Pos;
}

export interface EffectEnv {
  /** Acting seat: kill credit, side relations, flame/draw. Null for Snuff and global sources. */
  seat: number | null;
  /** The piece owning the trait, Charm or intent (`self`); the hero for cards and Powers. */
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
  /** The card being played (a Charm attaches this instance). */
  card: CardInstance | null;
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
    card: null,
    ...partial,
  };
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

/** Dispatch one op. */
export function runOp(ctx: Ctx, op: EffectOp, env: EffectEnv): void {
  switch (op.op) {
    case 'damage':
      return opDamage(ctx, op, env);
    case 'heal':
      for (const p of subjects(ctx, op, env)) healPiece(ctx, p, healAmount(p, op.amount));
      return;
    case 'ward':
      for (const p of subjects(ctx, op, env)) giveWard(ctx, p);
      return;
    case 'burn':
      for (const p of subjects(ctx, op, env)) applyBurn(ctx, p);
      return;
    case 'daze':
      for (const p of subjects(ctx, op, env)) applyDaze(ctx, p);
      return;
    case 'push':
      return opPush(ctx, op, env);
    case 'pull':
      return opPull(ctx, op, env);
    case 'swap':
      return opSwap(ctx, op, env);
    case 'teleport':
      return opTeleport(ctx, op, env);
    case 'summon':
      return opSummon(ctx, op, env);
    case 'transform':
      for (const p of subjects(ctx, op, env)) transformPiece(ctx, p, op, env);
      return;
    case 'extra_move':
    case 'extra_strike':
      return opExtraActions(ctx, op, env);
    case 'gain_flame':
      return opGainFlame(ctx, op.amount, env);
    case 'draw':
      if (env.seat !== null) drawCards(ctx, env.seat, op.amount);
      return;
    case 'create_tile':
      return opCreateTile(ctx, op, env);
    case 'move_tile':
      moveTiles(ctx, op.tile, op.where ?? { base: ['flagstone'], empty: true });
      return;
    case 'reverse_intent':
      for (const p of subjects(ctx, op, env)) reverseIntent(ctx, p, env.seat);
      return;
    case 'attach_charm':
      return opAttachCharm(ctx, op, env);
    case 'modify_rule':
      addRule(ctx.s, {
        rule: op.rule,
        delta: op.delta ?? 0,
        value: op.value ?? null,
        seat: env.seat,
        source: env.ruleSource,
        expires: op.duration ?? env.defaultDuration,
      });
      return;
    case 'melt':
      for (const p of subjects(ctx, op, env)) if (p.kind === 'unit') dismissUnit(ctx, p, 'melt');
      return;
    case 'relight':
      for (const p of subjects(ctx, op, env, { includeSmoldering: true })) {
        if (p.smoldering) relightHero(ctx, p, healAmount(p, op.hp), 'card', true);
      }
      return;
    case 'add_dread':
      changeDread(ctx, op.amount, 'effect', `${env.ruleSource.id} stirred the dark.`);
      return;
    case 'add_glory':
      return opAddGlory(ctx, op, env);
    case 'place_plume':
      return opPlacePlume(ctx, op, env);
    case 'remove_plume':
      return opRemovePlume(ctx, op, env);
    case 'custom':
      return opCustom(ctx, op, env);
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

function subjectList(ctx: Ctx, to: EffectSubject, op: EffectOp, env: EffectEnv): Piece[] {
  const { s } = ctx;
  switch (to) {
    case 'target':
    case 'target2': {
      const piece = targetPiece(ctx, env, to === 'target2' ? 1 : 0);
      return piece ? [piece] : [];
    }
    case 'hero':
      return env.seat !== null ? [heroOf(s, env.seat)].filter((p): p is Piece => p !== null) : heroPieces(s);
    case 'self':
      return env.self && s.pieces[env.self.id] === env.self ? [env.self] : [];
    case 'attacker': {
      const attacker = getPiece(s, env.attackerId);
      return attacker ? [attacker] : [];
    }
    case 'all':
      return pieceList(s).filter((p) => matchesFilter(ctx, env.seat, p, op.filter));
    case 'area': {
      const keys = new Set(opAreaTiles(ctx, op, env).map((t) => `${t.x},${t.y}`));
      return pieceList(s).filter((p) => footprint(p.pos, p.size).some((t) => keys.has(`${t.x},${t.y}`)) && matchesFilter(ctx, env.seat, p, op.filter));
    }
  }
}

/**
 * Who an op applies to (`to`, default `target`), in reading order. Smoldering Wicks are left out
 * unless asked for (only `relight` wants them); during a truce, rivals of the acting seat too.
 */
export function subjects(ctx: Ctx, op: EffectOp, env: EffectEnv, opts: { includeSmoldering?: boolean; to?: EffectSubject } = {}): Piece[] {
  const { s } = ctx;
  const truce = env.seat !== null && isTruceActive(s);
  const alive = subjectList(ctx, opts.to ?? op.to ?? 'target', op, env).filter(
    (p) => s.pieces[p.id] === p && (opts.includeSmoldering || !p.smoldering) && !(truce && isRivalOf(s, env.seat, p)),
  );
  return sortReadingOrder(alive, (p) => p.pos);
}

function healAmount(p: Piece, amount: number | 'half' | 'full'): number {
  if (amount === 'half') return halfMaxHp(p);
  if (amount === 'full') return p.maxHp;
  return amount;
}

// =============================================================================================
// Damage and displacement
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

function displaceSource(env: EffectEnv) {
  return { displacer: env.seat, credit: env.seat, sourceId: env.self?.id ?? null };
}

function opPush(ctx: Ctx, op: EffectOfOp<'push'>, env: EffectEnv): void {
  const centre = centreOf(ctx, env, op.from);
  if (!centre) return;
  for (const p of subjects(ctx, op, env)) {
    if (op.ifSurvives && !survived(ctx, p)) continue;
    pushPiece(ctx, p, pushDirection(centre.pos, centre.size, p.pos), op.distance, displaceSource(env));
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
    pullPiece(ctx, p, source, op.distance, displaceSource(env));
  }
}

/** Exchange two pieces (Feint, Ember Waltz, Flutterswap, Castle); intents move with attackers. */
function opSwap(ctx: Ctx, op: EffectOfOp<'swap'>, env: EffectEnv): void {
  const [a] = subjects(ctx, op, env, { to: op.a });
  const [b] = subjects(ctx, op, env, { to: op.b });
  if (!a || !b || a === b) return;
  if (swapPieces(ctx, a, b, displaceSource(env), op.ignoreImmunity ?? false)) {
    addLog(ctx, `${pieceName(ctx.reg, a)} and ${pieceName(ctx.reg, b)} trade places (${sqName(b.pos)} ↔ ${sqName(a.pos)}).`, env.seat ?? undefined);
  }
}

/** The straight tiles from `from` to `to` (excluding `from`), for slide animations. */
function straightPath(from: Pos, to: Pos): Pos[] {
  const dir = lineDir(from, to);
  if (!dir) return [{ ...to }];
  const path: Pos[] = [];
  for (let p = addPos(from, dir); path.length < 64; p = addPos(p, dir)) {
    path.push(p);
    if (samePos(p, to)) break;
  }
  return path;
}

/** Card / Power moves (Sunshield Charge slides, Shadowstep teleports). Never use the Move or Chimneys. */
function opTeleport(ctx: Ctx, op: EffectOfOp<'teleport'>, env: EffectEnv): void {
  const dest = env.targets[op.dest === 'target2' ? 1 : 0];
  const [piece] = subjects(ctx, op, env);
  if (!dest || !piece || piece.size > 1 || samePos(piece.pos, dest.pos)) return;
  if (!isOpenTile(boardQuery(ctx.s, { ignoreIds: [piece.id] }), dest.pos)) return;
  const from = { ...piece.pos };
  const kind: MoveKind = op.as === 'slide' ? 'slide' : 'teleport';
  piece.pos = { ...dest.pos };
  emit(ctx, { type: 'piece_moved', pieceId: piece.id, from, to: { ...piece.pos }, kind, path: kind === 'slide' ? straightPath(from, piece.pos) : [{ ...piece.pos }] });
  addLog(ctx, `${pieceName(ctx.reg, piece)} ${kind === 'slide' ? 'charges' : 'steps through shadow'} ${sqName(from)} → ${sqName(piece.pos)}.`, env.seat ?? undefined);
  afterMoveEnd(ctx, piece, env.seat);
}

// =============================================================================================
// Summons and transformations
// =============================================================================================

/** `byPlayers` counts use P: the Boss Night's player count once a boss is up (§10.1), else the seats. */
function summonCount(ctx: Ctx, count: EffectOfOp<'summon'>['count']): number {
  if (count === undefined) return 1;
  if (typeof count === 'number') return count;
  const players = ctx.s.boss?.players ?? ctx.s.players.length;
  return count.byPlayers[Math.min(Math.max(1, players), count.byPlayers.length) - 1] ?? 1;
}

/** The placement-routine anchor of a summon; a boss (`self`) anchors on its whole footprint. */
function summonAnchor(ctx: Ctx, op: EffectOfOp<'summon'>, env: EffectEnv, seat: number | null): { pos: Pos; size: number } | null {
  if (!op.near) return null;
  switch (op.near.anchor) {
    case 'hero': {
      const hero = seat !== null ? heroOf(ctx.s, seat) : null;
      return hero ? { pos: hero.pos, size: 1 } : null;
    }
    case 'self':
      return env.self ? { pos: env.self.pos, size: env.self.size } : null;
    case 'target': {
      const pos = env.targets[0]?.pos;
      return pos ? { pos, size: 1 } : null;
    }
    case 'board_centre':
      return { pos: { x: Math.floor((ctx.s.board.w - 1) / 2), y: Math.floor((ctx.s.board.h - 1) / 2) }, size: 1 };
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
    pos = anchor ? placeNear(s, anchor.pos, op.near.max ?? reg.rules.placementMaxDistance, legal, anchor.size) : null;
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

/** Moonlit Hex: the enemy's intents end, and it counts as a kill (stats, Glory) for the seat. */
function claimForSeat(ctx: Ctx, p: Piece, seat: number, countsAsKill: boolean): void {
  const { s } = ctx;
  for (const intent of s.intents.filter((i) => i.attackerId === p.id)) emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'attacker_died' });
  s.intents = s.intents.filter((i) => i.attackerId !== p.id);
  if (countsAsKill && p.kind === 'enemy') {
    s.players[seat].stats.kills += 1;
    gloryForSnuffKill(ctx, { ...p }, seat);
  }
  p.kind = 'unit';
  p.side = 'wick';
  p.owner = seat;
  p.initiative = 0;
  p.summonOrder = nextOrder(s);
  p.ward = false;
  p.burn = 0;
  p.dazed = false;
  p.lastDisplacedBy = null;
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
  if (toPlayer && env.seat !== null) claimForSeat(ctx, p, env.seat, op.countsAsKill ?? false);
  const charm = p.charm ? reg.cards.byId[p.charm.id]?.charm : null;
  const baseHp = enemy && !toPlayer ? enemyHp(s.config, enemy) : def.hp;
  p.defId = op.into;
  p.maxHp = baseHp + (charm?.maxHp ?? 0);
  p.atk = def.atk + (charm?.atk ?? 0);
  p.flying = def.move.flying;
  p.structure = def.structure;
  if (op.fullHp || toPlayer) p.hp = p.maxHp;
  else p.hp = Math.min(p.hp, p.maxHp);
  if (op.exhausted) {
    p.exhausted = true;
    p.movesLeft = 0;
    p.strikesLeft = 0;
  }
  emit(ctx, { type: 'transformed', pieceId: p.id, fromDefId, toDefId: op.into, seat: p.owner });
  addLog(ctx, `${fromName} at ${sqName(p.pos)} becomes a ${pieceName(reg, p)}.`);
}

// =============================================================================================
// Turn resources, Charms, Glory
// =============================================================================================

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

function opAttachCharm(ctx: Ctx, op: EffectOfOp<'attach_charm'>, env: EffectEnv): void {
  const [bearer] = subjects(ctx, op, env, { includeSmoldering: true });
  if (bearer && env.card && env.seat !== null) attachCharm(ctx, bearer, env.card, env.seat);
}

function opAddGlory(ctx: Ctx, op: EffectOfOp<'add_glory'>, env: EffectEnv): void {
  const seats = env.seat !== null ? [env.seat] : subjects(ctx, op, env).map((p) => p.owner);
  for (const seat of seats) if (seat !== null) awardGlory(ctx, seat, op.amount, 'effect');
}

// =============================================================================================
// Tiles and Plumes
// =============================================================================================

/** `create_tile`: at a centre (`at`, optionally an `area`), or on random / all tiles matching `where`. */
function opCreateTile(ctx: Ctx, op: EffectOfOp<'create_tile'>, env: EffectEnv): void {
  let tiles: Pos[];
  if (op.where) tiles = tilesWhere(ctx, op.where, op.count);
  else if (op.area) tiles = opAreaTiles(ctx, op, env);
  else {
    const centre = centreOf(ctx, env, op.at);
    tiles = centre ? [centre.pos] : [];
  }
  createTiles(ctx, tiles, op.tile, op.onlyEmpty ?? false);
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

function opCustom(ctx: Ctx, op: EffectOfOp<'custom'>, env: EffectEnv): void {
  switch (op.id) {
    case 'lantern_volley':
      if (env.seat !== null) lanternVolley(ctx, env.seat, op.args);
      return;
    case 'rouse':
      rouse(ctx, subjects(ctx, op, env));
      return;
    case 'smothered_mate':
    case 'devour_light':
    case 'hollow_bell':
      runBossCustomOp(ctx, op, env);
      return;
  }
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
      seat: p.charmSeat ?? p.owner,
      self: p,
      attackerId: extra.attackerId ?? null,
      targets: target ? [{ pieceId: target.id, pos: target.pos }] : [],
      cause: trigger === 'damaged' ? 'riposte' : 'card',
      damageKind: 'card',
      ruleSource: { kind: 'card', id: p.charm.id },
    }),
  );
}
