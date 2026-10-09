import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  customSelection,
  dailySelection,
  decodeSettingsCode,
  encodeSettingsCode,
  quickPlaySelection,
  resolveConfig,
  settingsCodeNotices,
  SETTINGS_CODE_PREFIX,
} from '../../../src/config';
import type { ConfigSelection } from '../../../src/config';
import { contentHash, getContent } from '../../../src/engine/content';
import { RULE_KEYS } from '../../../src/engine/types';

const HASH = contentHash(getContent());

function payloadOf(code: string): Record<string, unknown> {
  const json = base64UrlDecode(code.slice(SETTINGS_CODE_PREFIX.length));
  if (json === null) throw new Error('bad code');
  return JSON.parse(json) as Record<string, unknown>;
}

function codeFor(payload: unknown): string {
  return SETTINGS_CODE_PREFIX + base64UrlEncode(JSON.stringify(payload));
}

/** The rule values a selection resolves to (seats compared by kind and hero). */
function rulesOf(sel: ConfigSelection): Record<string, unknown> {
  const config = resolveConfig(sel).config;
  const rules: Record<string, unknown> = Object.fromEntries(RULE_KEYS.map((key) => [key, config[key]]));
  rules.seats = config.seats.map((s) => ({ kind: s.kind, hero: s.hero }));
  return rules;
}

describe('URL-safe base64', () => {
  it('round-trips ASCII, accents and emoji without padding or + /', () => {
    for (const text of ['', 'a', 'ab', 'abc', '{"seed":"Café ✨ 🕯️"}', 'x'.repeat(301)]) {
      const encoded = base64UrlEncode(text);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlDecode(encoded)).toBe(text);
    }
    expect(base64UrlEncode('Man')).toBe('TWFu');
    expect(base64UrlDecode('!!!')).toBeNull();
  });
});

describe('encode', () => {
  it('writes presets, only differing overrides and the content hash', () => {
    const code = encodeSettingsCode(customSelection({ mode: 'vigil', length: 'long', difficulty: 'midnight' }), HASH);
    expect(code.startsWith('WAX1:')).toBe(true);
    expect(payloadOf(code)).toEqual({ v: 1, presets: { mode: 'vigil', length: 'long', difficulty: 'midnight' }, overrides: {}, contentHash: HASH });
    const tweaked = customSelection({ overrides: { hand_size: 6, flame_per_turn: 3, dread_max: 12 } });
    expect(payloadOf(encodeSettingsCode(tweaked, HASH)).overrides).toEqual({ hand_size: 6 });
  });

  it('shares seats by kind and hero only', () => {
    const sel = customSelection({
      overrides: {
        seats: [
          { kind: 'human', hero: 'lampwright', name: 'Ada' },
          { kind: 'bot_elder', hero: null, name: 'Bob' },
        ],
      },
    });
    expect(payloadOf(encodeSettingsCode(sel, HASH)).overrides).toEqual({
      seats: [
        { kind: 'human', hero: 'lampwright' },
        { kind: 'bot_elder', hero: null },
      ],
    });
  });
});

describe('round trip', () => {
  const cases: Array<[string, ConfigSelection]> = [
    ['defaults', customSelection()],
    ['last flame tweaks', customSelection({ mode: 'last_flame', length: 'standard', difficulty: 'witching_hour', overrides: {
      seats: [
        { kind: 'human', hero: 'moth_witch', name: 'A' },
        { kind: 'bot_apprentice', hero: null, name: 'B' },
        { kind: 'bot_elder', hero: 'lampwright', name: 'C' },
      ],
      board_size: '12x12', truce: 'nights_1_2', boss_hp_multiplier: 1.55, neutrals: 'swarm', seed: 'Moth Moon ✨',
    } })],
    ['first-ever quick play', quickPlaySelection({ gamesCompleted: 0, lastQuickPlayLost: false, firstLastFlameDone: false }, 'moth_witch')],
    ['daily', dailySelection('2026-10-09', null)],
  ];

  it.each(cases)('%s resolves to the same rule values after decoding', (_name, sel) => {
    const decoded = decodeSettingsCode(encodeSettingsCode(sel, HASH), { contentHash: HASH });
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value).toMatchObject({ unknownKeys: [], clamped: [], invalid: [], contentMismatch: false });
    expect(rulesOf(decoded.value.selection)).toEqual(rulesOf(sel));
  });
});

describe('decode', () => {
  it('clamps out-of-range values and reports unknown keys', () => {
    const code = codeFor({
      v: 1,
      presets: { mode: 'vigil', length: 'short', difficulty: 'dusk' },
      overrides: { nights: 99, hand_size: 1, boss_hp_multiplier: 1.33, tolls: 'off', glitter: true, mode: 'last_flame' },
      contentHash: HASH,
    });
    const decoded = decodeSettingsCode(code, { contentHash: HASH });
    if (!decoded.ok) throw new Error(decoded.error);
    const { selection, unknownKeys, clamped } = decoded.value;
    expect(selection.overrides).toEqual({ nights: 8, hand_size: 4, boss_hp_multiplier: 1.35, tolls: false });
    expect(unknownKeys).toEqual(['glitter', 'mode']);
    expect(clamped).toEqual([
      { key: 'nights', from: 99, to: 8 },
      { key: 'hand_size', from: 1, to: 4 },
      { key: 'boss_hp_multiplier', from: 1.33, to: 1.35 },
    ]);
    expect(settingsCodeNotices(decoded.value)).toEqual([
      'Ignored unknown settings: glitter, mode',
      'nights adjusted from 99 to 8',
      'hand_size adjusted from 1 to 4',
      'boss_hp_multiplier adjusted from 1.33 to 1.35',
    ]);
  });

  it('drops unreadable values and bad presets', () => {
    const code = codeFor({ v: 1, presets: { mode: 'chess', length: 'eternal' }, overrides: { truce: 'forever', seats: 'many' }, contentHash: HASH });
    const decoded = decodeSettingsCode(code, { contentHash: HASH });
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value.selection).toMatchObject({ mode: 'vigil', length: 'short', difficulty: 'dusk', overrides: {} });
    expect(decoded.value.invalid.map((i) => i.key)).toEqual(['mode', 'length', 'truce', 'seats']);
  });

  it('flags codes made with different content', () => {
    const code = encodeSettingsCode(customSelection(), 'deadbeef');
    const decoded = decodeSettingsCode(code, { contentHash: HASH });
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value.contentMismatch).toBe(true);
    expect(settingsCodeNotices(decoded.value)).toEqual(['Made with different content (mods)']);
  });

  it('rejects codes that are not WAX1 or are damaged', () => {
    expect(decodeSettingsCode('WW1:abc')).toEqual({ ok: false, error: 'Not a Wickwatch settings code (it should start with WAX1:)' });
    expect(decodeSettingsCode('WAX1:%%%').ok).toBe(false);
    expect(decodeSettingsCode(SETTINGS_CODE_PREFIX + base64UrlEncode('{"v":2}'))).toEqual({ ok: false, error: 'Unsupported settings code version' });
    expect(decodeSettingsCode(`  ${encodeSettingsCode(customSelection(), HASH)}\n`).ok).toBe(true);
  });
});
