/**
 * Vigil mode rules (GDD §13.1): Dread and its thresholds, victory and defeat, stars, Dawn Dread
 * recovery and the night_setup snapshot used by Retry this Night.
 */
import { addLog } from '../log';
import { emit, isOver, pieceList } from '../state';
import type { Ctx } from '../state';
import type { ContentRegistry, DreadCause, DreadThresholdId, GameResult, GameState, StateSnapshot } from '../types';

/** Threshold values for a Dread maximum M: ⌊M/3⌋, ⌊2M/3⌋, M (§13.1.2). */
export function dreadThresholdValues(dreadMax: number, reg: ContentRegistry): Record<DreadThresholdId, number> {
  const out = {} as Record<DreadThresholdId, number>;
  for (const t of reg.rules.dread.thresholds) out[t.id] = Math.floor((dreadMax * t.num) / t.den);
  return out;
}

/** The highest threshold crossed going up from `from` to `to`, or null. */
export function crossedThreshold(from: number, to: number, dreadMax: number, reg: ContentRegistry): DreadThresholdId | null {
  if (to <= from) return null;
  const values = dreadThresholdValues(dreadMax, reg);
  let crossed: DreadThresholdId | null = null;
  for (const t of reg.rules.dread.thresholds) if (from < values[t.id] && to >= values[t.id]) crossed = t.id;
  return crossed;
}

/** The current threshold band (null below `dimming`). */
export function currentThreshold(s: GameState, reg: ContentRegistry): DreadThresholdId | null {
  if (!s.vigil) return null;
  const values = dreadThresholdValues(s.vigil.dreadMax, reg);
  let band: DreadThresholdId | null = null;
  for (const t of reg.rules.dread.thresholds) if (s.vigil.dread >= values[t.id]) band = t.id;
  return band;
}

/**
 * Change Dread (Vigil only; a no-op in Last Flame or after the game ended). Defeat is checked
 * after every atomic effect (§13.1.5): Dread at or above the maximum ends the game at once, or
 * at the end of the atomic effect in progress.
 */
export function changeDread(ctx: Ctx, delta: number, cause: DreadCause, causeText: string): void {
  const vigil = ctx.s.vigil;
  if (!vigil || delta === 0 || isOver(ctx.s)) return;
  const from = vigil.dread;
  const to = Math.max(0, Math.min(vigil.dreadMax, from + delta));
  if (to === from) return;
  vigil.dread = to;
  ctx.s.stats.dreadPeak = Math.max(ctx.s.stats.dreadPeak, to);
  emit(ctx, { type: 'dread_changed', from, to, cause, threshold: crossedThreshold(from, to, vigil.dreadMax, ctx.reg) });
  if (to < vigil.dreadMax) return;
  if (ctx.atomic && ctx.atomic.depth > 0) ctx.atomic.defeat ??= causeText;
  else endVigil(ctx, 'defeat', causeText);
}

/**
 * Run `fn` as one atomic effect (§13.1.5): a damage instance with what it sets off, or a bump
 * pair. A Dread defeat reached inside it lands when the outermost effect ends, unless the same
 * effect won the game (the boss fell): victory beats defeat.
 */
export function atomicEffect<T>(ctx: Ctx, fn: () => T): T {
  const open = (ctx.atomic ??= { depth: 0, defeat: null });
  open.depth += 1;
  try {
    return fn();
  } finally {
    open.depth -= 1;
    if (open.depth === 0 && open.defeat !== null) {
      const cause = open.defeat;
      open.defeat = null;
      endVigil(ctx, 'defeat', cause);
    }
  }
}

/** Stars for a victory (§13.1.6). */
export function starsFor(finalDread: number, dreadMax: number, retries: number): 1 | 2 | 3 {
  if (finalDread < Math.floor(dreadMax / 3) && retries === 0) return 3;
  if (finalDread < Math.floor((2 * dreadMax) / 3)) return 2;
  return 1;
}

/** Finish a Vigil game. A victory is never overwritten (victory wins ties, §13.1.5). */
export function endVigil(ctx: Ctx, outcome: 'victory' | 'defeat' | 'conceded', cause: string | null): void {
  const { s } = ctx;
  if (!s.vigil) return;
  if (s.result && !(s.result.mode === 'vigil' && s.result.outcome !== 'victory' && outcome === 'victory')) return;
  const result: GameResult = {
    mode: 'vigil',
    outcome,
    stars: outcome === 'victory' ? starsFor(s.vigil.dread, s.vigil.dreadMax, s.vigil.retries) : 0,
    cause: outcome === 'victory' ? null : cause,
    finalDread: s.vigil.dread,
    retries: s.vigil.retries,
  };
  s.result = result;
  s.phase = 'game_over';
  s.activeSeat = null;
  addLog(ctx, outcome === 'victory' ? 'Dawn breaks. The Vigil is kept.' : outcome === 'conceded' ? 'The Vigil is abandoned.' : `The Long Night falls. ${cause ?? ''}`.trim());
  emit(ctx, { type: 'phase_changed', phase: 'game_over', night: s.night, round: s.round });
  emit(ctx, { type: 'game_over', result });
}

/** Dawn step 2: Dread −1 per Vigil Candle still lit (not below 0). Returns the candles standing. */
export function dawnDreadRecovery(ctx: Ctx): number {
  const lit = pieceList(ctx.s).filter((p) => p.kind === 'candle').length;
  if (ctx.s.vigil && lit > 0) {
    changeDread(ctx, ctx.reg.rules.dread.dawnPerCandle * lit, 'dawn', 'Dawn');
  }
  return lit;
}

/** The night_setup snapshot for Retry this Night (RNG stream positions included, §13.1.7). */
export function captureNightSnapshot(s: GameState): void {
  const { undo: _undo, nightSnapshot: _snapshot, log, ...rest } = s;
  const copy = JSON.parse(JSON.stringify(rest)) as Omit<StateSnapshot, 'log'>;
  s.nightSnapshot = { ...copy, log: log.slice() };
}

/**
 * Retry this Night: restore the night_setup snapshot exactly (RNG streams, ids and the log
 * included), then count the retry. Votes and undo frames start empty.
 */
export function restoreNightSnapshot(ctx: Ctx): void {
  const current = ctx.s;
  const snapshot = current.nightSnapshot;
  if (!snapshot || !current.vigil) return;
  const { config: _config, log, ...rest } = snapshot;
  const restored = JSON.parse(JSON.stringify(rest)) as Omit<StateSnapshot, 'config' | 'log'>;
  ctx.s = { ...restored, config: current.config, log: log.slice(), nightSnapshot: snapshot, undo: { frames: [], depth: 0 } };
  const retries = current.vigil.retries + 1;
  if (ctx.s.vigil) ctx.s.vigil = { ...ctx.s.vigil, retries, retryVotes: [], concedeVotes: [] };
  ctx.s.stats.retries = current.stats.retries + 1;
  emit(ctx, { type: 'night_retried', night: ctx.s.night });
  emit(ctx, { type: 'phase_changed', phase: ctx.s.phase, night: ctx.s.night, round: ctx.s.round });
  addLog(ctx, `The Night begins again (retry ${retries}).`);
}
