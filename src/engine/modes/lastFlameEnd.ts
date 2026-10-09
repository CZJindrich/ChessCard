/**
 * The end of a Last Flame game (GDD §13.2.9) and its podium.
 *
 * The game ends at Tally step 9 ("end-of-round checks") at the first of: the round in which the
 * boss fell, the last boss round, or one or no heroes still standing (any Night). A seat that
 * concedes is eliminated; when no human seat is left in the game it ends at once.
 *
 * Final score = Glory + 5 for a hero still standing (awarded as `survival` Glory). Placement is
 * by score; ties go to still standing, then the later elimination band, then boss damage dealt,
 * then a shared placement.
 */
import { addLog } from '../log';
import { emit, livingPlayers } from '../state';
import type { Ctx } from '../state';
import type { GameResult, GameState, Standing } from '../types';
import { bossFallen } from '../bosses';
import { eliminatePlayer } from './falls';
import { awardGlory, bandScope, emptyGloryBreakdown, lastFlameOf } from './lastFlame';

export type LastFlameEndReason = Extract<GameResult, { mode: 'last_flame' }>['reason'];

/** Why the game ends at this Tally's end-of-round checks, or null to play on. */
export function lastFlameEndReason(s: GameState): LastFlameEndReason | null {
  if (!lastFlameOf(s)) return null;
  if (s.isBossNight && bossFallen(s)) return 'boss_fell';
  if (livingPlayers(s).length <= 1) return 'last_standing';
  if (s.isBossNight && s.roundsThisNight !== null && s.round >= s.roundsThisNight) return 'boss_rounds';
  return null;
}

/** Tally step 9: Last Flame boss rounds and standing heroes. */
export function tallyEndOfRoundChecks(ctx: Ctx): void {
  const reason = lastFlameEndReason(ctx.s);
  if (reason) endLastFlameGame(ctx, reason);
}

/** Negative when `a` was eliminated in a later band than `b` (both eliminated). */
function laterBand(a: Standing, b: Standing): number {
  if (a.alive || b.alive) return 0;
  return (b.eliminationBand ?? 0) - (a.eliminationBand ?? 0);
}

/** Negative when `a` places ahead of `b`: score, still standing, later band, boss damage dealt. */
export function compareStandings(a: Standing, b: Standing): number {
  return b.score - a.score || Number(b.alive) - Number(a.alive) || laterBand(a, b) || b.bossDamage - a.bossDamage;
}

/**
 * Standings now: score = Glory (the survival bonus included once awarded at the end), with the
 * full Glory breakdown. Placement 1 = best; tied seats share a placement (1, 1, 3).
 */
export function lastFlameStandings(s: GameState): Standing[] {
  const lf = lastFlameOf(s);
  const standings: Standing[] = s.players.map((p) => {
    const breakdown = { ...emptyGloryBreakdown(), ...(lf?.gloryBySeat[p.seat] ?? {}) };
    return {
      seat: p.seat,
      placement: 0,
      score: p.glory,
      glory: p.glory - breakdown.survival,
      standingBonus: breakdown.survival,
      alive: !p.eliminated,
      eliminationBand: p.eliminationBand,
      bossDamage: s.boss?.damageBySeat[p.seat] ?? 0,
      breakdown,
    };
  });
  for (const st of standings) st.placement = 1 + standings.filter((o) => compareStandings(o, st) < 0).length;
  return standings;
}

/** End the game: +5 Glory to every hero still standing, then the podium (§13.2.9). */
export function endLastFlameGame(ctx: Ctx, reason: LastFlameEndReason): void {
  const { s, reg } = ctx;
  if (s.result || !lastFlameOf(s)) return;
  for (const player of livingPlayers(s)) awardGlory(ctx, player.seat, reg.rules.glory.survival, 'survival');
  const standings = lastFlameStandings(s);
  const result: GameResult = { mode: 'last_flame', reason, standings };
  s.result = result;
  s.phase = 'game_over';
  s.activeSeat = null;
  for (const player of s.players) player.haunt.pending = false;
  const winners = standings.filter((st) => st.placement === 1).map((st) => s.players[st.seat].name);
  addLog(ctx, `The Last Flame burns for ${winners.join(' and ')}.`);
  emit(ctx, { type: 'phase_changed', phase: 'game_over', night: s.night, round: s.round });
  emit(ctx, { type: 'game_over', result });
}

/**
 * Concede (Last Flame): the seat leaves the game at once (its own band, Glory kept). When no
 * human seat is left in the game, the game ends now.
 */
export function concedeLastFlame(ctx: Ctx, seat: number): void {
  const { s } = ctx;
  const player = s.players[seat];
  if (!player || player.eliminated) return;
  addLog(ctx, `${player.name} concedes.`, seat);
  bandScope(ctx, () => eliminatePlayer(ctx, seat, 'melt', null));
  if (!s.players.some((p) => p.kind === 'human' && !p.eliminated)) endLastFlameGame(ctx, 'conceded');
}
