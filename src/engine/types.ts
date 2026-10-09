/**
 * Wickwatch engine types: closed vocabularies, content schemas, configuration, runtime state,
 * actions, events and view helpers. Every other engine module, the UI and the server build on
 * this file, so it covers the whole GDD.
 *
 * Conventions
 * - `Pos` x = file (0 = a), y = rank (0 = rank 1). Rank 1 is the bottom edge.
 * - Seats are 0-based indices everywhere in the engine (House seat 1 = index 0). UI shows index + 1.
 * - Content ids are the GDD's snake_case ids. Config keys are the GDD's snake_case parameter names.
 * - Content types describe the NORMALISED registry (content.ts fills defaults), so optional JSON
 *   fields are required here unless absence carries meaning.
 * - Runtime state is plain JSON: no classes, Maps, Sets, functions or `undefined` in arrays.
 */

/** GameState schema version (bump on breaking changes; saved games and the server check it). */
export const STATE_VERSION = 1;
/** Engine rules version: online players must match it (and the contentHash). */
export const ENGINE_VERSION = '1.0.0';

// =============================================================================================
// Closed vocabularies (runtime lists + derived union types)
// =============================================================================================

export const MODES = ['vigil', 'last_flame'] as const;
export type ModeId = (typeof MODES)[number];

export const LENGTHS = ['short', 'standard', 'long'] as const;
export type LengthId = (typeof LENGTHS)[number];

export const DIFFICULTIES = ['candlelit', 'dusk', 'midnight', 'witching_hour'] as const;
export type DifficultyId = (typeof DIFFICULTIES)[number];

export const PHASES = [
  'night_setup',
  'boss_intro',
  'toll',
  'omen',
  'snuff_move',
  'players',
  'snuff_strike',
  'rise',
  'tally',
  'dawn',
  'chandlery',
  'game_over',
] as const;
export type PhaseId = (typeof PHASES)[number];

/**
 * Phases stepped only by the system action `advance` (GDD §4.1). `boss_intro` is included: it has
 * no player action, the controller advances it after the intro screen.
 */
export const AUTOMATED_PHASES: readonly PhaseId[] = [
  'boss_intro',
  'omen',
  'snuff_move',
  'snuff_strike',
  'rise',
  'tally',
  'dawn',
];

export const SEAT_KINDS = ['human', 'bot_apprentice', 'bot_warden', 'bot_elder'] as const;
export type SeatKind = (typeof SEAT_KINDS)[number];

export const BOT_LEVELS = ['bot_apprentice', 'bot_warden', 'bot_elder'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export const HOUSE_IDS = ['house_beeswax', 'house_tallow', 'house_bayberry', 'house_rushlight'] as const;
export type HouseId = (typeof HOUSE_IDS)[number];

export const BOARD_SIZES = ['8x8', '10x10', '12x12'] as const;
export type BoardSizeKey = (typeof BOARD_SIZES)[number];

export const PATTERN_TYPES = ['step', 'slide', 'leap', 'immobile'] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];

export const DIR_SETS = ['orth', 'diag', 'all'] as const;
export type DirSet = (typeof DIR_SETS)[number];

export const ROTATIONS = ['N', 'E', 'S', 'W'] as const;
/** N = toward higher ranks (+y), E = toward later files (+x). */
export type Rotation = (typeof ROTATIONS)[number];

export const ATTACK_KINDS = ['melee', 'ranged', 'artillery', 'none'] as const;
export type AttackKind = (typeof ATTACK_KINDS)[number];

export const AREA_SHAPES = [
  'single',
  'line',
  'beam2',
  'side2',
  'ring8',
  'ring12',
  'square3',
  'plus5',
  'block2x2',
] as const;
export type AreaShape = (typeof AREA_SHAPES)[number];

export const EFFECT_OPS = [
  'damage',
  'heal',
  'ward',
  'burn',
  'daze',
  'push',
  'pull',
  'swap',
  'teleport',
  'summon',
  'transform',
  'extra_move',
  'extra_strike',
  'gain_flame',
  'draw',
  'create_tile',
  'move_tile',
  'reverse_intent',
  'attach_charm',
  'modify_rule',
  'melt',
  'relight',
  'add_dread',
  'add_glory',
  'place_plume',
  'remove_plume',
  'custom',
] as const;
export type EffectOpName = (typeof EFFECT_OPS)[number];

/**
 * Bespoke rules referenced by `{ op: 'custom', id }`. Mods may reference these but never define
 * new ones (GDD A.2). Descriptions live in `CUSTOM_OP_DOCS` (content.ts).
 */
export const CUSTOM_OP_IDS = [
  'smothered_mate',
  'devour_light',
  'hollow_bell',
  'lantern_volley',
  'rouse',
] as const;
export type CustomOpId = (typeof CUSTOM_OP_IDS)[number];

/**
 * Rule knobs a `modify_rule` effect can turn. `delta` adds to a number, `value` replaces.
 * Each entry notes who uses it in the base content.
 */
export const RULE_MOD_IDS = [
  'hand_size', // lucky_wick (+1)
  'flame_per_turn', // peddler_of_wicks, kindling (+1)
  'draw_extra', // bright_wings (+1 card at seat-turn start)
  'card_limit', // muffled_nave (2), silencing_peal (1)
  'plumes_per_placement', // black_sun (+1)
  'snuff_damage', // eclipse (+1 to every Snuff intent)
  'snuff_move_range', // restless_soot (+1), long_shadows (-1, min 1, leaps unchanged)
  'snuff_attack_status', // bell_of_embers ('burn')
  'wickfolk_range', // soot_fog (-1, min 1: strikes, cards and Powers)
  'omen_good_faces_calm', // ill_omen (true: faces 5 and 6 count as 3)
  'hero_strike_damage', // searing_edge, crimson_finale (+1)
  'hero_strike_burn', // searing_edge (true)
  'flourish_cap', // crimson_finale (4)
  'hero_max_hp', // brass_thimble (+2)
  'card_range_from_hero', // lamplighters_hook (+1)
  'hero_flying', // moth_velvet_cloak (true)
  'first_summon_discount', // candlemakers_mold (1)
] as const;
export type RuleModId = (typeof RULE_MOD_IDS)[number];

/** How long a rule modification lasts. Defaults by source: card/power turn, omen round, toll night, heirloom game. */
export const DURATIONS = ['turn', 'round', 'night', 'game', 'next_players_phase'] as const;
export type Duration = (typeof DURATIONS)[number];

/**
 * When a triggered effect fires. Absent `trigger` = immediately when played (cards, powers,
 * phase onEnter) or passively while the source is active (`modify_rule` on Tolls, Omens, Heirlooms).
 */
export const TRIGGERS = [
  'night_start', // after night_setup placement (Tolls, Heirlooms)
  'round_start',
  'turn_start', // owner's seat-turn start
  'summoned', // the piece arrives (shieldbearer)
  'strike_hit', // the owner's strike hit a target (charms: oath_of_tallow)
  'damaged', // the owner took damage (charms: riposte)
  'kill', // the owner's own strike killed (promotion)
  'death', // the owner died (pop, wax_pool)
  'snuff_move_end', // the owner ended its Snuff Move (crown)
  'tally', // during Tally step 6 (heals) unless the effect says otherwise
  'plume_placement', // each Plume placement (belch, waxen_rain)
  'dawn',
] as const;
export type TriggerId = (typeof TRIGGERS)[number];

export const TILE_IDS = ['flagstone', 'pillar', 'rubble', 'votive_shrine', 'chimney', 'hot_wax'] as const;
export type TileId = (typeof TILE_IDS)[number];

export const OVERLAY_IDS = ['gloam', 'gloam_warning', 'vigil_candle', 'smoldering_wick'] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

export const TOKEN_IDS = ['smoke_plume', 'lit_shrine', 'first_light', 'crown_socket', 'bounty_seal'] as const;
export type TokenId = (typeof TOKEN_IDS)[number];

export const STATUS_IDS = ['ward', 'burn', 'dazed'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const RANK_IDS = ['minion', 'soldier', 'elite', 'structure', 'boss', 'hero', 'unit'] as const;
export type RankId = (typeof RANK_IDS)[number];

export const AI_PREFS = ['candles', 'heroes', 'light', 'clusters', 'nearest'] as const;
export type AiPreference = (typeof AI_PREFS)[number];

export const FREE_ACTIONS = ['melt', 'ring_bell'] as const;
export type FreeActionKind = (typeof FREE_ACTIONS)[number];

export const RARITIES = ['common', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const CARD_TYPES = ['summon', 'rite', 'charm'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const RUNE_IDS = [
  'rune_crown',
  'rune_horse',
  'rune_tower',
  'rune_mitre',
  'rune_star',
  'rune_pawn',
  'rune_wing',
  'rune_arc',
  'rune_bolt',
  'rune_anchor',
] as const;
export type RuneId = (typeof RUNE_IDS)[number];

export const DREAD_THRESHOLDS = ['dimming', 'deep_dark', 'long_night_falls'] as const;
export type DreadThresholdId = (typeof DREAD_THRESHOLDS)[number];

/** Every trait. Closed: traits carry bespoke rules (mods may reference, not define). */
export const TRAIT_IDS = [
  // hero traits
  'stalwart',
  'mothmaker',
  'quick_build',
  'flourish',
  // unit traits
  'promotion',
  'censer',
  'shieldbearer',
  'battering',
  'webs',
  'heavy',
  'pop',
  'twin_knives',
  // enemy traits
  'crown',
  'wax_pool',
  'belch',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

/**
 * `immune` vocabulary (GDD A.2): tile ids, status ids, `displacement` (= push + pull + swap),
 * `push`, `pull`, `swap` (finer-grained, e.g. `stalwart`), `gloam`, `snuff_attacks`.
 * Every boss implicitly has `displacement`, `gloam` and `snuff_attacks`.
 */
export const IMMUNITY_EXTRAS = ['displacement', 'push', 'pull', 'swap', 'gloam', 'snuff_attacks'] as const;
export type Immunity = TileId | StatusId | (typeof IMMUNITY_EXTRAS)[number];

/** Boss intent targeting rules (GDD §10.5). Implemented by id in bosses.ts. */
export const BOSS_TARGETING_RULES = [
  'block_most_heroes', // bell_drop: most heroes, then Wickfolk, then Candles, then reading order
  'fixed', // hushwave: always the ring around the footprint
  'none', // silencing_peal: global
  'side_most_heroes', // ladle_slam: side with most heroes, then most Wickfolk
  'dir_most_wickfolk', // sceptre_sweep, wing_gust: orthogonal direction with most Wickfolk
  'hero_else_wickfolk', // wax_spit
  'brightest_light', // hunger: Lit Shrine > Lantern > Vigil Candle > hero; nearest; reading order
  'square_most_wickfolk', // dust_storm
] as const;
export type BossTargetingRule = (typeof BOSS_TARGETING_RULES)[number];

/** Glyph vocabulary for procedural card sigils (`CardDef.art.sigil`). */
export const SIGIL_GLYPHS = [
  'flame',
  'spark',
  'drop',
  'shield',
  'sun',
  'moon',
  'star',
  'moth',
  'wing',
  'eye',
  'bell',
  'crown',
  'horse',
  'tower',
  'mitre',
  'pawn',
  'lantern',
  'lens',
  'gear',
  'bellows',
  'mortar',
  'blade',
  'twin_blades',
  'ring',
  'key',
  'web',
  'cocoon',
  'spiral',
  'hand',
  'heart',
  'arrow',
  'swap',
  'burst',
  'ember',
  'hourglass',
  'wick',
  'censer',
  'ram',
  'sunrise',
  'seal',
] as const;
export type SigilGlyph = (typeof SIGIL_GLYPHS)[number];

/** Validation reason codes (GDD §15.6 + engine and config extras). Strings in content/reasons.json. */
export const REASON_CODES = [
  // GDD §15.6
  'NEED_FLAME',
  'UNIT_LIMIT',
  'NO_TILE',
  'NO_TARGET',
  'CARD_LIMIT',
  'HERO_SMOLDERING',
  'NO_DIRECTION',
  'TRUCE',
  'RANK_RESTRICTED',
  'PIECE_SPENT',
  'NOT_YOUR_TURN',
  'NO_LOS',
  'HAND_FULL',
  'POWER_USED',
  'DECK_MIN',
  // engine extras
  'WRONG_PHASE',
  'INVALID_ACTION',
  'INVALID_TARGET',
  'UNKNOWN_PIECE',
  'NOT_YOUR_PIECE',
  'EXHAUSTED',
  'NO_MOVE_LEFT',
  'NO_STRIKE_LEFT',
  'IMMOBILE',
  'NOT_IN_HAND',
  'OUT_OF_RANGE',
  'IMMUNE',
  'PLUME_TILE',
  'TILE_BLOCKED',
  'CHIMNEY_BLOCKED',
  'ALREADY_LIT',
  'IN_GLOAM',
  'NOT_ADJACENT',
  'ONCE_PER_NIGHT',
  'NO_UNDO',
  'RETRY_DISABLED',
  'GAME_OVER',
  'ELIMINATED',
  'TURN_ENDED',
  'MODE_ONLY',
  'NOT_ENABLED',
  'NOT_OWNED',
  'NOT_OFFERED',
  'NO_PICKS_LEFT',
  'TOO_MANY',
  'HAUNT_REPEAT',
  'HAUNT_LIMIT',
  'NOT_DEPLOY_ZONE',
  'ALREADY_TEMPERED',
  'NOT_HOST',
  // config validation (Setup screen greys options out with these)
  'CFG_BOARD_SEATS',
  'CFG_BOARD_MODE',
  'CFG_SEAT_COUNT',
  'CFG_NEED_HUMAN',
  'CFG_DUPLICATE_HERO',
  'CFG_UNKNOWN_HERO',
  'CFG_UNKNOWN_BOSS',
  'CFG_TRUCE_NIGHTS',
  'CFG_OUT_OF_RANGE',
  'CFG_BAD_VALUE',
  'CFG_MODE_ONLY',
  'CFG_DAILY_LOCKED',
  'CFG_DREAD_START',
  'CFG_SEED',
  'CFG_REMOTE_OFFLINE',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

// =============================================================================================
// Geometry primitives
// =============================================================================================

/** Board coordinate. x = file (0 = a), y = rank (0 = rank 1). */
export interface Pos {
  x: number;
  y: number;
}

/** Unit direction vector; each component is -1, 0 or 1. */
export type Dir = Pos;

/** Axis-aligned rectangle of tiles (inclusive origin, w × h tiles). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// =============================================================================================
// Content schemas (GDD Appendix A.2), normalised
// =============================================================================================

/** Leap offsets: the 8 knight offsets, or an explicit list of [dx, dy]. */
export type LeapOffsets = 'knight' | Array<[number, number]>;

/**
 * Movement or reach pattern. Normalised: `dirs` is always set (ignored by leap/immobile),
 * `range` is 1 for a plain step, `null` = to the board edge.
 */
export interface Pattern {
  type: PatternType;
  dirs: DirSet;
  range: number | null;
  /** Only with `leap`; otherwise null. */
  offsets: LeapOffsets | null;
  /** Passes over pieces and obstacles; ignores Rubble and Hot Wax while passing. */
  flying: boolean;
}

/**
 * One attack schema for heroes, units and enemies (GDD A.2).
 * Validation: `take` only with melee; artillery forces `los: false`; `firstHit` xor `pierce`.
 */
export interface AttackDef {
  kind: AttackKind;
  /** Melee only: a Pattern, or 'as_move'. Null for other kinds. */
  reach: Pattern | 'as_move' | null;
  area: AreaShape;
  /** Area centred on the attacker itself (ring8 Hush Monk, Clapper). Centred intents cannot be reversed. */
  centered: boolean;
  /** Line directions for ranged attacks. */
  dirs: DirSet;
  /** Max range for ranged / artillery; null = to the edge. */
  range: number | null;
  minRange: number;
  firstHit: boolean;
  pierce: boolean;
  los: boolean;
  damage: 'atk' | number;
  /** Damage instances per hit (twin_knives = 2). */
  times: number;
  push: number;
  pull: number;
  status: StatusId | null;
  take: boolean;
  /** Snuff attacks hit every piece on their tiles ('all'); 'enemies' restricts to the other side. */
  hits: 'all' | 'enemies';
}

export const TARGET_SIDES = ['enemy', 'ally', 'own', 'any'] as const;
/** Relative to the acting seat. In Vigil every Wickfolk piece is an ally; in Last Flame only your own. */
export type TargetSide = (typeof TARGET_SIDES)[number];

export const FACTIONS = ['wickfolk', 'snuff'] as const;
export type Faction = (typeof FACTIONS)[number];

export const PIECE_KINDS = ['hero', 'unit', 'enemy', 'boss', 'candle'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export const RANGE_ORIGINS = ['hero', 'piece', 'any_own', 'board', 'previous'] as const;
/** Where a "within N" range is measured from. `previous` = the previously chosen target. */
export type RangeOrigin = (typeof RANGE_ORIGINS)[number];

export interface TargetRange {
  from: RangeOrigin;
  /** Max Chebyshev distance; null = unlimited (board). */
  max: number | null;
  min: number;
}

/** A filter over pieces, relative to the acting seat (sides) or absolute (faction). */
export interface PieceFilter {
  side?: TargetSide;
  faction?: Faction;
  kinds?: PieceKind[];
  /** Allowed def ids (unit/enemy/hero ids). */
  units?: string[];
  ranks?: RankId[];
  /** Vigil Candles count as allied pieces for this effect. */
  includeCandles?: boolean;
}

/**
 * Card / Power / Heirloom target (GDD A.2 "Targets"). One spec = one pick (or `count` picks).
 * Range is measured with Chebyshev distance; multi-tile pieces use their nearest footprint tile.
 */
export interface TargetSpec {
  kind: 'piece' | 'tile' | 'direction' | 'board';
  side: TargetSide;
  range: TargetRange;
  /** Needs a clear straight orthogonal/diagonal line from the range origin. */
  los: boolean;
  /** "First enemy in a straight line": the target must be the first piece on a line from the origin. */
  line: { dirs: DirSet; firstHit: boolean } | null;
  ranks: RankId[] | null;
  /** Allowed def ids (e.g. lens_of_brass: lantern, wick_mortar). */
  units: string[] | null;
  kinds: PieceKind[] | null;
  /** Must be the acting player's own hero. */
  self: 'hero' | null;
  /** A Smoke Plume tile is also a valid choice (sent as a tile choice). */
  allowPlume: boolean;
  includeCandles: boolean;
  /** true: must be a Smoldering Wick; false: Smoldering Wicks are excluded. */
  smoldering: boolean;
  singleTile: boolean;
  /** The target must have a locked intent (turnabout). */
  hasIntent: boolean;
  /** Excludes structures (Lanterns, Mortars, Smokestacks, Candles). */
  notStructure: boolean;
  /** Tile targets: must be empty (no piece) and enterable. Moving onto a Plume is allowed. */
  empty: boolean;
  /** Tile targets: must not hold a Smoke Plume (summons, GDD §9.4). */
  noPlume: boolean;
  /** Tile targets: reachable from the range origin by this pattern (slide rules apply). */
  pattern: Pattern | null;
  /** Tile targets: adjacent to a piece matching this side within this range (shadowstep). */
  adjacentTo: { side: TargetSide; range: TargetRange } | null;
  /** Number of distinct picks of this spec (flutterswap = 2). */
  count: number;
  /** The pick may be skipped when no valid choice exists (sunshield_charge's follow-up). */
  optional: boolean;
}

/**
 * Who an effect applies to:
 * - `target` / `target2`: the first / second chosen target (count 2, or the `then` pick);
 * - `hero`: the acting player's hero (in Toll / Omen / global contexts: every living hero);
 * - `self`: the piece owning the trait, charm or intent;
 * - `attacker`: the damage source (riposte);
 * - `all`: every piece matching `filter`;
 * - `area`: every piece matching `filter` inside `area` centred `at`.
 */
export const EFFECT_SUBJECTS = ['target', 'target2', 'hero', 'self', 'attacker', 'all', 'area'] as const;
export type EffectSubject = (typeof EFFECT_SUBJECTS)[number];

export const EFFECT_CENTRES = ['target', 'target2', 'hero', 'self'] as const;
export type EffectCentre = (typeof EFFECT_CENTRES)[number];

export const DAMAGE_SOURCE_KINDS = ['snuff_attack', 'rival_strike', 'player_strike', 'card', 'hazard'] as const;
export type DamageSourceKind = (typeof DAMAGE_SOURCE_KINDS)[number];

/** Fields shared by every effect op. */
export interface EffectOpBase {
  to?: EffectSubject;
  filter?: PieceFilter;
  area?: AreaShape;
  at?: EffectCentre;
  trigger?: TriggerId;
  /** Trigger 'damaged' only: which damage sources fire it. */
  sources?: DamageSourceKind[];
  /** Apply only if the subject survived the hit (push after a strike). */
  ifSurvives?: boolean;
  /** Last Flame only / Vigil only. */
  mode?: ModeId;
}

export type HealAmount = number | 'half' | 'full';

export interface TileWhere {
  /** Allowed base tiles (default flagstone). */
  base?: TileId[];
  empty?: boolean;
  minHeroDistance?: number;
  notGloam?: boolean;
}

export interface NearSpec {
  anchor: 'hero' | 'self' | 'target' | 'board_centre';
  /** Max distance from the anchor (placement routine default: 3; respawn: unlimited). */
  max?: number;
}

export type SummonCount = number | { byPlayers: number[] };

export type EffectOp =
  | (EffectOpBase & {
      op: 'damage';
      amount: number | 'atk';
      times?: number;
      ignoreWard?: boolean;
      /** Line effects through the area pass through pieces; pillars still block. */
      pierce?: boolean;
    })
  | (EffectOpBase & { op: 'heal'; amount: HealAmount })
  | (EffectOpBase & { op: 'ward' })
  | (EffectOpBase & { op: 'burn' })
  | (EffectOpBase & { op: 'daze' })
  | (EffectOpBase & { op: 'push'; distance: number; from: EffectCentre })
  | (EffectOpBase & { op: 'pull'; distance: number; toward: EffectCentre })
  | (EffectOpBase & { op: 'swap'; a: EffectSubject; b: EffectSubject; ignoreImmunity?: boolean })
  | (EffectOpBase & {
      op: 'teleport';
      /** The tile to move `to` onto. */
      dest: 'target' | 'target2';
      /** 'slide' animates and validates as a slide (sunshield_charge). Never uses the Move pip. */
      as?: 'slide' | 'teleport';
    })
  | (EffectOpBase & {
      op: 'summon';
      unit: string;
      count?: SummonCount;
      /** Placement-routine anchor; absent = on the chosen target tile. */
      near?: NearSpec;
      upTo?: boolean;
      /** Owner: the acting seat ('player', default for cards) or the Snuff ('snuff', boss summons). */
      owner?: 'player' | 'snuff';
      modeOverrides?: Partial<Record<ModeId, { unit?: string }>>;
    })
  | (EffectOpBase & {
      op: 'transform';
      into: string;
      /** 'player' = becomes the acting seat's unit (moonlit_hex); 'same' keeps the owner. */
      owner: 'player' | 'same';
      exhausted?: boolean;
      countsAsKill?: boolean;
      fullHp?: boolean;
    })
  | (EffectOpBase & { op: 'extra_move'; amount: number })
  | (EffectOpBase & { op: 'extra_strike'; amount: number })
  | (EffectOpBase & { op: 'gain_flame'; amount: number })
  | (EffectOpBase & { op: 'draw'; amount: number })
  | (EffectOpBase & { op: 'create_tile'; tile: TileId; count?: number; where?: TileWhere; onlyEmpty?: boolean })
  | (EffectOpBase & { op: 'move_tile'; tile: TileId; where?: TileWhere })
  | (EffectOpBase & { op: 'reverse_intent' })
  | (EffectOpBase & { op: 'attach_charm' })
  | (EffectOpBase & {
      op: 'modify_rule';
      rule: RuleModId;
      delta?: number;
      value?: number | boolean | string;
      duration?: Duration;
    })
  | (EffectOpBase & { op: 'melt' })
  | (EffectOpBase & { op: 'relight'; hp: HealAmount })
  | (EffectOpBase & { op: 'add_dread'; amount: number })
  | (EffectOpBase & { op: 'add_glory'; amount: number })
  | (EffectOpBase & { op: 'place_plume'; enemy?: string; count?: number; near?: NearSpec })
  | (EffectOpBase & { op: 'remove_plume'; scope?: 'target' | 'area' | 'board' })
  | (EffectOpBase & {
      op: 'custom';
      id: CustomOpId;
      /** Scalar parameters. JSON may also write them inline (GDD style); content.ts folds them here. */
      args: Record<string, number | string | boolean>;
    });

/** Narrow an EffectOp by its `op`. */
export type EffectOfOp<K extends EffectOpName> = Extract<EffectOp, { op: K }>;

export interface CardArt {
  sigil: SigilGlyph[];
  accent: string;
}

/** Ongoing behaviour of an attached Charm. Stat bonuses apply while attached. */
export interface CharmDef {
  atk: number;
  maxHp: number;
  range: number;
  /** Triggered effects; `self` = the bearer, `target` = the struck piece, `attacker` = damage source. */
  triggers: EffectOp[];
}

/** "Choose one" card modes (kindle_hope). */
export interface CardMode {
  label: string;
  text: string;
  target: TargetSpec;
  then: TargetSpec | null;
  effects: EffectOp[];
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  /** Hero id whose class owns this card, or null for neutral. */
  class: string | null;
  starter: boolean;
  /** Copies in the starting deck (0 unless starter). */
  starterCopies: number;
  /** Summon cards: the unit summoned (for art and previews). */
  unit: string | null;
  target: TargetSpec;
  /** Optional follow-up pick (sunshield_charge: the enemy to hit after the slide). */
  then: TargetSpec | null;
  effects: EffectOp[];
  /** Effects used instead when the card is tempered (quickwick); null = normal effects. */
  temperedEffects: EffectOp[] | null;
  modes: CardMode[] | null;
  charm: CharmDef | null;
  text: string;
  flavor: string;
  art: CardArt;
}

export interface PowerDef {
  id: string;
  name: string;
  hero: string;
  target: TargetSpec;
  then: TargetSpec | null;
  effects: EffectOp[];
  text: string;
  flavor: string;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  owner: 'hero' | 'unit' | 'enemy';
  /**
   * How the engine implements it: 'effects' = run `effects` on their triggers;
   * 'data' = already expressed by other fields (attack, immune, startStatuses);
   * 'engine' = bespoke code keyed by this id.
   */
  impl: 'effects' | 'data' | 'engine';
  effects: EffectOp[];
  /** Vigil only / Last Flame only. */
  mode: ModeId | null;
  text: string;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  displayName: string;
  className: string;
  hp: number;
  atk: number;
  move: Pattern;
  attack: AttackDef;
  trait: TraitId;
  power: string;
  powerCost: number;
  starters: string[];
  immune: Immunity[];
  /** Class flame colour (hero flames only). */
  flame: string;
  flameEdge: string | null;
  rune: RuneId;
  /** Rune pips (slide range); null when not a slide. */
  pips: number | null;
  strikeRune: RuneId | null;
  lightRadius: number;
  pitch: string;
  look: string;
  flavor: string;
}

export interface UnitDef {
  id: string;
  name: string;
  rank: 'unit' | 'structure';
  structure: boolean;
  hp: number;
  atk: number;
  move: Pattern;
  attack: AttackDef;
  traits: TraitId[];
  immune: Immunity[];
  startStatuses: StatusId[];
  lightRadius: number;
  rune: RuneId;
  pips: number | null;
  strikeRune: RuneId | null;
  /** The card that summons it, or null. */
  card: string | null;
  text: string;
  look: string;
  flavor: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  faction: 'snuff';
  rank: Exclude<RankId, 'hero' | 'unit' | 'boss'>;
  glory: number;
  hp: number;
  atk: number;
  move: Pattern;
  attack: AttackDef;
  ai: { prefers: AiPreference | null };
  /** Draw weight on Nights of tier 1/2/3. */
  weight: Record<'1' | '2' | '3', number>;
  immune: Immunity[];
  traits: TraitId[];
  /** Placed only by bosses or scripts, never drawn. */
  summonOnly: boolean;
  structure: boolean;
  rune: RuneId;
  pips: number | null;
  strikeRune: RuneId | null;
  text: string;
  look: string;
  flavor: string;
}

/** Reach of a boss intent, measured from the boss footprint. */
export type BossIntentReach =
  | { kind: 'within'; min: number; max: number } // anchor/centre within [min,max] of the footprint
  | { kind: 'around' } // ring12 around the footprint
  | { kind: 'side' } // side2 on one side
  | { kind: 'beam'; length: number } // beam2 from one side
  | { kind: 'global' };

export const PUSH_MODES = ['away', 'outward', 'along'] as const;
/** 'away' = from the attacker; 'outward' = away from the footprint; 'along' = in the intent's direction (wing_gust). */
export type PushMode = (typeof PUSH_MODES)[number];

export interface BossIntentDef {
  id: string;
  name: string;
  boss: string;
  area: AreaShape | 'global';
  reach: BossIntentReach;
  damage: number;
  push: number;
  pushMode: PushMode | null;
  pierce: boolean;
  /** Aimed at a tile (or area anchor) ignoring line of sight; a reversal mirrors the offset through the boss. */
  artillery: boolean;
  status: StatusId | null;
  createsTile: TileId | null;
  /** Centred on the footprint (hushwave); centred intents cannot be reversed. */
  centered: boolean;
  reversible: boolean;
  /** Global effect (silencing_peal: card limit 1 during the next players phase). */
  global: EffectOp | null;
  /** Extra rule on hit (hunger: devour_light). */
  extra: EffectOp | null;
  targeting: BossTargetingRule;
  /** Heavy hit: plays `bossSlam` (§16.11). */
  heavy: boolean;
  text: string;
}

export interface BossPhaseDef {
  /** [a, b]: starts when HP <= floor(maxHp * a / b). Null for phase 1. */
  enterAt: [number, number] | null;
  move: Pattern;
  intents: string[];
  onEnter: EffectOp[];
  /** Banner / cosmetic note shown on entering (e.g. the clapper starts swinging). */
  banner: string | null;
}

export interface BossDef {
  id: string;
  name: string;
  epithet: string;
  size: [number, number];
  hp: { base: number; perPlayer: number };
  immune: Immunity[];
  flying: boolean;
  special: EffectOp | null;
  weakness: EffectOp | null;
  specialText: string;
  weaknessText: string;
  phases: BossPhaseDef[];
  hpBar: 'bell_rope' | 'crown_band' | 'wing_vein';
  look: string;
  flavor: string;
}

export const TOLL_REQUIREMENTS = ['moth_die', 'plumes', 'pillar', 'chimney_pair'] as const;
/** moth_die: the Moth Die is on; plumes: Plumes are placed (neutrals not off); pillar / chimney_pair: the site has one. */
export type TollRequirement = (typeof TOLL_REQUIREMENTS)[number];

export interface TollDef {
  id: string;
  name: string;
  kind: 'blessing' | 'curse';
  requires: TollRequirement[];
  effects: EffectOp[];
  reward: 'chandlery_take_two' | null;
  text: string;
  flavor: string;
}

export interface OmenDef {
  id: string;
  face: number;
  name: string;
  /** Top-bar label (never just the name, GDD §13.5). */
  label: string;
  tone: 'bad' | 'neutral' | 'good';
  effects: EffectOp[];
  text: string;
}

export interface HeirloomDef {
  id: string;
  name: string;
  /** passive = modify_rule for the game; night_start = triggered; free_action = ring_bell. */
  kind: 'passive' | 'triggered' | 'free_action';
  freeAction: FreeActionKind | null;
  usesPerNight: number | null;
  target: TargetSpec | null;
  effects: EffectOp[];
  text: string;
  flavor: string;
}

export interface BoonDef {
  id: 'heirloom' | 'temper' | 'prune';
  name: string;
  /** heirloom: options offered; prune: max cards removed. */
  amount: number;
  text: string;
}

export interface TileDef {
  id: TileId;
  name: string;
  enterable: boolean;
  endsSlide: boolean;
  blocksLos: boolean;
  /** Snuff AI path cost; null = not enterable. */
  aiCost: number | null;
  /** Path cost for Snuff immune to this tile (hot_wax: 1). */
  aiCostImmune: number | null;
  lightRadius: number;
  litLightRadius: number | null;
  /** Damage dealt by the tile (hot_wax: 1 on ending a move and at each Tally). */
  damage: number;
  text: string;
}

export interface OverlayDef {
  id: OverlayId;
  name: string;
  kind: 'overlay' | 'structure';
  hp: number | null;
  damage: number;
  text: string;
}

export interface TokenDef {
  id: TokenId;
  name: string;
  hp: number | null;
  text: string;
}

export interface StatusDef {
  id: StatusId;
  name: string;
  /** Max stacks / instances held (ward 1). */
  max: number;
  /** Damage per Tally (burn 1). */
  damage: number;
  /** Tallies it lasts (burn 2); null = until used. */
  tallies: number | null;
  /** Colour-blind shape (ward hexagon). */
  shape: string;
  text: string;
}

export interface RankDef {
  id: RankId;
  name: string;
  faction: 'snuff' | 'wickfolk' | 'both';
  /** Last Flame Glory for a kill; null = special (boss) or not a Snuff rank. */
  glory: number | null;
  text: string;
}

export interface HouseDef {
  id: HouseId;
  /** 1-based seat number (seat index + 1). */
  seat: number;
  name: string;
  color: string;
  glyph: string;
}

export interface BotDef {
  id: BotLevel;
  label: string;
  flavour: string;
  nodeBudget: number;
  wallClockMs: number;
  text: string;
}

export interface RuneDef {
  id: RuneId;
  name: string;
  kind: 'move' | 'strike' | 'modifier';
  text: string;
}

export interface ReasonDef {
  id: ReasonCode;
  /** English string with `{param}` placeholders. */
  text: string;
}

/** Counts for a generated site, per board size. */
export interface SiteCounts {
  pillars: number;
  rubble: number;
  shrines: number;
  chimneyPairs: number;
  hotWax: number;
  smokestacks: number;
}

export interface SiteDef {
  id: string;
  name: string;
  pillarLayout: 'mirrored' | 'staggered_lanes' | 'scattered';
  counts: Record<'8x8' | '10x10', SiteCounts>;
  text: string;
  flavor: string;
}

/** Inclusive rank band (1-based ranks as printed in the GDD). */
export interface RankBand {
  from: number;
  to: number;
}

export interface SiteZones {
  deploy: RankBand;
  snuff: RankBand;
  plume: RankBand;
  candles: RankBand;
}

export interface ScriptedPlume {
  at: string;
  enemy: string;
  /** 0 = at setup, n = at Tally n. */
  tally: number;
}

export interface TutorialOpening {
  heroStart: string;
  sootlings: Array<{ at: string; aim: string }>;
  hand: string[];
  flame: number;
  /** Guaranteed line, as human-readable steps. */
  line: string[];
}

export interface MapLayout {
  size: BoardSizeKey;
  w: number;
  h: number;
  pillars: string[];
  rubble: string[];
  shrines: string[];
  chimneys: Array<[string, string]>;
  hotWax: string[];
  candles: string[];
  /** Start tiles in seat order. */
  heroStarts: string[];
  /** Start tiles with exactly 2 seats (last_flame_ring). */
  heroStarts2: string[] | null;
  bossAnchor: string | null;
  zones: SiteZones | null;
  /** Final Gloam zone corners [low, high] (last_flame_ring). */
  finalZone: [string, string] | null;
  plumes: ScriptedPlume[];
}

export interface MapDef {
  id: string;
  name: string;
  kind: 'tutorial' | 'boss_arena' | 'ring';
  layouts: MapLayout[];
  /** first_vigil: the scripted Night 1 opening per hero (GDD §15.2). */
  tutorial: Record<string, TutorialOpening> | null;
  text: string;
  flavor: string;
}

/** The difficulty-driven config values (GDD §14.2). */
export interface DifficultyValues {
  starting_dread: number;
  dread_max: number;
  initial_enemies_mod: number;
  plumes_mod: number;
  enemy_hp_mod: EnemyHpMod;
  boss_hp_multiplier: number;
  heal_between_nights: number;
  extra_smokestack: boolean;
  retry_night: boolean;
}

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  candles: number;
  chip: string;
  values: DifficultyValues;
  text: string;
}

export interface LengthDef {
  id: LengthId;
  name: string;
  turns_per_night: number;
  vigil: { nights: number };
  last_flame: { nights: number; boss_rounds: number };
  targetTime: string;
}

/** Fixed rule constants that are not configurable parameters (content/rules.json). */
export interface RuleConstants {
  flameCap: number;
  handLimit: number;
  deckMin: number;
  startingDeckSize: number;
  charmsPerPiece: number;
  summonRange: number;
  placementMaxDistance: number;
  plumeMinHeroDistance: number;
  plumeLegalTiles: TileId[];
  bumpDamage: number;
  plumeBlockDamage: number;
  carryOverMax: number;
  candlesPerNight: number;
  candleMinSpacing: number;
  flourishPerTurn: number;
  ringBellRange: number;
  bossDazeCancelsLast: boolean;
  selfRelightHp: number;
  dawnRelightHp: number;
  /** Guttered King: CHECK! shows at these escape counts (CHECKMATE numbers live on the boss special). */
  checkWarnEscapes: number[];
  glory: {
    rivalUnit: number;
    rivalHero: number;
    bounty: number;
    shrine: number;
    bossDamagePct: number;
    bossKill: number;
    survival: number;
    heroFalls: number;
  };
  dread: {
    candleHit: number;
    candleSnuffed: number;
    heroFalls: number;
    selfRelight: number;
    bossToll: number;
    dawnPerCandle: number;
    thresholds: Array<{ id: DreadThresholdId; num: number; den: number }>;
  };
  chandlery: {
    offer: number;
    picks: number;
    picksAfterCurse: number;
    minClassCards: number;
    rarityWeights: Record<Rarity, number>;
  };
  lightRadius: { wickfolk: number; lantern: number; shrine: number; litShrine: number };
  timers: {
    turn: Record<'slow' | 'normal' | 'fast', number>;
    chandlery: number;
    deploy: number;
    toll: number;
    carryOver: number;
    haunt: number;
    retryVote: number;
    latencyGrace: number;
    passScreen: number;
    idleDisconnect: number;
  };
  gloam: { damage: number; closings: Record<'10x10' | '12x12', number>; finalRound: number };
  boardSize: {
    vigil: Array<{ maxSeats: number; size: BoardSizeKey }>;
    last_flame: Record<'10x10' | '12x12', { minSeats: number; maxSeats: number }>;
  };
  vigilZones: Record<'8x8' | '10x10', SiteZones>;
  vigilHeroStarts: Record<'8x8' | '10x10', string[]>;
  siteGeneration: { maxAttempts: number; minPlumeTiles: number; enemyMinHeroDistance: number };
  roomCode: { alphabet: string; length: number; idleMinutes: number };
}

/** Mirror of the frozen v1 rule defaults (content/config_defaults.json). */
export interface ConfigDefaultEntry {
  id: string;
  default: string | number | boolean | Array<{ kind: string; hero: string | null }>;
}

/** A table: lookup by id plus the file order. */
export interface ContentTable<T extends { id: string }> {
  byId: Record<string, T>;
  list: T[];
}

export interface ContentRegistry {
  heroes: ContentTable<HeroDef>;
  powers: ContentTable<PowerDef>;
  traits: ContentTable<TraitDef>;
  units: ContentTable<UnitDef>;
  cards: ContentTable<CardDef>;
  enemies: ContentTable<EnemyDef>;
  bosses: ContentTable<BossDef>;
  bossIntents: ContentTable<BossIntentDef>;
  tolls: ContentTable<TollDef>;
  omens: ContentTable<OmenDef>;
  heirlooms: ContentTable<HeirloomDef>;
  boons: ContentTable<BoonDef>;
  tiles: ContentTable<TileDef>;
  overlays: ContentTable<OverlayDef>;
  tokens: ContentTable<TokenDef>;
  statuses: ContentTable<StatusDef>;
  ranks: ContentTable<RankDef>;
  houses: ContentTable<HouseDef>;
  bots: ContentTable<BotDef>;
  runes: ContentTable<RuneDef>;
  sites: ContentTable<SiteDef>;
  maps: ContentTable<MapDef>;
  difficulty: ContentTable<DifficultyDef>;
  lengths: ContentTable<LengthDef>;
  configDefaults: ContentTable<ConfigDefaultEntry>;
  reasons: ContentTable<ReasonDef>;
  rules: RuleConstants;
}

// =============================================================================================
// Configuration (GDD Engineering summary + §14)
// =============================================================================================

export type BoardSizeSetting = 'auto' | '10x10' | '12x12';
export type EnemyHpMod = 'none' | 'non_minions' | 'all';
export type TurnTimer = 'off' | 'slow' | 'normal' | 'fast';
export type NeutralsSetting = 'off' | 'normal' | 'swarm';
export type TruceSetting = 'off' | 'night_1' | 'nights_1_2';

export interface SeatConfig {
  kind: SeatKind;
  /** Hero id, or null = random unpicked hero (bots) / not chosen yet. */
  hero: string | null;
  name: string;
  /** Online seat played from another client. */
  remote?: boolean;
}

/** Every rule parameter in the settings code (GDD §14.1). On/Off parameters are booleans. */
export interface RuleValues {
  mode: ModeId;
  seats: SeatConfig[];
  length: LengthId;
  difficulty: DifficultyId;
  /** 'random' or a boss id. */
  boss_choice: string;
  board_size: BoardSizeSetting;
  nights: number;
  turns_per_night: number;
  boss_rounds: number;
  flame_per_turn: number;
  hand_size: number;
  unit_limit: number;
  tolls: boolean;
  moth_die: boolean;
  boons: boolean;
  retry_night: boolean;
  starting_dread: number;
  dread_max: number;
  initial_enemies_mod: number;
  plumes_mod: number;
  enemy_hp_mod: EnemyHpMod;
  boss_hp_multiplier: number;
  heal_between_nights: number;
  extra_smokestack: boolean;
  turn_timer: TurnTimer;
  respawn_before_boss: boolean;
  neutrals: NeutralsSetting;
  truce: TruceSetting;
  bounty: boolean;
  haunting: boolean;
  /** Settings value: 'random', 'daily' or seed text. In a GameConfig passed to createGame it is the resolved seed text. */
  seed: string;
}

export type RuleKey = keyof RuleValues;

/** Every rule parameter key, in the GDD's table order. */
export const RULE_KEYS = [
  'mode',
  'seats',
  'length',
  'difficulty',
  'boss_choice',
  'board_size',
  'nights',
  'turns_per_night',
  'boss_rounds',
  'flame_per_turn',
  'hand_size',
  'unit_limit',
  'tolls',
  'moth_die',
  'boons',
  'retry_night',
  'starting_dread',
  'dread_max',
  'initial_enemies_mod',
  'plumes_mod',
  'enemy_hp_mod',
  'boss_hp_multiplier',
  'heal_between_nights',
  'extra_smokestack',
  'turn_timer',
  'respawn_before_boss',
  'neutrals',
  'truce',
  'bounty',
  'haunting',
  'seed',
] as const satisfies readonly RuleKey[];

type AssertNever<T extends never> = T;
/** Compile-time check: fails to compile if a RuleValues key is missing from RULE_KEYS. */
export type RuleKeysAreComplete = AssertNever<Exclude<RuleKey, (typeof RULE_KEYS)[number]>>;

/** The config passed to `createGame`: rule values plus non-rule engine flags. */
export interface GameConfig extends RuleValues {
  /** First-ever Quick Play: Night 1 is `first_vigil` with the scripted opening (§15.2). */
  tutorial: boolean;
  /** First-ever game: Night 1 `first_vigil`, Night 2 `cathedral_of_tallow`. */
  firstGame: boolean;
  /** Daily run (seed `daily:YYYY-MM-DD`): Retry and mods disabled. */
  daily: boolean;
  /** Content was modded (disables Daily). */
  modded: boolean;
}

// =============================================================================================
// Runtime state
// =============================================================================================

export type Side = 'wick' | 'snuff';
export type Tier = 1 | 2 | 3;
export type RngStreams = Record<string, number>;

export interface Tile {
  type: TileId;
  /** Chimney pair index (each pair has its own glyph), or null. */
  chimneyPair: number | null;
  shrineLit: boolean;
  gloam: boolean;
  gloamWarning: boolean;
}

export interface BoardZones {
  deploy: Rect[];
  snuff: Rect[];
  plume: Rect[];
  candleSlots: Rect[];
}

export interface Board {
  w: number;
  h: number;
  /** Row-major: index = y * w + x. */
  tiles: Tile[];
  zones: BoardZones;
}

/** A card in a deck, hand, discard pile or attached as a Charm. */
export interface CardInstance {
  uid: string;
  id: string;
  tempered: boolean;
}

/** Seat-turn-scoped modifiers on a piece (cleared at the end of the owner's seat turn). */
export interface PieceTurnBuffs {
  atk: number;
  range: number;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  /** Hero / unit / enemy / boss id; 'vigil_candle' for Candles. */
  defId: string;
  side: Side;
  /** Seat index for heroes and units; null for Snuff, bosses and Candles. */
  owner: number | null;
  /** Anchor: lowest file and lowest rank of the footprint. */
  pos: Pos;
  /** Footprint edge length: 1, or 2 for bosses. */
  size: number;
  hp: number;
  /** Current max HP including persistent modifiers (Charm, Heirloom, HP mods). */
  maxHp: number;
  /** Current ATK including persistent modifiers (Charm). Turn buffs live in `buffs`. */
  atk: number;
  ward: boolean;
  /** Tallies of Burn left (0 = not burning). */
  burn: number;
  /** Seat whose effect applied the Burn (credit for a Burn kill at Tally, §6.3); absent or null = none. */
  burnSeat?: number | null;
  dazed: boolean;
  charm: CardInstance | null;
  /**
   * Seat whose card the attached Charm is (it returns to that seat's discard pile). Absent or
   * null = the piece's owner. Vigil Charms can sit on an ally's piece.
   */
  charmSeat?: number | null;
  movesLeft: number;
  strikesLeft: number;
  /** Arrived since its owner's last seat turn: no actions until then. */
  exhausted: boolean;
  /** Heroes only: a Smoldering Wick. */
  smoldering: boolean;
  flying: boolean;
  structure: boolean;
  /** Global creation counter ("most recently summoned"). */
  summonOrder: number;
  /** Snuff resolution order (lower acts first); 0 for Wickfolk. */
  initiative: number;
  /** Seat that last pushed/pulled/swapped this piece this round (kill credit, §6.3). */
  lastDisplacedBy: number | null;
  /**
   * Last Flame: when that displacement happened (`LastFlameState.creditClock`), so a Snuff kill
   * goes to the most recent displacer or reverser (§6.3). Absent = before any (Vigil: always).
   */
  lastDisplacedAt?: number;
  buffs: PieceTurnBuffs;
  /** Relit by a `relight` action: returns at the end of the current seat turn. */
  pendingRelight: boolean;
  /** Vigil: Smoldering at the end of the players phase (self-relight at Tally, §13.1.3). */
  smolderedAtPlayersEnd: boolean;
  /** Last Flame: haunted by a Haunt Plume this round (one per hero per round). */
  hauntedThisRound: boolean;
}

export type IntentKind = 'melee' | 'ranged' | 'artillery' | 'area' | 'global';

/**
 * A locked attack. Aimed intents store their geometry relative to the attacker (shape, dir,
 * offset); at strike time the tiles are recomputed from the attacker's current position.
 */
export interface Intent {
  id: string;
  attackerId: string;
  /** Boss intent def id, or null for an enemy's own attack. */
  bossIntentId: string | null;
  kind: IntentKind;
  shape: AreaShape | 'global';
  dir: Dir | null;
  /** Offset from the attacker's anchor to the aimed tile / area anchor. */
  offset: Pos | null;
  range: number | null;
  minRange: number;
  damage: number;
  push: number;
  pushMode: PushMode | null;
  pull: number;
  status: StatusId | null;
  firstHit: boolean;
  pierce: boolean;
  centered: boolean;
  reversed: boolean;
  /** Seat that last reversed this intent (kill credit for its hits, §6.3), or null. */
  reversedBy: number | null;
  /** Last Flame: when it was reversed (`LastFlameState.creditClock`); see `Piece.lastDisplacedAt`. */
  reversedAt?: number;
  /** 1-based queue position (the only order number players see). */
  queue: number;
  /** Cached tiles for display (recomputed after every displacement). */
  tiles: Pos[];
  /** Piece the attacker aimed at when declaring (log / intent text). */
  targetId: string | null;
  global: EffectOp | null;
  createsTile: TileId | null;
  extra: EffectOp | null;
}

export type PlumeSource = 'schedule' | 'smoke' | 'smokestack' | 'haunt' | 'script' | 'card';

export interface Plume {
  id: string;
  pos: Pos;
  enemyId: string;
  /** Creation order (rise order). */
  order: number;
  source: PlumeSource;
  /** Haunt Plumes: the eliminated seat that placed it and the haunted hero. */
  hauntSeat: number | null;
  hauntedHeroId: string | null;
}

export interface PlayerStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  plumesBlocked: number;
  plumesPopped: number;
  cardsPlayed: number;
  summons: number;
  heroFalls: number;
  bossDamage: number;
  shrinesLit: number;
}

/** Things that end with the seat turn. */
export interface PlayerTurnState {
  cardsPlayed: number;
  powerUsed: boolean;
  summonsThisTurn: number;
  heroDmgBonus: number;
  heroBurn: boolean;
  /** Max Flourish strikes this turn (2; crimson_finale 4). */
  flourishCap: number;
  flourishUsed: number;
  /** Card limit this turn (null = none). */
  cardLimit: number | null;
}

export interface ChandleryState {
  offer: string[];
  picksLeft: number;
  picked: string[];
  skipped: boolean;
  /** heirloom Boon: the 2 Heirlooms offered (drawn when the Chandlery opens). */
  heirloomOffer: string[];
  boonDone: boolean;
  boonPicked: BoonDef['id'] | null;
}

export interface CarryOverState {
  /** Default keep (highest HP, ties most recently summoned). */
  defaults: string[];
  chosen: string[] | null;
}

export interface HauntState {
  /** The hero this seat's last Haunt Plume haunted (no hero twice in a row, §13.2.7). */
  lastHeroId: string | null;
  /** Owes a Haunt placement now (a Plume placement: night_setup or Tally step 10); `haunt` answers it. */
  pending: boolean;
}

export interface PlayerState {
  seat: number;
  kind: SeatKind;
  name: string;
  remote: boolean;
  hero: string;
  house: HouseId;
  heroPieceId: string;
  /** Last Flame start tile / Vigil default deploy tile. */
  startTile: Pos | null;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  flame: number;
  heirlooms: string[];
  glory: number;
  eliminated: boolean;
  eliminationBand: number | null;
  /** Last Flame: the Night and round of the elimination (podium, log); absent while in the game. */
  eliminatedAt?: { night: number; round: number } | null;
  turnEnded: boolean;
  /** night_setup Ready flag. */
  ready: boolean;
  bellUsedThisNight: boolean;
  turn: PlayerTurnState;
  chandlery: ChandleryState | null;
  carryOver: CarryOverState | null;
  haunt: HauntState;
  stats: PlayerStats;
}

export interface BossState {
  id: string;
  pieceId: string;
  phase: number;
  /** Guttered King: filled crown sockets (one per CHECKMATE, at most 3). */
  crowns: number;
  maxHp: number;
  /** Number of legal step vectors right now (Guttered King: CHECK at 1-2, CHECKMATE at 0). */
  escapes: number;
  /** Damage dealt per seat, Checkmate shares included (Last Flame Glory and tie-breaks; may be fractional). */
  damageBySeat: number[];
  /** Seat credited with the killing blow (null: none, or a shared Checkmate). */
  killerSeat: number | null;
  /** Hierophant phase 2+ cosmetic. */
  clapperSwinging: boolean;
  /** P used for the boss's HP and `byPlayers` summons (§10.1). Absent only in hand-built states. */
  players?: number;
  /** The open escape step vectors (UI escape arrows; the other of the 8 are blocked). */
  escapeDirs?: Dir[];
  /** Nocturna cosmetic: a Hunger intent is locked (her abdomen brightens). */
  hungry?: boolean;
}

export interface GloamClosing {
  night: number;
  /** Round whose Tally (step 1) applies the closing. */
  round: number;
  /** Ring index closed (0 = outermost). */
  ring: number;
  /** Edge length of the open area after the closing. */
  openSize: number;
  atDawn: boolean;
}

export interface GloamState {
  closingsDone: number;
  total: number;
  schedule: GloamClosing[];
  /** Ring shown as `gloam_warning` this round, or null. */
  warningRing: number | null;
  /**
   * The Gloam Bell (§13.2.8): rounds from the current one to the round whose Tally applies the
   * next closing (0 = it closes at this round's Tally; night_setup counts as round 0 of its
   * Night). Null once every closing is done.
   */
  roundsToNext: number | null;
}

export interface VigilState {
  dread: number;
  dreadMax: number;
  retries: number;
  retryVotes: number[];
  concedeVotes: number[];
  candlesSnuffed: number;
}

export interface BountyRecord {
  victimSeat: number;
  night: number;
}

export interface LastFlameState {
  gloam: GloamState;
  /** A truce is in force this Night (§13.2.3). */
  truce: boolean;
  /** Seat with strictly the most Glory (eliminated seats count), or null on a tie: the Wanted seal. */
  leader: number | null;
  bountiesPaid: BountyRecord[];
  /** The band the next elimination opens (1, 2, …): a later band places higher (§13.2.6). */
  nextBand: number;
  bossRounds: number;
  /** Glory per seat (index = seat) by reason; each record sums to that seat's Glory. */
  gloryBySeat: Array<Record<GloryReason, number>>;
  /** The Tally stopped at step 10 for Haunt placements (`haunt.pending`); the next advance resumes it. */
  tallyPaused: boolean;
  /** Monotonic clock ordering displacements and reversals for Snuff kill credit (§6.3). */
  creditClock: number;
}

export interface TollState {
  offer: { blessing: string; curse: string } | null;
  chooser: number | null;
  active: string | null;
  /** The chosen Toll was a Curse: next Chandlery takes 2. */
  curseReward: boolean;
  history: string[];
}

export interface OmenState {
  face: number | null;
  omenId: string | null;
}

export interface RuleSource {
  kind: 'toll' | 'omen' | 'card' | 'power' | 'heirloom' | 'boss';
  id: string;
}

/** An active `modify_rule`. `seat` null = applies to everyone. */
export interface ActiveRule {
  rule: RuleModId;
  delta: number;
  value: number | boolean | string | null;
  seat: number | null;
  source: RuleSource;
  expires: Duration;
}

export interface TutorialState {
  heroId: string;
  /** Coach mark index (1-6), 0 = not started, 7 = done. */
  step: number;
  /** The turn-1 script is active (only the guaranteed line is allowed). */
  scripted: boolean;
  skipped: boolean;
}

export interface GameStats {
  retries: number;
  roundsPlayed: number;
  candlesSnuffed: number;
  candlesSaved: number;
  nightsCompleted: number;
  dreadPeak: number;
  /** Per piece: damage dealt and kills (MVP piece). */
  pieces: Record<string, { defId: string; owner: number | null; damage: number; kills: number }>;
}

export interface LogEntry {
  text: string;
  night: number;
  round: number;
  seat?: number;
}

export type GloryReason =
  | 'snuff_kill'
  | 'rival_unit'
  | 'rival_hero'
  | 'bounty'
  | 'shrine'
  | 'boss_damage'
  | 'boss_kill'
  | 'survival'
  | 'hero_fell'
  /** An `add_glory` effect op (mods, bosses). */
  | 'effect';

export interface Standing {
  seat: number;
  placement: number;
  score: number;
  glory: number;
  standingBonus: number;
  alive: boolean;
  eliminationBand: number | null;
  bossDamage: number;
  breakdown: Record<GloryReason, number>;
}

export type GameResult =
  | {
      mode: 'vigil';
      outcome: 'victory' | 'defeat' | 'conceded';
      stars: 0 | 1 | 2 | 3;
      /** Human-readable defeat cause, e.g. "The c3 Vigil Candle was snuffed". */
      cause: string | null;
      finalDread: number;
      retries: number;
    }
  | {
      mode: 'last_flame';
      reason: 'boss_fell' | 'boss_rounds' | 'last_standing' | 'conceded';
      standings: Standing[];
    };

/** Everything in the state except history containers (used for undo frames and the night snapshot). */
export type StateSnapshot = Omit<GameState, 'undo' | 'nightSnapshot'>;

export interface UndoFrame {
  seat: number;
  action: Action;
  snapshot: StateSnapshot;
}

export interface UndoState {
  /** Frames for the current seat turn only; cleared at commit points and seat changes. */
  frames: UndoFrame[];
  /** Number of undoable actions (kept in views, where `frames` is emptied). */
  depth: number;
}

export interface GameState {
  /** State schema version (bump on breaking changes). */
  version: number;
  contentHash: string;
  config: GameConfig;
  seed: string;
  rng: RngStreams;
  nextId: number;
  phase: PhaseId;
  night: number;
  /** 0 before the Night's first round. */
  round: number;
  /** T for this Night; null on the uncapped Vigil Boss Night. */
  roundsThisNight: number | null;
  tier: Tier;
  siteId: string;
  isBossNight: boolean;
  usedSites: string[];
  board: Board;
  pieces: Record<string, Piece>;
  plumes: Plume[];
  /** In queue (resolution) order. */
  intents: Intent[];
  players: PlayerState[];
  activeSeat: number | null;
  /** Vigil claims waiting (FIFO). */
  claimQueue: number[];
  /** First Light holder (seat index). */
  firstLight: number;
  boss: BossState | null;
  vigil: VigilState | null;
  lastFlame: LastFlameState | null;
  toll: TollState;
  omen: OmenState;
  /** Active `modify_rule` effects (Tolls, Omens, cards, Heirlooms, Silencing Peal). */
  activeRules: ActiveRule[];
  undo: UndoState;
  /** night_setup snapshot for Retry this Night (RNG positions included). */
  nightSnapshot: StateSnapshot | null;
  tutorial: TutorialState | null;
  stats: GameStats;
  log: LogEntry[];
  result: GameResult | null;
}

// =============================================================================================
// Actions (GDD B.2)
// =============================================================================================

export type CardTargetChoice =
  | { kind: 'piece'; pieceId: string }
  | { kind: 'tile'; pos: Pos }
  | { kind: 'direction'; dir: Dir };

export interface BoonArgs {
  /** heirloom: the chosen Heirloom. */
  heirloomId?: string;
  /** temper: the card to temper. */
  cardUid?: string;
  /** prune: up to 2 cards to remove. */
  cardUids?: string[];
}

export type Action =
  | { type: 'move'; seat: number; pieceId: string; to: Pos }
  | { type: 'strike'; seat: number; pieceId: string; target: Pos }
  | { type: 'relight'; seat: number; pieceId: string; wickId: string }
  | { type: 'light_shrine'; seat: number; pieceId: string; shrine: Pos }
  | { type: 'play_card'; seat: number; cardUid: string; targets: CardTargetChoice[]; mode?: number }
  | { type: 'use_power'; seat: number; targets: CardTargetChoice[] }
  | { type: 'free_action'; seat: number; kind: FreeActionKind; pieceId?: string; target?: Pos }
  | { type: 'end_turn'; seat: number }
  | { type: 'undo'; seat: number }
  | { type: 'claim_turn'; seat: number }
  /** `vote: false` declines (cancels) a running co-op vote; absent or true agrees. */
  | { type: 'concede'; seat: number; vote?: boolean }
  | { type: 'deploy'; seat: number; pieceId: string; to: Pos }
  | { type: 'ready'; seat: number }
  | { type: 'choose_toll'; seat: number; tollId: string }
  | { type: 'carry_over'; seat: number; keep: string[] }
  | { type: 'haunt'; seat: number; at: Pos | null }
  | { type: 'retry_night'; seat: number; vote?: boolean }
  | { type: 'draft_pick'; seat: number; cardId: string }
  | { type: 'skip_pick'; seat: number }
  | { type: 'boon_pick'; seat: number; boon: BoonDef['id'] | null; args: BoonArgs }
  | { type: 'config_set'; seat: number; patch: Partial<RuleValues> }
  | { type: 'start_game'; seat: number }
  | { type: 'advance' };

export type ActionType = Action['type'];
export type ActionOf<K extends ActionType> = Extract<Action, { type: K }>;

// =============================================================================================
// Events (for animation; snake_case `type`)
// =============================================================================================

export type MoveKind =
  | 'step'
  | 'slide'
  | 'leap'
  | 'fly'
  | 'chimney'
  | 'take'
  | 'push'
  | 'pull'
  | 'swap'
  | 'teleport'
  | 'deploy'
  | 'respawn'
  | 'boss_step';

export type StrikeKind = 'melee' | 'ranged' | 'artillery' | 'snuff' | 'boss';

export type DamageCause =
  | 'strike'
  | 'card'
  | 'power'
  | 'intent'
  | 'bump'
  | 'hot_wax'
  | 'burn'
  | 'gloam'
  | 'plume_block'
  | 'pop'
  | 'riposte'
  | 'checkmate'
  | 'heirloom';

export type DeathCause = DamageCause | 'melt' | 'gloam_wick' | 'boss_death' | 'dawn' | 'transform';

/** `effect`: an `add_dread` effect op (mods, bosses). */
export type DreadCause = 'candle_hit' | 'candle_snuffed' | 'hero_fell' | 'self_relight' | 'boss_toll' | 'dawn' | 'effect';

export type RelightCause = 'relight' | 'self' | 'dawn' | 'card' | 'respawn';

export type GameEvent =
  | { type: 'phase_changed'; phase: PhaseId; night: number; round: number }
  | { type: 'night_started'; night: number; siteId: string; isBossNight: boolean; tier: Tier }
  | { type: 'turn_started'; seat: number; flame: number }
  | { type: 'turn_ended'; seat: number }
  | {
      type: 'piece_moved';
      pieceId: string;
      from: Pos;
      to: Pos;
      kind: MoveKind;
      path?: Pos[];
      /** Push/pull that stopped on a blocker: where the bump happened and who was bumped. */
      bump?: { at: Pos; pieceId: string | null };
    }
  | {
      type: 'strike';
      attackerId: string;
      kind: StrikeKind;
      from: Pos;
      target?: Pos;
      tiles?: Pos[];
      intentId?: string;
    }
  | {
      type: 'damage';
      pieceId: string;
      amount: number;
      hpAfter: number;
      lethal: boolean;
      blockedByWard: boolean;
      cause: DamageCause;
      sourceId: string | null;
      seat: number | null;
    }
  | { type: 'heal'; pieceId: string; amount: number; hpAfter: number }
  | {
      type: 'piece_died';
      pieceId: string;
      defId: string;
      kind: PieceKind;
      side: Side;
      pos: Pos;
      killerSeat: number | null;
      cause: DeathCause;
    }
  | { type: 'hero_smoldered'; pieceId: string; seat: number; pos: Pos }
  | { type: 'hero_relit'; pieceId: string; seat: number; pos: Pos; hp: number; cause: RelightCause }
  | {
      type: 'summoned';
      pieceId: string;
      defId: string;
      seat: number | null;
      pos: Pos;
      side: Side;
      source: 'card' | 'trait' | 'toll' | 'boss' | 'transform' | 'rise' | 'setup' | 'heirloom';
    }
  | { type: 'transformed'; pieceId: string; fromDefId: string; toDefId: string; seat: number | null }
  | {
      type: 'card_played';
      seat: number;
      cardUid: string;
      cardId: string;
      cost: number;
      targets: CardTargetChoice[];
      mode?: number;
    }
  | { type: 'power_used'; seat: number; powerId: string; cost: number; targets: CardTargetChoice[] }
  | { type: 'free_action_used'; seat: number; kind: FreeActionKind; pieceId?: string; target?: Pos }
  /** `cards` is filled only for the drawing seat (viewFor / server reveal); others see `count`. */
  | { type: 'cards_drawn'; seat: number; count: number; cards: CardInstance[] }
  | { type: 'deck_shuffled'; seat: number; size: number }
  | { type: 'cards_discarded'; seat: number; count: number }
  | { type: 'card_drafted'; seat: number; cardId: string | null }
  | { type: 'status_changed'; pieceId: string; status: StatusId; active: boolean; value: number }
  | { type: 'charm_changed'; pieceId: string; cardId: string | null }
  | { type: 'intent_declared'; intentId: string; attackerId: string; queue: number; tiles: Pos[]; damage: number }
  | { type: 'intent_cancelled'; intentId: string; reason: 'dazed' | 'attacker_died' | 'boss_died' }
  | { type: 'intent_reversed'; intentId: string; tiles: Pos[]; seat: number }
  | { type: 'intent_resolved'; intentId: string; tiles: Pos[] }
  | { type: 'plume_placed'; plumeId: string; pos: Pos; enemyId: string; source: PlumeSource }
  | { type: 'plume_popped'; plumeId: string; pos: Pos; seat: number | null }
  | { type: 'plume_rose'; plumeId: string; pos: Pos; pieceId: string; enemyId: string }
  | { type: 'plume_blocked'; plumeId: string; pos: Pos; blockerId: string; damaged: boolean }
  | { type: 'plume_skipped'; reason: 'no_tile' | 'gloam' }
  | { type: 'omen_rolled'; face: number; omenId: string; effectiveId: string }
  | { type: 'dread_changed'; from: number; to: number; cause: DreadCause; threshold: DreadThresholdId | null }
  | { type: 'glory_changed'; seat: number; from: number; to: number; reason: GloryReason }
  | { type: 'toll_revealed'; blessing: string; curse: string; chooser: number }
  | { type: 'toll_chosen'; tollId: string; seat: number }
  | { type: 'gloam_warning'; ring: number }
  | { type: 'gloam_closed'; ring: number; openSize: number; tiles: Pos[] }
  | { type: 'first_light_passed'; seat: number }
  | { type: 'boss_spawned'; bossId: string; pieceId: string; anchor: Pos; maxHp: number }
  | { type: 'boss_phase'; bossId: string; phase: number }
  | { type: 'check'; escapes: number }
  | { type: 'checkmate'; damage: number; crowns: number; shares: Array<{ seat: number; amount: number }> }
  | { type: 'tile_changed'; pos: Pos; from: TileId; to: TileId }
  | { type: 'shrine_changed'; pos: Pos; lit: boolean; seat: number | null }
  | { type: 'player_eliminated'; seat: number; band: number }
  | { type: 'chandlery_opened'; offers: Array<{ seat: number; cards: string[] }> }
  | { type: 'heirloom_gained'; seat: number; heirloomId: string }
  | { type: 'undone'; seat: number }
  /** Extra Move/Strike pips granted this seat turn (Quickwick, Trim the Wicks, Flourish, Ember Waltz). */
  | { type: 'actions_granted'; pieceId: string; moves: number; strikes: number; source: string }
  | { type: 'seat_ready'; seat: number }
  | { type: 'vote_changed'; vote: 'retry' | 'concede'; seats: number[] }
  | { type: 'night_retried'; night: number }
  | { type: 'units_kept'; seat: number; pieceIds: string[] }
  | { type: 'boon_picked'; seat: number; boon: BoonDef['id'] | null; args: BoonArgs }
  | { type: 'dawn'; night: number; candlesLit: number }
  | { type: 'game_over'; result: GameResult }
  | { type: 'log'; entry: LogEntry };

export type GameEventType = GameEvent['type'];
export type GameEventOf<K extends GameEventType> = Extract<GameEvent, { type: K }>;

// =============================================================================================
// Engine API results and view helpers
// =============================================================================================

export type ReasonParams = Record<string, string | number>;

export type Validation = { ok: true } | { ok: false; reason: ReasonCode; params?: ReasonParams };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: ReasonCode; params?: ReasonParams };

export interface PendingAutomation {
  phase: PhaseId;
}

export interface PushPreview {
  pieceId: string;
  path: Pos[];
  /** Bump at the end of the push: the blocking piece (null = edge/obstacle). */
  bump: { at: Pos; pieceId: string | null } | null;
  endsOnHotWax: boolean;
}

export interface StrikeOption {
  target: Pos;
  targetPieceId?: string;
  isPlume: boolean;
  damage: number;
  lethal: boolean;
  /** Ward would absorb the hit. */
  blockedByWard: boolean;
  /** Where the striker lands on a kill (Take), or null. */
  take: Pos | null;
  push: PushPreview | null;
}

/** Per-target effect preview for card / power targeting. */
export interface EffectPreview {
  damage: Array<{ pieceId: string; amount: number; lethal: boolean; blockedByWard: boolean }>;
  heal: Array<{ pieceId: string; amount: number }>;
  plumesPopped: Pos[];
  summon: { defId: string; pos: Pos } | null;
  swap: [Pos, Pos] | null;
  push: PushPreview[];
  area: Pos[];
  reversedIntentTiles: Pos[] | null;
  /** Card / Power moves other than pushes: slides, teleports, swaps (Sunshield Charge, Shadowstep). */
  moves?: Array<{ pieceId: string; from: Pos; to: Pos; kind: MoveKind }>;
  /** Statuses gained (Ward, Burn, Dazed). */
  statuses?: Array<{ pieceId: string; status: StatusId }>;
  /** The Charm that would attach. */
  charm?: { pieceId: string; cardId: string } | null;
  /** Pieces that would change into another piece (Moonlit Hex). */
  transforms?: Array<{ pieceId: string; toDefId: string }>;
  /** Smoldering heroes that would be relit (Kindle Hope). */
  relit?: string[];
  /** Pieces that would die. */
  deaths?: string[];
}

export interface TargetOption {
  choice: CardTargetChoice;
  pos: Pos;
  preview: EffectPreview;
}

/**
 * Multi-step targeting query for `cardTargets` / `powerTargets`: the chosen mode ("choose one"
 * cards) and the picks made so far. The answer lists the options for pick `chosen.length`.
 */
export interface TargetQuery {
  mode?: number;
  chosen?: CardTargetChoice[];
}

/** Per-mode playability of a "choose one" card (shown before a mode is picked). */
export interface CardModeOption {
  label: string;
  text: string;
  playable: boolean;
  reason?: ReasonCode;
  params?: ReasonParams;
}

export interface CardTargetInfo {
  playable: boolean;
  reason?: ReasonCode;
  params?: ReasonParams;
  cost: number;
  /** "Choose one" cards: labels per mode (index = `mode` in play_card). */
  modes: string[] | null;
  /** "Choose one" cards queried without a mode: playability of each mode. */
  modeOptions?: CardModeOption[];
  /**
   * The picks made so far can be played as they are (every required pick made, and any remaining
   * optional pick has no valid choice). Absent on mode-less answers of "choose one" cards.
   */
  complete?: boolean;
  /**
   * 0-based index of the pick these options are for, and the total picks. `optional` = this pick
   * is beyond the required ones (it may be left out only when `targets` is empty).
   */
  step: number;
  steps: number;
  optional: boolean;
  targets: TargetOption[];
  /** Range ring to draw (centre and radius), when the spec counts from a piece. */
  rangeRing: { centre: Pos; radius: number } | null;
  /** Board-wide cards (`steps` 0, no target to pick): the preview of playing it now. */
  preview?: EffectPreview;
}

export interface IntentView {
  queue: number;
  intentId: string;
  attackerId: string;
  attackerName: string;
  /** e.g. "Ink Wretch → lances c3 Vigil Candle for 1 (Dread +1)". */
  text: string;
  tiles: Pos[];
  damage: number;
}

/** Tile key ("x,y") -> incoming damage from the locked intents (preview). */
export type DangerMap = Record<string, number>;
