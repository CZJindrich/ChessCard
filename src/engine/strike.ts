/**
 * Player strikes (GDD §6.2): targets for melee "as move", explicit melee reach (pawns), ranged
 * lines and artillery; damage / lethal / Take / push previews; and resolution with Take,
 * statuses, pushes and kill triggers (promotion, flourish, mothmaker).
 */
import { bossStrikeBonus } from './bosses';
import { afterMoveEnd, applyBurn, applyDaze, dealDamage, isDisplacementImmune, pushPiece } from './combat';
import { hasTrait, runCharmTrigger, runTraitTrigger } from './effects';
import {
  artilleryTiles,
  compareReadingOrder,
  meleeReach,
  patternMoves,
  pushDirection,
  pushPath,
  rangedLines,
  reachablePlumes,
  samePos,
  sqName,
} from './geometry';
import type { MoveDest } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { popPlume } from './snuff';
import { createUnit, summonTileTest, unitLimitReached } from './spawn';
import { boardQuery, emit, isEnemyOfSeat, isOver, pieceAt, plumeAt, ruleDelta, ruleValue, tileAt } from './state';
import type { Ctx } from './state';
import type { AttackDef, ContentRegistry, GameState, Pattern, Piece, Pos, PushPreview, StrikeOption } from './types';

export interface PieceProfile {
  move: Pattern;
  attack: AttackDef;
}

/** Move pattern and attack of a hero, unit or enemy (Moth-Velvet Cloak makes a hero fly). */
export function pieceProfile(s: GameState, reg: ContentRegistry, p: Piece): PieceProfile | null {
  if (p.kind === 'hero') {
    const def = reg.heroes.byId[p.defId];
    if (!def) return null;
    const flying = p.flying || def.move.flying || (p.owner !== null && ruleValue(s, 'hero_flying', p.owner) === true);
    return { move: flying && def.move.type === 'slide' ? { ...def.move, flying: true } : def.move, attack: def.attack };
  }
  if (p.kind === 'unit') {
    const def = reg.units.byId[p.defId];
    return def ? { move: def.move, attack: def.attack } : null;
  }
  if (p.kind === 'enemy') {
    const def = reg.enemies.byId[p.defId];
    return def ? { move: def.move, attack: def.attack } : null;
  }
  return null;
}

/** Ranged / artillery reach with Charm (Lens of Brass), turn buffs and Soot Fog (min 1). */
export function strikeRange(s: GameState, reg: ContentRegistry, p: Piece, attack: AttackDef): number | null {
  if (attack.range === null) return null;
  const charmRange = p.charm ? (reg.cards.byId[p.charm.id]?.charm?.range ?? 0) : 0;
  return Math.max(1, attack.range + p.buffs.range + charmRange + ruleDelta(s, 'wickfolk_range', p.owner));
}

/** Damage of one strike instance (ATK, turn buffs, hero card bonuses, boss weaknesses). */
export function strikeDamage(s: GameState, reg: ContentRegistry, striker: Piece, victim: Piece): number {
  const profile = pieceProfile(s, reg, striker);
  const base = profile && profile.attack.damage !== 'atk' ? profile.attack.damage : striker.atk;
  let dmg = base + striker.buffs.atk;
  if (striker.kind === 'hero' && striker.owner !== null) dmg += ruleDelta(s, 'hero_strike_damage', striker.owner);
  if (victim.kind === 'boss') dmg += bossStrikeBonus(s, striker, victim);
  return Math.max(0, dmg);
}

export interface StrikePlan {
  /** The chosen tile (a footprint tile for bosses, the Plume tile, the artillery tile). */
  target: Pos;
  kind: 'melee' | 'ranged' | 'artillery';
  victimIds: string[];
  plumeId: string | null;
}

function foe(s: GameState, striker: Piece, p: Piece | null | undefined): p is Piece {
  return !!p && !p.smoldering && isEnemyOfSeat(s, striker.owner, p);
}

/** Every legal strike target of a piece from its current tile (§6.2). Ignores pips and turn. */
export function strikePlans(s: GameState, reg: ContentRegistry, striker: Piece): StrikePlan[] {
  const profile = pieceProfile(s, reg, striker);
  if (!profile || striker.smoldering) return [];
  const { attack, move } = profile;
  const q = boardQuery(s);
  const plans: StrikePlan[] = [];
  const plumeAtTile = (t: Pos) => plumeAt(s, t)?.id ?? null;
  switch (attack.kind) {
    case 'melee': {
      const pattern = attack.reach === 'as_move' || attack.reach === null ? move : attack.reach;
      for (const hit of meleeReach(q, striker.pos, pattern, { size: striker.size })) {
        if (foe(s, striker, s.pieces[hit.pieceId])) plans.push({ target: hit.pos, kind: 'melee', victimIds: [hit.pieceId], plumeId: null });
      }
      for (const t of reachablePlumes(q, striker.pos, pattern, { size: striker.size })) {
        plans.push({ target: t, kind: 'melee', victimIds: [], plumeId: plumeAtTile(t) });
      }
      break;
    }
    case 'ranged': {
      const range = strikeRange(s, reg, striker, attack);
      for (const { trace } of rangedLines(q, striker.pos, attack.dirs, range, attack.pierce ? 'pierce' : 'firstHit')) {
        const foes = trace.hits.filter((h) => foe(s, striker, s.pieces[h.pieceId]));
        if (attack.pierce && foes.length > 0) plans.push({ target: foes[0].pos, kind: 'ranged', victimIds: foes.map((h) => h.pieceId), plumeId: null });
        else if (!attack.pierce && trace.hits[0] && foes[0] === trace.hits[0]) {
          plans.push({ target: trace.hits[0].pos, kind: 'ranged', victimIds: [trace.hits[0].pieceId], plumeId: null });
        }
        for (const t of trace.plumes) plans.push({ target: t, kind: 'ranged', victimIds: [], plumeId: plumeAtTile(t) });
      }
      break;
    }
    case 'artillery': {
      const range = strikeRange(s, reg, striker, attack) ?? Math.max(s.board.w, s.board.h);
      for (const t of artilleryTiles(q, striker.pos, striker.size, attack.minRange, range)) {
        const victim = pieceAt(s, t);
        const plumeId = plumeAtTile(t);
        const victimIds = foe(s, striker, victim) ? [victim.id] : [];
        if (victimIds.length > 0 || plumeId) plans.push({ target: t, kind: 'artillery', victimIds, plumeId });
      }
      break;
    }
    case 'none':
      break;
  }
  return plans;
}

/** The plan matching a chosen tile (any footprint tile of a multi-tile target counts). */
export function findPlan(s: GameState, plans: readonly StrikePlan[], target: Pos): StrikePlan | null {
  const exact = plans.find((p) => samePos(p.target, target));
  if (exact) return exact;
  const occupant = pieceAt(s, target);
  return occupant ? (plans.find((p) => p.victimIds.length === 1 && p.victimIds[0] === occupant.id) ?? null) : null;
}

function takeAllowed(s: GameState, reg: ContentRegistry, striker: Piece, victim: Piece): boolean {
  const profile = pieceProfile(s, reg, striker);
  if (!profile || profile.attack.kind !== 'melee' || !profile.attack.take) return false;
  if (profile.move.type === 'immobile' || striker.size > 1 || victim.size > 1) return false;
  return victim.kind !== 'hero';
}

function simulateHits(victim: Piece, dmg: number, times: number): { lethal: boolean; blocked: boolean } {
  let hp = victim.hp;
  let ward = victim.ward;
  let blocked = false;
  for (let i = 0; i < times && hp > 0; i++) {
    if (ward) {
      ward = false;
      blocked = true;
    } else hp -= dmg;
  }
  return { lethal: hp <= 0, blocked };
}

function pushPreview(s: GameState, reg: ContentRegistry, striker: Piece, victim: Piece, distance: number): PushPreview | null {
  if (distance <= 0 || isDisplacementImmune(reg, victim, 'push')) return null;
  const result = pushPath(boardQuery(s), victim.pos, pushDirection(striker.pos, striker.size, victim.pos), distance);
  return {
    pieceId: victim.id,
    path: result.path,
    bump: result.bump,
    endsOnHotWax: result.path.length > 0 && tileAt(s, result.end)?.type === 'hot_wax',
  };
}

function charmPush(reg: ContentRegistry, p: Piece): number {
  const charm = p.charm ? reg.cards.byId[p.charm.id]?.charm : null;
  const op = charm?.triggers.find((t) => t.trigger === 'strike_hit' && t.op === 'push');
  return op && op.op === 'push' ? op.distance : 0;
}

/** Preview of one plan (§15.5: damage badge, skull if lethal, Take ghost, push arrows). */
export function strikeOption(s: GameState, reg: ContentRegistry, striker: Piece, plan: StrikePlan): StrikeOption {
  const profile = pieceProfile(s, reg, striker);
  const victim = plan.victimIds.length > 0 ? s.pieces[plan.victimIds[0]] : undefined;
  if (!profile || !victim) {
    return { target: plan.target, isPlume: plan.plumeId !== null, damage: 1, lethal: true, blockedByWard: false, take: null, push: null };
  }
  const dmg = strikeDamage(s, reg, striker, victim);
  const times = profile.attack.times;
  const { lethal, blocked } = simulateHits(victim, dmg, times);
  const pushDistance = profile.attack.push > 0 ? profile.attack.push : charmPush(reg, striker);
  return {
    target: plan.target,
    targetPieceId: victim.id,
    isPlume: false,
    damage: dmg * times,
    lethal,
    blockedByWard: blocked,
    take: lethal && takeAllowed(s, reg, striker, victim) ? { ...victim.pos } : null,
    push: lethal ? null : pushPreview(s, reg, striker, victim, pushDistance),
  };
}

// =============================================================================================
// Resolution
// =============================================================================================

function alive(s: GameState, p: Piece): boolean {
  return s.pieces[p.id] === p && !p.smoldering;
}

/** Flourish: a kill by Vey's own Strike grants 1 extra Strike, up to the turn's cap. */
function flourish(ctx: Ctx, striker: Piece): void {
  if (striker.owner === null || !hasTrait(ctx, striker, 'flourish')) return;
  const turn = ctx.s.players[striker.owner].turn;
  if (turn.flourishUsed >= turn.flourishCap) return;
  turn.flourishUsed += 1;
  striker.strikesLeft += 1;
  emit(ctx, { type: 'actions_granted', pieceId: striker.id, moves: 0, strikes: 1, source: 'flourish' });
  addLog(ctx, `Flourish! ${pieceName(ctx.reg, striker)} may strike again.`, striker.owner);
}

/** Mothmaker: a Minion or Soldier slain by Velveteen's Strike becomes her Velvet Moth (§8.1). */
function mothmaker(ctx: Ctx, striker: Piece, victim: Piece): void {
  const seat = striker.owner;
  if (seat === null || !hasTrait(ctx, striker, 'mothmaker') || victim.kind !== 'enemy') return;
  const rank = ctx.reg.enemies.byId[victim.defId]?.rank;
  if (rank !== 'minion' && rank !== 'soldier') return;
  if (unitLimitReached(ctx.s, seat) || !summonTileTest(ctx.s)(victim.pos)) return;
  createUnit(ctx, 'velvet_moth', seat, victim.pos, 'trait');
}

function onKill(ctx: Ctx, striker: Piece, victim: Piece): void {
  runTraitTrigger(ctx, striker, 'kill');
  flourish(ctx, striker);
  mothmaker(ctx, striker, victim);
}

function onHit(ctx: Ctx, striker: Piece, victim: Piece, attack: AttackDef): void {
  const { s } = ctx;
  if (attack.status === 'dazed') applyDaze(ctx, victim);
  if (attack.status === 'burn') applyBurn(ctx, victim);
  if (striker.kind === 'hero' && striker.owner !== null && ruleValue(s, 'hero_strike_burn', striker.owner) === true) applyBurn(ctx, victim);
  if (attack.push > 0 && alive(s, victim)) {
    pushPiece(ctx, victim, pushDirection(striker.pos, striker.size, victim.pos), attack.push, {
      displacer: striker.owner,
      credit: striker.owner,
      sourceId: striker.id,
    });
  }
  runCharmTrigger(ctx, striker, 'strike_hit', { targetId: victim.id });
}

function take(ctx: Ctx, striker: Piece, to: Pos): void {
  const from = striker.pos;
  striker.pos = { ...to };
  emit(ctx, { type: 'piece_moved', pieceId: striker.id, from, to: striker.pos, kind: 'take', path: [striker.pos] });
  addLog(ctx, `${pieceName(ctx.reg, striker)} takes ${sqName(to)}.`, striker.owner ?? undefined);
  afterMoveEnd(ctx, striker, striker.owner);
}

/** Resolve a strike (pips already checked by validation). */
export function performStrike(ctx: Ctx, striker: Piece, plan: StrikePlan): void {
  const { s, reg } = ctx;
  const profile = pieceProfile(s, reg, striker);
  if (!profile) return;
  const seat = striker.owner;
  striker.strikesLeft = Math.max(0, striker.strikesLeft - 1);
  emit(ctx, { type: 'strike', attackerId: striker.id, kind: plan.kind, from: striker.pos, target: plan.target });
  const plume = plan.plumeId ? s.plumes.find((m) => m.id === plan.plumeId) : undefined;
  if (plume) {
    addLog(ctx, `${pieceName(reg, striker)} strikes the Plume at ${sqName(plume.pos)}.`, seat ?? undefined);
    popPlume(ctx, plume, seat);
  }
  const victims = plan.victimIds
    .map((id) => s.pieces[id])
    .filter((p): p is Piece => p !== undefined)
    .sort((a, b) => compareReadingOrder(a.pos, b.pos));
  let takeTo: Pos | null = null;
  for (const victim of victims) {
    if (isOver(s)) return;
    const dmg = strikeDamage(s, reg, striker, victim);
    const victimPos = { ...victim.pos };
    addLog(ctx, `${pieceName(reg, striker)} strikes ${pieceAtText(reg, victim)} for ${dmg * profile.attack.times}.`, seat ?? undefined);
    for (let i = 0; i < profile.attack.times && alive(s, victim) && !isOver(s); i++) {
      dealDamage(ctx, victim, dmg, {
        cause: 'strike',
        sourceKind: victim.side === 'wick' ? 'rival_strike' : 'player_strike',
        sourceId: striker.id,
        seat,
      });
    }
    if (isOver(s)) return;
    if (alive(s, victim)) {
      onHit(ctx, striker, victim, profile.attack);
      continue;
    }
    onKill(ctx, striker, victim);
    if (victims.length === 1 && takeAllowed(s, reg, striker, victim) && !pieceAt(s, victimPos)) takeTo = victimPos;
  }
  if (takeTo && alive(s, striker) && !isOver(s)) take(ctx, striker, takeTo);
}

// =============================================================================================
// Movement
// =============================================================================================

/** Destinations of a piece's movement pattern (Wickfolk use Chimneys; Snuff use the Snuff range rules). */
export function moveDestinations(s: GameState, reg: ContentRegistry, p: Piece): MoveDest[] {
  const profile = pieceProfile(s, reg, p);
  if (!profile || p.smoldering || profile.move.type === 'immobile') return [];
  const q = boardQuery(s);
  if (p.side === 'wick') return patternMoves(q, p.pos, profile.move, { size: p.size, useChimneys: true });
  return patternMoves(q, p.pos, profile.move, { size: p.size, rangeDelta: ruleDelta(s, 'snuff_move_range', null) });
}
