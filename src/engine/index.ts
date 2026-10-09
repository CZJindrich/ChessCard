/**
 * Public engine API (ARCHITECTURE.md §4). The UI and the server import only from here.
 */
import { legalMoveTargets, legalStrikeOptions } from './actions';
import { cardTargetInfo } from './cards';
import { getContent } from './content';
import type { CardTargetInfo, GameState, Pos, StrikeOption } from './types';

export * from './types';
export * from './rng';
export * from './geometry';
export * from './content';

export { createGame } from './setup';
export { applyAction, validateAction } from './reducer';
export { activeSeats, pendingAutomation } from './phases';
export { dangerMap, intentQueue, previewSnuffStrike } from './preview';
export { viewFor } from './view';
export { botChoice, hint, planBotTurn } from './bots';
export { pieceName } from './log';
export { currentThreshold, dreadThresholdValues, starsFor } from './modes/vigil';
export { checkSiteLayout, generateVigilSite, buildFixedMap } from './sites';
export type { SiteLayout } from './sites';

/** Move destinations of a piece from its tile, Chimney exits included (pips and turn not checked). */
export function legalMoves(state: GameState, pieceId: string): Pos[] {
  return legalMoveTargets(state, getContent(), pieceId);
}

/** Strike targets with damage / lethal / Take / push previews (pips and turn not checked). */
export function legalStrikes(state: GameState, pieceId: string): StrikeOption[] {
  return legalStrikeOptions(state, getContent(), pieceId);
}

/** Playability, valid targets and previews of a card in a seat's hand. */
export function cardTargets(state: GameState, seat: number, cardUid: string): CardTargetInfo {
  return cardTargetInfo(state, getContent(), seat, cardUid);
}

/** Hero Powers arrive with E2: until then a Power is never playable. */
export function powerTargets(state: GameState, seat: number): CardTargetInfo {
  const hero = state.players[seat] ? getContent().heroes.byId[state.players[seat].hero] : undefined;
  return {
    playable: false,
    reason: 'NOT_ENABLED',
    params: { feature: 'Hero Powers' },
    cost: hero?.powerCost ?? 0,
    modes: null,
    step: 0,
    steps: 1,
    optional: false,
    targets: [],
    rangeRing: null,
  };
}
