/**
 * Audio settings store: sanitised, persisted to localStorage
 * (`chesscard.audio`) and observable (for the engine and the React hook).
 * Storage access is always wrapped: private mode, SSR and node are fine.
 */
import { clamp } from './dsp';
import type { AudioSettings } from './types';

export const STORAGE_KEY = 'chesscard.audio';

export const DEFAULT_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  master: 0.8,
  sfx: 0.9,
  music: 0.6,
  muted: false,
});

type Listener = () => void;

function storage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

function sanitize(base: AudioSettings, patch: Partial<AudioSettings> | null | undefined): AudioSettings {
  const out: AudioSettings = { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const key of ['master', 'sfx', 'music'] as const) {
    const v = patch[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp(v, 0, 1);
  }
  if (typeof patch.muted === 'boolean') out.muted = patch.muted;
  return out;
}

function load(): AudioSettings {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitize({ ...DEFAULT_SETTINGS }, JSON.parse(raw) as Partial<AudioSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist(s: AudioSettings): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode: settings still apply for this session */
  }
}

let current: AudioSettings = Object.freeze(load());
const listeners = new Set<Listener>();

/** Returns a stable, frozen snapshot (identity changes only when values change). */
export function getSettings(): AudioSettings {
  return current;
}

export function setSettings(patch: Partial<AudioSettings>): void {
  const next = sanitize(current, patch);
  if (
    next.master === current.master &&
    next.sfx === current.sfx &&
    next.music === current.music &&
    next.muted === current.muted
  ) {
    return;
  }
  current = Object.freeze(next);
  persist(current);
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* a broken listener must not break others */
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
