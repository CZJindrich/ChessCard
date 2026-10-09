/**
 * Turning the host's config into one the server trusts: every rule parameter coerced into its
 * type and range (src/config), validated for online play, and given a concrete seed. Online
 * games never run the tutorial or the first-ever maps, and the server only plays base content.
 */
import { coerceRuleValue, concreteSeed, defaultRuleValues, defaultSeatName, randomSeedText, validateConfig } from '../src/config';
import type { ConfigSelection } from '../src/config/presets';
import type { ContentRegistry, GameConfig, RuleValues, SeatConfig } from '../src/engine/types';
import { RULE_KEYS } from '../src/engine/types';
import { sanitizeName } from '../src/net/protocol';

export type ConfigCheck = { ok: true; config: GameConfig } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeRoomConfig(raw: unknown, content: ContentRegistry, now: Date): ConfigCheck {
  if (!isRecord(raw)) return { ok: false, message: 'The settings are missing.' };
  const values = defaultRuleValues() as unknown as Record<string, unknown>;
  for (const key of RULE_KEYS) {
    if (raw[key] === undefined) continue;
    const coerced = coerceRuleValue(key, raw[key], content);
    if (!coerced.ok) return { ok: false, message: `The setting "${key}" has a value the server does not accept.` };
    values[key] = coerced.value;
  }
  const rules = values as unknown as RuleValues;
  rules.seats = rules.seats.map((seat, i): SeatConfig => ({ kind: seat.kind, hero: seat.hero, name: sanitizeName(seat.name) || defaultSeatName(seat.kind, i, content) }));
  const flags = { tutorial: false, firstGame: false, daily: raw.daily === true, modded: false };
  const validation = validateConfig(rules, { online: true, content, flags });
  if (!validation.ok) return { ok: false, message: validation.issues.map((issue) => issue.message).join(' ') };
  const seed = concreteSeed(rules.seed, { now, random: randomSeedText });
  return { ok: true, config: { ...rules, seed, ...flags } };
}

/** The selection is opaque to the server (only the host's Setup reads it); keep it small and plain. */
export function sanitizeSelection(raw: unknown): ConfigSelection | null {
  if (!isRecord(raw)) return null;
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return null;
  }
  if (text.length > 16 * 1024) return null;
  const value = JSON.parse(text) as Record<string, unknown>;
  if (typeof value.mode !== 'string' || typeof value.length !== 'string' || typeof value.difficulty !== 'string') return null;
  if (!isRecord(value.locked) || !isRecord(value.overrides) || !isRecord(value.flags)) return null;
  return value as unknown as ConfigSelection;
}

/** Seats as the game starts: claimed human seats get their player's name; open ones a Warden. */
export function seatsForStart(config: GameConfig, occupantNames: ReadonlyArray<string | null>, content: ContentRegistry): SeatConfig[] {
  return config.seats.map((seat, i): SeatConfig => {
    if (seat.kind !== 'human') return { ...seat };
    const name = occupantNames[i];
    return name ? { kind: 'human', hero: seat.hero, name } : { kind: 'bot_warden', hero: seat.hero, name: defaultSeatName('bot_warden', i, content) };
  });
}
