/**
 * The `CardTargetInfo` answer for one step of a multi-step play (cards, Hero Powers, free
 * actions): validates the picks made so far, checks the play can still be completed, and lists
 * the next pick's options with a simulated preview each.
 *
 * `complete` means the picks so far can be sent as they are. An optional pick (Sunshield
 * Charge's hit) may be left out only when it has no valid choice, so `complete` stays false
 * while one exists.
 */
import { checkPicks, completes, effectiveRangeMax, matchPicks, rangeOrigin, stepOptions } from './targeting';
import type { Pick, PickEnv } from './targeting';
import type { CardTargetChoice, CardTargetInfo, ContentRegistry, EffectPreview, GameState, Validation } from './types';

export type PreviewFn = (choices: CardTargetChoice[]) => EffectPreview;

const BLANK: CardTargetInfo = { playable: false, cost: 0, modes: null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null };

function withReason(info: CardTargetInfo, v: Validation): CardTargetInfo {
  return v.ok ? info : { ...info, reason: v.reason, ...(v.params ? { params: v.params } : {}) };
}

/** The range ring of pick `picks.length` (or of the last pick once all are made). */
function stepRing(s: GameState, env: PickEnv, picks: readonly Pick[]): CardTargetInfo['rangeRing'] {
  const spec = env.plan.specs[Math.min(picks.length, env.plan.specs.length - 1)];
  if (!spec || spec.range.from === 'board' || spec.range.from === 'any_own') return null;
  const origin = rangeOrigin(s, env.seat, spec, picks);
  const radius = effectiveRangeMax(s, env.seat, spec.range, env.kind);
  return origin && radius !== null ? { centre: { ...origin.pos }, radius } : null;
}

export function stepInfo(s: GameState, reg: ContentRegistry, env: PickEnv, chosen: readonly CardTargetChoice[], preview: PreviewFn, base: CardTargetInfo = BLANK): CardTargetInfo {
  const { specs, required } = env.plan;
  if (specs.length === 0) {
    if (chosen.length > 0) return { ...base, steps: 0, reason: 'INVALID_TARGET' };
    return { ...base, playable: true, step: 0, steps: 0, complete: true, preview: preview([]) };
  }
  const matched = matchPicks(s, reg, env, chosen);
  if (!matched.ok) return withReason({ ...base, step: chosen.length, steps: specs.length }, matched.validation);
  const picks = matched.picks;
  const step = picks.length;
  const info: CardTargetInfo = {
    ...base,
    step,
    steps: specs.length,
    optional: step >= required && step < specs.length,
    complete: step >= required && checkPicks(s, reg, env, chosen).ok,
    rangeRing: stepRing(s, env, picks),
  };
  const whole = completes(s, reg, env, picks);
  if (!whole.ok) return withReason(info, whole);
  if (step >= specs.length) return { ...info, playable: true };
  const options = stepOptions(s, reg, env, picks);
  if (options.list.length === 0 && step < required) return withReason(info, options.empty);
  const done = picks.map((p) => p.choice);
  const targets = options.list.map((o) => ({ choice: o.choice, pos: { ...o.target.pos }, preview: preview([...done, o.choice]) }));
  return { ...info, playable: true, targets };
}
