/**
 * Content registry: loads the JSON files in src/content, validates them (pass 1: structure and
 * defaults; pass 2: references and sanity, GDD A.3), merges JSON mods and hashes the result.
 *
 * Decoders return the NORMALISED value (defaults filled) or `undefined` after recording errors,
 * so a registry exists only when every file is valid.
 */
import boonsJson from '../content/boons.json';
import bossIntentsJson from '../content/boss_intents.json';
import bossesJson from '../content/bosses.json';
import botsJson from '../content/bots.json';
import cardsJson from '../content/cards.json';
import configDefaultsJson from '../content/config_defaults.json';
import difficultyJson from '../content/difficulty.json';
import enemiesJson from '../content/enemies.json';
import heirloomsJson from '../content/heirlooms.json';
import heroesJson from '../content/heroes.json';
import housesJson from '../content/houses.json';
import lengthsJson from '../content/lengths.json';
import mapsJson from '../content/maps.json';
import omensJson from '../content/omens.json';
import overlaysJson from '../content/overlays.json';
import powersJson from '../content/powers.json';
import ranksJson from '../content/ranks.json';
import reasonsJson from '../content/reasons.json';
import rulesJson from '../content/rules.json';
import runesJson from '../content/runes.json';
import sitesJson from '../content/sites.json';
import statusesJson from '../content/statuses.json';
import tilesJson from '../content/tiles.json';
import tokensJson from '../content/tokens.json';
import tollsJson from '../content/tolls.json';
import traitsJson from '../content/traits.json';
import unitsJson from '../content/units.json';
import { seedFromString } from './rng';
import {
  AI_PREFS,
  AREA_SHAPES,
  ATTACK_KINDS,
  BOARD_SIZES,
  BOSS_TARGETING_RULES,
  BOT_LEVELS,
  CARD_TYPES,
  CUSTOM_OP_IDS,
  DAMAGE_SOURCE_KINDS,
  DIFFICULTIES,
  DIR_SETS,
  DREAD_THRESHOLDS,
  DURATIONS,
  EFFECT_CENTRES,
  EFFECT_SUBJECTS,
  FACTIONS,
  FREE_ACTIONS,
  HOUSE_IDS,
  IMMUNITY_EXTRAS,
  LENGTHS,
  MODES,
  OVERLAY_IDS,
  PATTERN_TYPES,
  PIECE_KINDS,
  PUSH_MODES,
  RANGE_ORIGINS,
  RANK_IDS,
  RARITIES,
  REASON_CODES,
  RULE_KEYS,
  RULE_MOD_IDS,
  RUNE_IDS,
  SEAT_KINDS,
  SIGIL_GLYPHS,
  STATUS_IDS,
  TARGET_SIDES,
  TILE_IDS,
  TOKEN_IDS,
  TOLL_REQUIREMENTS,
  TRAIT_IDS,
  TRIGGERS,
} from './types';
import type {
  AttackDef,
  BoardSizeKey,
  BoonDef,
  BossDef,
  BossIntentDef,
  BossIntentReach,
  BossPhaseDef,
  BotDef,
  CardArt,
  CardDef,
  CardMode,
  CharmDef,
  ConfigDefaultEntry,
  ContentRegistry,
  ContentTable,
  CustomOpId,
  DifficultyDef,
  DifficultyValues,
  EffectOfOp,
  EffectOp,
  EffectOpBase,
  EffectOpName,
  EnemyDef,
  HeirloomDef,
  HeroDef,
  HouseDef,
  Immunity,
  LeapOffsets,
  LengthDef,
  MapDef,
  MapLayout,
  ModeId,
  NearSpec,
  OmenDef,
  OverlayDef,
  Pattern,
  PatternType,
  DirSet,
  PieceFilter,
  PowerDef,
  RankBand,
  RankDef,
  ReasonCode,
  ReasonDef,
  ReasonParams,
  RuleConstants,
  RuneDef,
  ScriptedPlume,
  SiteCounts,
  SiteDef,
  SiteZones,
  StatusDef,
  SummonCount,
  TargetRange,
  TargetSpec,
  TileDef,
  TileWhere,
  TokenDef,
  TollDef,
  TraitDef,
  TutorialOpening,
  UnitDef,
} from './types';

// =============================================================================================
// Errors and file names
// =============================================================================================

export interface ContentError {
  /** Content file name (e.g. "cards"), or "mod" for problems with the mod document itself. */
  file: string;
  /** Path inside the file, e.g. "shield_bash.effects[1].distance". */
  path: string;
  message: string;
}

/** File name (snake_case, as in GDD A.1 and in mod documents) -> registry key. */
export const CONTENT_FILES = {
  heroes: 'heroes',
  powers: 'powers',
  traits: 'traits',
  units: 'units',
  cards: 'cards',
  enemies: 'enemies',
  bosses: 'bosses',
  boss_intents: 'bossIntents',
  tolls: 'tolls',
  omens: 'omens',
  heirlooms: 'heirlooms',
  boons: 'boons',
  tiles: 'tiles',
  overlays: 'overlays',
  tokens: 'tokens',
  statuses: 'statuses',
  ranks: 'ranks',
  houses: 'houses',
  bots: 'bots',
  runes: 'runes',
  sites: 'sites',
  maps: 'maps',
  difficulty: 'difficulty',
  lengths: 'lengths',
  config_defaults: 'configDefaults',
  reasons: 'reasons',
  rules: 'rules',
} as const satisfies Record<string, keyof ContentRegistry>;

export type ContentFileName = keyof typeof CONTENT_FILES;
export const CONTENT_FILE_NAMES = Object.keys(CONTENT_FILES) as ContentFileName[];

/** Raw (unvalidated) content documents keyed by file name. */
export type ContentFiles = Record<ContentFileName, unknown>;

/** Mods larger than this (UTF-8 bytes of the JSON text) are rejected (GDD A.3). */
export const MOD_SIZE_LIMIT = 1024 * 1024;

/** What each bespoke `custom` op does. Engine modules implement them by id. */
export const CUSTOM_OP_DOCS: Readonly<Record<CustomOpId, string>> = {
  smothered_mate:
    'Guttered King special. Escapes = legal king-step vectors (Hot Wax counts as open; edge, Pillars, pieces, Candles, Wicks and Gloam block). ' +
    'CHECK at 1-2 escapes. At 0 escapes at the end of the players phase he takes ceil(damagePct% of max HP) damage ignoring Ward and fills a crown socket, at most maxCrowns times. ' +
    'Last Flame: the damage is split equally among players with a piece adjacent to him. Args: damagePct, maxCrowns.',
  devour_light:
    'Hunger extra: if the hit puts out a Lit Shrine, snuffs a Vigil Candle, destroys a Lantern or fells a piece, Nocturna heals `heal` HP. Args: heal.',
  hollow_bell:
    'Hush Hierophant weakness: Strikes from pieces adjacent to it deal +`bonus` damage to it (cards do not get the bonus). Args: bonus.',
  lantern_volley:
    "Each of the player's Lanterns deals `damage` to every enemy in its 4 orthogonal lines up to `range` tiles, passing through pieces (Pillars block), and pops Plumes on those lines. Args: damage, range.",
  rouse: 'Every subject piece becomes Ready this seat turn (Exhausted cleared, one Move and one Strike restored). No args.',
};

// =============================================================================================
// Decoder toolkit
// =============================================================================================

interface Ctx {
  file: string;
  errors: ContentError[];
}

/** Returns the decoded value, or `undefined` after recording at least one error. */
type Decoder<T> = (value: unknown, path: string, ctx: Ctx) => T | undefined;

interface Field<T> {
  decode: Decoder<T>;
  /** What to do when the key is absent. */
  absent: 'required' | 'omit' | { fallback: () => T };
}

type FieldsOf<T> = { [K in keyof T]-?: Field<T[K]> };

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value);
  return String(value);
}

function joinPath(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

function fail(ctx: Ctx, path: string, message: string): undefined {
  ctx.errors.push({ file: ctx.file, path, message });
  return undefined;
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const req = <T>(decode: Decoder<T>): Field<T> => ({ decode, absent: 'required' });
const opt = <T>(decode: Decoder<T>): Field<T | undefined> => ({ decode, absent: 'omit' });
/** Absent -> a fresh copy of `fallback`. */
const def = <T>(decode: Decoder<T>, fallback: T): Field<T> => ({
  decode,
  absent: { fallback: () => clonePlain(fallback) },
});

function obj<T>(fields: FieldsOf<T>, check?: (value: T, path: string, ctx: Ctx) => T | undefined): Decoder<T> {
  const known = new Set(Object.keys(fields));
  return (value, path, ctx) => {
    if (!isPlain(value)) return fail(ctx, path, `expected an object, got ${describeValue(value)}`);
    let ok = true;
    for (const key of Object.keys(value)) {
      if (known.has(key)) continue;
      fail(ctx, joinPath(path, key), `unknown key "${key}"`);
      ok = false;
    }
    const out: Plain = {};
    for (const key of known) {
      const field = (fields as Record<string, Field<unknown>>)[key];
      const raw = value[key];
      if (raw === undefined) {
        if (field.absent === 'required') {
          fail(ctx, joinPath(path, key), 'is required');
          ok = false;
        } else if (field.absent !== 'omit') {
          out[key] = field.absent.fallback();
        }
        continue;
      }
      const decoded = field.decode(raw, joinPath(path, key), ctx);
      if (decoded === undefined) ok = false;
      else out[key] = decoded;
    }
    if (!ok) return undefined;
    // Every required field is present and every field went through its typed decoder.
    const typed = out as T;
    return check ? check(typed, path, ctx) : typed;
  };
}

function str(opts: { min?: number; max?: number; pattern?: RegExp; what?: string } = {}): Decoder<string> {
  const { min = 1, max = 2000, pattern, what = 'text' } = opts;
  return (value, path, ctx) => {
    if (typeof value !== 'string') return fail(ctx, path, `expected ${what}, got ${describeValue(value)}`);
    if (value.length < min || value.length > max) {
      return fail(ctx, path, `must be ${min}-${max} characters (got ${value.length})`);
    }
    if (pattern && !pattern.test(value)) return fail(ctx, path, `${describeValue(value)} is not a valid ${what}`);
    return value;
  };
}

const idStr = str({ max: 48, pattern: /^[a-z][a-z0-9_]*$/, what: 'snake_case id' });
const text = str({ max: 400 });
const flavor = str({ max: 90, what: 'flavour text (<= 90 characters)' });
const hex = str({ pattern: /^#[0-9A-Fa-f]{6}$/, what: '#RRGGBB colour' });
const square = str({ pattern: /^[a-l](1[0-2]|[1-9])$/, what: 'square name (a1-l12)' });

function num(min: number, max: number, integer = false): Decoder<number> {
  return (value, path, ctx) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fail(ctx, path, `expected a number, got ${describeValue(value)}`);
    }
    if (integer && !Number.isInteger(value)) return fail(ctx, path, `expected an integer, got ${value}`);
    if (value < min || value > max) return fail(ctx, path, `must be ${min}-${max} (got ${value})`);
    return value;
  };
}

const int = (min: number, max: number): Decoder<number> => num(min, max, true);

const bool: Decoder<boolean> = (value, path, ctx) =>
  typeof value === 'boolean' ? value : fail(ctx, path, `expected true/false, got ${describeValue(value)}`);

function oneOf<T extends string>(values: readonly T[], what = 'value'): Decoder<T> {
  return (value, path, ctx) => {
    if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T;
    const shown = values.length <= 12 ? `: ${values.join(', ')}` : '';
    return fail(ctx, path, `${describeValue(value)} is not a known ${what}${shown}`);
  };
}

const lit = <T extends string>(literal: T): Decoder<T> => oneOf([literal]);

function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path, ctx) => (value === null ? null : decode(value, path, ctx));
}

function arr<T>(decode: Decoder<T>, opts: { min?: number; max?: number; unique?: boolean } = {}): Decoder<T[]> {
  const { min = 0, max = 500, unique = false } = opts;
  return (value, path, ctx) => {
    if (!Array.isArray(value)) return fail(ctx, path, `expected an array, got ${describeValue(value)}`);
    if (value.length < min || value.length > max) {
      return fail(ctx, path, `must have ${min}-${max} entries (got ${value.length})`);
    }
    const out: T[] = [];
    let ok = true;
    value.forEach((item, i) => {
      const decoded = decode(item, joinPath(path, i), ctx);
      if (decoded === undefined) ok = false;
      else out.push(decoded);
    });
    if (!ok) return undefined;
    if (unique) {
      const seen = new Set<string>();
      for (const item of out) {
        const key = JSON.stringify(item);
        if (seen.has(key)) return fail(ctx, path, `duplicate entry ${key}`);
        seen.add(key);
      }
    }
    return out;
  };
}

function pair<A, B>(first: Decoder<A>, second: Decoder<B>): Decoder<[A, B]> {
  return (value, path, ctx) => {
    if (!Array.isArray(value) || value.length !== 2) return fail(ctx, path, 'expected a pair [a, b]');
    const a = first(value[0], joinPath(path, 0), ctx);
    const b = second(value[1], joinPath(path, 1), ctx);
    return a === undefined || b === undefined ? undefined : [a, b];
  };
}

/** An object with exactly the given keys. */
function keyed<K extends string, V>(keys: readonly K[], decode: Decoder<V>): Decoder<Record<K, V>> {
  return (value, path, ctx) => {
    if (!isPlain(value)) return fail(ctx, path, `expected an object, got ${describeValue(value)}`);
    let ok = true;
    for (const key of Object.keys(value)) {
      if ((keys as readonly string[]).includes(key)) continue;
      fail(ctx, joinPath(path, key), `unknown key "${key}"`);
      ok = false;
    }
    const out: Partial<Record<K, V>> = {};
    for (const key of keys) {
      if (value[key] === undefined) {
        fail(ctx, joinPath(path, key), 'is required');
        ok = false;
        continue;
      }
      const decoded = decode(value[key], joinPath(path, key), ctx);
      if (decoded === undefined) ok = false;
      else out[key] = decoded;
    }
    return ok ? (out as Record<K, V>) : undefined;
  };
}

const scalar: Decoder<number | string | boolean> = (value, path, ctx) =>
  typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
    ? value
    : fail(ctx, path, `expected a number, text or true/false, got ${describeValue(value)}`);

function scalarRecord(): Decoder<Record<string, number | string | boolean>> {
  return (value, path, ctx) => {
    if (!isPlain(value)) return fail(ctx, path, `expected an object, got ${describeValue(value)}`);
    const out: Record<string, number | string | boolean> = {};
    let ok = true;
    for (const [key, raw] of Object.entries(value)) {
      const decoded = scalar(raw, joinPath(path, key), ctx);
      if (decoded === undefined) ok = false;
      else out[key] = decoded;
    }
    return ok ? out : undefined;
  };
}

function check(ctx: Ctx, condition: boolean, path: string, message: string): boolean {
  if (!condition) fail(ctx, path, message);
  return condition;
}

// =============================================================================================
// Schemas: geometry, attacks, targets
// =============================================================================================

const leapOffsets: Decoder<LeapOffsets> = (value, path, ctx) => {
  if (value === 'knight') return 'knight';
  return arr(pair(int(-12, 12), int(-12, 12)), { min: 1, max: 32, unique: true })(value, path, ctx);
};

const range12 = nullable(int(1, 12));

interface RawPattern {
  type: PatternType;
  dirs?: DirSet;
  range?: number | null;
  offsets?: LeapOffsets | null;
  flying?: boolean;
}

const rawPattern = obj<RawPattern>({
  type: req(oneOf(PATTERN_TYPES, 'pattern type')),
  dirs: opt(oneOf(DIR_SETS, 'direction set')),
  range: opt(range12),
  offsets: opt(nullable(leapOffsets)),
  flying: opt(bool),
});

const pattern: Decoder<Pattern> = (value, path, ctx) => {
  const raw = rawPattern(value, path, ctx);
  if (!raw) return undefined;
  const offsets = raw.offsets ?? null;
  if (raw.type !== 'leap' && offsets !== null) return fail(ctx, joinPath(path, 'offsets'), 'offsets are used only with leap');
  const flying = raw.flying ?? false;
  switch (raw.type) {
    case 'step':
      return { type: 'step', dirs: raw.dirs ?? 'all', range: raw.range === undefined ? 1 : raw.range, offsets: null, flying };
    case 'slide':
      if (raw.range === undefined) return fail(ctx, joinPath(path, 'range'), 'a slide needs a range (null = to the edge)');
      return { type: 'slide', dirs: raw.dirs ?? 'all', range: raw.range, offsets: null, flying };
    case 'leap':
      return { type: 'leap', dirs: raw.dirs ?? 'all', range: null, offsets: offsets ?? 'knight', flying };
    case 'immobile':
      return { type: 'immobile', dirs: 'all', range: null, offsets: null, flying: false };
  }
};

const reach: Decoder<Pattern | 'as_move' | null> = (value, path, ctx) => {
  if (value === 'as_move' || value === null) return value;
  return pattern(value, path, ctx);
};

const atkOrInt: Decoder<'atk' | number> = (value, path, ctx) => (value === 'atk' ? 'atk' : int(0, 99)(value, path, ctx));

interface RawAttack {
  kind: AttackDef['kind'];
  reach?: Pattern | 'as_move' | null;
  area?: AttackDef['area'];
  centered?: boolean;
  dirs?: DirSet;
  range?: number | null;
  minRange?: number;
  firstHit?: boolean;
  pierce?: boolean;
  los?: boolean;
  damage?: 'atk' | number;
  times?: number;
  push?: number;
  pull?: number;
  status?: AttackDef['status'];
  take?: boolean;
  hits?: AttackDef['hits'];
}

const rawAttack = obj<RawAttack>({
  kind: req(oneOf(ATTACK_KINDS, 'attack kind')),
  reach: opt(reach),
  area: opt(oneOf(AREA_SHAPES, 'area shape')),
  centered: opt(bool),
  dirs: opt(oneOf(DIR_SETS, 'direction set')),
  range: opt(range12),
  minRange: opt(int(0, 12)),
  firstHit: opt(bool),
  pierce: opt(bool),
  los: opt(bool),
  damage: opt(atkOrInt),
  times: opt(int(1, 9)),
  push: opt(int(0, 9)),
  pull: opt(int(0, 9)),
  status: opt(nullable(oneOf(STATUS_IDS, 'status'))),
  take: opt(bool),
  hits: opt(oneOf(['all', 'enemies'] as const)),
});

const attack: Decoder<AttackDef> = (value, path, ctx) => {
  const raw = rawAttack(value, path, ctx);
  if (!raw) return undefined;
  const centered = raw.centered ?? false;
  const isMelee = raw.kind === 'melee';
  const firstHit = raw.firstHit ?? false;
  const pierce = raw.pierce ?? false;
  const take = raw.take ?? false;
  let ok = true;
  ok = check(ctx, isMelee || raw.reach === undefined || raw.reach === null, joinPath(path, 'reach'), 'reach is used by melee attacks only') && ok;
  ok = check(ctx, !take || isMelee, joinPath(path, 'take'), 'take is allowed only when kind is melee') && ok;
  ok = check(ctx, !(firstHit && pierce), path, 'firstHit and pierce are mutually exclusive') && ok;
  ok = check(ctx, raw.kind !== 'artillery' || raw.los !== true, joinPath(path, 'los'), 'artillery forces los: false') && ok;
  const needsRange = raw.kind === 'ranged' || raw.kind === 'artillery';
  ok = check(ctx, !needsRange || raw.range !== undefined, joinPath(path, 'range'), `a ${raw.kind} attack needs a range`) && ok;
  const range = raw.range ?? null;
  const minRange = raw.minRange ?? 1;
  ok = check(ctx, range === null || minRange <= range, joinPath(path, 'minRange'), 'minRange must not exceed range') && ok;
  if (!ok) return undefined;
  return {
    kind: raw.kind,
    reach: isMelee ? (raw.reach ?? (centered ? null : 'as_move')) : null,
    area: raw.area ?? 'single',
    centered,
    dirs: raw.dirs ?? 'all',
    range,
    minRange,
    firstHit,
    pierce,
    los: raw.kind === 'artillery' ? false : (raw.los ?? true),
    damage: raw.damage ?? 'atk',
    times: raw.times ?? 1,
    push: raw.push ?? 0,
    pull: raw.pull ?? 0,
    status: raw.status ?? null,
    take,
    hits: raw.hits ?? 'all',
  };
};

const targetRange = obj<TargetRange>({
  from: req(oneOf(RANGE_ORIGINS, 'range origin')),
  max: def(nullable(int(0, 12)), null),
  min: def(int(0, 12), 0),
});

const BOARD_RANGE: TargetRange = { from: 'board', max: null, min: 0 };

const targetSpec = obj<TargetSpec>(
  {
    kind: req(oneOf(['piece', 'tile', 'direction', 'board'] as const, 'target kind')),
    side: def(oneOf(TARGET_SIDES, 'side'), 'any'),
    range: def(targetRange, BOARD_RANGE),
    los: def(bool, false),
    line: def(nullable(obj<{ dirs: DirSet; firstHit: boolean }>({ dirs: req(oneOf(DIR_SETS)), firstHit: def(bool, true) })), null),
    ranks: def(nullable(arr(oneOf(RANK_IDS, 'rank'), { min: 1, unique: true })), null),
    units: def(nullable(arr(idStr, { min: 1, unique: true })), null),
    kinds: def(nullable(arr(oneOf(PIECE_KINDS, 'piece kind'), { min: 1, unique: true })), null),
    self: def(nullable(lit('hero')), null),
    allowPlume: def(bool, false),
    includeCandles: def(bool, false),
    smoldering: def(bool, false),
    singleTile: def(bool, false),
    hasIntent: def(bool, false),
    notStructure: def(bool, false),
    empty: def(bool, false),
    noPlume: def(bool, false),
    pattern: def(nullable(pattern), null),
    adjacentTo: def(
      nullable(obj<{ side: TargetSpec['side']; range: TargetRange }>({ side: req(oneOf(TARGET_SIDES)), range: def(targetRange, BOARD_RANGE) })),
      null,
    ),
    count: def(int(1, 4), 1),
    optional: def(bool, false),
  },
  (spec, path, ctx) => {
    const isTile = spec.kind === 'tile';
    const isPiece = spec.kind === 'piece';
    let ok = true;
    ok = check(ctx, isTile || (!spec.empty && !spec.noPlume && !spec.pattern && !spec.adjacentTo), path, 'empty, noPlume, pattern and adjacentTo apply to tile targets only') && ok;
    ok = check(ctx, isPiece || (!spec.line && !spec.self && !spec.allowPlume && !spec.hasIntent), path, 'line, self, allowPlume and hasIntent apply to piece targets only') && ok;
    ok = check(ctx, spec.range.min <= (spec.range.max ?? 99), joinPath(path, 'range'), 'range.min must not exceed range.max') && ok;
    return ok ? spec : undefined;
  },
);

/** The normalised "no target" spec. */
function boardTarget(): TargetSpec {
  const ctx: Ctx = { file: 'internal', errors: [] };
  const spec = targetSpec({ kind: 'board' }, '', ctx);
  if (!spec) throw new Error('internal: board target failed to decode');
  return spec;
}

const pieceFilter = obj<PieceFilter>({
  side: opt(oneOf(TARGET_SIDES, 'side')),
  faction: opt(oneOf(FACTIONS, 'faction')),
  kinds: opt(arr(oneOf(PIECE_KINDS, 'piece kind'), { min: 1, unique: true })),
  units: opt(arr(idStr, { min: 1, unique: true })),
  ranks: opt(arr(oneOf(RANK_IDS, 'rank'), { min: 1, unique: true })),
  includeCandles: opt(bool),
});

// =============================================================================================
// Schemas: effect ops
// =============================================================================================

const baseFields: FieldsOf<EffectOpBase> = {
  to: opt(oneOf(EFFECT_SUBJECTS, 'effect subject')),
  filter: opt(pieceFilter),
  area: opt(oneOf(AREA_SHAPES, 'area shape')),
  at: opt(oneOf(EFFECT_CENTRES, 'effect centre')),
  trigger: opt(oneOf(TRIGGERS, 'trigger')),
  sources: opt(arr(oneOf(DAMAGE_SOURCE_KINDS, 'damage source'), { min: 1, unique: true })),
  ifSurvives: opt(bool),
  mode: opt(oneOf(MODES, 'mode')),
};

const healAmount: Decoder<number | 'half' | 'full'> = (value, path, ctx) =>
  value === 'half' || value === 'full' ? value : int(0, 99)(value, path, ctx);

const nearSpec = obj<NearSpec>({
  anchor: req(oneOf(['hero', 'self', 'target', 'board_centre'] as const, 'anchor')),
  max: opt(int(0, 24)),
});

const summonCount: Decoder<SummonCount> = (value, path, ctx) => {
  if (typeof value === 'number') return int(1, 9)(value, path, ctx);
  return obj<{ byPlayers: number[] }>({ byPlayers: req(arr(int(0, 9), { min: 4, max: 4 })) })(value, path, ctx);
};

const tileWhere = obj<TileWhere>({
  base: opt(arr(oneOf(TILE_IDS, 'tile'), { min: 1, unique: true })),
  empty: opt(bool),
  minHeroDistance: opt(int(0, 12)),
  notGloam: opt(bool),
});

const modeOverrides = obj<Partial<Record<ModeId, { unit?: string }>>>({
  vigil: opt(obj<{ unit?: string }>({ unit: opt(idStr) })),
  last_flame: opt(obj<{ unit?: string }>({ unit: opt(idStr) })),
});

function opDecoder<K extends Exclude<EffectOpName, 'custom'>>(
  op: K,
  fields: Omit<FieldsOf<EffectOfOp<K>>, keyof EffectOpBase | 'op'>,
  extraCheck?: (value: EffectOfOp<K>, path: string, ctx: Ctx) => EffectOfOp<K> | undefined,
): Decoder<EffectOfOp<K>> {
  // The spread re-assembles exactly FieldsOf<EffectOfOp<K>> (base fields + op + op-specific fields).
  const all = { op: req(lit(op)), ...fields, ...baseFields } as unknown as FieldsOf<EffectOfOp<K>>;
  return obj<EffectOfOp<K>>(all, extraCheck);
}

const ruleValue: Decoder<number | boolean | string> = scalar;

const customFields: FieldsOf<EffectOfOp<'custom'>> = {
  op: req(lit('custom')),
  id: req(oneOf(CUSTOM_OP_IDS, 'custom op id (mods may reference, not define)')),
  args: def(scalarRecord(), {}),
  ...baseFields,
};
const customStrict = obj<EffectOfOp<'custom'>>(customFields);

/** Custom ops may write their args inline (GDD style: `{ "op": "custom", "id": "x", "damagePct": 15 }`). */
const customOp: Decoder<EffectOfOp<'custom'>> = (value, path, ctx) => {
  if (!isPlain(value)) return fail(ctx, path, `expected an object, got ${describeValue(value)}`);
  const known = new Set(Object.keys(customFields));
  const rest: Plain = {};
  const inline: Plain = {};
  for (const [key, raw] of Object.entries(value)) (known.has(key) ? rest : inline)[key] = raw;
  if (rest.args !== undefined && !isPlain(rest.args)) return fail(ctx, joinPath(path, 'args'), 'expected an object');
  const args = { ...(isPlain(rest.args) ? rest.args : {}), ...inline };
  return customStrict({ ...rest, args }, path, ctx);
};

const OP_DECODERS: { [K in EffectOpName]: Decoder<EffectOfOp<K>> } = {
  damage: opDecoder('damage', {
    amount: req(atkOrInt),
    times: opt(int(1, 9)),
    ignoreWard: opt(bool),
    pierce: opt(bool),
  }),
  heal: opDecoder('heal', { amount: req(healAmount) }),
  ward: opDecoder('ward', {}),
  burn: opDecoder('burn', {}),
  daze: opDecoder('daze', {}),
  push: opDecoder('push', { distance: req(int(1, 9)), from: req(oneOf(EFFECT_CENTRES, 'effect centre')) }),
  pull: opDecoder('pull', { distance: req(int(1, 9)), toward: req(oneOf(EFFECT_CENTRES, 'effect centre')) }),
  swap: opDecoder('swap', {
    a: req(oneOf(EFFECT_SUBJECTS, 'effect subject')),
    b: req(oneOf(EFFECT_SUBJECTS, 'effect subject')),
    ignoreImmunity: opt(bool),
  }),
  teleport: opDecoder('teleport', {
    dest: req(oneOf(['target', 'target2'] as const, 'destination')),
    as: opt(oneOf(['slide', 'teleport'] as const)),
  }),
  summon: opDecoder('summon', {
    unit: req(idStr),
    count: opt(summonCount),
    near: opt(nearSpec),
    upTo: opt(bool),
    owner: opt(oneOf(['player', 'snuff'] as const, 'owner')),
    modeOverrides: opt(modeOverrides),
  }),
  transform: opDecoder('transform', {
    into: req(idStr),
    owner: req(oneOf(['player', 'same'] as const, 'owner')),
    exhausted: opt(bool),
    countsAsKill: opt(bool),
    fullHp: opt(bool),
  }),
  extra_move: opDecoder('extra_move', { amount: req(int(1, 9)) }),
  extra_strike: opDecoder('extra_strike', { amount: req(int(1, 9)) }),
  gain_flame: opDecoder('gain_flame', { amount: req(int(1, 9)) }),
  draw: opDecoder('draw', { amount: req(int(1, 9)) }),
  create_tile: opDecoder('create_tile', {
    tile: req(oneOf(TILE_IDS, 'tile')),
    count: opt(int(1, 24)),
    where: opt(tileWhere),
    onlyEmpty: opt(bool),
  }),
  move_tile: opDecoder('move_tile', { tile: req(oneOf(TILE_IDS, 'tile')), where: opt(tileWhere) }),
  reverse_intent: opDecoder('reverse_intent', {}),
  attach_charm: opDecoder('attach_charm', {}),
  modify_rule: opDecoder(
    'modify_rule',
    {
      rule: req(oneOf(RULE_MOD_IDS, 'rule')),
      delta: opt(int(-9, 9)),
      value: opt(ruleValue),
      duration: opt(oneOf(DURATIONS, 'duration')),
    },
    (op, path, ctx) =>
      check(ctx, (op.delta === undefined) !== (op.value === undefined), path, 'modify_rule needs exactly one of delta or value') ? op : undefined,
  ),
  melt: opDecoder('melt', {}),
  relight: opDecoder('relight', { hp: req(healAmount) }),
  add_dread: opDecoder('add_dread', { amount: req(int(-12, 12)) }),
  add_glory: opDecoder('add_glory', { amount: req(int(-99, 99)) }),
  place_plume: opDecoder('place_plume', { enemy: opt(idStr), count: opt(int(1, 9)), near: opt(nearSpec) }),
  remove_plume: opDecoder('remove_plume', { scope: opt(oneOf(['target', 'area', 'board'] as const, 'scope')) }),
  custom: customOp,
};

const effectOp: Decoder<EffectOp> = (value, path, ctx) => {
  if (!isPlain(value)) return fail(ctx, path, `expected an effect object, got ${describeValue(value)}`);
  const op = value.op;
  if (typeof op !== 'string' || !(op in OP_DECODERS)) {
    return fail(ctx, joinPath(path, 'op'), `${describeValue(op)} is not a known effect op`);
  }
  return OP_DECODERS[op as EffectOpName](value, path, ctx);
};

const effects = arr(effectOp, { max: 16 });

// =============================================================================================
// Schemas: content entries
// =============================================================================================

const immunity = oneOf<Immunity>([...TILE_IDS, ...STATUS_IDS, ...IMMUNITY_EXTRAS], 'immunity');
const immunities = arr(immunity, { unique: true });
const runeId = oneOf(RUNE_IDS, 'rune');
const lightRadius = num(0, 12);
const WICK_LIGHT = 2.2;

const heroDef = obj<HeroDef>({
  id: req(idStr),
  name: req(str({ max: 32 })),
  title: req(str({ max: 48 })),
  displayName: req(str({ max: 80 })),
  className: req(str({ max: 48 })),
  hp: req(int(1, 99)),
  atk: req(int(0, 99)),
  move: req(pattern),
  attack: req(attack),
  trait: req(oneOf(TRAIT_IDS, 'trait')),
  power: req(idStr),
  powerCost: req(int(0, 9)),
  starters: req(arr(idStr, { min: 3, max: 3, unique: true })),
  immune: def(immunities, []),
  flame: req(hex),
  flameEdge: def(nullable(hex), null),
  rune: req(runeId),
  pips: def(nullable(int(1, 12)), null),
  strikeRune: def(nullable(runeId), null),
  lightRadius: def(lightRadius, WICK_LIGHT),
  pitch: req(text),
  look: req(text),
  flavor: req(flavor),
});

const powerDef = obj<PowerDef>({
  id: req(idStr),
  name: req(str({ max: 48 })),
  hero: req(idStr),
  target: req(targetSpec),
  then: def(nullable(targetSpec), null),
  effects: req(effects),
  text: req(text),
  flavor: req(flavor),
});

const traitDef = obj<TraitDef>(
  {
    id: req(oneOf(TRAIT_IDS, 'trait (mods may reference, not define)')),
    name: req(str({ max: 48 })),
    owner: req(oneOf(['hero', 'unit', 'enemy'] as const, 'trait owner')),
    impl: req(oneOf(['effects', 'data', 'engine'] as const, 'trait implementation')),
    effects: def(effects, []),
    mode: def(nullable(oneOf(MODES, 'mode')), null),
    text: req(text),
  },
  (trait, path, ctx) =>
    check(ctx, (trait.impl === 'effects') === trait.effects.length > 0, joinPath(path, 'effects'), 'impl "effects" needs effects; other impls must not have any')
      ? trait
      : undefined,
);

const unitDef = obj<UnitDef>(
  {
    id: req(idStr),
    name: req(str({ max: 48 })),
    rank: req(oneOf(['unit', 'structure'] as const, 'unit rank')),
    structure: def(bool, false),
    hp: req(int(1, 99)),
    atk: req(int(0, 99)),
    move: req(pattern),
    attack: req(attack),
    traits: def(arr(oneOf(TRAIT_IDS, 'trait'), { unique: true }), []),
    immune: def(immunities, []),
    startStatuses: def(arr(oneOf(STATUS_IDS, 'status'), { unique: true }), []),
    lightRadius: def(lightRadius, WICK_LIGHT),
    rune: req(runeId),
    pips: def(nullable(int(1, 12)), null),
    strikeRune: def(nullable(runeId), null),
    card: def(nullable(idStr), null),
    text: req(text),
    look: req(text),
    flavor: req(flavor),
  },
  (unit, path, ctx) =>
    check(ctx, unit.structure === (unit.rank === 'structure'), joinPath(path, 'structure'), 'structure must be true exactly when rank is "structure"')
      ? unit
      : undefined,
);

const tierWeights = keyed(['1', '2', '3'] as const, int(0, 99));

const enemyDef = obj<EnemyDef>(
  {
    id: req(idStr),
    name: req(str({ max: 48 })),
    faction: req(lit('snuff')),
    rank: req(oneOf(['minion', 'soldier', 'elite', 'structure'] as const, 'enemy rank')),
    glory: req(int(0, 99)),
    hp: req(int(1, 99)),
    atk: req(int(0, 99)),
    move: req(pattern),
    attack: req(attack),
    ai: req(obj<{ prefers: EnemyDef['ai']['prefers'] }>({ prefers: req(nullable(oneOf(AI_PREFS, 'AI preference'))) })),
    weight: req(tierWeights),
    immune: def(immunities, []),
    traits: def(arr(oneOf(TRAIT_IDS, 'trait'), { unique: true }), []),
    summonOnly: def(bool, false),
    structure: def(bool, false),
    rune: req(runeId),
    pips: def(nullable(int(1, 12)), null),
    strikeRune: def(nullable(runeId), null),
    text: req(text),
    look: req(text),
    flavor: req(flavor),
  },
  (enemy, path, ctx) => {
    let ok = check(ctx, enemy.structure === (enemy.rank === 'structure'), joinPath(path, 'structure'), 'structure must be true exactly when rank is "structure"');
    ok = check(ctx, enemy.attack.take === false, joinPath(path, 'attack.take'), 'Snuff never Take') && ok;
    return ok ? enemy : undefined;
  },
);

const intentReach: Decoder<BossIntentReach> = (value, path, ctx) => {
  if (!isPlain(value)) return fail(ctx, path, `expected an object, got ${describeValue(value)}`);
  switch (value.kind) {
    case 'within':
      return obj<Extract<BossIntentReach, { kind: 'within' }>>(
        { kind: req(lit('within')), min: def(int(0, 12), 1), max: req(int(1, 12)) },
        (r, p, c) => (check(c, r.min <= r.max, p, 'min must not exceed max') ? r : undefined),
      )(value, path, ctx);
    case 'beam':
      return obj<Extract<BossIntentReach, { kind: 'beam' }>>({ kind: req(lit('beam')), length: req(int(1, 12)) })(value, path, ctx);
    case 'around':
    case 'side':
    case 'global':
      return obj<{ kind: 'around' | 'side' | 'global' }>({ kind: req(oneOf(['around', 'side', 'global'] as const)) })(value, path, ctx);
    default:
      return fail(ctx, joinPath(path, 'kind'), `${describeValue(value.kind)} is not a known reach (within, around, side, beam, global)`);
  }
};

const bossIntentDef = obj<BossIntentDef>(
  {
    id: req(idStr),
    name: req(str({ max: 48 })),
    boss: req(idStr),
    area: req(oneOf([...AREA_SHAPES, 'global'] as const, 'area shape')),
    reach: req(intentReach),
    damage: req(int(0, 99)),
    push: def(int(0, 9), 0),
    pushMode: def(nullable(oneOf(PUSH_MODES, 'push mode')), null),
    pierce: def(bool, false),
    artillery: def(bool, false),
    status: def(nullable(oneOf(STATUS_IDS, 'status')), null),
    createsTile: def(nullable(oneOf(TILE_IDS, 'tile')), null),
    centered: def(bool, false),
    reversible: def(bool, true),
    global: def(nullable(effectOp), null),
    extra: def(nullable(effectOp), null),
    targeting: req(oneOf(BOSS_TARGETING_RULES, 'boss targeting rule')),
    heavy: def(bool, false),
    text: req(text),
  },
  (intent, path, ctx) => {
    let ok = check(ctx, (intent.push > 0) === (intent.pushMode !== null), joinPath(path, 'pushMode'), 'pushMode is required exactly when push > 0');
    ok = check(ctx, !(intent.centered && intent.reversible), joinPath(path, 'reversible'), 'centred intents cannot be reversed') && ok;
    ok = check(ctx, (intent.area === 'global') === (intent.reach.kind === 'global'), joinPath(path, 'reach'), 'global area needs a global reach') && ok;
    return ok ? intent : undefined;
  },
);

const bossPhase = obj<BossPhaseDef>({
  enterAt: def(nullable(pair(int(0, 9), int(1, 9))), null),
  move: req(pattern),
  intents: req(arr(idStr, { min: 1, max: 8 })),
  onEnter: def(effects, []),
  banner: def(nullable(text), null),
});

const bossDef = obj<BossDef>({
  id: req(idStr),
  name: req(str({ max: 48 })),
  epithet: req(str({ max: 64 })),
  size: req(pair(int(1, 4), int(1, 4))),
  hp: req(obj<BossDef['hp']>({ base: req(int(1, 99)), perPlayer: req(int(0, 99)) })),
  immune: def(immunities, []),
  flying: def(bool, false),
  special: def(nullable(effectOp), null),
  weakness: def(nullable(effectOp), null),
  specialText: req(text),
  weaknessText: req(text),
  phases: req(arr(bossPhase, { min: 1, max: 5 })),
  hpBar: req(oneOf(['bell_rope', 'crown_band', 'wing_vein'] as const, 'HP bar style')),
  look: req(text),
  flavor: req(flavor),
});

const tollDef = obj<TollDef>({
  id: req(idStr),
  name: req(str({ max: 48 })),
  kind: req(oneOf(['blessing', 'curse'] as const, 'toll kind')),
  requires: def(arr(oneOf(TOLL_REQUIREMENTS, 'toll requirement'), { unique: true }), []),
  effects: req(effects),
  reward: def(nullable(lit('chandlery_take_two')), null),
  text: req(text),
  flavor: req(flavor),
});

const omenDef = obj<OmenDef>({
  id: req(idStr),
  face: req(int(1, 6)),
  name: req(str({ max: 32 })),
  label: req(str({ max: 24 })),
  tone: req(oneOf(['bad', 'neutral', 'good'] as const, 'tone')),
  effects: req(effects),
  text: req(text),
});

const heirloomDef = obj<HeirloomDef>(
  {
    id: req(idStr),
    name: req(str({ max: 48 })),
    kind: req(oneOf(['passive', 'triggered', 'free_action'] as const, 'heirloom kind')),
    freeAction: def(nullable(oneOf(FREE_ACTIONS, 'free action')), null),
    usesPerNight: def(nullable(int(1, 9)), null),
    target: def(nullable(targetSpec), null),
    effects: req(effects),
    text: req(text),
    flavor: req(flavor),
  },
  (item, path, ctx) => {
    const isAction = item.kind === 'free_action';
    const ok = check(ctx, isAction === (item.freeAction !== null && item.target !== null), path, 'a free_action Heirloom needs freeAction and target (and nothing else may have them)');
    return ok ? item : undefined;
  },
);

const boonDef = obj<BoonDef>({
  id: req(oneOf(['heirloom', 'temper', 'prune'] as const, 'boon')),
  name: req(str({ max: 32 })),
  amount: req(int(1, 9)),
  text: req(text),
});

const tileDef = obj<TileDef>({
  id: req(oneOf(TILE_IDS, 'tile')),
  name: req(str({ max: 32 })),
  enterable: req(bool),
  endsSlide: req(bool),
  blocksLos: req(bool),
  aiCost: req(nullable(int(1, 99))),
  aiCostImmune: def(nullable(int(1, 99)), null),
  lightRadius: def(lightRadius, 0),
  litLightRadius: def(nullable(lightRadius), null),
  damage: def(int(0, 9), 0),
  text: req(text),
});

const overlayDef = obj<OverlayDef>({
  id: req(oneOf(OVERLAY_IDS, 'overlay')),
  name: req(str({ max: 32 })),
  kind: req(oneOf(['overlay', 'structure'] as const, 'overlay kind')),
  hp: def(nullable(int(1, 99)), null),
  damage: def(int(0, 9), 0),
  text: req(text),
});

const tokenDef = obj<TokenDef>({
  id: req(oneOf(TOKEN_IDS, 'token')),
  name: req(str({ max: 32 })),
  hp: def(nullable(int(1, 99)), null),
  text: req(text),
});

const statusDef = obj<StatusDef>({
  id: req(oneOf(STATUS_IDS, 'status')),
  name: req(str({ max: 32 })),
  max: req(int(1, 9)),
  damage: def(int(0, 9), 0),
  tallies: def(nullable(int(1, 9)), null),
  shape: req(idStr),
  text: req(text),
});

const rankDef = obj<RankDef>({
  id: req(oneOf(RANK_IDS, 'rank')),
  name: req(str({ max: 32 })),
  faction: req(oneOf(['snuff', 'wickfolk', 'both'] as const, 'faction')),
  glory: req(nullable(int(0, 99))),
  text: req(text),
});

const houseDef = obj<HouseDef>({
  id: req(oneOf(HOUSE_IDS, 'house')),
  seat: req(int(1, 4)),
  name: req(str({ max: 32 })),
  color: req(hex),
  glyph: req(idStr),
});

const botDef = obj<BotDef>({
  id: req(oneOf(BOT_LEVELS, 'bot level')),
  label: req(str({ max: 16 })),
  flavour: req(str({ max: 16 })),
  nodeBudget: req(int(1, 1_000_000)),
  wallClockMs: req(int(100, 60_000)),
  text: req(text),
});

const runeDef = obj<RuneDef>({
  id: req(runeId),
  name: req(str({ max: 32 })),
  kind: req(oneOf(['move', 'strike', 'modifier'] as const, 'rune kind')),
  text: req(text),
});

const reasonDef = obj<ReasonDef>({
  id: req(oneOf(REASON_CODES, 'reason code')),
  text: req(str({ max: 120 })),
});

const siteCounts = obj<SiteCounts>({
  pillars: req(int(0, 24)),
  rubble: req(int(0, 24)),
  shrines: req(int(0, 8)),
  chimneyPairs: req(int(0, 4)),
  hotWax: req(int(0, 24)),
  smokestacks: req(int(0, 4)),
});

const siteDef = obj<SiteDef>({
  id: req(idStr),
  name: req(str({ max: 48 })),
  pillarLayout: req(oneOf(['mirrored', 'staggered_lanes', 'scattered'] as const, 'pillar layout')),
  counts: req(keyed(['8x8', '10x10'] as const, siteCounts)),
  text: req(text),
  flavor: req(flavor),
});

const rankBand = obj<RankBand>(
  { from: req(int(1, 12)), to: req(int(1, 12)) },
  (band, path, ctx) => (check(ctx, band.from <= band.to, path, '"from" must not exceed "to"') ? band : undefined),
);

const siteZones = obj<SiteZones>({
  deploy: req(rankBand),
  snuff: req(rankBand),
  plume: req(rankBand),
  candles: req(rankBand),
});

const scriptedPlume = obj<ScriptedPlume>({ at: req(square), enemy: req(idStr), tally: req(int(0, 12)) });

const squares = arr(square, { unique: true });

const mapLayout = obj<MapLayout>({
  size: req(oneOf(BOARD_SIZES, 'board size')),
  w: req(int(4, 12)),
  h: req(int(4, 12)),
  pillars: def(squares, []),
  rubble: def(squares, []),
  shrines: def(squares, []),
  chimneys: def(arr(pair(square, square)), []),
  hotWax: def(squares, []),
  candles: def(squares, []),
  heroStarts: req(arr(square, { min: 1, max: 4, unique: true })),
  heroStarts2: def(nullable(arr(square, { min: 2, max: 2, unique: true })), null),
  bossAnchor: def(nullable(square), null),
  zones: def(nullable(siteZones), null),
  finalZone: def(nullable(pair(square, square)), null),
  plumes: def(arr(scriptedPlume), []),
});

const tutorialOpening = obj<TutorialOpening>({
  heroStart: req(square),
  sootlings: req(arr(obj<{ at: string; aim: string }>({ at: req(square), aim: req(square) }), { min: 1, max: 4 })),
  hand: req(arr(idStr, { min: 1, max: 8 })),
  flame: req(int(0, 9)),
  line: req(arr(text, { min: 1, max: 8 })),
});

const tutorialMap: Decoder<Record<string, TutorialOpening>> = (value, path, ctx) => {
  if (!isPlain(value)) return fail(ctx, path, `expected an object keyed by hero id, got ${describeValue(value)}`);
  const out: Record<string, TutorialOpening> = {};
  let ok = true;
  for (const [heroId, raw] of Object.entries(value)) {
    const opening = tutorialOpening(raw, joinPath(path, heroId), ctx);
    if (opening) out[heroId] = opening;
    else ok = false;
  }
  return ok ? out : undefined;
};

const mapDef = obj<MapDef>({
  id: req(idStr),
  name: req(str({ max: 48 })),
  kind: req(oneOf(['tutorial', 'boss_arena', 'ring'] as const, 'map kind')),
  layouts: req(arr(mapLayout, { min: 1, max: 3 })),
  tutorial: def(nullable(tutorialMap), null),
  text: req(text),
  flavor: req(flavor),
});

const difficultyValues = obj<DifficultyValues>({
  starting_dread: req(int(0, 6)),
  dread_max: req(int(8, 16)),
  initial_enemies_mod: req(int(-2, 2)),
  plumes_mod: req(int(-2, 2)),
  enemy_hp_mod: req(oneOf(['none', 'non_minions', 'all'] as const, 'enemy HP mod')),
  boss_hp_multiplier: req(num(0.5, 2)),
  heal_between_nights: req(int(0, 8)),
  extra_smokestack: req(bool),
  retry_night: req(bool),
});

const difficultyDef = obj<DifficultyDef>({
  id: req(oneOf(DIFFICULTIES, 'difficulty')),
  name: req(str({ max: 32 })),
  candles: req(int(1, 4)),
  chip: req(str({ max: 40 })),
  values: req(difficultyValues),
  text: req(text),
});

const lengthDef = obj<LengthDef>({
  id: req(oneOf(LENGTHS, 'length')),
  name: req(str({ max: 32 })),
  turns_per_night: req(int(3, 6)),
  vigil: req(obj<LengthDef['vigil']>({ nights: req(int(2, 8)) })),
  last_flame: req(obj<LengthDef['last_flame']>({ nights: req(int(2, 8)), boss_rounds: req(int(3, 8)) })),
  targetTime: req(text),
});

const seatDefault = obj<{ kind: string; hero: string | null }>({
  kind: req(oneOf(SEAT_KINDS, 'seat kind')),
  hero: req(nullable(idStr)),
});

const configDefaultValue: Decoder<ConfigDefaultEntry['default']> = (value, path, ctx) =>
  Array.isArray(value) ? arr(seatDefault, { min: 1, max: 4 })(value, path, ctx) : scalar(value, path, ctx);

const configDefaultEntry = obj<ConfigDefaultEntry>({
  id: req(oneOf(RULE_KEYS, 'rule parameter')),
  default: req(configDefaultValue),
});

const sizeKey10or12 = ['10x10', '12x12'] as const;

const ruleConstants = obj<RuleConstants>({
  flameCap: req(int(1, 20)),
  handLimit: req(int(1, 20)),
  deckMin: req(int(1, 40)),
  startingDeckSize: req(int(1, 40)),
  charmsPerPiece: req(int(1, 4)),
  summonRange: req(int(1, 12)),
  placementMaxDistance: req(int(1, 12)),
  plumeMinHeroDistance: req(int(0, 12)),
  plumeLegalTiles: req(arr(oneOf(TILE_IDS, 'tile'), { min: 1, unique: true })),
  bumpDamage: req(int(0, 9)),
  plumeBlockDamage: req(int(0, 9)),
  carryOverMax: req(int(0, 6)),
  candlesPerNight: req(int(1, 6)),
  candleMinSpacing: req(int(1, 6)),
  flourishPerTurn: req(int(0, 9)),
  ringBellRange: req(int(1, 12)),
  bossDazeCancelsLast: req(bool),
  selfRelightHp: req(int(1, 9)),
  dawnRelightHp: req(int(1, 9)),
  checkWarnEscapes: req(arr(int(0, 8), { min: 1, unique: true })),
  glory: req(
    obj<RuleConstants['glory']>({
      rivalUnit: req(int(0, 99)),
      rivalHero: req(int(0, 99)),
      bounty: req(int(0, 99)),
      shrine: req(int(0, 99)),
      bossDamagePct: req(int(1, 100)),
      bossKill: req(int(0, 99)),
      survival: req(int(0, 99)),
      heroFalls: req(int(-99, 0)),
    }),
  ),
  dread: req(
    obj<RuleConstants['dread']>({
      candleHit: req(int(0, 9)),
      candleSnuffed: req(int(0, 9)),
      heroFalls: req(int(0, 9)),
      selfRelight: req(int(0, 9)),
      bossToll: req(int(0, 9)),
      dawnPerCandle: req(int(-9, 0)),
      thresholds: req(
        arr(
          obj<RuleConstants['dread']['thresholds'][number]>({
            id: req(oneOf(DREAD_THRESHOLDS, 'Dread threshold')),
            num: req(int(1, 9)),
            den: req(int(1, 9)),
          }),
          { min: 3, max: 3 },
        ),
      ),
    }),
  ),
  chandlery: req(
    obj<RuleConstants['chandlery']>({
      offer: req(int(1, 6)),
      picks: req(int(0, 6)),
      picksAfterCurse: req(int(0, 6)),
      minClassCards: req(int(0, 6)),
      rarityWeights: req(keyed(RARITIES, int(0, 99))),
    }),
  ),
  lightRadius: req(keyed(['wickfolk', 'lantern', 'shrine', 'litShrine'] as const, lightRadius)),
  timers: req(
    obj<RuleConstants['timers']>({
      turn: req(keyed(['slow', 'normal', 'fast'] as const, int(1, 3600))),
      chandlery: req(int(1, 3600)),
      deploy: req(int(1, 3600)),
      toll: req(int(1, 3600)),
      carryOver: req(int(1, 3600)),
      haunt: req(int(1, 3600)),
      retryVote: req(int(1, 3600)),
      latencyGrace: req(num(0, 60)),
      passScreen: req(int(1, 3600)),
      idleDisconnect: req(int(1, 3600)),
    }),
  ),
  gloam: req(
    obj<RuleConstants['gloam']>({
      damage: req(int(0, 9)),
      closings: req(keyed(sizeKey10or12, int(1, 6))),
      finalRound: req(int(1, 8)),
    }),
  ),
  boardSize: req(
    obj<RuleConstants['boardSize']>({
      vigil: req(
        arr(obj<{ maxSeats: number; size: BoardSizeKey }>({ maxSeats: req(int(1, 4)), size: req(oneOf(BOARD_SIZES, 'board size')) }), { min: 1 }),
      ),
      last_flame: req(
        keyed(sizeKey10or12, obj<{ minSeats: number; maxSeats: number }>({ minSeats: req(int(2, 4)), maxSeats: req(int(2, 4)) })),
      ),
    }),
  ),
  vigilZones: req(keyed(['8x8', '10x10'] as const, siteZones)),
  vigilHeroStarts: req(keyed(['8x8', '10x10'] as const, arr(square, { min: 4, max: 4, unique: true }))),
  siteGeneration: req(
    obj<RuleConstants['siteGeneration']>({
      maxAttempts: req(int(1, 1000)),
      minPlumeTiles: req(int(0, 144)),
      enemyMinHeroDistance: req(int(0, 12)),
    }),
  ),
  roomCode: req(
    obj<RuleConstants['roomCode']>({
      alphabet: req(str({ min: 2, max: 64, pattern: /^[A-Z]+$/, what: 'upper-case alphabet' })),
      length: req(int(2, 12)),
      idleMinutes: req(int(1, 24 * 60)),
    }),
  ),
});

const cardArt = obj<CardArt>({
  sigil: req(arr(oneOf(SIGIL_GLYPHS, 'sigil glyph'), { min: 1, max: 4 })),
  accent: req(hex),
});

const charmDef = obj<CharmDef>({
  atk: def(int(-9, 9), 0),
  maxHp: def(int(-9, 9), 0),
  range: def(int(-9, 9), 0),
  triggers: def(effects, []),
});

const cardMode = obj<CardMode>({
  label: req(str({ max: 24 })),
  text: req(text),
  target: req(targetSpec),
  then: def(nullable(targetSpec), null),
  effects: req(effects),
});

const cardDef = obj<CardDef>(
  {
    id: req(idStr),
    name: req(str({ max: 32 })),
    type: req(oneOf(CARD_TYPES, 'card type')),
    cost: req(int(0, 9)),
    rarity: req(oneOf(RARITIES, 'rarity')),
    class: req(nullable(idStr)),
    starter: req(bool),
    starterCopies: def(int(0, 4), 0),
    unit: def(nullable(idStr), null),
    target: { decode: targetSpec, absent: { fallback: boardTarget } },
    then: def(nullable(targetSpec), null),
    effects: req(effects),
    temperedEffects: def(nullable(effects), null),
    modes: def(nullable(arr(cardMode, { min: 2, max: 4 })), null),
    charm: def(nullable(charmDef), null),
    text: req(text),
    flavor: req(flavor),
    art: req(cardArt),
  },
  (card, path, ctx) => {
    let ok = check(ctx, card.starter === card.starterCopies > 0, joinPath(path, 'starterCopies'), 'starter cards need starterCopies > 0, others 0');
    ok = check(ctx, (card.type === 'summon') === (card.unit !== null), joinPath(path, 'unit'), 'summon cards (and only they) name their unit') && ok;
    const attaches = card.effects.some((e) => e.op === 'attach_charm');
    ok = check(ctx, (card.type === 'charm') === (card.charm !== null && attaches), joinPath(path, 'charm'), 'charm cards (and only they) need a charm block and an attach_charm effect') && ok;
    ok = check(ctx, card.modes === null || card.effects.length === 0, joinPath(path, 'effects'), 'cards with modes keep their effects inside the modes') && ok;
    ok = check(ctx, card.modes !== null || card.effects.length > 0, joinPath(path, 'effects'), 'a card needs effects') && ok;
    return ok ? card : undefined;
  },
);

// =============================================================================================
// Registry build (pass 1 + pass 2)
// =============================================================================================

function entryPath(raw: unknown, index: number): string {
  return isPlain(raw) && typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `[${index}]`;
}

function decodeTable<T extends { id: string }>(file: string, raw: unknown, decode: Decoder<T>, errors: ContentError[]): ContentTable<T> | undefined {
  const ctx: Ctx = { file, errors };
  if (!Array.isArray(raw)) return fail(ctx, '', `expected an array of entries, got ${describeValue(raw)}`);
  const byId: Record<string, T> = {};
  const list: T[] = [];
  let ok = true;
  raw.forEach((entry, i) => {
    const path = entryPath(entry, i);
    const value = decode(entry, path, ctx);
    if (!value) {
      ok = false;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(byId, value.id)) {
      fail(ctx, path, `duplicate id "${value.id}"`);
      ok = false;
      return;
    }
    byId[value.id] = value;
    list.push(value);
  });
  return ok ? { byId, list } : undefined;
}

function decodeFiles(files: ContentFiles, errors: ContentError[]): ContentRegistry | undefined {
  const tables = {
    heroes: decodeTable('heroes', files.heroes, heroDef, errors),
    powers: decodeTable('powers', files.powers, powerDef, errors),
    traits: decodeTable('traits', files.traits, traitDef, errors),
    units: decodeTable('units', files.units, unitDef, errors),
    cards: decodeTable('cards', files.cards, cardDef, errors),
    enemies: decodeTable('enemies', files.enemies, enemyDef, errors),
    bosses: decodeTable('bosses', files.bosses, bossDef, errors),
    bossIntents: decodeTable('boss_intents', files.boss_intents, bossIntentDef, errors),
    tolls: decodeTable('tolls', files.tolls, tollDef, errors),
    omens: decodeTable('omens', files.omens, omenDef, errors),
    heirlooms: decodeTable('heirlooms', files.heirlooms, heirloomDef, errors),
    boons: decodeTable('boons', files.boons, boonDef, errors),
    tiles: decodeTable('tiles', files.tiles, tileDef, errors),
    overlays: decodeTable('overlays', files.overlays, overlayDef, errors),
    tokens: decodeTable('tokens', files.tokens, tokenDef, errors),
    statuses: decodeTable('statuses', files.statuses, statusDef, errors),
    ranks: decodeTable('ranks', files.ranks, rankDef, errors),
    houses: decodeTable('houses', files.houses, houseDef, errors),
    bots: decodeTable('bots', files.bots, botDef, errors),
    runes: decodeTable('runes', files.runes, runeDef, errors),
    sites: decodeTable('sites', files.sites, siteDef, errors),
    maps: decodeTable('maps', files.maps, mapDef, errors),
    difficulty: decodeTable('difficulty', files.difficulty, difficultyDef, errors),
    lengths: decodeTable('lengths', files.lengths, lengthDef, errors),
    configDefaults: decodeTable('config_defaults', files.config_defaults, configDefaultEntry, errors),
    reasons: decodeTable('reasons', files.reasons, reasonDef, errors),
  };
  const rules = ruleConstants(files.rules, '', { file: 'rules', errors });
  if (!rules) return undefined;
  if (Object.values(tables).some((table) => table === undefined)) return undefined;
  // Every table decoded (checked just above), so the record satisfies ContentRegistry.
  return { ...(tables as { [K in keyof typeof tables]: NonNullable<(typeof tables)[K]> }), rules };
}

// ---------------------------------------------------------------------------------------------
// Pass 2: references and sanity
// ---------------------------------------------------------------------------------------------

/** Tables whose ids share the global id namespace ("unique across the whole registry"). */
const NAMESPACED_FILES: Array<[ContentFileName, Exclude<keyof ContentRegistry, 'rules' | 'reasons' | 'configDefaults'>]> = [
  ['heroes', 'heroes'],
  ['powers', 'powers'],
  ['traits', 'traits'],
  ['units', 'units'],
  ['cards', 'cards'],
  ['enemies', 'enemies'],
  ['bosses', 'bosses'],
  ['boss_intents', 'bossIntents'],
  ['tolls', 'tolls'],
  ['omens', 'omens'],
  ['heirlooms', 'heirlooms'],
  ['boons', 'boons'],
  ['tiles', 'tiles'],
  ['overlays', 'overlays'],
  ['tokens', 'tokens'],
  ['statuses', 'statuses'],
  ['ranks', 'ranks'],
  ['houses', 'houses'],
  ['bots', 'bots'],
  ['runes', 'runes'],
  ['sites', 'sites'],
  ['maps', 'maps'],
  ['difficulty', 'difficulty'],
  ['lengths', 'lengths'],
];

interface Pass2 {
  reg: ContentRegistry;
  errors: ContentError[];
}

function err(p: Pass2, file: string, path: string, message: string): void {
  p.errors.push({ file, path, message });
}

function checkUniqueIds(p: Pass2): void {
  const owner = new Map<string, string>();
  for (const id of CUSTOM_OP_IDS) owner.set(id, 'custom ops');
  for (const [file, key] of NAMESPACED_FILES) {
    for (const entry of p.reg[key].list) {
      const previous = owner.get(entry.id);
      if (previous) err(p, file, entry.id, `id "${entry.id}" is already used in ${previous}`);
      else owner.set(entry.id, file);
    }
  }
}

function checkComplete(p: Pass2, file: string, table: ContentTable<{ id: string }>, ids: readonly string[]): void {
  for (const id of ids) if (!table.byId[id]) err(p, file, id, `missing entry "${id}"`);
}

function checkClosedVocabularies(p: Pass2): void {
  const r = p.reg;
  checkComplete(p, 'traits', r.traits, TRAIT_IDS);
  checkComplete(p, 'tiles', r.tiles, TILE_IDS);
  checkComplete(p, 'overlays', r.overlays, OVERLAY_IDS);
  checkComplete(p, 'tokens', r.tokens, TOKEN_IDS);
  checkComplete(p, 'statuses', r.statuses, STATUS_IDS);
  checkComplete(p, 'ranks', r.ranks, RANK_IDS);
  checkComplete(p, 'houses', r.houses, HOUSE_IDS);
  checkComplete(p, 'bots', r.bots, BOT_LEVELS);
  checkComplete(p, 'runes', r.runes, RUNE_IDS);
  checkComplete(p, 'boons', r.boons, ['heirloom', 'temper', 'prune']);
  checkComplete(p, 'difficulty', r.difficulty, DIFFICULTIES);
  checkComplete(p, 'lengths', r.lengths, LENGTHS);
  checkComplete(p, 'config_defaults', r.configDefaults, RULE_KEYS);
  checkComplete(p, 'reasons', r.reasons, REASON_CODES);
  const seats = r.houses.list.map((h) => h.seat).sort();
  if (seats.join() !== '1,2,3,4') err(p, 'houses', '', 'houses must cover seats 1-4 exactly once');
  const faces = r.omens.list.map((o) => o.face).sort();
  if (faces.join() !== '1,2,3,4,5,6') err(p, 'omens', '', 'the Moth Die needs exactly one omen per face 1-6');
}

/** Every effect op in the registry with the file/path that holds it. */
function* allEffects(reg: ContentRegistry): Generator<[string, string, EffectOp]> {
  const each = function* (file: string, path: string, list: EffectOp[] | null) {
    if (list) for (const [i, op] of list.entries()) yield [file, `${path}[${i}]`, op] as [string, string, EffectOp];
  };
  for (const c of reg.cards.list) {
    yield* each('cards', `${c.id}.effects`, c.effects);
    yield* each('cards', `${c.id}.temperedEffects`, c.temperedEffects);
    yield* each('cards', `${c.id}.charm.triggers`, c.charm?.triggers ?? null);
    for (const [m, mode] of (c.modes ?? []).entries()) yield* each('cards', `${c.id}.modes[${m}].effects`, mode.effects);
  }
  for (const x of reg.powers.list) yield* each('powers', `${x.id}.effects`, x.effects);
  for (const x of reg.traits.list) yield* each('traits', `${x.id}.effects`, x.effects);
  for (const x of reg.tolls.list) yield* each('tolls', `${x.id}.effects`, x.effects);
  for (const x of reg.omens.list) yield* each('omens', `${x.id}.effects`, x.effects);
  for (const x of reg.heirlooms.list) yield* each('heirlooms', `${x.id}.effects`, x.effects);
  for (const b of reg.bosses.list) {
    if (b.special) yield ['bosses', `${b.id}.special`, b.special];
    if (b.weakness) yield ['bosses', `${b.id}.weakness`, b.weakness];
    for (const [i, phase] of b.phases.entries()) yield* each('bosses', `${b.id}.phases[${i}].onEnter`, phase.onEnter);
  }
  for (const i of reg.bossIntents.list) {
    if (i.global) yield ['boss_intents', `${i.id}.global`, i.global];
    if (i.extra) yield ['boss_intents', `${i.id}.extra`, i.extra];
  }
}

function checkEffectRefs(p: Pass2): void {
  const { units, enemies } = p.reg;
  const isPiece = (id: string) => Boolean(units.byId[id] || enemies.byId[id]);
  for (const [file, path, op] of allEffects(p.reg)) {
    if (op.filter?.units) {
      for (const id of op.filter.units) if (!isPiece(id)) err(p, file, `${path}.filter.units`, `unknown unit or enemy "${id}"`);
    }
    switch (op.op) {
      case 'summon': {
        const pool = op.owner === 'snuff' ? enemies : units;
        if (!pool.byId[op.unit]) err(p, file, `${path}.unit`, `unknown ${op.owner === 'snuff' ? 'enemy' : 'unit'} "${op.unit}"`);
        for (const [mode, override] of Object.entries(op.modeOverrides ?? {})) {
          if (override?.unit && !pool.byId[override.unit]) err(p, file, `${path}.modeOverrides.${mode}.unit`, `unknown "${override.unit}"`);
        }
        break;
      }
      case 'transform':
        if (!isPiece(op.into)) err(p, file, `${path}.into`, `unknown unit or enemy "${op.into}"`);
        break;
      case 'place_plume':
        if (op.enemy !== undefined && !enemies.byId[op.enemy]) err(p, file, `${path}.enemy`, `unknown enemy "${op.enemy}"`);
        break;
      default:
        break;
    }
  }
}

function checkTargetUnits(p: Pass2, file: string, path: string, spec: TargetSpec | null): void {
  for (const id of spec?.units ?? []) {
    if (!p.reg.units.byId[id] && !p.reg.enemies.byId[id]) err(p, file, `${path}.units`, `unknown unit or enemy "${id}"`);
  }
}

function checkHeroesAndCards(p: Pass2): void {
  const { heroes, cards, powers, units } = p.reg;
  for (const hero of heroes.list) {
    const power = powers.byId[hero.power];
    if (!power) err(p, 'heroes', `${hero.id}.power`, `unknown power "${hero.power}"`);
    else if (power.hero !== hero.id) err(p, 'powers', `${power.id}.hero`, `power "${power.id}" belongs to "${power.hero}", not "${hero.id}"`);
    const classStarters = cards.list.filter((c) => c.class === hero.id && c.starter).map((c) => c.id);
    if (classStarters.length !== 3) err(p, 'cards', '', `class "${hero.id}" needs exactly 3 starters (has ${classStarters.length})`);
    for (const id of hero.starters) {
      const card = cards.byId[id];
      if (!card) err(p, 'heroes', `${hero.id}.starters`, `unknown card "${id}"`);
      else if (card.class !== hero.id || !card.starter) err(p, 'heroes', `${hero.id}.starters`, `"${id}" is not a ${hero.id} starter card`);
    }
  }
  for (const power of powers.list) {
    if (!heroes.byId[power.hero]) err(p, 'powers', `${power.id}.hero`, `unknown hero "${power.hero}"`);
    checkTargetUnits(p, 'powers', `${power.id}.target`, power.target);
  }
  for (const card of cards.list) {
    if (card.class !== null && !heroes.byId[card.class]) err(p, 'cards', `${card.id}.class`, `unknown hero class "${card.class}"`);
    if (card.unit !== null && !units.byId[card.unit]) err(p, 'cards', `${card.id}.unit`, `unknown unit "${card.unit}"`);
    checkTargetUnits(p, 'cards', `${card.id}.target`, card.target);
  }
  for (const unit of units.list) {
    if (unit.card === null) continue;
    const card = cards.byId[unit.card];
    if (!card) err(p, 'units', `${unit.id}.card`, `unknown card "${unit.card}"`);
    else if (card.unit !== unit.id) err(p, 'units', `${unit.id}.card`, `card "${card.id}" summons "${card.unit}", not "${unit.id}"`);
  }
  const starterTotal = (heroId: string) =>
    cards.list.filter((c) => c.starter && (c.class === null || c.class === heroId)).reduce((n, c) => n + c.starterCopies, 0);
  for (const hero of heroes.list) {
    const size = starterTotal(hero.id);
    if (size < p.reg.rules.deckMin) err(p, 'cards', '', `the ${hero.id} starting deck has ${size} cards, below the minimum ${p.reg.rules.deckMin}`);
  }
}

function checkSnuff(p: Pass2): void {
  const { enemies, bosses, bossIntents } = p.reg;
  for (const tier of ['1', '2', '3'] as const) {
    if (!enemies.list.some((e) => !e.summonOnly && e.weight[tier] > 0)) err(p, 'enemies', '', `no enemy can be drawn on tier ${tier}`);
  }
  for (const intent of bossIntents.list) {
    if (!bosses.byId[intent.boss]) err(p, 'boss_intents', `${intent.id}.boss`, `unknown boss "${intent.boss}"`);
  }
  for (const boss of bosses.list) {
    let previous = Infinity;
    boss.phases.forEach((phase, i) => {
      const path = `${boss.id}.phases[${i}]`;
      if ((i === 0) !== (phase.enterAt === null)) err(p, 'bosses', `${path}.enterAt`, 'phase 1 has no enterAt; later phases need one');
      if (phase.enterAt) {
        const fraction = phase.enterAt[0] / phase.enterAt[1];
        if (fraction >= previous || fraction >= 1) err(p, 'bosses', `${path}.enterAt`, 'phase thresholds must fall below 1 and decrease');
        previous = fraction;
      }
      for (const id of phase.intents) {
        const intent = bossIntents.byId[id];
        if (!intent) err(p, 'bosses', `${path}.intents`, `unknown boss intent "${id}"`);
        else if (intent.boss !== boss.id) err(p, 'bosses', `${path}.intents`, `intent "${id}" belongs to "${intent.boss}"`);
      }
    });
  }
}

function parseSquare(name: string): { x: number; y: number } {
  return { x: name.charCodeAt(0) - 97, y: Number(name.slice(1)) - 1 };
}

const SIZE_EDGE: Record<BoardSizeKey, number> = { '8x8': 8, '10x10': 10, '12x12': 12 };

function checkLayout(p: Pass2, path: string, layout: MapLayout): void {
  const edge = SIZE_EDGE[layout.size];
  if (layout.w !== edge || layout.h !== edge) err(p, 'maps', `${path}.size`, `size ${layout.size} does not match ${layout.w}x${layout.h}`);
  const occupied = new Map<string, string>();
  const place = (name: string, what: string, field: string) => {
    const { x, y } = parseSquare(name);
    if (x >= layout.w || y >= layout.h) err(p, 'maps', `${path}.${field}`, `${name} is off the ${layout.w}x${layout.h} board`);
    const previous = occupied.get(name);
    if (previous) err(p, 'maps', `${path}.${field}`, `${name} is already used by ${previous}`);
    else occupied.set(name, what);
  };
  for (const s of layout.pillars) place(s, 'a pillar', 'pillars');
  for (const s of layout.rubble) place(s, 'rubble', 'rubble');
  for (const s of layout.shrines) place(s, 'a shrine', 'shrines');
  for (const [a, b] of layout.chimneys) {
    place(a, 'a chimney', 'chimneys');
    place(b, 'a chimney', 'chimneys');
  }
  for (const s of layout.hotWax) place(s, 'hot wax', 'hotWax');
  for (const s of layout.candles) place(s, 'a candle', 'candles');
  const onBoard = (name: string, field: string) => {
    const { x, y } = parseSquare(name);
    if (x >= layout.w || y >= layout.h) err(p, 'maps', `${path}.${field}`, `${name} is off the ${layout.w}x${layout.h} board`);
    if (occupied.has(name)) err(p, 'maps', `${path}.${field}`, `${name} is already used by ${occupied.get(name) ?? ''}`);
  };
  for (const s of layout.heroStarts) onBoard(s, 'heroStarts');
  for (const s of layout.heroStarts2 ?? []) onBoard(s, 'heroStarts2');
  for (const plume of layout.plumes) {
    onBoard(plume.at, 'plumes');
    if (!p.reg.enemies.byId[plume.enemy]) err(p, 'maps', `${path}.plumes`, `unknown enemy "${plume.enemy}"`);
  }
  if (layout.bossAnchor) {
    const { x, y } = parseSquare(layout.bossAnchor);
    if (x + 1 >= layout.w || y + 1 >= layout.h) err(p, 'maps', `${path}.bossAnchor`, 'the 2x2 boss footprint does not fit the board');
  }
  for (const s of layout.finalZone ?? []) onBoard(s, 'finalZone');
}

function checkMaps(p: Pass2): void {
  const { maps, heroes, cards } = p.reg;
  for (const map of maps.list) {
    const sizes = new Set<string>();
    map.layouts.forEach((layout, i) => {
      if (sizes.has(layout.size)) err(p, 'maps', `${map.id}.layouts[${i}]`, `duplicate layout for ${layout.size}`);
      sizes.add(layout.size);
      checkLayout(p, `${map.id}.layouts[${i}]`, layout);
    });
    for (const [heroId, opening] of Object.entries(map.tutorial ?? {})) {
      const path = `${map.id}.tutorial.${heroId}`;
      if (!heroes.byId[heroId]) err(p, 'maps', path, `unknown hero "${heroId}"`);
      for (const id of opening.hand) if (!cards.byId[id]) err(p, 'maps', `${path}.hand`, `unknown card "${id}"`);
      const layout = map.layouts[0];
      for (const s of [opening.heroStart, ...opening.sootlings.flatMap((x) => [x.at, x.aim])]) {
        const { x, y } = parseSquare(s);
        if (x >= layout.w || y >= layout.h) err(p, 'maps', path, `${s} is off the board`);
      }
    }
  }
}

function checkConfigDefaults(p: Pass2): void {
  const seats = p.reg.configDefaults.byId.seats;
  if (seats && !Array.isArray(seats.default)) err(p, 'config_defaults', 'seats.default', 'seats default must be a list of seats');
  for (const entry of p.reg.configDefaults.list) {
    if (entry.id !== 'seats' && Array.isArray(entry.default)) err(p, 'config_defaults', `${entry.id}.default`, 'only seats takes a list');
  }
}

function runPass2(reg: ContentRegistry): ContentError[] {
  const p: Pass2 = { reg, errors: [] };
  checkUniqueIds(p);
  checkClosedVocabularies(p);
  checkEffectRefs(p);
  checkHeroesAndCards(p);
  checkSnuff(p);
  checkMaps(p);
  checkConfigDefaults(p);
  for (const h of reg.heirlooms.list) checkTargetUnits(p, 'heirlooms', `${h.id}.target`, h.target);
  return p.errors;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export interface ContentBuildResult {
  registry: ContentRegistry | null;
  errors: ContentError[];
}

/** Validate raw content documents (pass 1, then pass 2) into a frozen registry. */
export function buildRegistry(files: ContentFiles): ContentBuildResult {
  const errors: ContentError[] = [];
  const decoded = decodeFiles(files, errors);
  if (!decoded) return { registry: null, errors };
  const refErrors = runPass2(decoded);
  if (refErrors.length > 0) return { registry: null, errors: refErrors };
  return { registry: deepFreeze(decoded), errors: [] };
}

/** The shipped content documents. */
export const BASE_CONTENT_FILES: Readonly<ContentFiles> = {
  heroes: heroesJson,
  powers: powersJson,
  traits: traitsJson,
  units: unitsJson,
  cards: cardsJson,
  enemies: enemiesJson,
  bosses: bossesJson,
  boss_intents: bossIntentsJson,
  tolls: tollsJson,
  omens: omensJson,
  heirlooms: heirloomsJson,
  boons: boonsJson,
  tiles: tilesJson,
  overlays: overlaysJson,
  tokens: tokensJson,
  statuses: statusesJson,
  ranks: ranksJson,
  houses: housesJson,
  bots: botsJson,
  runes: runesJson,
  sites: sitesJson,
  maps: mapsJson,
  difficulty: difficultyJson,
  lengths: lengthsJson,
  config_defaults: configDefaultsJson,
  reasons: reasonsJson,
  rules: rulesJson,
};

/** The registry as plain documents (normalised), keyed by file name. */
export function registryToFiles(reg: ContentRegistry): ContentFiles {
  const files: Partial<ContentFiles> = {};
  for (const name of CONTENT_FILE_NAMES) {
    const key = CONTENT_FILES[name];
    files[name] = key === 'rules' ? reg.rules : reg[key].list;
  }
  return files as ContentFiles;
}

// =============================================================================================
// Mods
// =============================================================================================

export interface ModMergeResult {
  /** The merged registry when `errors` is empty, otherwise the unchanged base. */
  registry: ContentRegistry;
  errors: ContentError[];
}

function utf8Length(textValue: string): number {
  let bytes = 0;
  for (let i = 0; i < textValue.length; i++) {
    const code = textValue.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** Objects merge key by key; anything else (arrays included) replaces. Never mutates its inputs. */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return clonePlain(patch);
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = key in base ? deepMerge(base[key], value) : clonePlain(value);
  return out;
}

function mergeTable(file: string, baseList: unknown, patchList: unknown, errors: ContentError[]): unknown {
  if (!Array.isArray(patchList)) {
    errors.push({ file: 'mod', path: file, message: 'expected an array of entries' });
    return baseList;
  }
  const merged: unknown[] = Array.isArray(baseList) ? baseList.slice() : [];
  const indexOf = (id: string) => merged.findIndex((e) => isPlain(e) && e.id === id);
  patchList.forEach((entry, i) => {
    if (!isPlain(entry) || typeof entry.id !== 'string') {
      errors.push({ file, path: `[${i}]`, message: 'a mod entry needs a string "id"' });
      return;
    }
    const at = indexOf(entry.id);
    if (entry.$remove === true) {
      if (at < 0) errors.push({ file, path: entry.id, message: `cannot remove unknown id "${entry.id}"` });
      else merged.splice(at, 1);
      return;
    }
    if (at >= 0) merged[at] = deepMerge(merged[at], entry);
    else merged.push(clonePlain(entry));
  });
  return merged;
}

/**
 * Merge a JSON mod over `base`. A mod is `{ "<file>": [entries...], "rules": {...} }`: entries with
 * a known id are deep-merged over the existing entry (arrays replace), new ids are added, and
 * `{ "id": "x", "$remove": true }` removes an entry. The result is fully re-validated.
 */
export function mergeMod(base: ContentRegistry, mod: unknown): ModMergeResult {
  const errors: ContentError[] = [];
  let doc = mod;
  if (typeof mod === 'string') {
    if (utf8Length(mod) > MOD_SIZE_LIMIT) {
      return { registry: base, errors: [{ file: 'mod', path: '', message: `mod exceeds the ${MOD_SIZE_LIMIT / 1024} KB limit` }] };
    }
    try {
      doc = JSON.parse(mod) as unknown;
    } catch (e) {
      return { registry: base, errors: [{ file: 'mod', path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  } else if (utf8Length(JSON.stringify(mod) ?? '') > MOD_SIZE_LIMIT) {
    return { registry: base, errors: [{ file: 'mod', path: '', message: `mod exceeds the ${MOD_SIZE_LIMIT / 1024} KB limit` }] };
  }
  if (!isPlain(doc)) return { registry: base, errors: [{ file: 'mod', path: '', message: 'a mod must be a JSON object keyed by content file' }] };

  const files: Plain = { ...registryToFiles(base) };
  for (const [file, patch] of Object.entries(doc)) {
    if (!(file in CONTENT_FILES)) {
      errors.push({ file: 'mod', path: file, message: `unknown content file "${file}" (known: ${CONTENT_FILE_NAMES.join(', ')})` });
      continue;
    }
    files[file] = file === 'rules' ? deepMerge(files[file], patch) : mergeTable(file, files[file], patch, errors);
  }
  if (errors.length > 0) return { registry: base, errors };
  const built = buildRegistry(files as ContentFiles);
  return built.registry ? { registry: built.registry, errors: [] } : { registry: base, errors: built.errors };
}

// =============================================================================================
// Hash, active registry, helpers
// =============================================================================================

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlain(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a (32-bit) over the canonical JSON of the normalised registry, as 8 hex digits. */
export function contentHash(reg: ContentRegistry): string {
  return seedFromString(canonicalJson(registryToFiles(reg))).toString(16).padStart(8, '0');
}

/** Build the shipped registry; throws with every error listed if the base content is invalid. */
export function loadBaseContent(): ContentRegistry {
  const { registry, errors } = buildRegistry(BASE_CONTENT_FILES);
  if (!registry) {
    const lines = errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Base content is invalid:\n${lines}`);
  }
  return registry;
}

let active: ContentRegistry | null = null;

/** The active registry (the base content unless `setContent` installed a modded one). */
export function getContent(): ContentRegistry {
  if (!active) active = loadBaseContent();
  return active;
}

/** Install a registry (e.g. from `mergeMod`). Pass null to go back to the base content. */
export function setContent(reg: ContentRegistry | null): void {
  active = reg;
}

/** Localised reason string with `{param}` placeholders filled. Unknown params stay as written. */
export function reasonText(code: ReasonCode, params: ReasonParams = {}, reg: ContentRegistry = getContent()): string {
  const template = reg.reasons.byId[code]?.text ?? code;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Card ids of a hero's starting deck, one entry per copy, in file order. */
export function starterDeckIds(heroId: string, reg: ContentRegistry = getContent()): string[] {
  return reg.cards.list
    .filter((c) => c.starter && (c.class === null || c.class === heroId))
    .flatMap((c) => Array.from({ length: c.starterCopies }, () => c.id));
}

/** Movement rune, pips and strike glyph implied by a move pattern and attack (GDD §5.2). */
export function deriveRunes(move: Pattern, attackDef: AttackDef): { rune: RuneDef['id']; pips: number | null; strikeRune: RuneDef['id'] | null } {
  const strikeRune = attackDef.kind === 'artillery' ? 'rune_arc' : attackDef.kind === 'ranged' ? 'rune_bolt' : null;
  const reachIsPawn =
    attackDef.reach !== null && attackDef.reach !== 'as_move' && attackDef.reach.type === 'step' && attackDef.reach.dirs === 'diag';
  if (move.type === 'immobile') return { rune: 'rune_anchor', pips: null, strikeRune };
  if (move.type === 'leap') return { rune: 'rune_horse', pips: null, strikeRune };
  if (move.type === 'step' && move.dirs === 'orth' && reachIsPawn) return { rune: 'rune_pawn', pips: null, strikeRune };
  if (move.type === 'step' && move.dirs === 'all' && move.range === 1) return { rune: 'rune_crown', pips: null, strikeRune };
  const rune = move.dirs === 'orth' ? 'rune_tower' : move.dirs === 'diag' ? 'rune_mitre' : 'rune_star';
  return { rune, pips: move.range, strikeRune };
}
