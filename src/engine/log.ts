/**
 * Human-readable log lines (GDD §5.1, §8.1): absolute coordinates and first names only,
 * e.g. "Brannoc strikes Sootling at c4 for 2".
 */
import { sqName } from './geometry';
import { emit, LOG_LIMIT } from './state';
import type { Ctx } from './state';
import type { ContentRegistry, LogEntry, Piece } from './types';

/** Display name of a piece: hero first name, unit/enemy/boss name, "Vigil Candle". */
export function pieceName(reg: ContentRegistry, p: Piece): string {
  switch (p.kind) {
    case 'hero':
      return reg.heroes.byId[p.defId]?.name ?? p.defId;
    case 'unit':
      return reg.units.byId[p.defId]?.name ?? p.defId;
    case 'enemy':
      return reg.enemies.byId[p.defId]?.name ?? p.defId;
    case 'boss':
      return reg.bosses.byId[p.defId]?.name ?? p.defId;
    case 'candle':
      return 'Vigil Candle';
  }
}

/** "Sootling at c4". */
export function pieceAtText(reg: ContentRegistry, p: Piece): string {
  return `${pieceName(reg, p)} at ${sqName(p.pos)}`;
}

/** "c3 Vigil Candle" (intent text style, GDD §15.4). */
export function squarePieceText(reg: ContentRegistry, p: Piece): string {
  return `${sqName(p.pos)} ${pieceName(reg, p)}`;
}

/** Append a log line to the state and emit it as an event. */
export function addLog(ctx: Ctx, text: string, seat?: number): void {
  const entry: LogEntry = { text, night: ctx.s.night, round: ctx.s.round };
  if (seat !== undefined) entry.seat = seat;
  ctx.s.log.push(entry);
  if (ctx.s.log.length > LOG_LIMIT) ctx.s.log.splice(0, ctx.s.log.length - LOG_LIMIT);
  emit(ctx, { type: 'log', entry });
}
