/**
 * Falling, respawn and elimination in Last Flame (GDD §13.2.6).
 *
 * - Before the Boss Night, with `respawn_before_boss` on, a fallen hero stays as a Smoldering
 *   Wick. At the start of its owner's next seat turn the Wick is removed and the hero reappears
 *   on its start tile (or by the placement routine, no distance cap, outside the Gloam) with
 *   ⌈max HP/2⌉ HP, Ready. A Wick the Gloam covers first means elimination.
 * - On the Boss Night, or with the option off, a fallen hero is eliminated at once: the hero
 *   leaves the board, its units melt and Charms return to their discard piles.
 * - Eliminations inside one player action, one intent or one Tally step share a band.
 */
import { returnCharm } from '../charms';
import { dismissUnit, halfMaxHp, relightHero } from '../combat';
import { isOpenTile, samePos, sqName } from '../geometry';
import { addLog, pieceName } from '../log';
import { placeNear } from '../spawn';
import { boardQuery, emit, heroOf, isOver, plumeAt, removePiece, tileAt, unitsOf } from '../state';
import type { Ctx } from '../state';
import type { DeathCause, GameState, Piece, Pos } from '../types';
import { eliminationBand, lastFlameOf } from './lastFlame';

/** A fallen hero is eliminated at once (Boss Night, or `respawn_before_boss` off). */
export function eliminatedOnFall(s: GameState): boolean {
  return s.isBossNight || !s.config.respawn_before_boss;
}

/**
 * Remove a seat from the game: the hero (Wick or standing) leaves the board with its Charm
 * returned, its units melt, and it joins the band of this effect.
 */
export function eliminatePlayer(ctx: Ctx, seat: number, cause: DeathCause, killerSeat: number | null): void {
  const { s, reg } = ctx;
  const player = s.players[seat];
  if (!lastFlameOf(s) || !player || player.eliminated) return;
  const band = eliminationBand(ctx);
  player.eliminated = true;
  player.eliminationBand = band;
  player.eliminatedAt = { night: s.night, round: s.round };
  player.turnEnded = true;
  player.haunt.pending = false;
  const hero = heroOf(s, seat);
  if (hero) {
    returnCharm(ctx, hero);
    removePiece(s, hero.id);
    emit(ctx, { type: 'piece_died', pieceId: hero.id, defId: hero.defId, kind: hero.kind, side: hero.side, pos: hero.pos, killerSeat, cause });
  }
  for (const unit of unitsOf(s, seat).sort((a, b) => a.summonOrder - b.summonOrder)) dismissUnit(ctx, unit, 'melt');
  emit(ctx, { type: 'player_eliminated', seat, band });
  addLog(ctx, `${player.name} is eliminated${hero ? ` (${pieceName(reg, hero)} at ${sqName(hero.pos)})` : ''}.`, seat);
}

/**
 * After a hero's fatal hit has fully resolved (Riposte included): a Wick in the Gloam, or any
 * fall on the Boss Night or without respawn, eliminates its seat at once.
 */
export function settleFallenHero(ctx: Ctx, hero: Piece, cause: DeathCause, killerSeat: number | null): void {
  const { s } = ctx;
  if (!lastFlameOf(s) || isOver(s) || hero.owner === null || s.pieces[hero.id] !== hero || !hero.smoldering) return;
  if (tileAt(s, hero.pos)?.gloam) eliminatePlayer(ctx, hero.owner, 'gloam_wick', killerSeat);
  else if (eliminatedOnFall(s)) eliminatePlayer(ctx, hero.owner, cause, killerSeat);
  else addLog(ctx, `${pieceName(ctx.reg, hero)} will rise again at the start of ${s.players[hero.owner].name}'s next turn.`, hero.owner);
}

/** Where a hero respawns: its start tile when open, else the nearest open tile (no cap, outside the Gloam). */
function respawnTile(s: GameState, hero: Piece, start: Pos): Pos | null {
  const q = boardQuery(s, { ignoreIds: [hero.id] });
  const legal = (p: Pos): boolean => isOpenTile(q, p) && !plumeAt(s, p) && tileAt(s, p)?.gloam !== true;
  return legal(start) ? start : placeNear(s, start, null, legal);
}

/**
 * Seat-turn start: a Smoldering hero's Wick is removed and the hero reappears with ⌈max HP/2⌉
 * HP (its Charm returns: the Wick left play). The seat turn then readies it.
 */
export function respawnAtTurnStart(ctx: Ctx, seat: number): void {
  const { s } = ctx;
  const player = s.players[seat];
  const hero = heroOf(s, seat);
  if (!lastFlameOf(s) || !player || player.eliminated || !hero || !hero.smoldering) return;
  const start = player.startTile ?? hero.pos;
  const to = respawnTile(s, hero, start);
  if (!to) return;
  returnCharm(ctx, hero);
  const from = { ...hero.pos };
  hero.pos = { ...to };
  if (!samePos(from, to)) emit(ctx, { type: 'piece_moved', pieceId: hero.id, from, to: { ...to }, kind: 'respawn', path: [{ ...to }] });
  relightHero(ctx, hero, halfMaxHp(hero), 'respawn', false);
}
