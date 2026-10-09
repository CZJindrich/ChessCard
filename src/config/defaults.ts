/**
 * Rule parameters (GDD Engineering summary, §14.1): key, frozen v1 default, range or options,
 * label, one-line tooltip and the modes whose Advanced panel shows it. Host options (§14.5) too.
 *
 * content/config_defaults.json mirrors the defaults below (a unit test keeps them equal).
 */
import { DIFFICULTIES, LENGTHS, MODES, RULE_KEYS } from '../engine/types';
import type { ModeId, RuleKey, RuleValues, SeatConfig } from '../engine/types';

/** Value shape and limits of a parameter. `boss` options come from the content registry. */
export type ParamSpec =
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'float'; min: number; max: number; step: number }
  | { kind: 'bool' }
  | { kind: 'seats'; min: number; max: number }
  | { kind: 'boss' }
  | { kind: 'seed'; maxLength: number };

export interface RuleParamDef<K extends RuleKey = RuleKey> {
  key: K;
  default: RuleValues[K];
  spec: ParamSpec;
  label: string;
  tooltip: string;
  /** Modes whose Setup screen shows it (§14.1). */
  modes: readonly ModeId[];
  /** Layer that normally supplies the value ('online': `turn_timer` is normal online, off offline). */
  derivedFrom: 'length' | 'difficulty' | 'online' | null;
  /** Shown in the Basic panel rather than Advanced. */
  basic: boolean;
}

const BOTH: readonly ModeId[] = MODES;
const VIGIL: readonly ModeId[] = ['vigil'];
const LAST_FLAME: readonly ModeId[] = ['last_flame'];

export const SEED_MAX_LENGTH = 32;
export const DEFAULT_SEATS: readonly SeatConfig[] = [{ kind: 'human', hero: null, name: 'Player 1' }];

function param<K extends RuleKey>(def: RuleParamDef<K>): RuleParamDef<K> {
  return def;
}

const ON_OFF = { kind: 'bool' } as const;

export const RULE_PARAMS: { readonly [K in RuleKey]: RuleParamDef<K> } = {
  mode: param({
    key: 'mode',
    default: 'vigil',
    spec: { kind: 'enum', options: MODES },
    label: 'Mode',
    tooltip: 'Vigil: team up against the Snuff. Last Flame: every candle for itself.',
    modes: BOTH,
    derivedFrom: null,
    basic: true,
  }),
  seats: param({
    key: 'seats',
    default: DEFAULT_SEATS.map((s) => ({ ...s })),
    spec: { kind: 'seats', min: 1, max: 4 },
    label: 'Seats',
    tooltip: 'Up to 4 seats; each is a human or an AI (Easy, Normal or Hard).',
    modes: BOTH,
    derivedFrom: null,
    basic: true,
  }),
  length: param({
    key: 'length',
    default: 'short',
    spec: { kind: 'enum', options: LENGTHS },
    label: 'Length',
    tooltip: 'How many Nights the run lasts. The last one is always the Boss Night.',
    modes: BOTH,
    derivedFrom: null,
    basic: true,
  }),
  difficulty: param({
    key: 'difficulty',
    default: 'dusk',
    spec: { kind: 'enum', options: DIFFICULTIES },
    label: 'Difficulty',
    tooltip: 'Sets starting Dread, enemy numbers and toughness, healing and Retry.',
    modes: BOTH,
    derivedFrom: null,
    basic: true,
  }),
  boss_choice: param({
    key: 'boss_choice',
    default: 'random',
    spec: { kind: 'boss' },
    label: 'Boss',
    tooltip: 'Which boss waits on the final Night.',
    modes: BOTH,
    derivedFrom: null,
    basic: true,
  }),
  board_size: param({
    key: 'board_size',
    default: 'auto',
    spec: { kind: 'enum', options: ['auto', '10x10', '12x12'] },
    label: 'Board size',
    tooltip: 'Last Flame board: 10×10 for 2-3 seats, 12×12 for 3-4 seats.',
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: true,
  }),
  nights: param({
    key: 'nights',
    default: 3,
    spec: { kind: 'int', min: 2, max: 8 },
    label: 'Nights',
    tooltip: 'Total Nights, the Boss Night included.',
    modes: BOTH,
    derivedFrom: 'length',
    basic: false,
  }),
  turns_per_night: param({
    key: 'turns_per_night',
    default: 4,
    spec: { kind: 'int', min: 3, max: 6 },
    label: 'Rounds per Night',
    tooltip: 'Rounds in each regular Night.',
    modes: BOTH,
    derivedFrom: 'length',
    basic: false,
  }),
  boss_rounds: param({
    key: 'boss_rounds',
    default: 5,
    spec: { kind: 'int', min: 3, max: 8 },
    label: 'Boss rounds',
    tooltip: 'Rounds on the Last Flame Boss Night before the game ends.',
    modes: LAST_FLAME,
    derivedFrom: 'length',
    basic: false,
  }),
  flame_per_turn: param({
    key: 'flame_per_turn',
    default: 3,
    spec: { kind: 'int', min: 2, max: 5 },
    label: 'Flame per turn',
    tooltip: 'Flame you get at the start of each of your seat turns.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  hand_size: param({
    key: 'hand_size',
    default: 5,
    spec: { kind: 'int', min: 4, max: 7 },
    label: 'Hand size',
    tooltip: 'Cards you draw up to at the start of each seat turn.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  unit_limit: param({
    key: 'unit_limit',
    default: 4,
    spec: { kind: 'int', min: 2, max: 6 },
    label: 'Unit limit',
    tooltip: 'Most non-hero pieces each seat may have on the board.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  tolls: param({
    key: 'tolls',
    default: true,
    spec: ON_OFF,
    label: 'Tolls',
    tooltip: 'From Night 2, reveal a Blessing and a Curse each Night; one of them is chosen.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  moth_die: param({
    key: 'moth_die',
    default: true,
    spec: ON_OFF,
    label: 'Moth Die',
    tooltip: 'Roll the Moth Die at the start of every round for a small twist.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  boons: param({
    key: 'boons',
    default: true,
    spec: ON_OFF,
    label: 'Boons',
    tooltip: 'Choose a Heirloom, Temper or Prune at every Chandlery.',
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
  retry_night: param({
    key: 'retry_night',
    default: true,
    spec: ON_OFF,
    label: 'Retry this Night',
    tooltip: 'Allow restarting the current Night from its setup.',
    modes: VIGIL,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  starting_dread: param({
    key: 'starting_dread',
    default: 0,
    spec: { kind: 'int', min: 0, max: 6 },
    label: 'Starting Dread',
    tooltip: 'Dread on the Hour Candle when the run begins.',
    modes: VIGIL,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  dread_max: param({
    key: 'dread_max',
    default: 12,
    spec: { kind: 'int', min: 8, max: 16 },
    label: 'Dread maximum',
    tooltip: 'Dread at which the Long Night falls.',
    modes: VIGIL,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  initial_enemies_mod: param({
    key: 'initial_enemies_mod',
    default: 0,
    spec: { kind: 'int', min: -2, max: 2 },
    label: 'Initial enemies',
    tooltip: 'More or fewer Snuff at the start of each Night.',
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  plumes_mod: param({
    key: 'plumes_mod',
    default: 0,
    spec: { kind: 'int', min: -2, max: 2 },
    label: 'Plumes',
    tooltip: 'More or fewer Smoke Plumes at each placement.',
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  enemy_hp_mod: param({
    key: 'enemy_hp_mod',
    default: 'none',
    spec: { kind: 'enum', options: ['none', 'non_minions', 'all'] },
    label: 'Enemy HP bonus',
    tooltip: '+1 HP to every non-minion Snuff, or to every Snuff (never bosses).',
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  boss_hp_multiplier: param({
    key: 'boss_hp_multiplier',
    default: 1,
    spec: { kind: 'float', min: 0.5, max: 2, step: 0.05 },
    label: 'Boss HP',
    tooltip: "Multiplies the boss's HP.",
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  heal_between_nights: param({
    key: 'heal_between_nights',
    default: 4,
    spec: { kind: 'int', min: 0, max: 8 },
    label: 'Heal between Nights',
    tooltip: 'HP that heroes and kept units recover at each Dawn.',
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  extra_smokestack: param({
    key: 'extra_smokestack',
    default: false,
    spec: ON_OFF,
    label: 'Extra Smokestack',
    tooltip: 'Add a Smokestack on regular Nights of tier 2 and up.',
    modes: BOTH,
    derivedFrom: 'difficulty',
    basic: false,
  }),
  turn_timer: param({
    key: 'turn_timer',
    default: 'off',
    spec: { kind: 'enum', options: ['off', 'slow', 'normal', 'fast'] },
    label: 'Turn timer',
    tooltip: 'Time per seat turn: off, slow (150 s), normal (90 s) or fast (45 s).',
    modes: BOTH,
    derivedFrom: 'online',
    basic: false,
  }),
  respawn_before_boss: param({
    key: 'respawn_before_boss',
    default: true,
    spec: ON_OFF,
    label: 'Respawn before boss',
    tooltip: 'Fallen heroes return at their start tile until the Boss Night.',
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: false,
  }),
  neutrals: param({
    key: 'neutrals',
    default: 'normal',
    spec: { kind: 'enum', options: ['off', 'normal', 'swarm'] },
    label: 'Neutral Snuff',
    tooltip: 'How many neutral Snuff and Plumes appear on the Last Flame board.',
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: false,
  }),
  truce: param({
    key: 'truce',
    default: 'night_1',
    spec: { kind: 'enum', options: ['off', 'night_1', 'nights_1_2'] },
    label: 'Truce',
    tooltip: 'Nights on which rival pieces cannot be attacked.',
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: false,
  }),
  bounty: param({
    key: 'bounty',
    default: true,
    spec: ON_OFF,
    label: 'Bounty',
    tooltip: "+3 Glory for felling the hero of the sole Glory leader.",
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: false,
  }),
  haunting: param({
    key: 'haunting',
    default: true,
    spec: ON_OFF,
    label: 'Haunting',
    tooltip: 'Eliminated players keep placing Sootling Plumes.',
    modes: LAST_FLAME,
    derivedFrom: null,
    basic: false,
  }),
  seed: param({
    key: 'seed',
    default: 'random',
    spec: { kind: 'seed', maxLength: SEED_MAX_LENGTH },
    label: 'Seed',
    tooltip: "Same seed, same game: 'random', 'daily' or any text up to 32 characters.",
    modes: BOTH,
    derivedFrom: null,
    basic: false,
  }),
};

/** All parameter definitions in table order. */
export const RULE_PARAM_LIST: readonly RuleParamDef[] = RULE_KEYS.map((key) => RULE_PARAMS[key] as RuleParamDef);

/** The preset selectors (written under "presets" in a settings code, never as overrides). */
export const PRESET_KEYS = ['mode', 'length', 'difficulty'] as const satisfies readonly RuleKey[];

/** A fresh copy of the frozen v1 defaults. */
export function defaultRuleValues(): RuleValues {
  const values: Partial<Record<RuleKey, unknown>> = {};
  for (const key of RULE_KEYS) values[key] = cloneJson(RULE_PARAMS[key].default);
  // Every RuleKey was assigned from its typed parameter definition.
  return values as RuleValues;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Keys the Setup screen hides for a mode (§14.1). */
export function hiddenKeys(mode: ModeId): RuleKey[] {
  return RULE_KEYS.filter((key) => !RULE_PARAMS[key].modes.includes(mode));
}

// ---------------------------------------------------------------------------------------------
// Host options (§14.5): not in the settings code.
// ---------------------------------------------------------------------------------------------

export interface HostOptions {
  hot_seat_privacy: boolean;
  /** Seconds; capped at 120 during that seat's active turn. */
  reconnect_grace: number;
}

export const HOST_OPTION_DEFAULTS: Readonly<HostOptions> = { hot_seat_privacy: true, reconnect_grace: 120 };
export const RECONNECT_GRACE_RANGE = { min: 30, max: 600, activeTurnCap: 120 } as const;

export function sanitizeHostOptions(raw: Partial<HostOptions> | null | undefined): HostOptions {
  const grace = raw?.reconnect_grace;
  return {
    hot_seat_privacy: typeof raw?.hot_seat_privacy === 'boolean' ? raw.hot_seat_privacy : HOST_OPTION_DEFAULTS.hot_seat_privacy,
    reconnect_grace:
      typeof grace === 'number' && Number.isFinite(grace)
        ? Math.min(RECONNECT_GRACE_RANGE.max, Math.max(RECONNECT_GRACE_RANGE.min, Math.round(grace)))
        : HOST_OPTION_DEFAULTS.reconnect_grace,
  };
}
