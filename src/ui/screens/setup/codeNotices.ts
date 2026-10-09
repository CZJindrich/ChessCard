/** Toast lines for a pasted settings code (§14.6), naming parameters by their labels. */
import { RULE_KEYS } from '../../../engine/types';
import type { DecodedSettings } from '../../../config';
import { RULE_PARAMS } from '../../../config';

function label(key: string): string {
  const ruleKey = RULE_KEYS.find((k) => k === key);
  return ruleKey ? RULE_PARAMS[ruleKey].label : key;
}

function shown(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
}

export function codeNotices(decoded: DecodedSettings): string[] {
  const lines: string[] = [];
  if (decoded.unknownKeys.length > 0) lines.push(`Ignored unknown settings: ${decoded.unknownKeys.join(', ')}`);
  for (const c of decoded.clamped) lines.push(`${label(c.key)} adjusted from ${shown(c.from)} to ${shown(c.to)}`);
  for (const i of decoded.invalid) lines.push(`Ignored unreadable ${label(i.key)}: ${shown(i.value)}`);
  if (decoded.contentMismatch) lines.push('Made with different content (mods)');
  return lines;
}
