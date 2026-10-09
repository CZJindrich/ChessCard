import { describe, expect, it } from 'vitest';
import configDefaultsJson from '../../../src/content/config_defaults.json';
import {
  coerceRuleValue,
  concreteSeed,
  customSelection,
  dailySelection,
  defaultRuleValues,
  deriveConfig,
  hiddenKeys,
  layerSelection,
  normalizeSeed,
  quickLastFlameSelection,
  quickPlaySelection,
  resolveConfig,
  RULE_PARAM_LIST,
  RULE_PARAMS,
  validateConfig,
  withDifficulty,
  withLength,
} from '../../../src/config';
import type { LengthId, RuleValues, SeatConfig } from '../../../src/engine/types';
import { RULE_KEYS } from '../../../src/engine/types';

const human = (hero: string | null = null): SeatConfig => ({ kind: 'human', hero, name: 'P' });
const bot = (hero: string | null = null): SeatConfig => ({ kind: 'bot_warden', hero, name: 'B' });
const fresh = { gamesCompleted: 0, lastQuickPlayLost: false, firstLastFlameDone: false };
const veteran = { gamesCompleted: 5, lastQuickPlayLost: false, firstLastFlameDone: true };

function values(patch: Partial<RuleValues>): RuleValues {
  return { ...defaultRuleValues(), ...patch };
}

describe('rule parameters', () => {
  it('cover every rule key with an in-range default', () => {
    expect(RULE_PARAM_LIST.map((p) => p.key)).toEqual([...RULE_KEYS]);
    expect(validateConfig(defaultRuleValues()).issues).toEqual([]);
    for (const p of RULE_PARAM_LIST) {
      expect(p.label.length, p.key).toBeGreaterThan(0);
      expect(p.tooltip.length, p.key).toBeGreaterThan(10);
    }
  });

  it('content/config_defaults.json mirrors the frozen v1 defaults', () => {
    const mirror = Object.fromEntries(configDefaultsJson.map((e) => [e.id, e.default]));
    const defaults = defaultRuleValues() as unknown as Record<string, unknown>;
    expect(Object.keys(mirror)).toEqual([...RULE_KEYS]);
    for (const key of RULE_KEYS) {
      const value = key === 'seats' ? (defaults.seats as SeatConfig[]).map((s) => ({ kind: s.kind, hero: s.hero })) : defaults[key];
      expect(mirror[key], key).toEqual(value);
    }
  });

  it('hides each mode’s foreign parameters (§14.1)', () => {
    expect(hiddenKeys('vigil').sort()).toEqual(['board_size', 'boss_rounds', 'bounty', 'haunting', 'neutrals', 'respawn_before_boss', 'truce']);
    expect(hiddenKeys('last_flame').sort()).toEqual(['dread_max', 'retry_night', 'starting_dread']);
  });
});

describe('precedence: defaults < length < difficulty < one-click < overrides', () => {
  it('records where every value came from', () => {
    const sel = customSelection({ mode: 'vigil', length: 'long', difficulty: 'midnight', overrides: { heal_between_nights: 7, nights: 5 } });
    sel.locked = { tolls: false, heal_between_nights: 1 };
    const { values: v, sources } = layerSelection(sel);
    expect([v.nights, sources.nights]).toEqual([5, 'override']);
    expect([v.turns_per_night, sources.turns_per_night]).toEqual([4, 'length']);
    expect([v.dread_max, sources.dread_max]).toEqual([12, 'difficulty']);
    expect([v.starting_dread, sources.starting_dread]).toEqual([2, 'difficulty']);
    expect([v.tolls, sources.tolls]).toEqual([false, 'mode']);
    expect([v.heal_between_nights, sources.heal_between_nights]).toEqual([7, 'override']);
    expect([v.flame_per_turn, sources.flame_per_turn]).toEqual([3, 'default']);
  });

  it('length presets follow §14.3 per mode', () => {
    const nights = (mode: 'vigil' | 'last_flame', length: LengthId) => layerSelection(customSelection({ mode, length })).values;
    expect(nights('vigil', 'short').nights).toBe(3);
    expect(nights('vigil', 'standard').nights).toBe(4);
    expect(nights('vigil', 'long').nights).toBe(6);
    expect([nights('last_flame', 'long').nights, nights('last_flame', 'long').boss_rounds]).toEqual([5, 6]);
    expect(nights('last_flame', 'short').boss_rounds).toBe(5);
  });

  it('preset keys in overrides are ignored; chips drop stale overrides', () => {
    const sel = customSelection({ overrides: { mode: 'last_flame', nights: 7, dread_max: 9 } });
    expect(layerSelection(sel).values.mode).toBe('vigil');
    expect(withLength(sel, 'long').overrides.nights).toBeUndefined();
    expect(withDifficulty(sel, 'candlelit').overrides.dread_max).toBeUndefined();
  });

  it('turn timer defaults to normal online and off offline', () => {
    expect(layerSelection(customSelection(), { online: true }).values.turn_timer).toBe('normal');
    expect(layerSelection(customSelection()).values.turn_timer).toBe('off');
  });
});

describe('one-click modes', () => {
  it('first-ever Quick Play: short, candlelit, Hierophant, no Tolls / Moth Die / Boons, tutorial', () => {
    const { config, validation } = resolveConfig(quickPlaySelection(fresh, 'moth_witch'));
    expect(config).toMatchObject({
      mode: 'vigil', length: 'short', difficulty: 'candlelit', boss_choice: 'hush_hierophant',
      tolls: false, moth_die: false, boons: false, dread_max: 14, nights: 3, tutorial: true, firstGame: true, daily: false,
    });
    expect(config.seats).toEqual([{ kind: 'human', hero: 'moth_witch', name: 'Player 1' }]);
    expect(validation.ok).toBe(true);
  });

  it('later Quick Play: dusk (candlelit after a loss), random boss, everything on', () => {
    expect(resolveConfig(quickPlaySelection(veteran, 'lampwright')).config).toMatchObject({
      difficulty: 'dusk', boss_choice: 'random', tolls: true, moth_die: true, boons: true, tutorial: false,
    });
    expect(resolveConfig(quickPlaySelection({ ...veteran, lastQuickPlayLost: true }, null)).config.difficulty).toBe('candlelit');
  });

  it('Quick Last Flame: you + 2 Wardens on 10x10; the first one has no Bounty or Haunting', () => {
    const first = resolveConfig(quickLastFlameSelection(fresh, 'ember_duelist'));
    expect(first.config).toMatchObject({ mode: 'last_flame', board_size: '10x10', truce: 'night_1', turn_timer: 'off', bounty: false, haunting: false });
    expect(first.config.seats.map((s) => [s.kind, s.hero])).toEqual([
      ['human', 'ember_duelist'],
      ['bot_warden', null],
      ['bot_warden', null],
    ]);
    expect(first.config.seats[1].name).toBe('Warden of Tallow');
    expect(first.validation.ok).toBe(true);
    expect(resolveConfig(quickLastFlameSelection(veteran, null)).config).toMatchObject({ bounty: true, haunting: true });
  });

  it('Daily: standard, dusk, solo, seed and boss from the date, no Retry, no mods', () => {
    const daily = resolveConfig(dailySelection('2026-10-09', 'sconce_paladin'));
    expect(daily.config).toMatchObject({ length: 'standard', difficulty: 'dusk', seed: 'daily:2026-10-09', retry_night: false, daily: true });
    expect(['hush_hierophant', 'guttered_king', 'nocturna']).toContain(daily.config.boss_choice);
    expect(resolveConfig(dailySelection('2026-10-09', null)).config.boss_choice).toBe(daily.config.boss_choice);
    expect(daily.validation.ok).toBe(true);
    const modded = dailySelection('2026-10-09', null);
    modded.flags.modded = true;
    expect(resolveConfig(modded).validation.issues.map((i) => i.reason)).toEqual(['CFG_DAILY_LOCKED']);
    const retry = dailySelection('2026-10-09', null);
    retry.overrides = { retry_night: true };
    expect(resolveConfig(retry).validation.issues).toMatchObject([{ key: 'retry_night', reason: 'CFG_DAILY_LOCKED' }]);
  });
});

describe('derived values', () => {
  const derived = (patch: Partial<RuleValues>) => deriveConfig(values(patch));

  it('board size by mode and seats (§5.1)', () => {
    expect(derived({ seats: [human()] }).boardSize).toBe('8x8');
    expect(derived({ seats: [human(), bot()] }).boardSize).toBe('8x8');
    expect(derived({ seats: [human(), bot(), bot()] }).boardSize).toBe('10x10');
    expect(derived({ mode: 'last_flame', seats: [human(), bot(), bot()] }).boardSize).toBe('10x10');
    expect(derived({ mode: 'last_flame', seats: [human(), bot(), bot(), bot()] }).boardSize).toBe('12x12');
    expect(derived({ mode: 'last_flame', board_size: '12x12', seats: [human(), bot(), bot()] }).w).toBe(12);
  });

  it('tiers per regular Night (§13.3.3)', () => {
    expect(derived({ nights: 3 }).tiers).toEqual([1, 2]);
    expect(derived({ nights: 4 }).tiers).toEqual([1, 2, 3]);
    expect(derived({ nights: 6 }).tiers).toEqual([1, 1, 2, 2, 3]);
    expect(derived({ mode: 'last_flame', nights: 5, seats: [human(), bot()] }).tiers).toEqual([1, 1, 2, 3]);
  });

  it('the Gloam schedule matches the §13.2.8 table for every board and length', () => {
    const table = (size: '10x10' | '12x12', nights: number) =>
      derived({ mode: 'last_flame', board_size: size, nights, seats: [human(), bot(), bot()] }).gloam?.schedule.map((c) =>
        c.atDawn ? `dawn ${c.night} (${c.openSize})` : `boss ${c.round} (${c.openSize})`,
      );
    expect(table('12x12', 3)).toEqual(['dawn 1 (10)', 'dawn 2 (8)', 'boss 1 (6)', 'boss 3 (4)']);
    expect(table('12x12', 4)).toEqual(['dawn 1 (10)', 'dawn 2 (8)', 'dawn 3 (6)', 'boss 3 (4)']);
    expect(table('12x12', 5)).toEqual(['dawn 2 (10)', 'dawn 3 (8)', 'dawn 4 (6)', 'boss 3 (4)']);
    expect(table('10x10', 3)).toEqual(['dawn 1 (8)', 'dawn 2 (6)', 'boss 3 (4)']);
    expect(table('10x10', 4)).toEqual(['dawn 2 (8)', 'dawn 3 (6)', 'boss 3 (4)']);
    expect(table('10x10', 5)).toEqual(['dawn 3 (8)', 'dawn 4 (6)', 'boss 3 (4)']);
    const dawn = derived({ mode: 'last_flame', board_size: '10x10', nights: 3, seats: [human(), bot()] }).gloam?.schedule[0];
    expect(dawn).toEqual({ night: 1, round: 4, ring: 0, openSize: 8, atDawn: true });
  });

  it('Dread thresholds, timers and truce Nights', () => {
    expect(derived({ dread_max: 12 }).dreadThresholds).toEqual({ dimming: 4, deep_dark: 8, long_night_falls: 12 });
    expect(derived({ dread_max: 14 }).dreadThresholds).toEqual({ dimming: 4, deep_dark: 9, long_night_falls: 14 });
    expect([derived({ turn_timer: 'slow' }).turnTimerSeconds, derived({ turn_timer: 'fast' }).turnTimerSeconds]).toEqual([150, 45]);
    expect(derived({ turn_timer: 'off' }).turnTimerSeconds).toBeNull();
    expect(derived({ mode: 'last_flame', seats: [human(), bot()], nights: 5, truce: 'nights_1_2' }).truceNights).toEqual([1, 2]);
    expect(derived({ mode: 'last_flame', seats: [human(), bot()], neutrals: 'off' }).plumesEnabled).toBe(false);
    expect(derived({}).bossRounds).toBeNull();
  });
});

describe('validation with reasons', () => {
  const reasons = (patch: Partial<RuleValues>) => validateConfig(values(patch)).issues.map((i) => `${i.key}:${i.reason}`);

  it('12x12 needs 3-4 seats; 10x10 needs 2-3', () => {
    const v = validateConfig(values({ mode: 'last_flame', seats: [human(), bot()], board_size: '12x12' }));
    expect(v.issues).toMatchObject([{ key: 'board_size', reason: 'CFG_BOARD_SEATS', message: '12×12 needs 3-4 seats' }]);
    expect(v.disabled.board_size?.map((d) => d.value)).toEqual(['12x12']);
    const four = validateConfig(values({ mode: 'last_flame', seats: [human(), bot(), bot(), bot()] }));
    expect(four.disabled.board_size?.map((d) => d.value)).toEqual(['10x10']);
    expect(reasons({ board_size: '10x10' })).toEqual(['board_size:CFG_BOARD_MODE']);
  });

  it('nights_1_2 needs at least 3 regular Nights', () => {
    const lf = { mode: 'last_flame' as const, seats: [human(), bot()] };
    expect(reasons({ ...lf, nights: 3, truce: 'nights_1_2' })).toEqual(['truce:CFG_TRUCE_NIGHTS']);
    expect(validateConfig(values({ ...lf, nights: 3 })).disabled.truce?.[0]).toMatchObject({ value: 'nights_1_2', message: 'Needs at least 3 regular Nights' });
    expect(reasons({ ...lf, nights: 4, truce: 'nights_1_2' })).toEqual([]);
  });

  it('heroes are unique and known', () => {
    const v = validateConfig(values({ seats: [human('lampwright'), bot('lampwright'), bot('vampire')] }));
    expect(v.issues.map((i) => i.reason)).toEqual(['CFG_DUPLICATE_HERO', 'CFG_UNKNOWN_HERO']);
    expect(v.issues[0].message).toBe('Wicklow is already taken');
    expect(v.disabled.seats?.map((d) => d.value)).toContain('lampwright');
  });

  it('seat count limits per mode, and Last Flame needs a human', () => {
    expect(reasons({ mode: 'last_flame', seats: [human()] })).toContain('seats:CFG_SEAT_COUNT');
    expect(reasons({ mode: 'last_flame', seats: [bot(), bot()] })).toEqual(['seats:CFG_NEED_HUMAN']);
    expect(reasons({ seats: [human(), bot(), bot(), bot(), bot()] })).toContain('seats:CFG_SEAT_COUNT');
    expect(validateConfig(values({ seats: [human(), bot(), bot(), bot()] })).disabled.seats?.map((d) => d.value)).toContain('add');
    expect(validateConfig(values({ seats: [human()] })).disabled.seats?.map((d) => d.value)).toContain('remove');
    expect(reasons({ seats: [{ ...human(), remote: true }] })).toEqual(['seats:CFG_REMOTE_OFFLINE']);
    expect(validateConfig(values({ seats: [{ ...human(), remote: true }] }), { online: true }).ok).toBe(true);
  });

  it('ranges, Dread order, bosses and seeds', () => {
    expect(reasons({ nights: 9 })).toEqual(['nights:CFG_OUT_OF_RANGE']);
    expect(reasons({ boss_hp_multiplier: 2.5 })).toEqual(['boss_hp_multiplier:CFG_OUT_OF_RANGE']);
    expect(reasons({ starting_dread: 6, dread_max: 6 })).toContain('starting_dread:CFG_DREAD_START');
    expect(reasons({ boss_choice: 'dragon' })).toEqual(['boss_choice:CFG_UNKNOWN_BOSS']);
    expect(reasons({ seed: 'x'.repeat(33) })).toEqual(['seed:CFG_SEED']);
    expect(reasons({ seed: ' padded ' })).toEqual(['seed:CFG_SEED']);
    expect(reasons({ seed: 'daily' })).toEqual([]);
  });
});

describe('coercion and seeds', () => {
  it('clamps numbers, snaps the boss multiplier and reads on/off', () => {
    expect(coerceRuleValue('nights', 12)).toEqual({ ok: true, value: 8, clamped: true });
    expect(coerceRuleValue('nights', 4)).toEqual({ ok: true, value: 4, clamped: false });
    expect(coerceRuleValue('boss_hp_multiplier', 1.234)).toEqual({ ok: true, value: 1.25, clamped: true });
    expect(coerceRuleValue('boss_hp_multiplier', 0.1)).toEqual({ ok: true, value: 0.5, clamped: true });
    expect(coerceRuleValue('tolls', 'off')).toEqual({ ok: true, value: false, clamped: false });
    expect(coerceRuleValue('truce', 'forever')).toEqual({ ok: false });
    expect(coerceRuleValue('boss_choice', 'dragon')).toEqual({ ok: true, value: 'random', clamped: true });
    expect(coerceRuleValue('seats', [{ kind: 'bot_elder', hero: 'moth_witch' }])).toMatchObject({
      ok: true,
      value: [{ kind: 'bot_elder', hero: 'moth_witch', name: 'Elder of Beeswax' }],
    });
    expect(coerceRuleValue('seats', [{ kind: 'wizard' }])).toEqual({ ok: false });
  });

  it('normalises seed text (NFC, trimmed, case-sensitive, 32 characters)', () => {
    expect(normalizeSeed('  Moth  ')).toBe('Moth');
    expect(normalizeSeed('Café')).toBe('Café');
    expect(normalizeSeed('x'.repeat(40))).toHaveLength(32);
    expect(normalizeSeed('ABC')).not.toBe(normalizeSeed('abc'));
    const now = new Date('2026-10-09T23:59:00Z');
    expect(concreteSeed('daily', { now, random: () => 'r' })).toBe('daily:2026-10-09');
    expect(concreteSeed('random', { now, random: () => 'wick-123456' })).toBe('wick-123456');
    expect(concreteSeed(' Lantern ', { now, random: () => 'r' })).toBe('Lantern');
  });

  it('resolves the default config with every rule key present', () => {
    const { config } = resolveConfig(customSelection());
    for (const key of RULE_KEYS) expect(config[key], key).toBeDefined();
    expect(RULE_PARAMS.seed.default).toBe('random');
  });
});
