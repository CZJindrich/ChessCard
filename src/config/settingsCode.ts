/**
 * Settings codes (GDD §14.6): "WAX1:" + URL-safe base64 of
 * {"v":1,"presets":{"mode","length","difficulty"},"overrides":{…},"contentHash":"…"}.
 * Only values that differ from the preset baseline are written. Pasting clamps out-of-range
 * values, ignores unknown keys and reports both, and flags a different contentHash.
 */
import { getContent } from '../engine/content';
import { DIFFICULTIES, LENGTHS, MODES, RULE_KEYS } from '../engine/types';
import type { ContentRegistry, DifficultyId, LengthId, ModeId, RuleKey, RuleValues } from '../engine/types';
import { PRESET_KEYS } from './defaults';
import { customSelection } from './presets';
import type { ConfigSelection } from './presets';
import { coerceRuleValue, layerSelection } from './resolve';
import { isRecord } from './storage';

export const SETTINGS_CODE_PREFIX = 'WAX1:';
export const SETTINGS_CODE_VERSION = 1;

export interface SettingsCodePayload {
  v: 1;
  presets: { mode: ModeId; length: LengthId; difficulty: DifficultyId };
  overrides: Record<string, unknown>;
  contentHash: string;
}

export interface DecodedSettings {
  selection: ConfigSelection;
  /** Keys that are not rule parameters (ignored). */
  unknownKeys: string[];
  /** Values brought into range (or onto a known id). */
  clamped: Array<{ key: string; from: unknown; to: unknown }>;
  /** Values that could not be read at all (dropped; the preset value applies). */
  invalid: Array<{ key: string; value: unknown }>;
  /** The code was made with different content (mods). */
  contentMismatch: boolean;
  contentHash: string;
}

export type DecodeResult = { ok: true; value: DecodedSettings } | { ok: false; error: string };

// ---------------------------------------------------------------------------------------------
// UTF-8 + URL-safe base64 (hand-written: identical in browsers and Node, no globals needed)
// ---------------------------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return bytes;
}

function utf8Decode(bytes: readonly number[]): string | null {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const extra = b < 0x80 ? 0 : b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : -1;
    if (extra < 0 || i + extra >= bytes.length) return null;
    let cp = extra === 0 ? b : b & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (next & 63);
    }
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

export function base64UrlEncode(text: string): string {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [B64[(n >> 18) & 63], B64[(n >> 12) & 63], B64[(n >> 6) & 63], B64[n & 63]];
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

export function base64UrlDecode(encoded: string): string | null {
  const clean = encoded.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk[k]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return utf8Decode(bytes);
}

// ---------------------------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------------------------

/** Seats are shared by kind and hero only (names are local). */
function shareableValue(key: RuleKey, value: unknown): unknown {
  if (key !== 'seats' || !Array.isArray(value)) return value;
  return (value as RuleValues['seats']).map((s) => ({ kind: s.kind, hero: s.hero }));
}

function sameValue(key: RuleKey, a: unknown, b: unknown): boolean {
  return JSON.stringify(shareableValue(key, a)) === JSON.stringify(shareableValue(key, b));
}

/**
 * Values that differ from the plain preset baseline (defaults < length < difficulty). One-click
 * locked values count as overrides, so a code copied from a Quick Play game reproduces it.
 */
export function effectiveOverrides(selection: ConfigSelection, content: ContentRegistry = getContent()): Partial<Record<RuleKey, unknown>> {
  const baseline = layerSelection({ ...selection, locked: {}, overrides: {} }, { content }).values;
  const full = layerSelection(selection, { content }).values;
  const out: Partial<Record<RuleKey, unknown>> = {};
  for (const key of RULE_KEYS) {
    if ((PRESET_KEYS as readonly string[]).includes(key)) continue;
    if (!sameValue(key, baseline[key], full[key])) out[key] = shareableValue(key, full[key]);
  }
  return out;
}

export function encodeSettingsCode(selection: ConfigSelection, contentHash: string, content: ContentRegistry = getContent()): string {
  const payload: SettingsCodePayload = {
    v: 1,
    presets: { mode: selection.mode, length: selection.length, difficulty: selection.difficulty },
    overrides: effectiveOverrides(selection, content),
    contentHash,
  };
  return SETTINGS_CODE_PREFIX + base64UrlEncode(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------------------------

function pickPreset<T extends string>(raw: unknown, options: readonly T[], fallback: T, key: string, invalid: DecodedSettings['invalid']): T {
  if (typeof raw === 'string' && (options as readonly string[]).includes(raw)) return raw as T;
  if (raw !== undefined) invalid.push({ key, value: raw });
  return fallback;
}

export function decodeSettingsCode(code: string, opts: { contentHash?: string; content?: ContentRegistry } = {}): DecodeResult {
  const content = opts.content ?? getContent();
  const trimmed = code.trim();
  if (!trimmed.startsWith(SETTINGS_CODE_PREFIX)) return { ok: false, error: 'Not a Wickwatch settings code (it should start with WAX1:)' };
  const json = base64UrlDecode(trimmed.slice(SETTINGS_CODE_PREFIX.length));
  if (json === null) return { ok: false, error: 'The settings code is damaged' };
  let payload: unknown;
  try {
    payload = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, error: 'The settings code is damaged' };
  }
  if (!isRecord(payload) || payload.v !== SETTINGS_CODE_VERSION) return { ok: false, error: 'Unsupported settings code version' };

  const invalid: DecodedSettings['invalid'] = [];
  const clamped: DecodedSettings['clamped'] = [];
  const unknownKeys: string[] = [];
  const presets = isRecord(payload.presets) ? payload.presets : {};
  const selection = customSelection({
    mode: pickPreset(presets.mode, MODES, 'vigil', 'mode', invalid),
    length: pickPreset(presets.length, LENGTHS, 'short', 'length', invalid),
    difficulty: pickPreset(presets.difficulty, DIFFICULTIES, 'dusk', 'difficulty', invalid),
  });
  const overrides: Partial<Record<RuleKey, unknown>> = {};
  const rawOverrides = isRecord(payload.overrides) ? payload.overrides : {};
  for (const [key, raw] of Object.entries(rawOverrides)) {
    const ruleKey = RULE_KEYS.find((k) => k === key);
    if (!ruleKey || (PRESET_KEYS as readonly string[]).includes(key)) {
      unknownKeys.push(key);
      continue;
    }
    const result = coerceRuleValue(ruleKey, raw, content);
    if (!result.ok) {
      invalid.push({ key, value: raw });
      continue;
    }
    if (result.clamped) clamped.push({ key, from: raw, to: result.value });
    overrides[ruleKey] = result.value;
  }
  selection.overrides = overrides as Partial<RuleValues>;
  const hash = typeof payload.contentHash === 'string' ? payload.contentHash : '';
  return {
    ok: true,
    value: {
      selection,
      unknownKeys,
      clamped,
      invalid,
      contentMismatch: opts.contentHash !== undefined && hash !== opts.contentHash,
      contentHash: hash,
    },
  };
}

/** Toast lines for a pasted code (§14.6): ignored keys, clamped values, content mismatch. */
export function settingsCodeNotices(decoded: DecodedSettings): string[] {
  const lines: string[] = [];
  if (decoded.unknownKeys.length > 0) lines.push(`Ignored unknown settings: ${decoded.unknownKeys.join(', ')}`);
  for (const c of decoded.clamped) lines.push(`${c.key} adjusted from ${JSON.stringify(c.from)} to ${JSON.stringify(c.to)}`);
  for (const i of decoded.invalid) lines.push(`Ignored unreadable ${i.key}: ${JSON.stringify(i.value)}`);
  if (decoded.contentMismatch) lines.push('Made with different content (mods)');
  return lines;
}
