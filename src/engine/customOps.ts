/**
 * Player-side `custom` effect ops (GDD A.1 custom op registry):
 * - `lantern_volley` (Grand Illumination): each of the seat's Lanterns fires down its 4
 *   orthogonal lines, passing through pieces (Pillars block), hitting every enemy and popping
 *   every Plume on them.
 * - `rouse` (Swarm of Wings): the subject pieces become Ready this seat turn.
 * The boss ops (`smothered_mate`, `devour_light`, `hollow_bell`) live in bosses.ts.
 */
import { dealDamage } from './combat';
import { compareReadingOrder, DIRS_ORTH, posKey, traceLine } from './geometry';
import { addLog, pieceName } from './log';
import { isTruceActive } from './modes/lastFlame';
import { popPlume } from './snuff';
import { boardQuery, emit, isEnemyOfSeat, isOver, isRivalOf, pieceList, plumeAt, ruleDelta } from './state';
import type { Ctx } from './state';
import type { Piece, Pos } from './types';

function numberArg(args: Record<string, number | string | boolean>, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === 'number' ? value : fallback;
}

/** One Lantern's 4 lines: the enemies on them (reading order) and every tile covered. */
function volleyLines(ctx: Ctx, seat: number, lantern: Piece, range: number): { victims: Piece[]; tiles: Pos[] } {
  const q = boardQuery(ctx.s);
  const tiles: Pos[] = [];
  const victims = new Map<string, Piece>();
  const truce = isTruceActive(ctx.s);
  for (const dir of DIRS_ORTH) {
    const trace = traceLine(q, lantern.pos, dir, range, 'pierce', { ignoreIds: [lantern.id] });
    tiles.push(...trace.tiles);
    for (const hit of trace.hits) {
      const piece = ctx.s.pieces[hit.pieceId];
      if (!piece || !isEnemyOfSeat(ctx.s, seat, piece) || (truce && isRivalOf(ctx.s, seat, piece))) continue;
      victims.set(piece.id, piece);
    }
  }
  return { victims: [...victims.values()].sort((a, b) => compareReadingOrder(a.pos, b.pos)), tiles };
}

export function lanternVolley(ctx: Ctx, seat: number, args: Record<string, number | string | boolean>): void {
  const { s } = ctx;
  const damage = numberArg(args, 'damage', 2);
  const range = Math.max(1, numberArg(args, 'range', 4) + ruleDelta(s, 'wickfolk_range', seat));
  const lanterns = pieceList(s)
    .filter((p) => p.owner === seat && p.defId === 'lantern')
    .sort((a, b) => compareReadingOrder(a.pos, b.pos));
  for (const lantern of lanterns) {
    if (isOver(s) || s.pieces[lantern.id] !== lantern) continue;
    const { victims, tiles } = volleyLines(ctx, seat, lantern, range);
    emit(ctx, { type: 'strike', attackerId: lantern.id, kind: 'ranged', from: { ...lantern.pos }, tiles });
    addLog(ctx, `The ${pieceName(ctx.reg, lantern)} blazes down its lines.`, seat);
    const popped = new Set<string>();
    for (const t of tiles) {
      const plume = plumeAt(s, t);
      if (plume && !popped.has(posKey(t))) {
        popped.add(posKey(t));
        popPlume(ctx, plume, seat);
      }
    }
    for (const victim of victims) {
      if (isOver(s)) return;
      dealDamage(ctx, victim, damage, { cause: 'card', sourceKind: 'card', sourceId: lantern.id, seat });
    }
  }
}

/** Ready for this seat turn: Exhausted cleared, one Move and one Strike restored (Dazed eats the Strike). */
export function rouse(ctx: Ctx, pieces: readonly Piece[]): void {
  for (const p of pieces) {
    if (p.side !== 'wick' || p.smoldering || p.kind === 'candle') continue;
    const def = p.kind === 'hero' ? ctx.reg.heroes.byId[p.defId] : ctx.reg.units.byId[p.defId];
    if (!def) continue;
    const moves = Math.max(0, (def.move.type === 'immobile' ? 0 : 1) - p.movesLeft);
    let strikes = Math.max(0, (def.attack.kind === 'none' ? 0 : 1) - p.strikesLeft);
    if (p.dazed && strikes > 0) {
      p.dazed = false;
      strikes = 0;
      emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'dazed', active: false, value: 0 });
    }
    p.exhausted = false;
    p.movesLeft += moves;
    p.strikesLeft += strikes;
    emit(ctx, { type: 'actions_granted', pieceId: p.id, moves, strikes, source: 'rouse' });
  }
}
