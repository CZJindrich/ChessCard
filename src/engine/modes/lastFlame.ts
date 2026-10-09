/**
 * Last Flame (GDD §13.2). E1b ships the parts the shared core needs (turn order, First Light,
 * Snuff-kill Glory, neutral counts); the named hooks below are where the Last Flame engineer
 * adds the Gloam, respawn/elimination, Bounty, Haunting and the end of the game.
 */
import { addLog } from '../log';
import { emit, livingPlayers } from '../state';
import type { Ctx } from '../state';
import type { GameResult, GameState, GloryReason, Piece, Standing } from '../types';

export function awardGlory(ctx: Ctx, seat: number, amount: number, reason: GloryReason): void {
  const player = ctx.s.players[seat];
  if (!player || ctx.s.config.mode !== 'last_flame' || amount === 0) return;
  const from = player.glory;
  player.glory = Math.max(0, from + amount);
  if (player.glory !== from) emit(ctx, { type: 'glory_changed', seat, from, to: player.glory, reason });
}

/** Glory for killing a Snuff: its rank value (§13.2.2). */
export function gloryForSnuffKill(ctx: Ctx, victim: Piece, seat: number | null): void {
  if (seat === null || ctx.s.config.mode !== 'last_flame') return;
  const def = ctx.reg.enemies.byId[victim.defId];
  if (def) awardGlory(ctx, seat, def.glory, 'snuff_kill');
}

/** A Last Flame hero fell: −2 Glory now; respawn or elimination is the Last Flame engineer's hook. */
export function onHeroFellLastFlame(ctx: Ctx, hero: Piece): void {
  if (hero.owner !== null) awardGlory(ctx, hero.owner, ctx.reg.rules.glory.heroFalls, 'hero_fell');
}

/** Tally step 1: the Gloam closes (hook). */
export function tallyGloamClose(_ctx: Ctx): void {}

/** Tally step 5: Gloam damage (hook). */
export function tallyGloamDamage(_ctx: Ctx): void {}

/** Tally step 9: boss rounds and standing heroes (hook). */
export function tallyEndOfRoundChecks(_ctx: Ctx): void {}

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
    s.firstLight = seat;
    emit(ctx, { type: 'first_light_passed', seat });
    addLog(ctx, `First Light passes to ${s.players[seat].name}.`);
    return;
  }
}

/** Living heroes (L, §13.2.1). */
export function livingHeroCount(s: GameState): number {
  return livingPlayers(s).length;
}

/** Neutral Plumes per placement (§13.2.5). */
export function neutralPlumeCount(s: GameState, blackSunDelta: number): number {
  if (s.config.neutrals === 'off') return 0;
  const base = Math.max(1, livingHeroCount(s) - 1 + s.config.plumes_mod);
  return base + (s.config.neutrals === 'swarm' ? 1 : 0) + blackSunDelta;
}

/** Initial neutral enemies on a regular Night (§13.2.1). */
export function neutralEnemyCount(s: GameState): number {
  if (s.config.neutrals === 'off' || s.isBossNight) return 0;
  return Math.max(0, livingHeroCount(s) + s.config.initial_enemies_mod);
}

/**
 * End the Last Flame game (§13.2.9). Minimal scoring until the Last Flame engineer lands:
 * score = Glory + the survival bonus for a standing hero; equal scores share a placement.
 */
export function endLastFlameGame(ctx: Ctx, reason: Extract<GameResult, { mode: 'last_flame' }>['reason']): void {
  const { s, reg } = ctx;
  const standings: Standing[] = s.players.map((p) => {
    const alive = !p.eliminated;
    const bonus = alive ? reg.rules.glory.survival : 0;
    return {
      seat: p.seat,
      placement: 0,
      score: p.glory + bonus,
      glory: p.glory,
      standingBonus: bonus,
      alive,
      eliminationBand: p.eliminationBand,
      bossDamage: p.stats.bossDamage,
      breakdown: { snuff_kill: 0, rival_unit: 0, rival_hero: 0, bounty: 0, shrine: 0, boss_damage: 0, boss_kill: 0, survival: bonus, hero_fell: 0 },
    };
  });
  for (const st of standings) st.placement = 1 + standings.filter((o) => o.score > st.score).length;
  const result: GameResult = { mode: 'last_flame', reason, standings };
  s.result = result;
  s.phase = 'game_over';
  s.activeSeat = null;
  emit(ctx, { type: 'phase_changed', phase: 'game_over', night: s.night, round: s.round });
  emit(ctx, { type: 'game_over', result });
}
