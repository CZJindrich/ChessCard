/**
 * Combat primitives (GDD §6.3-6.5): damage instances with Ward, death (Wickfolk melt, Snuff
 * burst, heroes smolder, Candles are snuffed), kill credit, push / pull / swap / bump with their
 * immunities, statuses, Hot Wax and relighting.
 *
 * Every function mutates `ctx.s` and appends events. Win/loss is checked after every atomic
 * effect (Dread changes end the game at once), so callers stop when `isOver(ctx.s)`.
 */
import { onBossDamaged, onBossDeath } from './bosses';
import { returnCharm } from './charms';
import { runCharmTrigger, runTraitTrigger } from './effects';
import { footprint, pullPath, pushPath, sqName } from './geometry';
import type { DisplacementPath } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { settleFallenHero } from './modes/falls';
import { creditTick, gloryForRivalUnit, gloryForSnuffKill, isTruceActive, onHeroFellLastFlame } from './modes/lastFlame';
import { atomicEffect, changeDread } from './modes/vigil';
import { boardQuery, emit, isOver, isRivalOf, removePiece, tileAt } from './state';
import type { Ctx } from './state';
import type {
  ContentRegistry,
  DamageCause,
  DamageSourceKind,
  DeathCause,
  Dir,
  Immunity,
  Piece,
  Pos,
  RelightCause,
} from './types';

// =============================================================================================
// Definitions and immunities
// =============================================================================================

export function immunitiesOf(reg: ContentRegistry, p: Piece): readonly Immunity[] {
  switch (p.kind) {
    case 'hero':
      return reg.heroes.byId[p.defId]?.immune ?? [];
    case 'unit':
      return reg.units.byId[p.defId]?.immune ?? [];
    case 'enemy':
      return reg.enemies.byId[p.defId]?.immune ?? [];
    case 'boss':
      return [...(reg.bosses.byId[p.defId]?.immune ?? []), 'displacement', 'gloam', 'snuff_attacks'];
    case 'candle':
      return ['displacement'];
  }
}

export function isImmune(reg: ContentRegistry, p: Piece, what: Immunity): boolean {
  return immunitiesOf(reg, p).includes(what);
}

export type DisplaceKind = 'push' | 'pull' | 'swap';

/**
 * Immune to push/pull/swap (§6.4): multi-tile pieces, structures (Candles, Lanterns, Mortars,
 * Smokestacks, Smoldering Wicks), `heavy` (immune: displacement) and `stalwart` (push, pull).
 */
export function isDisplacementImmune(reg: ContentRegistry, p: Piece, kind: DisplaceKind): boolean {
  if (p.size > 1 || p.structure || p.kind === 'candle' || p.smoldering) return true;
  const immune = immunitiesOf(reg, p);
  return immune.includes('displacement') || immune.includes(kind);
}

/** Hot Wax hurts non-flying, non-immune pieces that end a movement on it (§5.4). */
export function takesHotWax(reg: ContentRegistry, p: Piece): boolean {
  return !p.flying && p.kind !== 'candle' && !p.smoldering && !isImmune(reg, p, 'hot_wax');
}

export function halfMaxHp(p: Piece): number {
  return Math.ceil(p.maxHp / 2);
}

// =============================================================================================
// Damage
// =============================================================================================

export interface DamageSource {
  cause: DamageCause;
  sourceKind: DamageSourceKind;
  /** The attacking piece (strikes, intents, pop), or null. */
  sourceId: string | null;
  /** Seat credited with the damage and any kill (§6.3). */
  seat: number | null;
  /** Gloam and Checkmate damage ignore Ward. */
  ignoreWard?: boolean;
}

export interface DamageOutcome {
  dealt: number;
  blocked: boolean;
  killed: boolean;
}

const NO_DAMAGE: DamageOutcome = { dealt: 0, blocked: false, killed: false };

function pieceStats(ctx: Ctx, p: Piece) {
  const stats = ctx.s.stats.pieces;
  return (stats[p.id] ??= { defId: p.defId, owner: p.owner, damage: 0, kills: 0 });
}

function recordDamage(ctx: Ctx, target: Piece, amount: number, src: DamageSource): void {
  const { s } = ctx;
  const source = src.sourceId ? s.pieces[src.sourceId] : undefined;
  if (source && source.side === 'wick') pieceStats(ctx, source).damage += amount;
  if (src.seat !== null && s.players[src.seat] && target.side === 'snuff') {
    s.players[src.seat].stats.damageDealt += amount;
    if (target.kind === 'boss') s.players[src.seat].stats.bossDamage += amount;
  }
  if (target.owner !== null && s.players[target.owner]) s.players[target.owner].stats.damageTaken += amount;
}

/**
 * One damage instance (§6.3, §6.5). Ward cancels the whole instance and breaks. Smoldering Wicks
 * take no damage (the Gloam eliminates them instead, modes/gloam); bosses never take Snuff-attack
 * damage. A Candle hit adds Dread. The instance and what it sets off (death, Dread, Riposte, a
 * Last Flame elimination) are one atomic effect (§13.1.5).
 */
export function dealDamage(ctx: Ctx, target: Piece, amount: number, src: DamageSource): DamageOutcome {
  return atomicEffect(ctx, () => damageInstance(ctx, target, amount, src));
}

function damageInstance(ctx: Ctx, target: Piece, amount: number, src: DamageSource): DamageOutcome {
  const { s } = ctx;
  if (isOver(s) || amount <= 0 || s.pieces[target.id] !== target) return NO_DAMAGE;
  if (target.smoldering) return NO_DAMAGE;
  if (target.kind === 'boss' && src.sourceKind === 'snuff_attack') return NO_DAMAGE;
  if (target.ward && !src.ignoreWard) {
    target.ward = false;
    emit(ctx, { type: 'status_changed', pieceId: target.id, status: 'ward', active: false, value: 0 });
    emit(ctx, {
      type: 'damage',
      pieceId: target.id,
      amount,
      hpAfter: target.hp,
      lethal: false,
      blockedByWard: true,
      cause: src.cause,
      sourceId: src.sourceId,
      seat: src.seat,
    });
    addLog(ctx, `Ward absorbs the hit on ${pieceAtText(ctx.reg, target)}.`);
    return { dealt: 0, blocked: true, killed: false };
  }
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  const lethal = target.hp === 0;
  emit(ctx, {
    type: 'damage',
    pieceId: target.id,
    amount,
    hpAfter: target.hp,
    lethal,
    blockedByWard: false,
    cause: src.cause,
    sourceId: src.sourceId,
    seat: src.seat,
  });
  recordDamage(ctx, target, amount, src);
  if (target.kind === 'candle') {
    changeDread(ctx, ctx.reg.rules.dread.candleHit, 'candle_hit', `The ${sqName(target.pos)} Vigil Candle was struck.`);
  }
  if (target.kind === 'boss') onBossDamaged(ctx, target, hpBefore - target.hp, src.seat);
  if (isOver(s)) return { dealt: amount, blocked: false, killed: false };
  if (lethal) killPiece(ctx, target, { cause: src.cause, seat: src.seat, sourceId: src.sourceId });
  // A felled hero stays on the board as a Wick and keeps its Charm: Riposte answers the fatal hit too.
  if (!isOver(s)) runCharmTrigger(ctx, target, 'damaged', { attackerId: src.sourceId, sourceKind: src.sourceKind });
  // Last Flame: a hero that must be eliminated leaves only once its fatal hit has resolved.
  if (lethal && target.kind === 'hero') settleFallenHero(ctx, target, src.cause, src.seat);
  return { dealt: amount, blocked: false, killed: lethal };
}

// =============================================================================================
// Death
// =============================================================================================

export interface KillInfo {
  cause: DeathCause;
  /** Seat credited with the kill, or null (§6.3). */
  seat: number | null;
  sourceId: string | null;
}

function creditKill(ctx: Ctx, info: KillInfo): void {
  const { s } = ctx;
  if (info.seat !== null && s.players[info.seat]) s.players[info.seat].stats.kills += 1;
  const source = info.sourceId ? s.pieces[info.sourceId] : undefined;
  if (source && source.side === 'wick') pieceStats(ctx, source).kills += 1;
}

function emitDied(ctx: Ctx, p: Piece, info: KillInfo): void {
  emit(ctx, {
    type: 'piece_died',
    pieceId: p.id,
    defId: p.defId,
    kind: p.kind,
    side: p.side,
    pos: p.pos,
    killerSeat: info.seat,
    cause: info.cause,
  });
}

function smolderHero(ctx: Ctx, hero: Piece, info: KillInfo): void {
  hero.hp = 0;
  hero.smoldering = true;
  hero.ward = false;
  hero.burn = 0;
  hero.dazed = false;
  hero.movesLeft = 0;
  hero.strikesLeft = 0;
  hero.pendingRelight = false;
  hero.buffs = { atk: 0, range: 0 };
  if (hero.owner !== null) {
    ctx.s.players[hero.owner].stats.heroFalls += 1;
    emit(ctx, { type: 'hero_smoldered', pieceId: hero.id, seat: hero.owner, pos: hero.pos });
  }
  addLog(ctx, `${pieceName(ctx.reg, hero)} falls and smolders at ${sqName(hero.pos)}.`);
  if (ctx.s.config.mode === 'vigil') {
    changeDread(ctx, ctx.reg.rules.dread.heroFalls, 'hero_fell', `${pieceName(ctx.reg, hero)} fell at ${sqName(hero.pos)}.`);
    return;
  }
  if (info.seat !== null && info.seat !== hero.owner) creditKill(ctx, info);
  onHeroFellLastFlame(ctx, hero, info.seat);
}

function snuffCandle(ctx: Ctx, candle: Piece, info: KillInfo): void {
  removePiece(ctx.s, candle.id);
  emitDied(ctx, candle, info);
  ctx.s.stats.candlesSnuffed += 1;
  if (ctx.s.vigil) ctx.s.vigil.candlesSnuffed += 1;
  addLog(ctx, `The ${sqName(candle.pos)} Vigil Candle is snuffed.`);
  changeDread(ctx, ctx.reg.rules.dread.candleSnuffed, 'candle_snuffed', `The ${sqName(candle.pos)} Vigil Candle was snuffed.`);
}

/** Removals that are not deaths in play: no death traits (Pop) fire. */
const QUIET_REMOVALS: ReadonlySet<DeathCause> = new Set<DeathCause>(['melt', 'dawn', 'gloam']);

function meltUnit(ctx: Ctx, unit: Piece, info: KillInfo): void {
  returnCharm(ctx, unit);
  removePiece(ctx.s, unit.id);
  emitDied(ctx, unit, info);
  addLog(ctx, `${pieceAtText(ctx.reg, unit)} melts.`);
  if (!QUIET_REMOVALS.has(info.cause)) runTraitTrigger(ctx, unit, 'death');
}

function burstSnuff(ctx: Ctx, enemy: Piece, info: KillInfo): void {
  const cancelled = ctx.s.intents.filter((i) => i.attackerId === enemy.id);
  removePiece(ctx.s, enemy.id);
  for (const intent of cancelled) emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'attacker_died' });
  emitDied(ctx, enemy, info);
  creditKill(ctx, info);
  addLog(ctx, `${pieceAtText(ctx.reg, enemy)} bursts.`);
  gloryForSnuffKill(ctx, enemy, info.seat);
  runTraitTrigger(ctx, enemy, 'death');
}

/** A piece at 0 HP dies at once (§6.3). */
export function killPiece(ctx: Ctx, p: Piece, info: KillInfo): void {
  if (ctx.s.pieces[p.id] !== p) return;
  switch (p.kind) {
    case 'hero':
      smolderHero(ctx, p, info);
      return;
    case 'candle':
      snuffCandle(ctx, p, info);
      return;
    case 'unit':
      if (info.seat !== null && p.owner !== info.seat) {
        creditKill(ctx, info);
        gloryForRivalUnit(ctx, p, info.seat);
      }
      meltUnit(ctx, p, info);
      return;
    case 'enemy':
      burstSnuff(ctx, p, info);
      return;
    case 'boss':
      creditKill(ctx, info);
      emitDied(ctx, p, info);
      onBossDeath(ctx, p, info.seat);
      return;
  }
}

/** Dismiss a unit without credit (free action `melt`, carry-over at Dawn, elimination, the Gloam). */
export function dismissUnit(ctx: Ctx, unit: Piece, cause: 'melt' | 'dawn' | 'gloam'): void {
  meltUnit(ctx, unit, { cause, seat: null, sourceId: null });
}

/**
 * Remove a unit or Snuff without credit, Glory or death traits (the Gloam swallowing Lanterns,
 * Wick Mortars and Smokestacks, §5.4). Its locked intents end.
 */
export function vanishPiece(ctx: Ctx, p: Piece, cause: DeathCause): void {
  if (ctx.s.pieces[p.id] !== p) return;
  if (p.kind === 'unit') {
    meltUnit(ctx, p, { cause, seat: null, sourceId: null });
    return;
  }
  const cancelled = ctx.s.intents.filter((i) => i.attackerId === p.id);
  removePiece(ctx.s, p.id);
  for (const intent of cancelled) emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'attacker_died' });
  emitDied(ctx, p, { cause, seat: null, sourceId: null });
}

/** Record a player displacement (push, pull, swap) for kill credit (§6.3); Last Flame also times it. */
export function markDisplaced(ctx: Ctx, p: Piece, seat: number): void {
  p.lastDisplacedBy = seat;
  const at = creditTick(ctx.s);
  if (at > 0) p.lastDisplacedAt = at;
}

// =============================================================================================
// Relight
// =============================================================================================

/** A Smoldering hero returns on its Wick's tile (§6.6, §13.1.3). */
export function relightHero(ctx: Ctx, hero: Piece, hp: number, cause: RelightCause, exhausted: boolean): void {
  if (!hero.smoldering) return;
  hero.smoldering = false;
  hero.pendingRelight = false;
  hero.smolderedAtPlayersEnd = false;
  hero.hp = Math.max(1, Math.min(hp, hero.maxHp));
  hero.exhausted = exhausted;
  hero.movesLeft = 0;
  hero.strikesLeft = 0;
  if (hero.owner !== null) emit(ctx, { type: 'hero_relit', pieceId: hero.id, seat: hero.owner, pos: hero.pos, hp: hero.hp, cause });
  addLog(ctx, `${pieceName(ctx.reg, hero)} is relit at ${sqName(hero.pos)} with ${hero.hp} HP.`);
}

// =============================================================================================
// Heal and statuses
// =============================================================================================

export function healPiece(ctx: Ctx, p: Piece, amount: number): number {
  if (amount <= 0 || p.smoldering || ctx.s.pieces[p.id] !== p) return 0;
  const healed = Math.min(amount, p.maxHp - p.hp);
  if (healed <= 0) return 0;
  p.hp += healed;
  emit(ctx, { type: 'heal', pieceId: p.id, amount: healed, hpAfter: p.hp });
  return healed;
}

export function giveWard(ctx: Ctx, p: Piece): void {
  if (p.ward || p.smoldering) return;
  p.ward = true;
  emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'ward', active: true, value: 1 });
}

/**
 * Burn: 1 damage at each of the next 2 Tallies; reapplying resets the count (§6.5). `seat` is the
 * player whose effect applied it (a Snuff attack: null), credited if the Burn kills.
 */
export function applyBurn(ctx: Ctx, p: Piece, seat: number | null = null): void {
  if (p.smoldering || p.kind === 'candle' || isImmune(ctx.reg, p, 'burn')) return;
  p.burn = ctx.reg.statuses.byId.burn?.tallies ?? 2;
  p.burnSeat = seat;
  emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'burn', active: true, value: p.burn });
}

/**
 * Dazed (§6.5): a Snuff's locked intent is cancelled at once (a boss loses its last one); a Snuff
 * without an intent skips its next declaration; a Wickfolk piece loses its next Strike.
 */
export function applyDaze(ctx: Ctx, p: Piece): void {
  const { s } = ctx;
  if (p.smoldering || p.kind === 'candle' || isImmune(ctx.reg, p, 'dazed')) return;
  if (p.side === 'snuff') {
    const own = s.intents.filter((i) => i.attackerId === p.id);
    const cancel = p.kind === 'boss' ? own.slice(-1) : own;
    if (cancel.length > 0) {
      s.intents = s.intents.filter((i) => !cancel.includes(i));
      for (const intent of cancel) emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'dazed' });
      addLog(ctx, `${pieceAtText(ctx.reg, p)} is Dazed: its attack is cancelled.`);
      return;
    }
  } else if (p.owner !== null && s.phase === 'players' && s.activeSeat === p.owner && p.strikesLeft > 0) {
    p.strikesLeft = 0;
    addLog(ctx, `${pieceAtText(ctx.reg, p)} is Dazed and loses its Strike.`);
    return;
  }
  p.dazed = true;
  emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'dazed', active: true, value: 1 });
}

export function clearStatuses(ctx: Ctx, p: Piece): void {
  if (p.ward) emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'ward', active: false, value: 0 });
  if (p.burn > 0) emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'burn', active: false, value: 0 });
  if (p.dazed) emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'dazed', active: false, value: 0 });
  p.ward = false;
  p.burn = 0;
  p.dazed = false;
}

// =============================================================================================
// Movement hazards
// =============================================================================================

/** Hot Wax under any tile of the piece's footprint. */
export function standsOnHotWax(ctx: Ctx, p: Piece): boolean {
  return footprint(p.pos, p.size).some((t) => tileAt(ctx.s, t)?.type === 'hot_wax');
}

/** After any movement ends (move, push, pull, swap, Take, card move, boss step): Hot Wax (§5.4), one instance. */
export function afterMoveEnd(ctx: Ctx, p: Piece, creditSeat: number | null): void {
  if (isOver(ctx.s) || ctx.s.pieces[p.id] !== p) return;
  if (!standsOnHotWax(ctx, p) || !takesHotWax(ctx.reg, p)) return;
  const amount = ctx.reg.tiles.byId.hot_wax?.damage ?? 1;
  dealDamage(ctx, p, amount, { cause: 'hot_wax', sourceKind: 'hazard', sourceId: null, seat: creditSeat });
}

// =============================================================================================
// Push, pull, swap
// =============================================================================================

export interface DisplaceSource {
  /** The player who caused the displacement (sets lastDisplacedBy), or null for the Snuff. */
  displacer: number | null;
  /** Seat credited with bump / Hot Wax kills. */
  credit: number | null;
  sourceId: string | null;
}

function bump(ctx: Ctx, p: Piece, src: DisplaceSource): void {
  dealDamage(ctx, p, ctx.reg.rules.bumpDamage, { cause: 'bump', sourceKind: 'hazard', sourceId: src.sourceId, seat: src.credit });
}

/**
 * Truce (§6.4): a player's push or pull that would bump a rival piece stops short without the
 * bump, and nothing bumps a rival who is being displaced.
 */
function truceSparesBump(ctx: Ctx, p: Piece, bumpAt: { at: Pos; pieceId: string | null }, src: DisplaceSource): boolean {
  if (src.displacer === null || !isTruceActive(ctx.s)) return false;
  const blocker = bumpAt.pieceId ? ctx.s.pieces[bumpAt.pieceId] : undefined;
  return isRivalOf(ctx.s, src.displacer, p) || (blocker !== undefined && isRivalOf(ctx.s, src.displacer, blocker));
}

function finishDisplacement(ctx: Ctx, p: Piece, from: Pos, result: DisplacementPath, kind: 'push' | 'pull', src: DisplaceSource): void {
  const path = result.path;
  const bumpAt = result.bump && !truceSparesBump(ctx, p, result.bump, src) ? result.bump : null;
  emit(ctx, { type: 'piece_moved', pieceId: p.id, from, to: p.pos, kind, path, ...(bumpAt ? { bump: bumpAt } : {}) });
  if (src.displacer !== null) markDisplaced(ctx, p, src.displacer);
  if (bumpAt) {
    atomicEffect(ctx, () => {
      bump(ctx, p, src);
      const blocker = bumpAt.pieceId ? ctx.s.pieces[bumpAt.pieceId] : undefined;
      if (blocker) bump(ctx, blocker, src);
    });
  }
  if (path.length > 0) afterMoveEnd(ctx, p, src.credit);
}

/** Push tile by tile; at the first blocked tile the piece (and a blocking piece) takes bump 1 (§6.4). */
export function pushPiece(ctx: Ctx, p: Piece, dir: Dir, distance: number, src: DisplaceSource): void {
  if (isOver(ctx.s) || ctx.s.pieces[p.id] !== p || distance <= 0 || (dir.x === 0 && dir.y === 0)) return;
  if (isDisplacementImmune(ctx.reg, p, 'push')) return;
  const from = p.pos;
  const result = pushPath(boardQuery(ctx.s), from, dir, distance);
  p.pos = result.end;
  finishDisplacement(ctx, p, from, result, 'push', src);
}

/** Pull toward a source; stops adjacent to it (§6.4). */
export function pullPiece(ctx: Ctx, p: Piece, source: Piece, distance: number, src: DisplaceSource): void {
  if (isOver(ctx.s) || ctx.s.pieces[p.id] !== p || distance <= 0) return;
  if (isDisplacementImmune(ctx.reg, p, 'pull')) return;
  const from = p.pos;
  const result = pullPath(boardQuery(ctx.s), from, source.pos, source.size, distance);
  p.pos = result.end;
  finishDisplacement(ctx, p, from, result, 'pull', src);
}

/** Exchange two pieces' tiles; locked intents move with their attackers (§6.4). */
export function swapPieces(ctx: Ctx, a: Piece, b: Piece, src: DisplaceSource, ignoreImmunity = false): boolean {
  if (isOver(ctx.s) || a === b) return false;
  if (!ignoreImmunity && (isDisplacementImmune(ctx.reg, a, 'swap') || isDisplacementImmune(ctx.reg, b, 'swap'))) return false;
  const posA = a.pos;
  const posB = b.pos;
  a.pos = posB;
  b.pos = posA;
  emit(ctx, { type: 'piece_moved', pieceId: a.id, from: posA, to: posB, kind: 'swap' });
  emit(ctx, { type: 'piece_moved', pieceId: b.id, from: posB, to: posA, kind: 'swap' });
  if (src.displacer !== null) {
    markDisplaced(ctx, a, src.displacer);
    markDisplaced(ctx, b, src.displacer);
  }
  afterMoveEnd(ctx, a, src.credit);
  afterMoveEnd(ctx, b, src.credit);
  return true;
}
