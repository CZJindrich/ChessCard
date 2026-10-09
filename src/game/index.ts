/**
 * Client-side game control (ARCHITECTURE §6): the controller, transports, bot runners and the
 * pure helpers the game screen renders from (highlights, targeting, playback timing, sounds).
 */
export {
  GameController,
  DEFAULT_CONTROLLER_SETTINGS,
  reasonLine,
  type ControllerOptions,
  type ControllerSettings,
  type ControllerSnapshot,
  type EndTurnOutcome,
  type GameAudio,
  type PlaybackStep,
  type Scheduler,
} from './controller';
export { LocalTransport, Emitter, type GameTransport, type LocalTransportOptions, type SendResult, type TransportRejection, type TransportUpdate } from './transport';
export { createBotRunner, createSyncBotRunner, createWorkerBotRunner, type BotRunner } from './bots';
export {
  pieceHighlights,
  deployTargets,
  dangerAfter,
  pieceIsReady,
  readyPieces,
  playableCards,
  hasRemainingActions,
  moveRangeKeys,
  type MoveMark,
  type StrikeMark,
  type SpecialMark,
  type PieceHighlights,
} from './highlights';
export { cardStep, powerStep, needsMode, modeChoices, picksComplete, canSkipRest, optionAt, sameChoice } from './targeting';
export { EMPTY_SELECTION, clearChoices, type Selection, type CardSelection, type PowerSelection, type NoticeAnchor, type UiNotice } from './selection';
export { baseDuration, playbackDuration, paceScale, paceForAction, type Pace, type PlaybackSettings } from './timing';
export { cuesForEvent, musicMoodFor, type SfxCue } from './sfx';
export { patchView } from './viewPatch';
