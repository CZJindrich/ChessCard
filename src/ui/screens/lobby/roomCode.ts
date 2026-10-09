/**
 * Room codes (GDD §11.6): 4 letters from BCDFGHJKMNPQRSTVWXZ (no vowels, so no words).
 * The alphabet and length come from the content rules so the server and client agree.
 */
import type { RuleConstants } from '../../../engine/types';

export type RoomCodeRules = RuleConstants['roomCode'];

/** Upper-case, drop anything outside the alphabet, cut to length (for typing into the field). */
export function normalizeRoomCode(raw: string, rules: Pick<RoomCodeRules, 'alphabet' | 'length'>): string {
  return [...raw.toUpperCase()].filter((ch) => rules.alphabet.includes(ch)).join('').slice(0, rules.length);
}

export function isValidRoomCode(code: string, rules: Pick<RoomCodeRules, 'alphabet' | 'length'>): boolean {
  return code.length === rules.length && [...code].every((ch) => rules.alphabet.includes(ch));
}
