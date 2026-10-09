/** Validation results with reason codes (GDD §15.6). */
import type { ReasonCode, ReasonParams, Validation } from './types';

export const OK: Validation = { ok: true };

export function fail(reason: ReasonCode, params?: ReasonParams): Validation {
  return params ? { ok: false, reason, params } : { ok: false, reason };
}
