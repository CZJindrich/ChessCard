/**
 * Config resolution (GDD §14.1): layer a ConfigSelection into a GameConfig
 * (defaults < length < difficulty < one-click mode < overrides), compute derived values
 * (board size, tiers, timers, Dread thresholds, the Gloam schedule) and validate the result
 * with per-key reasons the Setup screen uses to grey options out.
 */
import { getContent, reasonText } from '../engine/content';
import { RULE_KEYS, SEAT_KINDS } from '../engine/types';
import type {
  BoardSizeKey,
  ContentRegistry,
  DreadThresholdId,
  GameConfig,
  GloamClosing,
  ModeId,
  ReasonCode,
  ReasonParams,
  RuleConstants,
  RuleKey,
  RuleValues,
  SeatConfig,
  Tier,
} from '../engine/types';
import { cloneJson, defaultRuleValues, hiddenKeys, PRESET_KEYS, RULE_PARAMS, SEED_MAX_LENGTH } from './defaults';
import { defaultSeatName, difficultyPreset, lengthPreset } from './presets';
import type { ConfigSelection, EngineFlags } from './presets';
import { isRecord } from './storage';

export type ParamSource = 'default' | 'length' | 'difficulty' | 'mode' | 'override';

export interface ResolveContext {
  /** Online games default the turn timer to `normal` (offline: `off`). */
  online?: boolean;
  content?: ContentRegistry;
}

export interface LayeredValues {
  values: RuleValues;
  sources: Record<RuleKey, ParamSource>;
}

export interface DerivedConfig {
  boardSize: BoardSizeKey;
  w: number;
  h: number;
  regularNights: number;
  /** Tier of regular Night k at index k - 1 (§13.3.3). */
  tiers: Tier[];
  bossNightTier: Tier;
  /** Round cap on the Boss Night: null = uncapped (Vigil). */
  bossRounds: number | null;
  turnTimerSeconds: number | null;
  /** Vigil only. */
  dreadThresholds: Record<DreadThresholdId, number> | null;
  /** Last Flame only. */
  gloam: { closings: number; schedule: GloamClosing[] } | null;
  /** Last Flame: Nights under truce. */
  truceNights: number[];
  /** Plumes are placed at all (Vigil always; Last Flame unless neutrals are off). */
  plumesEnabled: boolean;
}

export interface DisabledOption {
  value: string;
  reason: ReasonCode;
  params?: ReasonParams;
  message: string;
}

export interface ConfigIssue {
  key: RuleKey;
  reason: ReasonCode;
  params?: ReasonParams;
  message: string;
}

export interface ConfigValidation {
  ok: boolean;
  issues: ConfigIssue[];
  /** Options to grey out, per key, with the reason (seats: 'add', 'remove' and taken hero ids). */
  disabled: Partial<Record<RuleKey, DisabledOption[]>>;
  /** Keys the current mode hides. */
  hidden: RuleKey[];
}

export interface ResolvedConfig {
  config: GameConfig;
  derived: DerivedConfig;
  sources: Record<RuleKey, ParamSource>;
  validation: ConfigValidation;
}

// =============================================================================================
// Layering
// =============================================================================================

function assignLayer(values: RuleValues, sources: Record<RuleKey, ParamSource>, layer: Partial<RuleValues>, source: ParamSource): void {
  const target = values as unknown as Record<RuleKey, unknown>;
  for (const key of RULE_KEYS) {
    const value = layer[key];
    if (value === undefined) continue;
    target[key] = cloneJson(value);
    sources[key] = source;
  }
}

/** Layer a selection's rule values. `includeOverrides: false` gives the preset baseline (settings codes). */
export function layerSelection(sel: ConfigSelection, ctx: ResolveContext = {}, includeOverrides = true): LayeredValues {
  const content = ctx.content ?? getContent();
  const values = defaultRuleValues();
  const sources = Object.fromEntries(RULE_KEYS.map((k) => [k, 'default'])) as Record<RuleKey, ParamSource>;
  values.turn_timer = ctx.online ? 'normal' : 'off';
  values.mode = sel.mode;
  values.length = sel.length;
  values.difficulty = sel.difficulty;
  assignLayer(values, sources, lengthPreset(sel.length, sel.mode, content), 'length');
  assignLayer(values, sources, difficultyPreset(sel.difficulty, content), 'difficulty');
  assignLayer(values, sources, sel.locked, 'mode');
  if (includeOverrides) {
    const overrides: Partial<RuleValues> = { ...sel.overrides };
    for (const key of PRESET_KEYS) delete overrides[key];
    assignLayer(values, sources, overrides, 'override');
  }
  values.seats = values.seats.map((s, i) => ({ ...s, name: s.name || defaultSeatName(s.kind, i, content) }));
  return { values, sources };
}

/** Resolve a selection into the GameConfig for createGame, plus derived values and validation. */
export function resolveConfig(sel: ConfigSelection, ctx: ResolveContext = {}): ResolvedConfig {
  const content = ctx.content ?? getContent();
  const { values, sources } = layerSelection(sel, { ...ctx, content });
  const config: GameConfig = { ...values, ...flagsOf(sel.flags) };
  return {
    config,
    derived: deriveConfig(values, content),
    sources,
    validation: validateConfig(values, { ...ctx, content, flags: sel.flags }),
  };
}

function flagsOf(flags: EngineFlags): EngineFlags {
  return { tutorial: flags.tutorial, firstGame: flags.firstGame, daily: flags.daily, modded: flags.modded };
}

// =============================================================================================
// Derived values
// =============================================================================================

/** Tier of regular Night k of R (§13.3.3): 1 + floor(3(k - 1) / R). */
export function tierForNight(k: number, regularNights: number): Tier {
  return Math.min(3, 1 + Math.floor((3 * (k - 1)) / Math.max(1, regularNights))) as Tier;
}

export function boardSizeFor(values: Pick<RuleValues, 'mode' | 'board_size' | 'seats'>, rules: RuleConstants): BoardSizeKey {
  const seats = values.seats.length;
  if (values.mode === 'vigil') {
    const entry = rules.boardSize.vigil.find((e) => seats <= e.maxSeats) ?? rules.boardSize.vigil[rules.boardSize.vigil.length - 1];
    return entry.size;
  }
  if (values.board_size !== 'auto') return values.board_size;
  return seats <= rules.boardSize.last_flame['10x10'].maxSeats ? '10x10' : '12x12';
}

const EDGE: Record<BoardSizeKey, number> = { '8x8': 8, '10x10': 10, '12x12': 12 };

/**
 * Gloam closings (§13.2.8): the first C - 1 at the Dawns (Tally of round T) of the last C - 1
 * regular Nights; any that do not fit go to boss rounds 1, 2, …; the last at boss round 3.
 */
export function gloamSchedule(
  size: '10x10' | '12x12',
  nights: number,
  turnsPerNight: number,
  rules: RuleConstants,
): GloamClosing[] {
  const closings = rules.gloam.closings[size];
  const edge = EDGE[size];
  const regular = nights - 1;
  const atDawn = Math.min(closings - 1, regular);
  const schedule: GloamClosing[] = [];
  const push = (night: number, round: number, isDawn: boolean) => {
    const ring = schedule.length;
    schedule.push({ night, round, ring, openSize: edge - 2 * (ring + 1), atDawn: isDawn });
  };
  for (let i = 0; i < atDawn; i++) push(regular - atDawn + 1 + i, turnsPerNight, true);
  for (let r = 1; r <= closings - 1 - atDawn; r++) push(nights, r, false);
  push(nights, rules.gloam.finalRound, false);
  return schedule;
}

export function dreadThresholds(dreadMax: number, rules: RuleConstants): Record<DreadThresholdId, number> {
  const out: Partial<Record<DreadThresholdId, number>> = {};
  for (const t of rules.dread.thresholds) out[t.id] = Math.floor((dreadMax * t.num) / t.den);
  return out as Record<DreadThresholdId, number>;
}

export function deriveConfig(values: RuleValues, content: ContentRegistry = getContent()): DerivedConfig {
  const rules = content.rules;
  const boardSize = boardSizeFor(values, rules);
  const edge = EDGE[boardSize];
  const regularNights = Math.max(0, values.nights - 1);
  const isVigil = values.mode === 'vigil';
  const truceNights = isVigil || values.truce === 'off' ? [] : values.truce === 'night_1' ? [1] : [1, 2];
  return {
    boardSize,
    w: edge,
    h: edge,
    regularNights,
    tiers: Array.from({ length: regularNights }, (_, i) => tierForNight(i + 1, regularNights)),
    bossNightTier: 3,
    bossRounds: isVigil ? null : values.boss_rounds,
    turnTimerSeconds: values.turn_timer === 'off' ? null : rules.timers.turn[values.turn_timer],
    dreadThresholds: isVigil ? dreadThresholds(values.dread_max, rules) : null,
    gloam:
      !isVigil && boardSize !== '8x8'
        ? { closings: rules.gloam.closings[boardSize], schedule: gloamSchedule(boardSize, values.nights, values.turns_per_night, rules) }
        : null,
    truceNights: truceNights.filter((n) => n <= regularNights),
    plumesEnabled: isVigil || values.neutrals !== 'off',
  };
}

// =============================================================================================
// Seeds
// =============================================================================================

/** Seed text: NFC, trimmed, case-sensitive, at most 32 characters (§14.6). */
export function normalizeSeed(text: string): string {
  return Array.from(text.normalize('NFC').trim()).slice(0, SEED_MAX_LENGTH).join('');
}

/**
 * The concrete seed for createGame: 'daily' -> "daily:YYYY-MM-DD" (UTC of `now`),
 * 'random' -> `random()` (the caller supplies the randomness), text -> normalised text.
 */
export function concreteSeed(setting: string, opts: { now: Date; random: () => string }): string {
  if (setting === 'daily') return `daily:${opts.now.toISOString().slice(0, 10)}`;
  if (setting === 'random') return normalizeSeed(opts.random()) || 'random';
  return normalizeSeed(setting);
}

/** A readable random seed ("wick-4f9a1c") using Math.random. UI/server only, never the engine. */
export function randomSeedText(): string {
  return `wick-${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

// =============================================================================================
// Coercion (settings codes, lobby patches)
// =============================================================================================

export type CoerceResult<K extends RuleKey> =
  | { ok: true; value: RuleValues[K]; clamped: boolean }
  | { ok: false };

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function coerceSeats(raw: unknown, content: ContentRegistry): { seats: SeatConfig[]; clamped: boolean } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let clamped = raw.length > 4;
  const seats: SeatConfig[] = [];
  for (const entry of raw.slice(0, 4)) {
    if (!isRecord(entry) || typeof entry.kind !== 'string' || !(SEAT_KINDS as readonly string[]).includes(entry.kind)) return null;
    const kind = entry.kind as SeatConfig['kind'];
    let hero: string | null = typeof entry.hero === 'string' ? entry.hero : null;
    if (hero !== null && !content.heroes.byId[hero]) {
      hero = null;
      clamped = true;
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 24) : defaultSeatName(kind, seats.length, content);
    seats.push({ kind, hero, name });
  }
  return { seats, clamped };
}

/** Bring a raw value into a parameter's type and range. Out-of-range numbers are clamped (and flagged). */
export function coerceRuleValue<K extends RuleKey>(key: K, raw: unknown, content: ContentRegistry = getContent()): CoerceResult<K> {
  const spec = RULE_PARAMS[key].spec;
  const ok = (value: unknown, clamped = false): CoerceResult<K> => ({ ok: true, value: value as RuleValues[K], clamped });
  switch (spec.kind) {
    case 'enum':
      return typeof raw === 'string' && spec.options.includes(raw) ? ok(raw) : { ok: false };
    case 'bool':
      if (typeof raw === 'boolean') return ok(raw);
      if (raw === 'on' || raw === 'off') return ok(raw === 'on');
      return { ok: false };
    case 'int':
    case 'float': {
      const n = coerceNumber(raw);
      if (n === null) return { ok: false };
      const step = spec.kind === 'int' ? 1 : spec.step;
      const snapped = Math.round(Math.min(spec.max, Math.max(spec.min, n)) / step) * step;
      const value = spec.kind === 'int' ? snapped : Number(snapped.toFixed(4));
      return ok(value, value !== n);
    }
    case 'boss': {
      if (raw === 'random') return ok('random');
      if (typeof raw !== 'string') return { ok: false };
      return content.bosses.byId[raw] ? ok(raw) : ok('random', true);
    }
    case 'seed': {
      if (typeof raw !== 'string') return { ok: false };
      const seed = normalizeSeed(raw);
      return seed ? ok(seed, seed !== raw) : { ok: false };
    }
    case 'seats': {
      const result = coerceSeats(raw, content);
      return result ? ok(result.seats, result.clamped) : { ok: false };
    }
  }
}

// =============================================================================================
// Validation
// =============================================================================================

interface ValidationCtx {
  content: ContentRegistry;
  online: boolean;
  flags: EngineFlags | null;
  issues: ConfigIssue[];
  disabled: Partial<Record<RuleKey, DisabledOption[]>>;
}

function issue(v: ValidationCtx, key: RuleKey, reason: ReasonCode, params?: ReasonParams): void {
  v.issues.push({ key, reason, params, message: reasonText(reason, params, v.content) });
}

function disable(v: ValidationCtx, key: RuleKey, value: string, reason: ReasonCode, params?: ReasonParams): void {
  const list = v.disabled[key] ?? (v.disabled[key] = []);
  list.push({ value, reason, params, message: reasonText(reason, params, v.content) });
}

const SEAT_LIMITS: Record<ModeId, { min: number; max: number }> = { vigil: { min: 1, max: 4 }, last_flame: { min: 2, max: 4 } };
const MODE_NAMES: Record<ModeId, string> = { vigil: 'Vigil', last_flame: 'Last Flame' };

function validateRanges(values: RuleValues, v: ValidationCtx): void {
  for (const key of RULE_KEYS) {
    const spec = RULE_PARAMS[key].spec;
    const value: unknown = values[key];
    if (spec.kind === 'int' || spec.kind === 'float') {
      const n = value as number;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < spec.min || n > spec.max || (spec.kind === 'int' && !Number.isInteger(n))) {
        issue(v, key, 'CFG_OUT_OF_RANGE', { key, min: spec.min, max: spec.max });
      }
    } else if (spec.kind === 'enum' && !spec.options.includes(String(value))) {
      issue(v, key, 'CFG_BAD_VALUE', { key, value: String(value) });
    } else if (spec.kind === 'bool' && typeof value !== 'boolean') {
      issue(v, key, 'CFG_BAD_VALUE', { key, value: String(value) });
    }
  }
}

function validateSeats(values: RuleValues, v: ValidationCtx): void {
  const { min, max } = SEAT_LIMITS[values.mode];
  const count = values.seats.length;
  const params = { mode: MODE_NAMES[values.mode], min, max };
  if (count < min || count > max) issue(v, 'seats', 'CFG_SEAT_COUNT', params);
  if (count >= max) disable(v, 'seats', 'add', 'CFG_SEAT_COUNT', params);
  if (count <= min) disable(v, 'seats', 'remove', 'CFG_SEAT_COUNT', params);
  if (values.mode === 'last_flame' && !values.seats.some((s) => s.kind === 'human')) issue(v, 'seats', 'CFG_NEED_HUMAN');
  const taken = new Map<string, number>();
  values.seats.forEach((s, i) => {
    if (s.remote && !v.online) issue(v, 'seats', 'CFG_REMOTE_OFFLINE');
    if (s.hero === null) return;
    const hero = v.content.heroes.byId[s.hero];
    if (!hero) {
      issue(v, 'seats', 'CFG_UNKNOWN_HERO', { hero: s.hero });
      return;
    }
    if (taken.has(s.hero)) issue(v, 'seats', 'CFG_DUPLICATE_HERO', { hero: hero.name, seat: i + 1 });
    else taken.set(s.hero, i);
  });
  for (const [heroId] of taken) {
    disable(v, 'seats', heroId, 'CFG_DUPLICATE_HERO', { hero: v.content.heroes.byId[heroId]?.name ?? heroId });
  }
}

function validateBoard(values: RuleValues, v: ValidationCtx): void {
  const seats = values.seats.length;
  if (values.mode === 'vigil') {
    if (values.board_size !== 'auto') issue(v, 'board_size', 'CFG_BOARD_MODE');
    for (const size of ['10x10', '12x12']) disable(v, 'board_size', size, 'CFG_BOARD_MODE');
    return;
  }
  for (const size of ['10x10', '12x12'] as const) {
    const { minSeats, maxSeats } = v.content.rules.boardSize.last_flame[size];
    if (seats >= minSeats && seats <= maxSeats) continue;
    const params = { size: size.replace('x', '×'), min: minSeats, max: maxSeats };
    disable(v, 'board_size', size, 'CFG_BOARD_SEATS', params);
    if (values.board_size === size) issue(v, 'board_size', 'CFG_BOARD_SEATS', params);
  }
}

function validateModeRules(values: RuleValues, v: ValidationCtx): void {
  if (values.nights - 1 < 3) {
    disable(v, 'truce', 'nights_1_2', 'CFG_TRUCE_NIGHTS');
    if (values.mode === 'last_flame' && values.truce === 'nights_1_2') issue(v, 'truce', 'CFG_TRUCE_NIGHTS');
  }
  if (values.mode === 'vigil' && values.starting_dread >= values.dread_max) issue(v, 'starting_dread', 'CFG_DREAD_START');
  if (values.boss_choice !== 'random' && !v.content.bosses.byId[values.boss_choice]) {
    issue(v, 'boss_choice', 'CFG_UNKNOWN_BOSS', { boss: values.boss_choice });
  }
  const seed = values.seed;
  if (seed !== 'random' && seed !== 'daily' && (normalizeSeed(seed) !== seed || seed.length === 0)) issue(v, 'seed', 'CFG_SEED');
}

/** Daily locks: standard, dusk, solo Vigil, Retry off, no mods (§14.3, A.3). */
function validateDaily(values: RuleValues, v: ValidationCtx): void {
  if (!v.flags?.daily) return;
  const locked: Array<[RuleKey, boolean]> = [
    ['mode', values.mode === 'vigil'],
    ['length', values.length === 'standard'],
    ['difficulty', values.difficulty === 'dusk'],
    ['seats', values.seats.length === 1],
    ['retry_night', !values.retry_night],
    ['seed', !v.flags.modded],
  ];
  for (const [key, fine] of locked) if (!fine) issue(v, key, 'CFG_DAILY_LOCKED');
  disable(v, 'mode', 'last_flame', 'CFG_DAILY_LOCKED');
  disable(v, 'retry_night', 'on', 'CFG_DAILY_LOCKED');
  disable(v, 'seats', 'add', 'CFG_DAILY_LOCKED');
}

/** Validate resolved rule values. `flags` enables the Daily locks. */
export function validateConfig(
  values: RuleValues,
  ctx: ResolveContext & { flags?: EngineFlags | null } = {},
): ConfigValidation {
  const v: ValidationCtx = {
    content: ctx.content ?? getContent(),
    online: ctx.online ?? false,
    flags: ctx.flags ?? null,
    issues: [],
    disabled: {},
  };
  validateRanges(values, v);
  validateSeats(values, v);
  validateBoard(values, v);
  validateModeRules(values, v);
  validateDaily(values, v);
  return { ok: v.issues.length === 0, issues: v.issues, disabled: v.disabled, hidden: hiddenKeys(values.mode) };
}
