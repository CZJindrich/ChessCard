import { describe, expect, it } from 'vitest';
import {
  customSelection,
  defaultProfile,
  encodeSettingsCode,
  isFirstEverGame,
  loadProfile,
  memoryStorage,
  PROFILE_STORAGE_KEY,
  quickLastFlameSelection,
  quickPlaySelection,
  recordGame,
  sanitizeProfile,
  saveProfile,
  setCustomPreset,
  setPlayerName,
} from '../../../src/config';

describe('local profile', () => {
  it('starts as a first-ever game', () => {
    const p = defaultProfile();
    expect(isFirstEverGame(p)).toBe(true);
    expect(p.customPresets).toEqual([null, null, null]);
    expect(quickPlaySelection(p, 'moth_witch').flags.tutorial).toBe(true);
  });

  it('walks the unlock ladder (§13.7)', () => {
    let p = recordGame(defaultProfile(), { mode: 'vigil', won: true, quickPlay: true, bossId: 'hush_hierophant', stars: 3, kills: 12 });
    expect(p).toMatchObject({ gamesCompleted: 1, lastQuickPlayLost: false });
    expect(p.stats).toMatchObject({ vigilPlayed: 1, vigilWon: 1, kills: 12, bestStars: { hush_hierophant: 3 } });
    expect(quickPlaySelection(p, null).difficulty).toBe('dusk');
    expect(quickPlaySelection(p, null).locked.tolls).toBe(true);
    p = recordGame(p, { mode: 'vigil', won: false, quickPlay: true });
    expect(p.lastQuickPlayLost).toBe(true);
    expect(quickPlaySelection(p, null).difficulty).toBe('candlelit');
    expect(quickLastFlameSelection(p, null).locked.bounty).toBe(false);
    p = recordGame(p, { mode: 'last_flame', won: true });
    expect(p.firstLastFlameDone).toBe(true);
    expect(p.lastQuickPlayLost).toBe(true);
    expect(quickLastFlameSelection(p, null).locked.bounty).toBeUndefined();
    expect(p.stats).toMatchObject({ lastFlamePlayed: 1, lastFlameWon: 1 });
  });

  it('keeps the best Daily result per date and never counts a concession as a win', () => {
    let p = recordGame(defaultProfile(), { mode: 'vigil', won: true, stars: 1, finalDread: 9, dailyDate: '2026-10-09' });
    p = recordGame(p, { mode: 'vigil', won: true, stars: 2, finalDread: 5, dailyDate: '2026-10-09' });
    p = recordGame(p, { mode: 'vigil', won: true, stars: 2, finalDread: 7, dailyDate: '2026-10-09' });
    expect(p.stats.daily['2026-10-09']).toEqual({ stars: 2, dread: 5 });
    const conceded = recordGame(p, { mode: 'vigil', won: true, conceded: true });
    expect(conceded.stats.vigilWon).toBe(p.stats.vigilWon);
  });

  it('stores up to 3 custom presets as settings codes', () => {
    const code = encodeSettingsCode(customSelection({ length: 'long' }), 'abcd1234');
    const p = setCustomPreset(defaultProfile(), 1, { name: 'Long haul', code });
    expect(p.customPresets).toEqual([null, { name: 'Long haul', code }, null]);
    expect(setCustomPreset(p, 1, null).customPresets[1]).toBeNull();
    expect(() => setCustomPreset(p, 3, null)).toThrow();
  });

  it('loads, saves and sanitises guardedly', () => {
    const storage = memoryStorage();
    const p = setPlayerName(recordGame(defaultProfile(), { mode: 'vigil', won: false }), '  Ada  ');
    expect(saveProfile(p, storage)).toBe(true);
    expect(loadProfile(storage)).toEqual(p);
    expect(loadProfile(memoryStorage({ [PROFILE_STORAGE_KEY]: 'garbage' }))).toEqual(defaultProfile());
    expect(loadProfile(null)).toEqual(defaultProfile());
    const repaired = sanitizeProfile({ gamesCompleted: -4, lastQuickPlayLost: 'yes', customPresets: [{ name: 1 }], stats: { kills: 3.7, bestStars: { nocturna: 2, bad: 'x' } } });
    expect(repaired).toMatchObject({ gamesCompleted: 0, lastQuickPlayLost: false, customPresets: [null, null, null] });
    expect(repaired.stats).toMatchObject({ kills: 3, bestStars: { nocturna: 2 } });
    expect(setPlayerName(p, '   ').playerName).toBe('Ada');
  });
});
