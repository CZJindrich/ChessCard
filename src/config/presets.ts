/**
 * Preset layers (GDD §14.2-14.3): length and difficulty presets, and the one-click modes
 * (Quick Play first-ever and later, Quick Last Flame, Daily). A preset produces a
 * `ConfigSelection`; `resolve.ts` layers it into a GameConfig.
 */
import { getContent } from '../engine/content';
import { seedFromString } from '../engine/rng';
import type {
  ContentRegistry,
  DifficultyId,
  LengthId,
  ModeId,
  RuleValues,
  SeatConfig,
  SeatKind,
} from '../engine/types';

export type OneClickMode = 'quick_play' | 'quick_last_flame' | 'daily';

/** Non-rule engine flags carried into GameConfig. */
export interface EngineFlags {
  tutorial: boolean;
  firstGame: boolean;
  daily: boolean;
  modded: boolean;
}

export const NO_FLAGS: Readonly<EngineFlags> = { tutorial: false, firstGame: false, daily: false, modded: false };

/**
 * What the player picked. Precedence when resolving (later wins):
 * defaults < length preset < difficulty preset < one-click `locked` values < `overrides`.
 */
export interface ConfigSelection {
  mode: ModeId;
  length: LengthId;
  difficulty: DifficultyId;
  oneClick: OneClickMode | null;
  /** Values a one-click mode sets (applied after the difficulty preset). */
  locked: Partial<RuleValues>;
  /** User overrides (Advanced panel, settings code). Preset keys here are ignored. */
  overrides: Partial<RuleValues>;
  flags: EngineFlags;
}

/** The profile facts the unlock ladder (§13.7) needs; LocalProfile satisfies it. */
export interface UnlockState {
  gamesCompleted: number;
  lastQuickPlayLost: boolean;
  firstLastFlameDone: boolean;
}

/** nights / turns_per_night / boss_rounds for a length and mode (§14.3). */
export function lengthPreset(
  length: LengthId,
  mode: ModeId,
  content: ContentRegistry = getContent(),
): Pick<RuleValues, 'nights' | 'turns_per_night' | 'boss_rounds'> {
  const def = content.lengths.byId[length];
  if (!def) throw new Error(`unknown length "${length}"`);
  const nights = mode === 'vigil' ? def.vigil.nights : def.last_flame.nights;
  return { nights, turns_per_night: def.turns_per_night, boss_rounds: def.last_flame.boss_rounds };
}

/** The difficulty-driven values (§14.2). */
export function difficultyPreset(difficulty: DifficultyId, content: ContentRegistry = getContent()): Partial<RuleValues> {
  const def = content.difficulty.byId[difficulty];
  if (!def) throw new Error(`unknown difficulty "${difficulty}"`);
  return { ...def.values };
}

/** A plain New Game selection. */
export function customSelection(input: Partial<Pick<ConfigSelection, 'mode' | 'length' | 'difficulty' | 'overrides' | 'flags'>> = {}): ConfigSelection {
  return {
    mode: input.mode ?? 'vigil',
    length: input.length ?? 'short',
    difficulty: input.difficulty ?? 'dusk',
    oneClick: null,
    locked: {},
    overrides: { ...(input.overrides ?? {}) },
    flags: { ...NO_FLAGS, ...(input.flags ?? {}) },
  };
}

/** "Player 2" for humans; "Warden of Tallow" for bots (bot flavour + House). */
export function defaultSeatName(kind: SeatKind, seat: number, content: ContentRegistry = getContent()): string {
  if (kind === 'human') return `Player ${seat + 1}`;
  const flavour = content.bots.byId[kind]?.flavour ?? 'Bot';
  const house = content.houses.list.find((h) => h.seat === seat + 1)?.name.replace(/^House /, '');
  return house ? `${flavour} of ${house}` : `${flavour} ${seat + 1}`;
}

function seat(kind: SeatKind, index: number, hero: string | null, content: ContentRegistry, name?: string): SeatConfig {
  return { kind, hero, name: name ?? defaultSeatName(kind, index, content) };
}

/**
 * QUICK PLAY (§14.3, §13.7): solo Vigil, one click after choosing a hero.
 * First-ever game: short, candlelit, first_vigil then cathedral_of_tallow, Hush Hierophant,
 * no Tolls / Moth Die / Boons. Later: short, dusk (candlelit after a lost Quick Play), random boss,
 * everything else on.
 */
export function quickPlaySelection(
  profile: UnlockState,
  hero: string | null,
  playerName?: string,
  content: ContentRegistry = getContent(),
): ConfigSelection {
  const firstEver = profile.gamesCompleted === 0;
  const seats = [seat('human', 0, hero, content, playerName)];
  if (firstEver) {
    return {
      mode: 'vigil',
      length: 'short',
      difficulty: 'candlelit',
      oneClick: 'quick_play',
      locked: { seats, boss_choice: 'hush_hierophant', tolls: false, moth_die: false, boons: false },
      overrides: {},
      flags: { ...NO_FLAGS, tutorial: true, firstGame: true },
    };
  }
  return {
    mode: 'vigil',
    length: 'short',
    difficulty: profile.lastQuickPlayLost ? 'candlelit' : 'dusk',
    oneClick: 'quick_play',
    locked: { seats, boss_choice: 'random', tolls: true, moth_die: true, boons: true },
    overrides: {},
    flags: { ...NO_FLAGS },
  };
}

/**
 * QUICK LAST FLAME (§14.3): you + 2 bot_warden seats on 10×10, short, dusk, truce night_1,
 * timer off. Bots get random unpicked heroes. The first one turns Bounty and Haunting off.
 */
export function quickLastFlameSelection(
  profile: UnlockState,
  hero: string | null,
  playerName?: string,
  content: ContentRegistry = getContent(),
): ConfigSelection {
  const seats = [seat('human', 0, hero, content, playerName), seat('bot_warden', 1, null, content), seat('bot_warden', 2, null, content)];
  const firstTime = !profile.firstLastFlameDone;
  return {
    mode: 'last_flame',
    length: 'short',
    difficulty: 'dusk',
    oneClick: 'quick_last_flame',
    locked: {
      seats,
      board_size: '10x10',
      truce: 'night_1',
      turn_timer: 'off',
      ...(firstTime ? { bounty: false, haunting: false } : {}),
    },
    overrides: {},
    flags: { ...NO_FLAGS },
  };
}

/** "YYYY-MM-DD" of a Date in UTC. */
export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The Daily seed for a UTC date ("YYYY-MM-DD"). */
export function dailySeed(utcDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) throw new Error(`not a YYYY-MM-DD date: ${utcDate}`);
  return `daily:${utcDate}`;
}

/** The boss a seed draws (Daily shows it in advance). Deterministic over the content's boss order. */
export function bossForSeed(seed: string, content: ContentRegistry = getContent()): string {
  const bosses = content.bosses.list;
  if (bosses.length === 0) throw new Error('no bosses in content');
  return bosses[seedFromString(`${seed}\u0000boss`) % bosses.length].id;
}

/**
 * DAILY (§14.3): standard, dusk, solo Vigil, boss drawn from the seed, Retry off. The caller
 * supplies the UTC date. Mods disable the Daily (validateConfig reports it).
 */
export function dailySelection(
  utcDate: string,
  hero: string | null,
  playerName?: string,
  content: ContentRegistry = getContent(),
): ConfigSelection {
  const seed = dailySeed(utcDate);
  return {
    mode: 'vigil',
    length: 'standard',
    difficulty: 'dusk',
    oneClick: 'daily',
    locked: {
      seats: [seat('human', 0, hero, content, playerName)],
      boss_choice: bossForSeed(seed, content),
      retry_night: false,
      seed,
    },
    overrides: {},
    flags: { ...NO_FLAGS, daily: true },
  };
}

/** Setup-screen preset chips (§14.3). */
export const PRESET_CHIPS = ['short', 'standard', 'long', 'daily', 'custom_1', 'custom_2', 'custom_3'] as const;
export type PresetChip = (typeof PRESET_CHIPS)[number];

/** Apply a length chip to a selection (keeps mode, difficulty and overrides other than length-driven keys). */
export function withLength(selection: ConfigSelection, length: LengthId): ConfigSelection {
  const overrides = { ...selection.overrides };
  delete overrides.nights;
  delete overrides.turns_per_night;
  delete overrides.boss_rounds;
  return { ...selection, length, overrides };
}

/** Apply a difficulty chip (drops overrides of difficulty-driven keys). */
export function withDifficulty(selection: ConfigSelection, difficulty: DifficultyId, content: ContentRegistry = getContent()): ConfigSelection {
  const overrides = { ...selection.overrides };
  for (const key of Object.keys(difficultyPreset(difficulty, content)) as Array<keyof RuleValues>) delete overrides[key];
  return { ...selection, difficulty, overrides };
}
