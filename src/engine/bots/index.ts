/**
 * Bot entry points (GDD §12.5). PLACEHOLDERS until E5 lands the real planners:
 * `planBotTurn` just ends the turn, `botChoice` takes the first legal option of the current
 * decision, and `hint` suggests the first lethal strike it finds.
 */
import { legalStrikeOptions } from '../actions';
import { getContent } from '../content';
import { validateAction } from '../reducer';
import { heroOf, pieceList } from '../state';
import type { Action, BotLevel, ContentRegistry, GameState } from '../types';

/** A full seat turn, ending with end_turn. */
export function planBotTurn(_s: GameState, seat: number, _level: BotLevel): Action[] {
  return [{ type: 'end_turn', seat }];
}

function legal(s: GameState, action: Action, reg: ContentRegistry): Action | null {
  return validateAction(s, action, reg).ok ? action : null;
}

/** The first legal choice for a non-turn decision: ready, Toll (the Blessing), carry-over, draft, Boon. */
export function botChoice(s: GameState, seat: number, reg: ContentRegistry = getContent()): Action | null {
  const player = s.players[seat];
  if (!player || s.result) return null;
  switch (s.phase) {
    case 'night_setup':
      return legal(s, { type: 'ready', seat }, reg);
    case 'toll':
      return s.toll.offer ? legal(s, { type: 'choose_toll', seat, tollId: s.toll.offer.blessing }, reg) : null;
    case 'dawn':
      return player.carryOver && player.carryOver.chosen === null ? legal(s, { type: 'carry_over', seat, keep: player.carryOver.defaults }, reg) : null;
    case 'chandlery': {
      const ch = player.chandlery;
      if (!ch) return null;
      const card = ch.offer.find((id) => !ch.picked.includes(id));
      if (ch.picksLeft > 0 && card) return legal(s, { type: 'draft_pick', seat, cardId: card }, reg);
      if (ch.picksLeft > 0) return legal(s, { type: 'skip_pick', seat }, reg);
      return ch.boonDone ? null : legal(s, { type: 'boon_pick', seat, boon: null, args: {} }, reg);
    }
    default:
      return null;
  }
}

/** Hint (H): the first lethal strike of a Ready piece, else null. */
export function hint(s: GameState, seat: number, reg: ContentRegistry = getContent()): Action | null {
  if (s.phase !== 'players' || s.activeSeat !== seat) return null;
  const hero = heroOf(s, seat);
  const pieces = pieceList(s).filter((p) => p.owner === seat && p.strikesLeft > 0 && !p.exhausted);
  pieces.sort((a, b) => Number(b.id === hero?.id) - Number(a.id === hero?.id));
  for (const piece of pieces) {
    const option = legalStrikeOptions(s, reg, piece.id).find((o) => o.lethal && !o.isPlume);
    if (option) return legal(s, { type: 'strike', seat, pieceId: piece.id, target: option.target }, reg);
  }
  return null;
}
