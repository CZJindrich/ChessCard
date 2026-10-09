/**
 * Engine piece → `PieceArt` props: which drawing (hero, unit, enemy, Vigil Candle, Smoldering
 * Wick), House colour, stats, statuses, action pips and the Ready / Spent / Exhausted looks.
 */
import { HOUSES, type PieceArtProps } from '../../art';
import type { GameState, Piece } from '../../engine/types';

export function houseColorOf(state: GameState, seat: number | null): string | undefined {
  if (seat === null) return undefined;
  const player = state.players[seat];
  return player ? HOUSES[player.house].color : undefined;
}

function artKind(piece: Piece): NonNullable<PieceArtProps['kind']> {
  if (piece.kind === 'candle') return 'candle';
  if (piece.smoldering) return 'wick';
  if (piece.kind === 'hero') return 'hero';
  return piece.side === 'snuff' ? 'enemy' : 'unit';
}

function artDefId(piece: Piece): string {
  if (piece.kind === 'candle') return 'vigil_candle';
  if (piece.smoldering) return 'smoldering_wick';
  return piece.defId;
}

/** Is the piece one the acting seat can still use this turn (pulsing halo)? */
export function isActingPiece(state: GameState, piece: Piece): boolean {
  return state.phase === 'players' && piece.owner !== null && piece.owner === state.activeSeat && !piece.exhausted && !piece.smoldering;
}

export function pieceArtProps(state: GameState, piece: Piece, tile: number, ready: boolean): PieceArtProps {
  const kind = artKind(piece);
  const acting = isActingPiece(state, piece);
  const wickUnit = piece.side === 'wick' && (piece.kind === 'hero' || piece.kind === 'unit') && !piece.smoldering;
  const spent = acting && piece.movesLeft <= 0 && piece.strikesLeft <= 0;
  return {
    defId: artDefId(piece),
    kind,
    side: piece.side,
    houseColor: houseColorOf(state, piece.owner),
    hp: piece.smoldering ? undefined : piece.hp,
    maxHp: piece.maxHp,
    atk: piece.kind === 'candle' || piece.smoldering || piece.atk <= 0 ? undefined : piece.atk,
    ward: piece.ward,
    burn: piece.burn > 0 ? piece.burn : false,
    dazed: piece.dazed,
    charm: piece.charm?.id ?? null,
    movesLeft: wickUnit ? piece.movesLeft : undefined,
    strikesLeft: wickUnit ? piece.strikesLeft : undefined,
    spent,
    exhausted: piece.exhausted && piece.side === 'wick',
    showPips: wickUnit && state.phase === 'players' && piece.owner === state.activeSeat,
    ready,
    size: tile,
    seed: piece.id,
  };
}
