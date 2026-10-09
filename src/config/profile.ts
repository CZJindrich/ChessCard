/**
 * Local profile (GDD §13.7 unlock ladder, §14.3 custom presets, stats). Stored per device under
 * `chesscard.profile`. All updates are pure functions returning a new profile; storage access
 * happens only in load/save, which never throw.
 */
import type { ModeId } from '../engine/types';
import type { UnlockState } from './presets';
import { browserStorage, isRecord, readJson, writeJson } from './storage';
import type { KeyValueStorage } from './storage';

export const PROFILE_STORAGE_KEY = 'chesscard.profile';
export const PROFILE_VERSION = 1;
export const CUSTOM_PRESET_SLOTS = 3;

/** A saved Setup preset (chips Custom 1-3): a settings code plus a name. */
export interface CustomPreset {
  name: string;
  /** WAX1 settings code. */
  code: string;
}

export interface ProfileStats {
  vigilPlayed: number;
  vigilWon: number;
  lastFlamePlayed: number;
  lastFlameWon: number;
  /** Best stars per boss id. */
  bestStars: Record<string, number>;
  retries: number;
  kills: number;
  /** Daily results by UTC date ("YYYY-MM-DD"). */
  daily: Record<string, { stars: number; dread: number }>;
}

export interface LocalProfile extends UnlockState {
  version: number;
  playerName: string;
  customPresets: Array<CustomPreset | null>;
  stats: ProfileStats;
}

/** What a finished game reports to the profile. */
export interface GameRecord {
  mode: ModeId;
  /** Vigil: victory / defeat / conceded. Last Flame: won = placement 1. */
  won: boolean;
  conceded?: boolean;
  quickPlay?: boolean;
  bossId?: string | null;
  stars?: number;
  kills?: number;
  retries?: number;
  /** Daily run date, when it was a Daily. */
  dailyDate?: string | null;
  finalDread?: number;
}

export function defaultProfile(): LocalProfile {
  return {
    version: PROFILE_VERSION,
    playerName: 'Player 1',
    gamesCompleted: 0,
    lastQuickPlayLost: false,
    firstLastFlameDone: false,
    customPresets: Array.from({ length: CUSTOM_PRESET_SLOTS }, () => null),
    stats: { vigilPlayed: 0, vigilWon: 0, lastFlamePlayed: 0, lastFlameWon: 0, bestStars: {}, retries: 0, kills: 0, daily: {} },
  };
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
}

function dailyRecord(value: unknown): ProfileStats['daily'] {
  if (!isRecord(value)) return {};
  const out: ProfileStats['daily'] = {};
  for (const [date, entry] of Object.entries(value)) {
    if (isRecord(entry)) out[date] = { stars: count(entry.stars), dread: count(entry.dread) };
  }
  return out;
}

function presetSlot(value: unknown): CustomPreset | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.code !== 'string') return null;
  return { name: value.name.slice(0, 24), code: value.code };
}

/** Rebuild a profile from untrusted JSON, keeping every valid field. */
export function sanitizeProfile(raw: unknown): LocalProfile {
  const base = defaultProfile();
  if (!isRecord(raw)) return base;
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const presets = Array.isArray(raw.customPresets) ? raw.customPresets : [];
  return {
    version: PROFILE_VERSION,
    playerName: typeof raw.playerName === 'string' && raw.playerName.trim() ? raw.playerName.trim().slice(0, 24) : base.playerName,
    gamesCompleted: count(raw.gamesCompleted),
    lastQuickPlayLost: raw.lastQuickPlayLost === true,
    firstLastFlameDone: raw.firstLastFlameDone === true,
    customPresets: Array.from({ length: CUSTOM_PRESET_SLOTS }, (_, i) => presetSlot(presets[i])),
    stats: {
      vigilPlayed: count(stats.vigilPlayed),
      vigilWon: count(stats.vigilWon),
      lastFlamePlayed: count(stats.lastFlamePlayed),
      lastFlameWon: count(stats.lastFlameWon),
      bestStars: numberRecord(stats.bestStars),
      retries: count(stats.retries),
      kills: count(stats.kills),
      daily: dailyRecord(stats.daily),
    },
  };
}

export function loadProfile(storage: KeyValueStorage | null = browserStorage()): LocalProfile {
  return sanitizeProfile(readJson(storage, PROFILE_STORAGE_KEY));
}

export function saveProfile(profile: LocalProfile, storage: KeyValueStorage | null = browserStorage()): boolean {
  return writeJson(storage, PROFILE_STORAGE_KEY, profile);
}

export function isFirstEverGame(profile: UnlockState): boolean {
  return profile.gamesCompleted === 0;
}

/** Record a completed game (pure). Conceded games count as played but never as wins. */
export function recordGame(profile: LocalProfile, game: GameRecord): LocalProfile {
  const won = game.won && !game.conceded;
  const stats: ProfileStats = {
    ...profile.stats,
    bestStars: { ...profile.stats.bestStars },
    daily: { ...profile.stats.daily },
    retries: profile.stats.retries + (game.retries ?? 0),
    kills: profile.stats.kills + (game.kills ?? 0),
  };
  if (game.mode === 'vigil') {
    stats.vigilPlayed += 1;
    if (won) stats.vigilWon += 1;
    if (won && game.bossId) stats.bestStars[game.bossId] = Math.max(stats.bestStars[game.bossId] ?? 0, game.stars ?? 1);
    if (game.dailyDate) {
      const previous = stats.daily[game.dailyDate];
      const result = { stars: won ? (game.stars ?? 1) : 0, dread: game.finalDread ?? 0 };
      if (!previous || result.stars > previous.stars || (result.stars === previous.stars && result.dread < previous.dread)) {
        stats.daily[game.dailyDate] = result;
      }
    }
  } else {
    stats.lastFlamePlayed += 1;
    if (won) stats.lastFlameWon += 1;
  }
  return {
    ...profile,
    gamesCompleted: profile.gamesCompleted + 1,
    lastQuickPlayLost: game.quickPlay ? !won : profile.lastQuickPlayLost,
    firstLastFlameDone: profile.firstLastFlameDone || game.mode === 'last_flame',
    stats,
  };
}

/** Save or clear (null) a Custom 1-3 slot (pure). */
export function setCustomPreset(profile: LocalProfile, slot: number, preset: CustomPreset | null): LocalProfile {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CUSTOM_PRESET_SLOTS) throw new Error(`custom preset slot must be 0-${CUSTOM_PRESET_SLOTS - 1}`);
  const customPresets = profile.customPresets.slice();
  customPresets[slot] = preset ? { name: preset.name.slice(0, 24), code: preset.code } : null;
  return { ...profile, customPresets };
}

export function setPlayerName(profile: LocalProfile, name: string): LocalProfile {
  const trimmed = name.trim().slice(0, 24);
  return trimmed ? { ...profile, playerName: trimmed } : profile;
}
