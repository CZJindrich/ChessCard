/** Labels and grouping for rule parameters on the Setup screen (§14.1). */
import { RULE_PARAM_LIST, RULE_PARAMS } from '../../../config';
import type { ConfigSelection, ParamSource, RuleParamDef } from '../../../config';
import type { ContentRegistry, ModeId, RuleKey } from '../../../engine/types';

interface ParamGroup {
  title: string;
  keys: readonly RuleKey[];
}

const GROUPS: readonly ParamGroup[] = [
  { title: 'Nights & rounds', keys: ['nights', 'turns_per_night', 'boss_rounds'] },
  { title: 'Hand & Flame', keys: ['flame_per_turn', 'hand_size', 'unit_limit'] },
  { title: 'Systems', keys: ['tolls', 'moth_die', 'boons', 'retry_night', 'turn_timer'] },
  {
    title: 'Dread & the Snuff',
    keys: ['starting_dread', 'dread_max', 'initial_enemies_mod', 'plumes_mod', 'enemy_hp_mod', 'extra_smokestack', 'boss_hp_multiplier', 'heal_between_nights'],
  },
  { title: 'Last Flame', keys: ['respawn_before_boss', 'neutrals', 'truce', 'bounty', 'haunting'] },
  { title: 'Seed', keys: ['seed'] },
];

export interface AdvancedGroup {
  title: string;
  params: RuleParamDef[];
}

/** The Advanced panel for a mode: every non-basic parameter that mode shows, grouped. */
export function advancedGroups(mode: ModeId): AdvancedGroup[] {
  const shown = (def: RuleParamDef): boolean => !def.basic && def.modes.includes(mode);
  const groups = GROUPS.map((g) => ({ title: g.title, params: g.keys.map((k) => RULE_PARAMS[k] as RuleParamDef).filter(shown) }));
  const grouped = new Set<RuleKey>(GROUPS.flatMap((g) => g.keys));
  const rest = RULE_PARAM_LIST.filter((def) => shown(def) && !grouped.has(def.key));
  if (rest.length > 0) groups.push({ title: 'Other', params: rest });
  return groups.filter((g) => g.params.length > 0);
}

const OPTION_LABELS: Readonly<Partial<Record<RuleKey, Readonly<Record<string, string>>>>> = {
  board_size: { auto: 'Auto', '10x10': '10×10', '12x12': '12×12' },
  enemy_hp_mod: { none: 'None', non_minions: 'Non-minions', all: 'All Snuff' },
  turn_timer: { off: 'Off', slow: 'Slow 150 s', normal: 'Normal 90 s', fast: 'Fast 45 s' },
  neutrals: { off: 'Off', normal: 'Normal', swarm: 'Swarm' },
  truce: { off: 'Off', night_1: 'Night 1', nights_1_2: 'Nights 1–2' },
  mode: { vigil: 'Vigil', last_flame: 'Last Flame' },
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function optionLabel(key: RuleKey, value: string): string {
  return OPTION_LABELS[key]?.[value] ?? titleCase(value);
}

const SIGNED_KEYS: ReadonlySet<RuleKey> = new Set(['initial_enemies_mod', 'plumes_mod']);

/** Display text for a numeric parameter value. */
export function formatNumber(key: RuleKey, value: number): string {
  if (key === 'boss_hp_multiplier') return `×${value.toFixed(2)}`;
  if (SIGNED_KEYS.has(key)) return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
  return String(value);
}

/** Where a value comes from, for the small tag beside each parameter. */
export function sourceLabel(source: ParamSource, selection: ConfigSelection, content: ContentRegistry): string {
  switch (source) {
    case 'default':
      return 'Default';
    case 'length':
      return content.lengths.byId[selection.length]?.name ?? selection.length;
    case 'difficulty':
      return content.difficulty.byId[selection.difficulty]?.name ?? selection.difficulty;
    case 'mode':
      return selection.flags.daily ? 'Daily' : selection.oneClick === 'quick_last_flame' ? 'Quick Last Flame' : 'Quick Play';
    case 'override':
      return 'Custom';
  }
}
