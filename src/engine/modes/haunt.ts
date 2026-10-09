/**
 * Haunting (GDD §13.2.7). With `haunting` on, every eliminated player places one Sootling Plume
 * at each Plume placement (night_setup and Tally step 10), or skips (`at: null`; online the
 * 15 s timer skips for them). The tile must be a legal Plume tile (§9.4). The haunted hero is
 * the hero nearest the Plume (ties: seat order from the First Light holder); a player cannot
 * haunt the same hero twice in a row, and a hero receives at most 1 Haunt Plume per round.
 * Bots haunt the Glory leader.
 *
 * While any seat owes a placement (`haunt.pending`) the phase waits: `pendingAutomation` is null
 * and `activeSeats` lists the haunters.
 */
import { chebyshev, compareReadingOrder, sqName } from '../geometry';
import { addLog, pieceName } from '../log';
import { createPlume, isLegalPlumeTile } from '../snuff';
import { heroPieces } from '../state';
import type { Ctx } from '../state';
import { fail, OK } from '../validation';
import type { ActionOf, ContentRegistry, GameState, Piece, Pos, Validation } from '../types';
import { clockwiseFromFirstLight, lastFlameOf } from './lastFlame';

export const HAUNT_ENEMY = 'sootling';

export interface HauntOption {
  pos: Pos;
  /** The hero this Plume would haunt. */
  heroId: string;
}

/** Haunting is played this game: Last Flame, `haunting` on, Plumes on (neutrals not off). */
export function hauntingOn(s: GameState): boolean {
  return lastFlameOf(s) !== null && s.config.haunting && s.config.neutrals !== 'off';
}

/** Seat order from the First Light holder, eliminated seats included (haunted-hero ties). */
function seatRank(s: GameState): (seat: number | null) => number {
  const n = s.players.length;
  return (seat) => (seat === null ? n : (seat - s.firstLight + n) % n);
}

/** The hero a Plume on `p` would haunt: the nearest hero, ties by seat order from First Light. */
export function hauntedHeroAt(s: GameState, p: Pos): Piece | null {
  const rank = seatRank(s);
  const heroes = heroPieces(s).filter((h) => h.owner !== null && !s.players[h.owner]?.eliminated);
  heroes.sort((a, b) => chebyshev(a.pos, p) - chebyshev(b.pos, p) || rank(a.owner) - rank(b.owner));
  return heroes[0] ?? null;
}

/** Why `seat` may not haunt `hero` now (HAUNT_REPEAT / HAUNT_LIMIT), or null. */
function hauntBlock(s: GameState, seat: number, hero: Piece): 'HAUNT_REPEAT' | 'HAUNT_LIMIT' | null {
  if (s.players[seat]?.haunt.lastHeroId === hero.id) return 'HAUNT_REPEAT';
  if (hero.hauntedThisRound) return 'HAUNT_LIMIT';
  return null;
}

/** Every tile `seat` may haunt now, with the hero each would haunt (reading order). */
export function hauntOptions(s: GameState, seat: number, reg: ContentRegistry): HauntOption[] {
  if (!hauntingOn(s) || !s.players[seat]?.eliminated) return [];
  const out: HauntOption[] = [];
  for (let y = s.board.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.board.w; x++) {
      const pos = { x, y };
      if (!isLegalPlumeTile(s, reg, pos)) continue;
      const hero = hauntedHeroAt(s, pos);
      if (hero && hauntBlock(s, seat, hero) === null) out.push({ pos, heroId: hero.id });
    }
  }
  return out;
}

export function hauntsPending(s: GameState): boolean {
  return s.players.some((p) => p.haunt.pending);
}

export function hauntingSeats(s: GameState): number[] {
  return s.players.filter((p) => p.haunt.pending).map((p) => p.seat);
}

/** A Plume placement happened: every eliminated seat with a legal tile now owes a Haunt (§13.2.7). */
export function requestHaunts(ctx: Ctx): void {
  const { s, reg } = ctx;
  if (!hauntingOn(s)) return;
  for (const player of s.players) {
    if (!player.eliminated) continue;
    const hasTile = hauntOptions(s, player.seat, reg).length > 0;
    player.haunt.pending = hasTile;
    if (!hasTile) addLog(ctx, `${player.name} finds nowhere to haunt.`, player.seat);
  }
}

export function validateHaunt(s: GameState, reg: ContentRegistry, a: ActionOf<'haunt'>): Validation {
  if (!hauntingOn(s)) return fail('NOT_ENABLED', { feature: 'Haunting' });
  if (s.phase !== 'night_setup' && s.phase !== 'tally') return fail('WRONG_PHASE');
  const player = s.players[a.seat];
  if (!player || !player.eliminated || !player.haunt.pending) return fail('INVALID_ACTION');
  if (a.at === null) return OK;
  if (!isLegalPlumeTile(s, reg, a.at)) return fail('INVALID_TARGET');
  const hero = hauntedHeroAt(s, a.at);
  if (!hero) return fail('INVALID_TARGET');
  const blocked = hauntBlock(s, a.seat, hero);
  return blocked ? fail(blocked) : OK;
}

/** Place the Haunt Plume (a Sootling) or skip it. */
export function applyHaunt(ctx: Ctx, a: ActionOf<'haunt'>): void {
  const { s, reg } = ctx;
  const player = s.players[a.seat];
  player.haunt.pending = false;
  if (a.at === null) {
    addLog(ctx, `${player.name} lets the haunting pass.`, a.seat);
    return;
  }
  const hero = hauntedHeroAt(s, a.at);
  if (!hero) return;
  const plume = createPlume(ctx, a.at, HAUNT_ENEMY, 'haunt');
  plume.hauntSeat = a.seat;
  plume.hauntedHeroId = hero.id;
  hero.hauntedThisRound = true;
  player.haunt.lastHeroId = hero.id;
  addLog(ctx, `${player.name} haunts ${pieceName(reg, hero)}: a Plume coils at ${sqName(a.at)}.`, a.seat);
}

/** Living seats by Glory, highest first (ties: seat order from First Light): whom a bot haunts. */
function hauntTargetsByGlory(s: GameState): number[] {
  const order = clockwiseFromFirstLight(s);
  return order.slice().sort((a, b) => s.players[b].glory - s.players[a].glory || order.indexOf(a) - order.indexOf(b));
}

/**
 * The bot's Haunt (§12.5 heuristics): the tile that haunts the Glory leader's hero from closest,
 * ties in reading order; else the next-highest Glory seat; null (skip) when nothing is legal.
 */
export function botHauntTile(s: GameState, seat: number, reg: ContentRegistry): Pos | null {
  const options = hauntOptions(s, seat, reg);
  for (const target of hauntTargetsByGlory(s)) {
    const hero = s.pieces[s.players[target].heroPieceId];
    if (!hero) continue;
    const mine = options.filter((o) => o.heroId === hero.id);
    mine.sort((a, b) => chebyshev(a.pos, hero.pos) - chebyshev(b.pos, hero.pos) || compareReadingOrder(a.pos, b.pos));
    if (mine[0]) return mine[0].pos;
  }
  return null;
}
