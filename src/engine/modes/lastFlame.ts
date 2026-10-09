/**
 * Last Flame core (GDD §13.2): the truce, Glory (with its per-reason breakdown and the sole
 * leader), kill Glory and the Bounty, boss Glory, turn order and First Light, neutral counts,
 * the kill-credit clock and elimination bands.
 *
 * The rest of the mode lives next to it: the Gloam in `gloam.ts`, falling, respawn and
 * elimination in `falls.ts`, Haunting in `haunt.ts`, the end of the game in `lastFlameEnd.ts`.
 * `isTruceActive` stays here: other modules (and tests mocking it) import it from this file.
 */
import { bossGlory } from '../bosses';
import { addLog } from '../log';
import { emit, livingPlayers } from '../state';
import type { Ctx } from '../state';
import type { GameConfig, GameState, GloryReason, LastFlameState, Piece } from '../types';

export const GLORY_REASONS: readonly GloryReason[] = [
  'snuff_kill',
  'rival_unit',
  'rival_hero',
  'bounty',
  'shrine',
  'boss_damage',
  'boss_kill',
  'survival',
  'hero_fell',
  'effect',
];

export function emptyGloryBreakdown(): Record<GloryReason, number> {
  const out = {} as Record<GloryReason, number>;
  for (const reason of GLORY_REASONS) out[reason] = 0;
  return out;
}

/** The Last Flame state of a Last Flame game (null in Vigil). */
export function lastFlameOf(s: GameState): LastFlameState | null {
  return s.config.mode === 'last_flame' ? s.lastFlame : null;
}

// =============================================================================================
// Truce (§13.2.3)
// =============================================================================================

/** Is Night `night` a truce Night? Never the Boss Night (the last Night). */
export function truceForNight(config: Pick<GameConfig, 'mode' | 'truce' | 'nights'>, night: number): boolean {
  if (config.mode !== 'last_flame' || night >= config.nights) return false;
  if (config.truce === 'night_1') return night === 1;
  if (config.truce === 'nights_1_2') return night <= 2;
  return false;
}

/**
 * A truce is in force: rival pieces cannot be targeted, damaged, pushed, pulled, swapped, Dazed,
 * Burned or bumped by a player, area effects skip them, and Snuff redirected onto them earn no
 * Glory or Bounty. Night setup keeps `lastFlame.truce` current.
 */
export function isTruceActive(s: GameState): boolean {
  return lastFlameOf(s)?.truce === true;
}

// =============================================================================================
// Glory (§13.2.2) and the Bounty (§13.2.4)
// =============================================================================================

/** The seat holding strictly the most Glory (eliminated seats count), or null on a tie. */
export function gloryLeader(s: GameState): number | null {
  let leader: number | null = null;
  let best = -Infinity;
  let tied = false;
  for (const p of s.players) {
    if (p.glory > best) {
      best = p.glory;
      leader = p.seat;
      tied = false;
    } else if (p.glory === best) tied = true;
  }
  return tied ? null : leader;
}

/**
 * Change a seat's Glory (never below 0). The breakdown records the change actually made, so a
 * seat's breakdown always sums to its Glory; the Wanted seal (leader) follows every change.
 */
export function awardGlory(ctx: Ctx, seat: number, amount: number, reason: GloryReason): void {
  const lf = lastFlameOf(ctx.s);
  const player = ctx.s.players[seat];
  if (!lf || !player || amount === 0) return;
  const from = player.glory;
  const to = Math.max(0, from + amount);
  if (to === from) return;
  player.glory = to;
  const breakdown = (lf.gloryBySeat[seat] ??= emptyGloryBreakdown());
  breakdown[reason] += to - from;
  lf.leader = gloryLeader(ctx.s);
  emit(ctx, { type: 'glory_changed', seat, from, to, reason });
}

/** Glory for killing a Snuff: its rank value (§9.1). A Snuff kill counts during a truce too. */
export function gloryForSnuffKill(ctx: Ctx, victim: Piece, seat: number | null): void {
  if (seat === null || !lastFlameOf(ctx.s)) return;
  const def = ctx.reg.enemies.byId[victim.defId];
  if (def) awardGlory(ctx, seat, def.glory, 'snuff_kill');
}

/** A seat other than the owner is credited, and no truce holds: rival Glory is due. */
function rivalCredit(s: GameState, owner: number | null, seat: number | null): seat is number {
  return seat !== null && owner !== null && seat !== owner && s.players[seat] !== undefined && !isTruceActive(s);
}

/** A rival's unit melted under `seat`'s credit: +1 (§13.2.2). */
export function gloryForRivalUnit(ctx: Ctx, unit: Piece, seat: number | null): void {
  if (!lastFlameOf(ctx.s) || !rivalCredit(ctx.s, unit.owner, seat)) return;
  awardGlory(ctx, seat, ctx.reg.rules.glory.rivalUnit, 'rival_unit');
}

/** The Bounty is due on a fallen hero of `owner`: Bounty on, `owner` was the sole leader, unpaid this Night. */
function bountyDue(s: GameState, lf: LastFlameState, owner: number, leaderBefore: number | null): boolean {
  if (!s.config.bounty || leaderBefore !== owner) return false;
  return !lf.bountiesPaid.some((b) => b.victimSeat === owner && b.night === s.night);
}

/**
 * A hero fell (§13.2.2, §13.2.4). The leader is fixed before this fall's Glory: a credited rival
 * (not during a truce) gains +3, plus the +3 Bounty when the victim's owner was the sole leader
 * (once per victim per Night). Then the owner loses 2 (not below 0), whatever the cause.
 */
export function onHeroFellLastFlame(ctx: Ctx, hero: Piece, seat: number | null): void {
  const { s, reg } = ctx;
  const lf = lastFlameOf(s);
  const owner = hero.owner;
  if (!lf || owner === null) return;
  if (rivalCredit(s, owner, seat)) {
    const leaderBefore = gloryLeader(s);
    awardGlory(ctx, seat, reg.rules.glory.rivalHero, 'rival_hero');
    if (bountyDue(s, lf, owner, leaderBefore)) {
      lf.bountiesPaid.push({ victimSeat: owner, night: s.night });
      awardGlory(ctx, seat, reg.rules.glory.bounty, 'bounty');
      addLog(ctx, `${s.players[seat].name} claims the Bounty on ${s.players[owner].name}.`, seat);
    }
  }
  awardGlory(ctx, owner, reg.rules.glory.heroFalls, 'hero_fell');
}

/** Boss damage Glory (+1 per full 10% of max HP dealt, Checkmate shares included), paid as it accrues. */
export function syncBossGlory(ctx: Ctx): void {
  const lf = lastFlameOf(ctx.s);
  if (!lf || !ctx.s.boss) return;
  for (const player of ctx.s.players) {
    const due = bossGlory(ctx.s, player.seat, ctx.reg).damageGlory;
    const paid = lf.gloryBySeat[player.seat]?.boss_damage ?? 0;
    if (due > paid) awardGlory(ctx, player.seat, due - paid, 'boss_damage');
  }
}

/** The boss's killing blow: +2 (§13.2.2). */
export function awardBossKill(ctx: Ctx, seat: number | null): void {
  if (seat === null || !lastFlameOf(ctx.s)) return;
  awardGlory(ctx, seat, ctx.reg.rules.glory.bossKill, 'boss_kill');
}

// =============================================================================================
// Kill credit clock (§6.3) and elimination bands (§13.2.6)
// =============================================================================================

/** The next tick of the kill-credit clock (≥ 1), or 0 outside Last Flame (Vigil keeps the fixed priority). */
export function creditTick(s: GameState): number {
  const lf = lastFlameOf(s);
  if (!lf) return 0;
  lf.creditClock += 1;
  return lf.creditClock;
}

/** Run `fn` as one elimination-band scope (a nested call joins the open one). */
export function bandScope<T>(ctx: Ctx, fn: () => T): T {
  if (ctx.band) return fn();
  ctx.band = { value: null };
  try {
    return fn();
  } finally {
    ctx.band = undefined;
  }
}

/** The band for an elimination now: the open scope's (allocated on first use), else a fresh one. */
export function eliminationBand(ctx: Ctx): number {
  const lf = lastFlameOf(ctx.s);
  if (!lf) return 0;
  const allocate = (): number => lf.nextBand++;
  if (!ctx.band) return allocate();
  ctx.band.value ??= allocate();
  return ctx.band.value;
}

// =============================================================================================
// Turn order and First Light (§11.2)
// =============================================================================================

/** Seats in clockwise order from the First Light holder, skipping the eliminated. */
export function clockwiseFromFirstLight(s: GameState): number[] {
  const n = s.players.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const seat = (s.firstLight + i) % n;
    if (!s.players[seat].eliminated) order.push(seat);
  }
  return order;
}

/** First Light passes clockwise to the next seat still in the game. */
export function passFirstLight(ctx: Ctx): void {
  const { s } = ctx;
  const n = s.players.length;
  if (n <= 1) return;
  for (let i = 1; i <= n; i++) {
    const seat = (s.firstLight + i) % n;
    if (s.players[seat].eliminated) continue;
    if (seat === s.firstLight) return;
    s.firstLight = seat;
    emit(ctx, { type: 'first_light_passed', seat });
    addLog(ctx, `First Light passes to ${s.players[seat].name}.`);
    return;
  }
}

// =============================================================================================
// Neutrals (§13.2.1, §13.2.5)
// =============================================================================================

/** Living heroes (L): seats still in the game. */
export function livingHeroCount(s: GameState): number {
  return livingPlayers(s).length;
}

/** Neutral Plumes per placement: max(1, L − 1 + plumes_mod), +1 with `swarm`, + Black Sun. */
export function neutralPlumeCount(s: GameState, blackSunDelta: number): number {
  if (s.config.neutrals === 'off') return 0;
  const base = Math.max(1, livingHeroCount(s) - 1 + s.config.plumes_mod);
  return base + (s.config.neutrals === 'swarm' ? 1 : 0) + blackSunDelta;
}

/** Initial neutral enemies on a regular Night: L + initial_enemies_mod (minimum 0); none on the Boss Night. */
export function neutralEnemyCount(s: GameState): number {
  if (s.config.neutrals === 'off' || s.isBossNight) return 0;
  return Math.max(0, livingHeroCount(s) + s.config.initial_enemies_mod);
}
