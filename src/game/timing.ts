/**
 * Playback durations (GDD §16.9, 1× speed) and how the presentation settings scale them.
 * Player-driven events (human and bot seat turns) follow `animation_speed`; automated phases
 * (Moth Die, Snuff Move, Snuff Strike, Rise, Tally, Dawn) follow `enemy_turn_speed` too.
 */
import { chebyshev } from '../engine';
import type { GameEvent, PhaseId } from '../engine/types';

export type Pace = 'player' | 'enemy';

/** Presentation keys the controller reads (a subset of `PresentationSettings`). */
export interface PlaybackSettings {
  animation_speed: number;
  enemy_turn_speed: 'normal' | 'fast' | 'instant';
  reduced_motion: boolean;
}

/** Board distance a 1× ember bolt covers per second, in tiles (600 px/s on 64 px tiles). */
const BOLT_TILES_PER_SECOND = 600 / 64;

export const STEP_MS_PER_TILE = 180;
export const LEAP_MS = 300;
export const MELEE_LUNGE_MS = 200;
export const DAMAGE_MS = 160;
export const PUSH_MS = 200;
export const WICK_DEATH_MS = 450;
export const SNUFF_DEATH_MS = 400;
export const INTENT_MS = 200;
export const RISE_MS = 450;
export const CARD_PLAY_MS = 350;
export const DIE_MS = 900;
export const DREAD_MS = 600;
export const BANNER_MS = 1500;

/** Pause between two automated `advance`s, so each beat of the round reads (1×). */
export const PHASE_GAP_MS = 240;
/** Pause between two bot actions after their animations (1×). */
export const BOT_ACTION_GAP_MS = 280;

function moveDuration(event: Extract<GameEvent, { type: 'piece_moved' }>): number {
  const tiles = Math.max(1, event.path?.length ?? chebyshev(event.from, event.to));
  switch (event.kind) {
    case 'step':
    case 'slide':
      return STEP_MS_PER_TILE * tiles;
    case 'leap':
    case 'fly':
    case 'chimney':
    case 'teleport':
    case 'swap':
    case 'respawn':
      return LEAP_MS;
    case 'take':
      return DAMAGE_MS;
    case 'push':
    case 'pull':
      return PUSH_MS + (event.bump ? 80 : 0);
    case 'deploy':
      return 160;
    case 'boss_step':
      return 260;
  }
}

function strikeDuration(event: Extract<GameEvent, { type: 'strike' }>): number {
  if (event.kind === 'melee') return MELEE_LUNGE_MS;
  if (event.kind === 'boss') return 320;
  if (event.kind === 'snuff') return 240;
  const tiles = event.target ? chebyshev(event.from, event.target) : 3;
  return Math.max(160, Math.round((tiles / BOLT_TILES_PER_SECOND) * 1000));
}

/** Beats that get a short banner when the round reaches them. */
const BEAT_PAUSE: Partial<Record<PhaseId, number>> = {
  snuff_move: 520,
  snuff_strike: 520,
  players: 260,
  boss_intro: BANNER_MS,
  dawn: 700,
  game_over: 400,
};

/** Base duration of one event at 1× speed, in ms (0 = instant bookkeeping). */
export function baseDuration(event: GameEvent, reducedMotion = false): number {
  switch (event.type) {
    case 'piece_moved':
      return moveDuration(event);
    case 'strike':
      return strikeDuration(event);
    case 'damage':
      return event.blockedByWard ? 200 : DAMAGE_MS;
    case 'heal':
      return DAMAGE_MS;
    case 'piece_died':
      return event.side === 'snuff' ? SNUFF_DEATH_MS : WICK_DEATH_MS;
    case 'hero_smoldered':
      return WICK_DEATH_MS;
    case 'hero_relit':
    case 'transformed':
      return 320;
    case 'summoned':
      return event.source === 'rise' ? RISE_MS : 320;
    case 'card_played':
    case 'power_used':
      return CARD_PLAY_MS;
    case 'free_action_used':
      return 260;
    case 'status_changed':
      return event.status === 'ward' && event.active ? 200 : 120;
    case 'charm_changed':
      return 200;
    case 'intent_declared':
      return INTENT_MS;
    case 'intent_cancelled':
    case 'intent_reversed':
      return 260;
    case 'intent_resolved':
      return 60;
    case 'plume_placed':
      return 280;
    case 'plume_popped':
      return 260;
    case 'plume_rose':
      return RISE_MS;
    case 'plume_blocked':
      return 320;
    case 'omen_rolled':
      return reducedMotion ? 500 : DIE_MS + 300;
    case 'dread_changed':
      return event.to > event.from ? DREAD_MS : 300;
    case 'glory_changed':
      return 200;
    case 'toll_revealed':
      return 400;
    case 'boss_spawned':
    case 'boss_phase':
    case 'checkmate':
      return BANNER_MS;
    case 'check':
      return 600;
    case 'gloam_closed':
      return 900;
    case 'phase_changed':
      return BEAT_PAUSE[event.phase] ?? 0;
    case 'turn_started':
      return 320;
    case 'night_started':
      return 1400;
    case 'dawn':
      return 900;
    case 'tile_changed':
      return 160;
    case 'shrine_changed':
      return 260;
    case 'player_eliminated':
      return 900;
    case 'game_over':
      return 300;
    default:
      return 0;
  }
}

/** Duration multiplier for a pace: player pace follows animation_speed; enemy pace also enemy_turn_speed. */
export function paceScale(pace: Pace, settings: PlaybackSettings): number {
  const speed = settings.animation_speed > 0 ? settings.animation_speed : 1;
  if (pace === 'player') return 1 / speed;
  const enemy = settings.enemy_turn_speed === 'instant' ? 0 : settings.enemy_turn_speed === 'fast' ? 0.5 : 1;
  return enemy / speed;
}

/** The scaled duration of one event (ms, rounded; 0 plays it instantly). */
export function playbackDuration(event: GameEvent, pace: Pace, settings: PlaybackSettings): number {
  return Math.round(baseDuration(event, settings.reduced_motion) * paceScale(pace, settings));
}

/** Events from an `advance` are the automated beats; everything else is a seat acting. */
export function paceForAction(actionType: string | null): Pace {
  return actionType === 'advance' || actionType === null ? 'enemy' : 'player';
}
