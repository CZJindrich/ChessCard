/**
 * Public engine API (ARCHITECTURE.md §4). The UI and the server import only from here.
 */
import { freeActionTargetInfo, legalMoveTargets, legalStrikeOptions } from './actions';
import { cardTargetInfo } from './cards';
import { getContent } from './content';
import { hauntOptions as hauntOptionsFor } from './modes/haunt';
import type { HauntOption } from './modes/haunt';
import { powerTargetInfo } from './powers';
import type { CardTargetInfo, FreeActionKind, GameState, Pos, StrikeOption, TargetQuery } from './types';

export * from './types';
export * from './rng';
export * from './geometry';
export * from './content';

export { createGame } from './setup';
export { applyAction, validateAction } from './reducer';
export { activeSeats, pendingAutomation } from './phases';
export { dangerMap, intentQueue, previewMoveDanger, previewSnuffStrike } from './preview';
export type { MoveDanger } from './preview';
export { eventsForSeat, HIDDEN_CARD, viewFor } from './view';
export { botChoice, hint, planBotTurn, planTurn } from './bots';
export type { PlanOptions, PlanResult } from './bots';
export { pieceName } from './log';
export { canUndo } from './undo';
export { retryOpen, voteStatus } from './votes';
export type { VoteKind, VoteStatus } from './votes';
export { clockwiseFromFirstLight, GLORY_REASONS, gloryLeader, isTruceActive, truceForNight } from './modes/lastFlame';
export { inGloam, nextClosing, roundsToNextClosing } from './modes/gloam';
export { eliminatedOnFall } from './modes/falls';
export { hauntedHeroAt, hauntingOn } from './modes/haunt';
export type { HauntOption } from './modes/haunt';
export { compareStandings, lastFlameEndReason, lastFlameStandings } from './modes/lastFlameEnd';
export type { LastFlameEndReason } from './modes/lastFlameEnd';
export { bossFallen, bossGlory, bossMaxHp, bossPhaseForHp, bossPlayerCount, openEscapes, phaseThreshold } from './bosses';
export type { BossGlory } from './bosses';
export { matchesTutorialStep, tutorialAction, tutorialScript, tutorialTurnActive } from './tutorial';
export type { TutorialActionKind, TutorialScript, TutorialStep } from './tutorial';
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

/**
 * Playability, valid targets and previews of a card in a seat's hand. Multi-step cards: pass the
 * mode ("choose one") and the picks made so far; the answer lists the next pick's options.
 */
export function cardTargets(state: GameState, seat: number, cardUid: string, query: TargetQuery = {}): CardTargetInfo {
  return cardTargetInfo(state, getContent(), seat, cardUid, query);
}

/** Playability, valid choices and previews of the seat's Hero Power (multi-step via `query.chosen`). */
export function powerTargets(state: GameState, seat: number, query: TargetQuery = {}): CardTargetInfo {
  return powerTargetInfo(state, getContent(), seat, query);
}

/** Valid targets of a free action (`melt`: own units; `ring_bell`: enemies the Bell can Daze). */
export function freeActionTargets(state: GameState, seat: number, kind: FreeActionKind): CardTargetInfo {
  return freeActionTargetInfo(state, getContent(), seat, kind);
}

/**
 * Last Flame Haunting (§13.2.7): the tiles an eliminated seat owing a Haunt may choose, each with
 * the hero it would haunt (empty when the seat owes nothing or no tile is legal).
 */
export function hauntOptions(state: GameState, seat: number): HauntOption[] {
  return state.players[seat]?.haunt.pending ? hauntOptionsFor(state, seat, getContent()) : [];
}
