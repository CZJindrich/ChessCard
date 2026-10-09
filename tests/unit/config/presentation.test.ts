import { describe, expect, it } from 'vitest';
import {
  animationDurationScale,
  audioPatchFrom,
  createPresentationStore,
  DEFAULT_PRESENTATION,
  enemyPhaseDurationScale,
  hintsEnabled,
  loadPresentation,
  memoryStorage,
  PRESENTATION_STORAGE_KEY,
  presentationFromAudio,
  sanitizePresentation,
  savePresentation,
  shakeEnabled,
} from '../../../src/config';
import type { AudioBridge, AudioLevels, KeyValueStorage } from '../../../src/config';

const throwingStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

function fakeAudio(initial: AudioLevels = { master: 0.8, sfx: 0.9, music: 0.6, muted: false }): AudioBridge & { levels: AudioLevels } {
  const listeners = new Set<() => void>();
  const bridge = {
    levels: { ...initial },
    getSettings: () => bridge.levels,
    setSettings(patch: Partial<AudioLevels>) {
      bridge.levels = { ...bridge.levels, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return bridge;
}

describe('presentation settings (§14.4)', () => {
  it('has the GDD defaults', () => {
    expect(DEFAULT_PRESENTATION).toEqual({
      animation_speed: 1, enemy_turn_speed: 'normal', reduced_motion: false, screen_shake: true, bold_outlines: false,
      readable_font: false, ui_scale: 100, confirm_end_turn: 'smart', tutorial_hints: 'auto',
      master_volume: 80, sfx_volume: 90, music_volume: 60, mute: false,
    });
  });

  it('sanitises untrusted values', () => {
    const s = sanitizePresentation({ animation_speed: 4, ui_scale: 137, master_volume: 140, confirm_end_turn: 'maybe', reduced_motion: true, junk: 1 });
    expect(s).toMatchObject({ animation_speed: 1, ui_scale: 140, master_volume: 100, confirm_end_turn: 'smart', reduced_motion: true });
    expect(sanitizePresentation({ ui_scale: 10 }).ui_scale).toBe(90);
    expect(sanitizePresentation('nope')).toEqual(DEFAULT_PRESENTATION);
  });

  it('persists visual keys under chesscard.presentation, never the audio keys', () => {
    const storage = memoryStorage();
    expect(savePresentation({ ...DEFAULT_PRESENTATION, readable_font: true, master_volume: 10 }, storage)).toBe(true);
    const stored = JSON.parse(storage.dump()[PRESENTATION_STORAGE_KEY]) as Record<string, unknown>;
    expect(stored.readable_font).toBe(true);
    expect(stored.master_volume).toBeUndefined();
    expect(loadPresentation(storage)).toEqual({ ...DEFAULT_PRESENTATION, readable_font: true });
  });

  it('survives storage that throws or holds garbage', () => {
    expect(loadPresentation(throwingStorage)).toEqual(DEFAULT_PRESENTATION);
    expect(savePresentation(DEFAULT_PRESENTATION, throwingStorage)).toBe(false);
    expect(loadPresentation(memoryStorage({ [PRESENTATION_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_PRESENTATION);
    expect(loadPresentation(null)).toEqual(DEFAULT_PRESENTATION);
  });

  it('store: stable snapshots, notifications, reset', () => {
    const store = createPresentationStore({ storage: memoryStorage() });
    const first = store.get();
    let calls = 0;
    const unsubscribe = store.subscribe(() => (calls += 1));
    store.set({ screen_shake: true });
    expect(store.get()).toBe(first);
    store.set({ screen_shake: false, animation_speed: 2 });
    expect(store.get()).toMatchObject({ screen_shake: false, animation_speed: 2 });
    expect(calls).toBe(1);
    store.reset();
    expect(store.get()).toEqual(DEFAULT_PRESENTATION);
    unsubscribe();
    store.set({ bold_outlines: true });
    expect(calls).toBe(2);
  });

  it('routes the audio keys through the audio bridge', () => {
    const audio = fakeAudio({ master: 0.5, sfx: 0.9, music: 0.6, muted: false });
    const store = createPresentationStore({ storage: memoryStorage(), audio });
    expect(store.get().master_volume).toBe(50);
    store.set({ music_volume: 25, mute: true });
    expect(audio.levels).toEqual({ master: 0.5, sfx: 0.9, music: 0.25, muted: true });
    expect(store.get()).toMatchObject({ music_volume: 25, mute: true });
    audio.setSettings({ sfx: 0.3 });
    expect(store.get().sfx_volume).toBe(30);
    expect(presentationFromAudio({ master: 0.8, sfx: 0.9, music: 0.6, muted: false })).toEqual({ master_volume: 80, sfx_volume: 90, music_volume: 60, mute: false });
    expect(audioPatchFrom({ readable_font: true, master_volume: 40 })).toEqual({ master: 0.4 });
  });

  it('derived helpers', () => {
    expect(hintsEnabled(DEFAULT_PRESENTATION, 2)).toBe(true);
    expect(hintsEnabled(DEFAULT_PRESENTATION, 3)).toBe(false);
    expect(hintsEnabled({ ...DEFAULT_PRESENTATION, tutorial_hints: 'on' }, 50)).toBe(true);
    expect(animationDurationScale({ ...DEFAULT_PRESENTATION, animation_speed: 2 })).toBe(0.5);
    expect(enemyPhaseDurationScale({ ...DEFAULT_PRESENTATION, enemy_turn_speed: 'fast' }, false)).toBe(0.5);
    expect(enemyPhaseDurationScale({ ...DEFAULT_PRESENTATION, enemy_turn_speed: 'instant' }, true)).toBe(1);
    expect(shakeEnabled({ ...DEFAULT_PRESENTATION, reduced_motion: true })).toBe(false);
  });
});
