/**
 * Pure state transitions for the New Game screen. The screen's whole state is one
 * ConfigSelection; seats live in `overrides.seats` (overrides win over every preset), and
 * the highlighted preset chip is derived from the selection rather than stored.
 */
import {
  customSelection,
  dailySelection,
  defaultSeatName,
  encodeSettingsCode,
  hiddenKeys,
  utcDateString,
  withDifficulty,
  withLength,
} from '../../../config';
import type { ConfigSelection, LocalProfile, PresetChip } from '../../../config';
import type { ContentRegistry, DifficultyId, LengthId, ModeId, RuleKey, RuleValues, SeatConfig, SeatKind } from '../../../engine/types';

export const MAX_SEATS = 4;
export const NAME_MAX_LENGTH = 24;

export function initialSetupSelection(playerName: string): ConfigSelection {
  return customSelection({ overrides: { seats: [{ kind: 'human', hero: null, name: playerName }] } });
}

function omitKeys(overrides: Partial<RuleValues>, keys: readonly RuleKey[]): Partial<RuleValues> {
  const out = { ...overrides };
  for (const key of keys) delete out[key];
  return out;
}

export function withSeats(selection: ConfigSelection, seats: SeatConfig[]): ConfigSelection {
  return { ...selection, overrides: { ...selection.overrides, seats } };
}

/** A plain custom selection with the same mode, presets, overrides and the given seats (leaves the Daily). */
export function leaveOneClick(selection: ConfigSelection, seats: SeatConfig[]): ConfigSelection {
  if (selection.oneClick === null && !selection.flags.daily) return withSeats(selection, seats);
  return customSelection({
    mode: selection.mode,
    length: selection.length,
    difficulty: selection.difficulty,
    overrides: { ...selection.overrides, seats },
    flags: { ...selection.flags, daily: false },
  });
}

// ---------------------------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------------------------

export function newSeat(kind: SeatKind, index: number, content: ContentRegistry): SeatConfig {
  return { kind, hero: null, name: defaultSeatName(kind, index, content) };
}

function hasDefaultName(seat: SeatConfig, index: number, content: ContentRegistry): boolean {
  return seat.name.trim() === '' || seat.name === defaultSeatName(seat.kind, index, content);
}

/** Last Flame needs 2+ seats and at least one human (§3.2); Vigil takes any 1–4. */
export function adaptSeatsForMode(seats: readonly SeatConfig[], mode: ModeId, content: ContentRegistry): SeatConfig[] {
  const next = seats.map((s) => ({ ...s }));
  if (mode !== 'last_flame') return next;
  if (next.length > 0 && !next.some((s) => s.kind === 'human')) next[0] = setKindOf(next[0], 0, 'human', content);
  while (next.length < 2) next.push(newSeat('bot_warden', next.length, content));
  return next;
}

function setKindOf(seat: SeatConfig, index: number, kind: SeatKind, content: ContentRegistry): SeatConfig {
  const name = hasDefaultName(seat, index, content) ? defaultSeatName(kind, index, content) : seat.name;
  return { ...seat, kind, name };
}

export function addSeat(seats: readonly SeatConfig[], kind: SeatKind, content: ContentRegistry): SeatConfig[] {
  if (seats.length >= MAX_SEATS) return [...seats];
  return [...seats, newSeat(kind, seats.length, content)];
}

/** Remove a seat; later seats move up and keep default names in step with their new seat. */
export function removeSeat(seats: readonly SeatConfig[], index: number, content: ContentRegistry): SeatConfig[] {
  return seats
    .map((seat, i) => ({ seat, i }))
    .filter(({ i }) => i !== index)
    .map(({ seat, i }, j) => (hasDefaultName(seat, i, content) ? { ...seat, name: defaultSeatName(seat.kind, j, content) } : seat));
}

export function setSeatKind(seats: readonly SeatConfig[], index: number, kind: SeatKind, content: ContentRegistry): SeatConfig[] {
  return seats.map((seat, i) => (i === index ? setKindOf(seat, i, kind, content) : seat));
}

export function setSeatHero(seats: readonly SeatConfig[], index: number, hero: string | null): SeatConfig[] {
  return seats.map((seat, i) => (i === index ? { ...seat, hero } : seat));
}

export function setSeatName(seats: readonly SeatConfig[], index: number, name: string): SeatConfig[] {
  return seats.map((seat, i) => (i === index ? { ...seat, name: name.slice(0, NAME_MAX_LENGTH) } : seat));
}

/** The other seat (0-based) that holds `hero`, or null. */
export function heroTakenBy(seats: readonly SeatConfig[], hero: string, exceptIndex: number): number | null {
  const index = seats.findIndex((s, i) => i !== exceptIndex && s.hero === hero);
  return index >= 0 ? index : null;
}

// ---------------------------------------------------------------------------------------------
// Mode, presets and parameters
// ---------------------------------------------------------------------------------------------

/** Switch mode: seats adapt, overrides the new mode hides are dropped, the Daily is left. */
export function setMode(selection: ConfigSelection, mode: ModeId, seats: readonly SeatConfig[], content: ContentRegistry): ConfigSelection {
  const overrides = omitKeys(selection.overrides, hiddenKeys(mode));
  return customSelection({
    mode,
    length: selection.length,
    difficulty: selection.difficulty,
    overrides: { ...overrides, seats: adaptSeatsForMode(seats, mode, content) },
    flags: { ...selection.flags, daily: false },
  });
}

export function setLength(selection: ConfigSelection, length: LengthId, seats: SeatConfig[]): ConfigSelection {
  return withLength(leaveOneClick(selection, seats), length);
}

export function setDifficulty(selection: ConfigSelection, difficulty: DifficultyId, seats: SeatConfig[], content: ContentRegistry): ConfigSelection {
  return withDifficulty(leaveOneClick(selection, seats), difficulty, content);
}

export function setOverride<K extends RuleKey>(selection: ConfigSelection, key: K, value: RuleValues[K]): ConfigSelection {
  const overrides: Partial<RuleValues> = { ...selection.overrides };
  overrides[key] = value;
  return { ...selection, overrides };
}

export function clearOverride(selection: ConfigSelection, key: RuleKey): ConfigSelection {
  return { ...selection, overrides: omitKeys(selection.overrides, [key]) };
}

/** The Daily for `now` (UTC), keeping seat 1's hero and name. */
export function dailyFor(now: Date, seats: readonly SeatConfig[], content: ContentRegistry): ConfigSelection {
  const first = seats[0];
  return dailySelection(utcDateString(now), first?.hero ?? null, first?.name, content);
}

export const CUSTOM_CHIPS = ['custom_1', 'custom_2', 'custom_3'] as const satisfies readonly PresetChip[];

export function customChip(slot: number): PresetChip {
  return CUSTOM_CHIPS[slot] ?? 'custom_1';
}

/** Which preset chip lights up: the Daily, a saved Custom preset that matches exactly, or the length. */
export function activeChip(selection: ConfigSelection, profile: LocalProfile, contentHash: string, content: ContentRegistry): PresetChip {
  if (selection.flags.daily) return 'daily';
  const code = encodeSettingsCode(selection, contentHash, content);
  const slot = profile.customPresets.findIndex((p) => p?.code === code);
  return slot >= 0 ? customChip(slot) : selection.length;
}
