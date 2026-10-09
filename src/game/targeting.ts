/**
 * Card and Hero Power targeting over the engine's `cardTargets` / `powerTargets`.
 *
 * Multi-step contract (shared with the engine): given a `TargetQuery` with the chosen mode
 * ("choose one" cards) and the picks made so far, the engine answers with the options for pick
 * number `chosen.length`; `complete` says the picks already make a playable whole (the rest are
 * optional). Engines that predate the query ignore the extra argument (single-step cards only).
 */
import { cardTargets, powerTargets } from '../engine';
import type { Action, CardTargetChoice, CardTargetInfo, GameState, Pos, TargetOption, TargetQuery } from '../engine/types';
import type { CardSelection, PowerSelection } from './selection';

type CardStepFn = (state: GameState, seat: number, cardUid: string, query?: TargetQuery) => CardTargetInfo;
type PowerStepFn = (state: GameState, seat: number, query?: TargetQuery) => CardTargetInfo;

const cardStepFn: CardStepFn = cardTargets;
const powerStepFn: PowerStepFn = powerTargets;

/** Targets for the next pick of a selected card. */
export function cardStep(state: GameState, seat: number, card: CardSelection): CardTargetInfo {
  return cardStepFn(state, seat, card.uid, card.mode === null ? { chosen: card.picks } : { mode: card.mode, chosen: card.picks });
}

/** Targets for the next pick of the Hero Power. */
export function powerStep(state: GameState, seat: number, power: PowerSelection): CardTargetInfo {
  return powerStepFn(state, seat, { chosen: power.picks });
}

/** The card needs a mode chosen before any target ("Choose one"). */
export function needsMode(info: CardTargetInfo, card: CardSelection): boolean {
  return info.modes !== null && info.modes.length > 0 && card.mode === null;
}

/** Labels and playability of a "choose one" card's modes. */
export function modeChoices(info: CardTargetInfo): Array<{ label: string; text: string; playable: boolean; reason?: CardTargetInfo['reason']; params?: CardTargetInfo['params'] }> {
  if (info.modeOptions) return info.modeOptions;
  return (info.modes ?? []).map((label) => ({ label, text: '', playable: info.playable }));
}

/**
 * Every required pick is made: board-wide cards need none; otherwise one per step, or the
 * engine says the picks are complete and nothing else can be picked.
 */
export function picksComplete(info: CardTargetInfo, picks: readonly CardTargetChoice[]): boolean {
  if (info.steps === 0) return true;
  if (picks.length >= info.steps) return true;
  return info.complete === true && info.targets.length === 0;
}

/** The picks so far are playable and only optional picks remain (offer "Skip"). */
export function canSkipRest(info: CardTargetInfo, picks: readonly CardTargetChoice[]): boolean {
  return picks.length > 0 && (info.complete === true || info.optional);
}

export function sameChoice(a: CardTargetChoice, b: CardTargetChoice): boolean {
  if (a.kind === 'piece') return b.kind === 'piece' && a.pieceId === b.pieceId;
  if (a.kind === 'tile') return b.kind === 'tile' && a.pos.x === b.pos.x && a.pos.y === b.pos.y;
  return b.kind === 'direction' && a.dir.x === b.dir.x && a.dir.y === b.dir.y;
}

/** The option covering a board tile (pieces match on any footprint tile via the option pos). */
export function optionAt(info: CardTargetInfo, pos: Pos, state: GameState): TargetOption | null {
  const exact = info.targets.find((t) => t.pos.x === pos.x && t.pos.y === pos.y);
  if (exact) return exact;
  return (
    info.targets.find((t) => {
      if (t.choice.kind !== 'piece') return false;
      const piece = state.pieces[t.choice.pieceId];
      return piece !== undefined && pos.x >= piece.pos.x && pos.x < piece.pos.x + piece.size && pos.y >= piece.pos.y && pos.y < piece.pos.y + piece.size;
    }) ?? null
  );
}

export function playCardAction(seat: number, card: CardSelection): Action {
  const action: Action = { type: 'play_card', seat, cardUid: card.uid, targets: card.picks };
  return card.mode === null ? action : { ...action, mode: card.mode };
}

export function usePowerAction(seat: number, power: PowerSelection): Action {
  return { type: 'use_power', seat, targets: power.picks };
}
