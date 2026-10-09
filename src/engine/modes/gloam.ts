/**
 * The Gloam (GDD §13.2.8, §5.4): the smoke ring that closes ring by ring on the schedule from
 * `config/resolve` `gloamSchedule` (the §13.2.8 table). A closing is applied at step 1 of its
 * Tally and announced as `gloam_warning` from the start of that round; Wickfolk ending a Tally
 * in the Gloam take 2 damage that Ward cannot stop (step 5). The Gloam Bell counts the rounds
 * to the next closing.
 */
import { dealDamage, isImmune, vanishPiece } from '../combat';
import { footprint, ringTiles, sortReadingOrder, sqName } from '../geometry';
import { addLog, pieceName } from '../log';
import { putOutShrine } from '../snuff';
import { emit, pieceList, tileAt } from '../state';
import type { Ctx } from '../state';
import type { GameState, GloamClosing, Piece, Pos } from '../types';
import { eliminatePlayer } from './falls';
import { lastFlameOf } from './lastFlame';

export function inGloam(s: GameState, p: Pos): boolean {
  return tileAt(s, p)?.gloam === true;
}

/** Any tile of the piece's footprint lies in the Gloam. */
export function pieceInGloam(s: GameState, p: Piece): boolean {
  return footprint(p.pos, p.size).some((t) => inGloam(s, t));
}

/** The next closing still to come, or null. */
export function nextClosing(s: GameState): GloamClosing | null {
  const gloam = lastFlameOf(s)?.gloam;
  return gloam ? (gloam.schedule[gloam.closingsDone] ?? null) : null;
}

function roundsInNight(s: GameState, night: number): number {
  return night >= s.config.nights ? s.config.boss_rounds : s.config.turns_per_night;
}

/** Rounds since the game began, night_setup of Night n being "round 0" of that Night. */
function absoluteRound(s: GameState, night: number, round: number): number {
  let total = round;
  for (let n = 1; n < night; n++) total += roundsInNight(s, n);
  return total;
}

/** Gloam Bell: rounds from now to the round whose Tally applies the next closing (null: none left). */
export function roundsToNextClosing(s: GameState): number | null {
  const next = nextClosing(s);
  if (!next) return null;
  return Math.max(0, absoluteRound(s, next.night, next.round) - absoluteRound(s, s.night, s.round));
}

export function refreshGloamBell(s: GameState): void {
  const lf = lastFlameOf(s);
  if (lf) lf.gloam.roundsToNext = roundsToNextClosing(s);
}

/** The closing due at this round's Tally (its Night and round reached), or null. */
function closingDueNow(s: GameState): GloamClosing | null {
  const next = nextClosing(s);
  if (!next) return null;
  return s.night > next.night || (s.night === next.night && s.round >= next.round) ? next : null;
}

function setWarning(s: GameState, ring: number | null): void {
  const lf = lastFlameOf(s);
  if (!lf) return;
  lf.gloam.warningRing = ring;
  for (const tile of s.board.tiles) tile.gloamWarning = false;
  if (ring === null) return;
  for (const p of ringTiles(ring, s.board.w, s.board.h)) {
    const tile = tileAt(s, p);
    if (tile && !tile.gloam) tile.gloamWarning = true;
  }
}

/** Round start: show `gloam_warning` on the ring that closes at this round's Tally; ring the Bell. */
export function startRoundGloam(ctx: Ctx): void {
  const { s } = ctx;
  if (!lastFlameOf(s)) return;
  const due = closingDueNow(s);
  setWarning(s, due ? due.ring : null);
  refreshGloamBell(s);
  if (!due) return;
  emit(ctx, { type: 'gloam_warning', ring: due.ring });
  addLog(ctx, `The Gloam gathers: the ring closes at this round's Tally (${due.openSize}×${due.openSize} remains).`);
}

/** What a closing does to one covered tile (§5.4): Plume, Lit Shrine, structures, Wicks. */
function coverTile(ctx: Ctx, p: Pos): void {
  const { s } = ctx;
  const plume = s.plumes.find((m) => m.pos.x === p.x && m.pos.y === p.y);
  if (plume) {
    s.plumes = s.plumes.filter((m) => m !== plume);
    emit(ctx, { type: 'plume_popped', plumeId: plume.id, pos: plume.pos, seat: null });
  }
  putOutShrine(ctx, p);
}

function coveredPieces(s: GameState, tiles: readonly Pos[]): Piece[] {
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  return sortReadingOrder(
    pieceList(s).filter((piece) => piece.size === 1 && keys.has(`${piece.pos.x},${piece.pos.y}`)),
    (piece) => piece.pos,
  );
}

/** Lanterns, Wick Mortars and Smokestacks are removed; a Smoldering Wick means elimination. */
function coverPiece(ctx: Ctx, piece: Piece): void {
  if (ctx.s.pieces[piece.id] !== piece) return;
  if (piece.kind === 'hero' && piece.smoldering && piece.owner !== null) {
    addLog(ctx, `The Gloam swallows ${pieceName(ctx.reg, piece)}'s Wick at ${sqName(piece.pos)}.`);
    eliminatePlayer(ctx, piece.owner, 'gloam_wick', null);
    return;
  }
  if (piece.structure && (piece.kind === 'unit' || piece.kind === 'enemy')) {
    addLog(ctx, `The Gloam swallows ${pieceName(ctx.reg, piece)} at ${sqName(piece.pos)}.`);
    vanishPiece(ctx, piece, 'gloam');
  }
}

function applyClosing(ctx: Ctx, closing: GloamClosing): void {
  const { s } = ctx;
  const lf = lastFlameOf(s);
  if (!lf) return;
  const tiles = ringTiles(closing.ring, s.board.w, s.board.h);
  for (const p of tiles) {
    const tile = tileAt(s, p);
    if (tile) tile.gloam = true;
  }
  lf.gloam.closingsDone += 1;
  setWarning(s, null);
  emit(ctx, { type: 'gloam_closed', ring: closing.ring, openSize: closing.openSize, tiles: tiles.map((t) => ({ ...t })) });
  addLog(ctx, `The Gloam closes in: ${closing.openSize}×${closing.openSize} remains.`);
  for (const p of tiles) coverTile(ctx, p);
  for (const piece of coveredPieces(s, tiles)) coverPiece(ctx, piece);
  refreshGloamBell(s);
}

/** Tally step 1: apply the closing scheduled for this Tally. */
export function tallyGloamClose(ctx: Ctx): void {
  const due = closingDueNow(ctx.s);
  if (due) applyClosing(ctx, due);
}

/**
 * Tally step 5: every Wickfolk piece in the Gloam takes 2 damage that Ward cannot stop (credit:
 * whoever displaced it this round); a Smoldering Wick there is eliminated. Snuff and bosses are
 * immune.
 */
export function tallyGloamDamage(ctx: Ctx): void {
  const { s, reg } = ctx;
  if (!lastFlameOf(s)) return;
  const inside = sortReadingOrder(
    pieceList(s).filter((p) => p.side === 'wick' && (p.kind === 'hero' || p.kind === 'unit') && pieceInGloam(s, p) && !isImmune(reg, p, 'gloam')),
    (p) => p.pos,
  );
  for (const piece of inside) {
    if (s.result || s.pieces[piece.id] !== piece) continue;
    if (piece.smoldering) {
      coverPiece(ctx, piece);
      continue;
    }
    dealDamage(ctx, piece, reg.rules.gloam.damage, { cause: 'gloam', sourceKind: 'hazard', sourceId: null, seat: piece.lastDisplacedBy, ignoreWard: true });
  }
}
