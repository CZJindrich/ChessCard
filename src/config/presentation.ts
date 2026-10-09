/**
 * Presentation settings (GDD §14.4): per device, never in the settings code.
 *
 * The visual/gameplay keys persist under `chesscard.presentation`. The four audio keys are the
 * same values the audio module already persists under `chesscard.audio`; the store reads and
 * writes them through an optional `AudioBridge` (pass `audio` from src/audio) so there is one
 * source of truth. Without a bridge they live in memory only.
 */
import { browserStorage, isRecord, readJson, writeJson } from './storage';
import type { KeyValueStorage } from './storage';

export const PRESENTATION_STORAGE_KEY = 'chesscard.presentation';

export const ANIMATION_SPEEDS = [0.5, 1, 2, 3] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

export const ENEMY_TURN_SPEEDS = ['normal', 'fast', 'instant'] as const;
export type EnemyTurnSpeed = (typeof ENEMY_TURN_SPEEDS)[number];

export const CONFIRM_END_TURN = ['smart', 'always', 'never'] as const;
export type ConfirmEndTurn = (typeof CONFIRM_END_TURN)[number];

export const TUTORIAL_HINTS = ['auto', 'on', 'off'] as const;
export type TutorialHints = (typeof TUTORIAL_HINTS)[number];

export const UI_SCALE = { min: 90, max: 150, step: 10 } as const;
/** Board tiles never render smaller than this (the UI clamps ui_scale with it). */
export const MIN_TILE_PX = 36;
/** tutorial_hints 'auto' shows hints during the first N completed games. */
export const AUTO_HINT_GAMES = 3;

export interface PresentationSettings {
  animation_speed: AnimationSpeed;
  /** Local only; online, the server's pacing applies. */
  enemy_turn_speed: EnemyTurnSpeed;
  reduced_motion: boolean;
  screen_shake: boolean;
  bold_outlines: boolean;
  readable_font: boolean;
  /** Percent, 90-150 in steps of 10. */
  ui_scale: number;
  confirm_end_turn: ConfirmEndTurn;
  tutorial_hints: TutorialHints;
  /** Percent 0-100 (audio bridge). */
  master_volume: number;
  sfx_volume: number;
  music_volume: number;
  mute: boolean;
}

export const AUDIO_KEYS = ['master_volume', 'sfx_volume', 'music_volume', 'mute'] as const;
export type AudioKey = (typeof AUDIO_KEYS)[number];

export const DEFAULT_PRESENTATION: Readonly<PresentationSettings> = Object.freeze({
  animation_speed: 1,
  enemy_turn_speed: 'normal',
  reduced_motion: false,
  screen_shake: true,
  bold_outlines: false,
  readable_font: false,
  ui_scale: 100,
  confirm_end_turn: 'smart',
  tutorial_hints: 'auto',
  master_volume: 80,
  sfx_volume: 90,
  music_volume: 60,
  mute: false,
});

/** Settings-screen metadata: label and one-line help per key. */
export const PRESENTATION_LABELS: Readonly<Record<keyof PresentationSettings, { label: string; help: string }>> = {
  animation_speed: { label: 'Animation speed', help: 'How fast moves and strikes play out.' },
  enemy_turn_speed: { label: 'Enemy turn speed', help: 'Pace of the Snuff Move and Snuff Strike (local games only).' },
  reduced_motion: { label: 'Reduced motion', help: 'No shake, parallax or particles; fades instead of flashes.' },
  screen_shake: { label: 'Screen shake', help: 'Shake the board on heavy hits.' },
  bold_outlines: { label: 'Bold outlines', help: 'Draw every state shape with a bold outline.' },
  readable_font: { label: 'Readable font', help: 'Use the system font for all text except the logo.' },
  ui_scale: { label: 'UI scale', help: 'Size of the interface (board tiles stay at least 36 px).' },
  confirm_end_turn: { label: 'Confirm End Turn', help: 'Smart asks only when pieces or cards are still usable.' },
  tutorial_hints: { label: 'Tutorial hints', help: 'Auto shows hints in your first 3 games.' },
  master_volume: { label: 'Master volume', help: 'Overall volume.' },
  sfx_volume: { label: 'Sound effects', help: 'Volume of sound effects.' },
  music_volume: { label: 'Music', help: 'Volume of the music.' },
  mute: { label: 'Mute', help: 'Silence everything.' },
};

function pickFrom<T extends string | number>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function percent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : fallback;
}

function uiScale(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, value));
  return Math.round(clamped / UI_SCALE.step) * UI_SCALE.step;
}

/** Merge an untrusted patch over `base`, dropping anything invalid. */
export function sanitizePresentation(raw: unknown, base: PresentationSettings = DEFAULT_PRESENTATION): PresentationSettings {
  if (!isRecord(raw)) return { ...base };
  return {
    animation_speed: pickFrom(ANIMATION_SPEEDS, raw.animation_speed, base.animation_speed),
    enemy_turn_speed: pickFrom(ENEMY_TURN_SPEEDS, raw.enemy_turn_speed, base.enemy_turn_speed),
    reduced_motion: boolOr(raw.reduced_motion, base.reduced_motion),
    screen_shake: boolOr(raw.screen_shake, base.screen_shake),
    bold_outlines: boolOr(raw.bold_outlines, base.bold_outlines),
    readable_font: boolOr(raw.readable_font, base.readable_font),
    ui_scale: uiScale(raw.ui_scale, base.ui_scale),
    confirm_end_turn: pickFrom(CONFIRM_END_TURN, raw.confirm_end_turn, base.confirm_end_turn),
    tutorial_hints: pickFrom(TUTORIAL_HINTS, raw.tutorial_hints, base.tutorial_hints),
    master_volume: percent(raw.master_volume, base.master_volume),
    sfx_volume: percent(raw.sfx_volume, base.sfx_volume),
    music_volume: percent(raw.music_volume, base.music_volume),
    mute: boolOr(raw.mute, base.mute),
  };
}

function visualOnly(s: PresentationSettings): Partial<PresentationSettings> {
  const out: Partial<PresentationSettings> = { ...s };
  for (const key of AUDIO_KEYS) delete out[key];
  return out;
}

/** Load the visual keys from storage (audio keys come back as defaults). */
export function loadPresentation(storage: KeyValueStorage | null = browserStorage()): PresentationSettings {
  return { ...DEFAULT_PRESENTATION, ...visualOnly(sanitizePresentation(readJson(storage, PRESENTATION_STORAGE_KEY))) };
}

/** Persist the visual keys (audio keys are persisted by the audio module). */
export function savePresentation(settings: PresentationSettings, storage: KeyValueStorage | null = browserStorage()): boolean {
  return writeJson(storage, PRESENTATION_STORAGE_KEY, visualOnly(settings));
}

// ---------------------------------------------------------------------------------------------
// Audio bridge (structurally matches `audio` from src/audio)
// ---------------------------------------------------------------------------------------------

export interface AudioLevels {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export interface AudioBridge {
  getSettings(): AudioLevels;
  setSettings(patch: Partial<AudioLevels>): void;
  subscribe?(listener: () => void): () => void;
}

export function presentationFromAudio(levels: AudioLevels): Pick<PresentationSettings, AudioKey> {
  return {
    master_volume: Math.round(levels.master * 100),
    sfx_volume: Math.round(levels.sfx * 100),
    music_volume: Math.round(levels.music * 100),
    mute: levels.muted,
  };
}

/** The audio-module patch for the audio keys present in `patch`. */
export function audioPatchFrom(patch: Partial<PresentationSettings>): Partial<AudioLevels> {
  const out: Partial<AudioLevels> = {};
  if (patch.master_volume !== undefined) out.master = patch.master_volume / 100;
  if (patch.sfx_volume !== undefined) out.sfx = patch.sfx_volume / 100;
  if (patch.music_volume !== undefined) out.music = patch.music_volume / 100;
  if (patch.mute !== undefined) out.muted = patch.mute;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

export interface PresentationStore {
  /** A stable snapshot; identity changes only when a value changes (useSyncExternalStore-friendly). */
  get(): PresentationSettings;
  set(patch: Partial<PresentationSettings>): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

function sameSettings(a: PresentationSettings, b: PresentationSettings): boolean {
  return (Object.keys(a) as Array<keyof PresentationSettings>).every((k) => a[k] === b[k]);
}

export function createPresentationStore(
  opts: { storage?: KeyValueStorage | null; audio?: AudioBridge | null } = {},
): PresentationStore {
  const storage = opts.storage === undefined ? browserStorage() : opts.storage;
  const audio = opts.audio ?? null;
  const listeners = new Set<() => void>();
  const withAudio = (s: PresentationSettings): PresentationSettings =>
    audio ? { ...s, ...presentationFromAudio(audio.getSettings()) } : s;
  let current: PresentationSettings = Object.freeze(withAudio(loadPresentation(storage)));

  const publish = (next: PresentationSettings) => {
    if (sameSettings(next, current)) return;
    current = Object.freeze(next);
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A broken listener must not break the others.
      }
    }
  };

  audio?.subscribe?.(() => publish(withAudio(current)));

  return {
    get: () => current,
    set(patch) {
      const next = sanitizePresentation(patch, current);
      savePresentation(next, storage);
      if (audio) audio.setSettings(audioPatchFrom(patch));
      publish(withAudio(next));
    },
    reset() {
      savePresentation({ ...DEFAULT_PRESENTATION }, storage);
      if (audio) audio.setSettings(audioPatchFrom(DEFAULT_PRESENTATION));
      publish(withAudio({ ...DEFAULT_PRESENTATION }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------------------------

/** Whether tutorial hints show, given completed games (§14.4 'auto' = first 3 games). */
export function hintsEnabled(settings: PresentationSettings, gamesCompleted: number): boolean {
  if (settings.tutorial_hints === 'auto') return gamesCompleted < AUTO_HINT_GAMES;
  return settings.tutorial_hints === 'on';
}

/** Duration multiplier for player-driven animations (0.5x speed = 2x duration). */
export function animationDurationScale(settings: PresentationSettings): number {
  return 1 / settings.animation_speed;
}

/** Duration multiplier for automated enemy phases; online games use the server's pacing (1). */
export function enemyPhaseDurationScale(settings: PresentationSettings, online: boolean): number {
  if (online) return 1;
  const enemy = settings.enemy_turn_speed === 'instant' ? 0 : settings.enemy_turn_speed === 'fast' ? 0.5 : 1;
  return enemy / settings.animation_speed;
}

/** Shake only when enabled and motion is not reduced. */
export function shakeEnabled(settings: PresentationSettings): boolean {
  return settings.screen_shake && !settings.reduced_motion;
}
