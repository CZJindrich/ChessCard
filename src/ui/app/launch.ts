/**
 * Turning a menu selection into the game route's input: a validated GameConfig with a
 * concrete seed (the engine never sees 'random' or 'daily').
 */
import { concreteSeed, quickLastFlameSelection, quickPlaySelection, resolveConfig } from '../../config';
import type { ConfigIssue, ConfigSelection, LocalProfile, UnlockState } from '../../config';
import type { ContentRegistry, GameConfig, SeatConfig } from '../../engine/types';
import type { HeroPickMode } from './navigation';

/** The unlock state of a brand-new profile: "Play the tutorial" always gets the first-ever game. */
const FIRST_EVER: UnlockState = { gamesCompleted: 0, lastQuickPlayLost: false, firstLastFlameDone: false };

export function heroPickSelection(mode: HeroPickMode, profile: LocalProfile, heroId: string, content: ContentRegistry): ConfigSelection {
  switch (mode) {
    case 'quick_play':
      return quickPlaySelection(profile, heroId, profile.playerName, content);
    case 'quick_last_flame':
      return quickLastFlameSelection(profile, heroId, profile.playerName, content);
    case 'tutorial':
      return quickPlaySelection(FIRST_EVER, heroId, profile.playerName, content);
  }
}

/** "Watch a 20-second demo": one Normal AI ally keeps a short Vigil on its own. */
export function demoSelection(content: ContentRegistry): ConfigSelection {
  const seats: SeatConfig[] = [{ kind: 'bot_warden', hero: null, name: content.bots.byId.bot_warden?.flavour ?? 'Warden' }];
  return {
    mode: 'vigil',
    length: 'short',
    difficulty: 'dusk',
    oneClick: null,
    locked: { seats, tolls: false, moth_die: true, boons: false },
    overrides: {},
    flags: { tutorial: false, firstGame: false, daily: false, modded: false },
  };
}

export interface LaunchEnv {
  content: ContentRegistry;
  modded: boolean;
  now: Date;
  randomSeed: () => string;
  online?: boolean;
}

export type LaunchResult = { ok: true; config: GameConfig; selection: ConfigSelection } | { ok: false; issues: ConfigIssue[] };

export function prepareLaunch(selection: ConfigSelection, env: LaunchEnv): LaunchResult {
  const sel: ConfigSelection = { ...selection, flags: { ...selection.flags, modded: env.modded } };
  const resolved = resolveConfig(sel, { online: env.online ?? false, content: env.content });
  if (!resolved.validation.ok) return { ok: false, issues: resolved.validation.issues };
  const seed = concreteSeed(resolved.config.seed, { now: env.now, random: env.randomSeed });
  return { ok: true, config: { ...resolved.config, seed }, selection: sel };
}
