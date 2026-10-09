/**
 * Bosses (GDD §10, §6.7, §12.4, §13.1.5, §13.2.9): choosing and spawning the boss, HP and phases,
 * the boss's Snuff Move (movement in bossMove.ts, intents in bossIntents.ts), the specials
 * (`hollow_bell`, `smothered_mate` CHECK / CHECKMATE, `devour_light`), boss death, and the hooks
 * the phase machine, combat, the reducer and previews call.
 *
 * Multi-tile rules live where they apply: footprints and distances in geometry.ts, displacement
 * and Snuff-attack immunity in combat.ts, "no Take, any footprint tile" in strike.ts.
 */
import { bossForSeed } from '../config/presets';
import { planBossIntents, bossIntentFrom, isDevourIntent } from './bossIntents';
import { moveBoss } from './bossMove';
import { dealDamage, healPiece } from './combat';
import { getContent } from './content';
import { baseEnv, runEffects } from './effects';
import type { EffectEnv } from './effects';
import { DIRS_ALL, addPos, footprint, footprintDistance, inBounds, inFootprint, sortReadingOrder, sqName } from './geometry';
import { addLog, pieceName } from './log';
import { awardBossKill, syncBossGlory } from './modes/lastFlame';
import { endVigil } from './modes/vigil';
import { streamPick } from './rng';
import { createBossPiece, placeNear, summonTileTest } from './spawn';
import { boardQuery, emit, isOver, livingPlayers, pieceList, removePiece, tileAt } from './state';
import type { Ctx } from './state';
import type { BossDef, BossPhaseDef, BossState, ContentRegistry, Dir, EffectOfOp, GameState, Piece, Pos } from './types';

// =============================================================================================
// HP and phases (§10.1)
// =============================================================================================

/**
 * P (§10.1): every Vigil seat (AI allies included); in Last Flame the heroes not eliminated at
 * the start of the Boss Night (minimum 1).
 */
export function bossPlayerCount(s: GameState): number {
  return s.config.mode === 'vigil' ? s.players.length : Math.max(1, livingPlayers(s).length);
}

/**
 * round_half_up(raw × boss_hp_multiplier). The multiplier moves in steps of 0.05, so it is applied
 * in hundredths to stay exact (35 at 1.3 = 45.5 → 46); `raw` is exact to two decimals.
 */
function scaleBossHp(raw: number, multiplier: number): number {
  const hundredths = Math.round(multiplier * 100);
  return Math.max(1, Math.floor((Math.round(raw * 100) * hundredths + 5000) / 10000));
}

/** Last Flame: round_half_up((base + perPlayer × P) × boss_hp_multiplier). */
export function bossMaxHp(def: BossDef, players: number, multiplier: number): number {
  return scaleBossHp(def.hp.base + def.hp.perPlayer * players, multiplier);
}

/** The solo HP, base + perPlayer (Vigil with one seat). */
export function bossSoloHp(def: BossDef): number {
  return def.hp.base + def.hp.perPlayer;
}

/**
 * Vigil: round_half_up(solo HP × (1 + k × (P − 1)) × boss_hp_multiplier), k =
 * `coopScaling.bossHpPerExtraSeat` (k = 1: the solo HP once per seat).
 */
export function vigilBossMaxHp(def: BossDef, seats: number, perExtraSeat: number, multiplier: number): number {
  return scaleBossHp(bossSoloHp(def) * (1 + perExtraSeat * Math.max(0, seats - 1)), multiplier);
}

/** The boss's max HP for this game's mode and P (§10.1). */
export function bossMaxHpFor(s: GameState, reg: ContentRegistry, def: BossDef, players: number): number {
  const multiplier = s.config.boss_hp_multiplier;
  return s.config.mode === 'vigil' ? vigilBossMaxHp(def, players, reg.rules.coopScaling.bossHpPerExtraSeat, multiplier) : bossMaxHp(def, players, multiplier);
}

/** `enterAt [a, b]`: the phase starts when HP ≤ ⌊max HP × a / b⌋. */
export function phaseThreshold(maxHp: number, enterAt: readonly [number, number]): number {
  return Math.floor((maxHp * enterAt[0]) / enterAt[1]);
}

/** The phase a boss at `hp` belongs in (phases never go back: a heal does not undo one). */
export function bossPhaseForHp(def: BossDef, maxHp: number, hp: number): number {
  let phase = 1;
  def.phases.forEach((p, i) => {
    if (p.enterAt && hp <= phaseThreshold(maxHp, p.enterAt)) phase = Math.max(phase, i + 1);
  });
  return phase;
}

interface ActiveBoss {
  boss: Piece;
  state: BossState;
  def: BossDef;
}

/** The boss on the board, if one stands there. */
function activeBoss(s: GameState, reg: ContentRegistry): ActiveBoss | null {
  const state = s.boss;
  const boss = state ? s.pieces[state.pieceId] : undefined;
  const def = state ? reg.bosses.byId[state.id] : undefined;
  return state && boss && def ? { boss, state, def } : null;
}

/** The boss has fallen this game (its piece is gone; `boss.killerSeat` holds the killing blow). */
export function bossFallen(s: GameState): boolean {
  return s.boss !== null && !s.pieces[s.boss.pieceId];
}

// =============================================================================================
// Spawn (§10.1, §13.1.1, §13.2.9)
// =============================================================================================

/** `boss_choice`: a boss id, or random — the Daily draws it from the seed, otherwise the `setup` stream. */
export function chooseBossId(s: GameState, reg: ContentRegistry): string {
  const choice = s.config.boss_choice;
  if (reg.bosses.byId[choice]) return choice;
  if (s.config.daily) return bossForSeed(s.seed, reg);
  return streamPick(s, 'setup', reg.bosses.list.map((b) => b.id));
}

/** The board centre anchor (f6 on 12×12, e5 on 10×10). */
function centreAnchor(s: GameState, size: number): Pos {
  return { x: Math.floor((s.board.w - size) / 2), y: Math.floor((s.board.h - size) / 2) };
}

/** Pieces on the footprint move off it by the placement routine (anchor = the footprint). */
function clearFootprint(ctx: Ctx, at: Pos, size: number): void {
  const { s, reg } = ctx;
  s.plumes = s.plumes.filter((m) => !inFootprint(m.pos, at, size));
  const blocking = pieceList(s).filter((p) => footprint(p.pos, p.size).some((t) => inFootprint(t, at, size)));
  for (const p of sortReadingOrder(blocking, (q) => q.pos)) {
    const free = summonTileTest(s);
    const legal = (t: Pos) => !inFootprint(t, at, size) && free(t);
    const to = placeNear(s, at, reg.rules.placementMaxDistance, legal, size) ?? placeNear(s, at, null, legal, size);
    if (!to) continue;
    const from = { ...p.pos };
    p.pos = to;
    emit(ctx, { type: 'piece_moved', pieceId: p.id, from, to: { ...to }, kind: 'teleport', path: [{ ...to }] });
    addLog(ctx, `${pieceName(reg, p)} is driven from ${sqName(from)} to ${sqName(to)}.`);
  }
}

/**
 * Boss Night setup: the boss rises with its anchor on the site's boss anchor (hollow_nave d6 /
 * e7; last_flame_ring f6 / e5), with HP for P players. Called before the Night's enemies and
 * Plumes are placed, so they avoid its footprint.
 */
export function spawnBoss(ctx: Ctx, anchor: Pos | null): void {
  const { s, reg } = ctx;
  const def = reg.bosses.byId[chooseBossId(s, reg)];
  if (!def) return;
  const size = def.size[0];
  const at = anchor ?? centreAnchor(s, size);
  clearFootprint(ctx, at, size);
  const players = bossPlayerCount(s);
  const maxHp = bossMaxHpFor(s, reg, def, players);
  const piece = createBossPiece(s, def, at, maxHp);
  s.boss = {
    id: def.id,
    pieceId: piece.id,
    phase: 1,
    crowns: 0,
    maxHp,
    escapes: 0,
    damageBySeat: s.players.map(() => 0),
    killerSeat: null,
    clapperSwinging: false,
    players,
    escapeDirs: [],
    hungry: false,
  };
  updateEscapes(s, piece);
  emit(ctx, { type: 'boss_spawned', bossId: def.id, pieceId: piece.id, anchor: { ...at }, maxHp });
  addLog(ctx, `${def.name}, ${def.epithet}, rises at ${sqName(at)} with ${maxHp} HP.`);
}

// =============================================================================================
// Snuff Move (§10.1, §12.4)
// =============================================================================================

/** Declare the phase's intents in listed order; a Dazed boss drops its last one (§6.5). */
function declareBossIntents(ctx: Ctx, boss: Piece, intentIds: readonly string[]): void {
  const { s, reg } = ctx;
  const plan = planBossIntents(s, reg, boss, boss.pos, intentIds);
  if (boss.dazed) {
    const dropped = plan.pop();
    boss.dazed = false;
    emit(ctx, { type: 'status_changed', pieceId: boss.id, status: 'dazed', active: false, value: 0 });
    if (dropped) addLog(ctx, `${pieceName(reg, boss)} is Dazed and loses its ${dropped.def.name}.`);
  }
  const declared: string[] = [];
  for (const { def, choice } of plan) {
    if (!choice && def.area !== 'global') continue;
    s.intents.push(bossIntentFrom(s, boss, def, choice));
    declared.push(def.name);
  }
  if (declared.length > 0) addLog(ctx, `${pieceName(reg, boss)} readies ${declared.join(', ')}.`);
}

/**
 * The intents a boss declares at a Snuff Move (§10.1): its phase's list, then in Vigil its
 * `coopIntent` k × (P − 1) more times (k = `coopScaling.bossIntentsPerExtraSeat`).
 */
export function bossTurnIntents(s: GameState, reg: ContentRegistry, def: BossDef, phase: BossPhaseDef): string[] {
  const coop = def.coopIntent;
  if (coop === null || s.config.mode !== 'vigil') return phase.intents;
  const extra = reg.rules.coopScaling.bossIntentsPerExtraSeat * (bossPlayerCount(s) - 1);
  return extra > 0 ? [...phase.intents, ...Array.from({ length: extra }, () => coop)] : phase.intents;
}

/** snuff_move, before every enemy: the boss moves, then declares every intent of its phase. */
export function bossSnuffMove(ctx: Ctx): void {
  const found = activeBoss(ctx.s, ctx.reg);
  if (!found) return;
  const { boss, state, def } = found;
  const phase = def.phases[state.phase - 1] ?? def.phases[0];
  if (!phase) return;
  const intents = bossTurnIntents(ctx.s, ctx.reg, def, phase);
  moveBoss(ctx, boss, phase.move, intents);
  if (isOver(ctx.s) || ctx.s.pieces[boss.id] !== boss) return;
  declareBossIntents(ctx, boss, intents);
}

// =============================================================================================
// Damage, phases and death
// =============================================================================================

function bossEnv(boss: Piece, def: BossDef): EffectEnv {
  return baseEnv({
    seat: null,
    self: boss,
    attackerId: boss.id,
    cause: 'intent',
    damageKind: 'snuff_attack',
    ruleSource: { kind: 'boss', id: def.id },
    defaultDuration: 'night',
    summonSource: 'boss',
  });
}

function enterPhase(ctx: Ctx, found: ActiveBoss): void {
  const { boss, state, def } = found;
  const phase = def.phases[state.phase - 1];
  if (!phase) return;
  if (def.id === 'hush_hierophant') state.clapperSwinging = true;
  emit(ctx, { type: 'boss_phase', bossId: def.id, phase: state.phase });
  addLog(ctx, `${def.name} enters phase ${state.phase}${phase.banner ? `: ${phase.banner}` : '.'}`);
  runEffects(ctx, phase.onEnter, bossEnv(boss, def));
}

/**
 * A boss took damage (`amount` = HP actually lost). Credits the seat's share and enters every
 * phase whose threshold the HP is now at or below, in order, running each `onEnter` (§10.1). A
 * killing hit enters no phase: the boss is gone.
 */
export function onBossDamaged(ctx: Ctx, boss: Piece, amount: number, seat: number | null): void {
  const found = activeBoss(ctx.s, ctx.reg);
  if (!found || found.boss !== boss) return;
  creditBossDamage(found.state, seat, amount);
  syncBossGlory(ctx);
  if (boss.hp <= 0) return;
  const target = bossPhaseForHp(found.def, found.state.maxHp, boss.hp);
  while (found.state.phase < target && !isOver(ctx.s) && ctx.s.pieces[boss.id] === boss) {
    found.state.phase += 1;
    enterPhase(ctx, found);
  }
}

function creditBossDamage(state: BossState, seat: number | null, amount: number): void {
  if (seat === null || amount <= 0 || state.damageBySeat[seat] === undefined) return;
  state.damageBySeat[seat] += amount;
}

/**
 * The boss reached 0 HP (§10.1, §13.1.5): its locked intents end, every Snuff on the board (the
 * Clapper and Plumes included) vanishes, and in Vigil the game is won at once. Last Flame plays
 * the round out (the Last Flame engineer ends the game after its Tally, §13.2.9).
 */
export function onBossDeath(ctx: Ctx, boss: Piece, killerSeat: number | null): void {
  const { s, reg } = ctx;
  for (const intent of s.intents) emit(ctx, { type: 'intent_cancelled', intentId: intent.id, reason: 'boss_died' });
  s.intents = [];
  removePiece(s, boss.id);
  const snuff = sortReadingOrder(
    pieceList(s).filter((p) => p.side === 'snuff'),
    (p) => p.pos,
  );
  for (const p of snuff) {
    removePiece(s, p.id);
    emit(ctx, { type: 'piece_died', pieceId: p.id, defId: p.defId, kind: p.kind, side: p.side, pos: p.pos, killerSeat: null, cause: 'boss_death' });
  }
  for (const plume of s.plumes) emit(ctx, { type: 'plume_popped', plumeId: plume.id, pos: plume.pos, seat: null });
  s.plumes = [];
  if (s.boss) s.boss = { ...s.boss, killerSeat, escapes: 0, escapeDirs: [], hungry: false };
  addLog(ctx, `${reg.bosses.byId[boss.defId]?.name ?? 'The boss'} falls, and the smoke goes with it.`);
  if (s.config.mode === 'vigil') endVigil(ctx, 'victory', null);
  else awardBossKill(ctx, killerSeat);
}

// =============================================================================================
// Specials: hollow_bell, smothered_mate, devour_light
// =============================================================================================

function numArg(value: number | string | boolean | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

/** Hush Hierophant `hollow_bell`: strikes (not cards) from a piece adjacent to it deal +1. Pure: previews call it. */
export function bossStrikeBonus(_s: GameState, attacker: Piece, target: Piece, reg: ContentRegistry = getContent()): number {
  const weakness = reg.bosses.byId[target.defId]?.weakness;
  if (weakness?.op !== 'custom' || weakness.id !== 'hollow_bell') return 0;
  return footprintDistance(attacker.pos, attacker.size, target.pos, target.size) === 1 ? numArg(weakness.args.bonus, 1) : 0;
}

/**
 * A step vector is open (§10.3) when every newly entered tile is on the board and not a Pillar,
 * a piece (his own Gutter Pawns, Candles and Wicks included) or Gloam. Hot Wax counts as open.
 */
export function openEscapes(s: GameState, boss: Piece): Dir[] {
  const q = boardQuery(s, { ignoreIds: [boss.id] });
  const open = (t: Pos) => inBounds(t, s.board.w, s.board.h) && q.tileAt(t)?.enterable === true && q.pieceAt(t) === null && !tileAt(s, t)?.gloam;
  return DIRS_ALL.filter((d) => footprint(addPos(boss.pos, d), boss.size).every((t) => inFootprint(t, boss.pos, boss.size) || open(t))).map((d) => ({ ...d }));
}

function updateEscapes(s: GameState, boss: Piece): Dir[] {
  const dirs = openEscapes(s, boss);
  if (s.boss) {
    s.boss.escapes = dirs.length;
    s.boss.escapeDirs = dirs;
  }
  return dirs;
}

function hasSmotheredMate(def: BossDef): boolean {
  return def.special?.op === 'custom' && def.special.id === 'smothered_mate';
}

/** Seats with a piece adjacent to the boss (they share Checkmate damage, §10.3). */
function boxingSeats(s: GameState, boss: Piece): number[] {
  const seats = pieceList(s)
    .filter((p) => p.owner !== null && !s.players[p.owner]?.eliminated && footprintDistance(p.pos, p.size, boss.pos, boss.size) === 1)
    .map((p) => p.owner as number);
  return [...new Set(seats)].sort((a, b) => a - b);
}

/**
 * CHECKMATE (§10.3): with 0 Escapes the King takes ⌈damagePct % of max HP⌉, which Ward cannot
 * stop, and a crown socket fills, at most `maxCrowns` times per fight. The damage is split
 * equally among the seats with a piece next to him (a sole seat gets the kill credit too).
 */
function checkmate(ctx: Ctx, found: ActiveBoss, args: Record<string, number | string | boolean>): void {
  const { s, reg } = ctx;
  const { boss, state } = found;
  if (updateEscapes(s, boss).length > 0) return;
  const maxCrowns = numArg(args.maxCrowns, 3);
  if (state.crowns >= maxCrowns) return;
  const hpBase = s.config.mode === 'vigil' ? vigilBossMaxHp(found.def, 1, 0, s.config.boss_hp_multiplier) : state.maxHp;
  const damage = Math.ceil((hpBase * numArg(args.damagePct, 15)) / 100);
  state.crowns += 1;
  const seats = boxingSeats(s, boss);
  const lost = Math.min(damage, boss.hp);
  const shares = seats.map((seat) => ({ seat, amount: lost / seats.length }));
  emit(ctx, { type: 'checkmate', damage, crowns: state.crowns, shares });
  addLog(ctx, `CHECKMATE! ${pieceName(reg, boss)} is boxed in and takes ${damage} (crown ${state.crowns}/${maxCrowns}).`);
  const sole = seats.length === 1 ? seats[0] : null;
  dealDamage(ctx, boss, damage, { cause: 'checkmate', sourceKind: 'hazard', sourceId: null, seat: sole, ignoreWard: true });
  if (sole !== null) return;
  for (const share of shares) {
    creditBossDamage(state, share.seat, share.amount);
    const stats = s.players[share.seat]?.stats;
    if (stats) {
      stats.bossDamage += share.amount;
      stats.damageDealt += share.amount;
    }
  }
  syncBossGlory(ctx);
}

/** End of the players phase: the Guttered King's CHECKMATE check. */
export function bossPlayersPhaseEnd(ctx: Ctx): void {
  const found = activeBoss(ctx.s, ctx.reg);
  const special = found?.def.special;
  if (found && special?.op === 'custom' && special.id === 'smothered_mate') checkmate(ctx, found, special.args);
}

function devourLight(ctx: Ctx, boss: Piece, heal: number): void {
  const healed = healPiece(ctx, boss, heal);
  if (healed > 0) addLog(ctx, `${pieceName(ctx.reg, boss)} devours the light and heals ${healed}.`);
}

/**
 * The boss-only `custom` ops when they run as effects: `devour_light` (Hunger's extra, run by
 * bossIntents.ts only when the bite put out a light or felled a piece) heals the boss;
 * `smothered_mate` runs the CHECKMATE check; `hollow_bell` is passive (`bossStrikeBonus`).
 */
export function runBossCustomOp(ctx: Ctx, op: EffectOfOp<'custom'>, env: EffectEnv): void {
  const found = activeBoss(ctx.s, ctx.reg);
  const boss = env.self?.kind === 'boss' ? env.self : (found?.boss ?? null);
  if (!boss || ctx.s.pieces[boss.id] !== boss) return;
  if (op.id === 'devour_light') devourLight(ctx, boss, numArg(op.args.heal, 3));
  else if (op.id === 'smothered_mate' && found && found.boss === boss) checkmate(ctx, found, op.args);
}

// =============================================================================================
// Watch: Escapes, CHECK and cosmetic flags (after every action)
// =============================================================================================

/**
 * Keep the boss's derived fields current (Escapes and the open escape arrows, Nocturna's
 * `hungry` glow) and announce CHECK! when the Guttered King's Escapes change to 1 or 2.
 * The reducer runs it after every action, `previewSnuffStrike` on its clone.
 */
export function refreshBossWatch(ctx: Ctx): void {
  const found = activeBoss(ctx.s, ctx.reg);
  if (!found) return;
  const { boss, state, def } = found;
  const before = state.escapes;
  const open = updateEscapes(ctx.s, boss);
  state.hungry = ctx.s.intents.some((i) => i.attackerId === boss.id && isDevourIntent(i));
  if (isOver(ctx.s) || !hasSmotheredMate(def) || open.length === before || !ctx.reg.rules.checkWarnEscapes.includes(open.length)) return;
  emit(ctx, { type: 'check', escapes: open.length });
  addLog(ctx, `CHECK! ${pieceName(ctx.reg, boss)} has ${open.length} escape${open.length === 1 ? '' : 's'} left.`);
}

// =============================================================================================
// Last Flame Glory data (§13.2.2) — paid by modes/lastFlame `syncBossGlory` / `awardBossKill`
// =============================================================================================

export interface BossGlory {
  /** Boss damage the seat dealt (Checkmate shares included). */
  damage: number;
  /** +1 per full `bossDamagePct` % (10 %) of the boss's max HP dealt. */
  damageGlory: number;
  /** +`bossKill` (2) for the killing blow, 0 otherwise. */
  killingBlow: number;
}

export function bossGlory(s: GameState, seat: number, reg: ContentRegistry = getContent()): BossGlory {
  const state = s.boss;
  if (!state) return { damage: 0, damageGlory: 0, killingBlow: 0 };
  const damage = state.damageBySeat[seat] ?? 0;
  const step = state.maxHp * reg.rules.glory.bossDamagePct;
  const damageGlory = Math.floor((damage * 100) / step + 1e-9);
  return { damage, damageGlory, killingBlow: bossFallen(s) && state.killerSeat === seat ? reg.rules.glory.bossKill : 0 };
}
