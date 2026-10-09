/**
 * Hero Powers (GDD §6.6, §8.1): `lantern_oath`, `flutterswap`, `castle` and `shadowstep`.
 * A Power costs Flame, can be used once per seat turn, never while the hero is Smoldering, and
 * never uses a piece's Move or Strike. Soot Fog shortens Power ranges; card limits and
 * Lamplighter's Hook do not apply.
 */
import { checkTurn } from './actions';
import { baseEnv, runEffects } from './effects';
import { addLog, pieceName } from './log';
import { effectArea, previewFromEvents } from './previewEvents';
import { cloneState, emit, heroOf, makeCtx } from './state';
import type { Ctx } from './state';
import { checkPicks, pickPlan, picksToTargets } from './targeting';
import type { PickEnv } from './targeting';
import { stepInfo } from './targetInfo';
import { fail, OK } from './validation';
import type { ActionOf, CardTargetChoice, CardTargetInfo, ContentRegistry, EffectPreview, GameState, PowerDef, TargetQuery, Validation } from './types';

export function powerOf(s: GameState, reg: ContentRegistry, seat: number): PowerDef | null {
  const hero = s.players[seat] ? reg.heroes.byId[s.players[seat].hero] : undefined;
  return hero ? (reg.powers.byId[hero.power] ?? null) : null;
}

export function powerCost(s: GameState, reg: ContentRegistry, seat: number): number {
  const hero = s.players[seat] ? reg.heroes.byId[s.players[seat].hero] : undefined;
  return hero?.powerCost ?? 0;
}

function powerEnv(seat: number, def: PowerDef): PickEnv {
  return { seat, kind: 'power', plan: pickPlan(def.target, def.then, def.effects) };
}

/** Everything except the targets: turn, hero standing, once per seat turn, Flame. */
function powerReady(s: GameState, reg: ContentRegistry, seat: number): Validation {
  const turn = checkTurn(s, seat);
  if (!turn.ok) return turn;
  if (!powerOf(s, reg, seat)) return fail('INVALID_ACTION');
  const hero = heroOf(s, seat);
  if (!hero || hero.smoldering) return fail('HERO_SMOLDERING');
  if (s.players[seat].turn.powerUsed) return fail('POWER_USED');
  const cost = powerCost(s, reg, seat);
  return s.players[seat].flame < cost ? fail('NEED_FLAME', { n: cost }) : OK;
}

export function validateUsePower(s: GameState, reg: ContentRegistry, a: ActionOf<'use_power'>): Validation {
  const ready = powerReady(s, reg, a.seat);
  if (!ready.ok) return ready;
  const def = powerOf(s, reg, a.seat);
  return def ? checkPicks(s, reg, powerEnv(a.seat, def), a.targets) : fail('INVALID_ACTION');
}

/** Pay, mark the Power used for this seat turn and run its effects (validation already passed). */
export function applyUsePower(ctx: Ctx, a: ActionOf<'use_power'>): void {
  const { s, reg } = ctx;
  const def = powerOf(s, reg, a.seat);
  const hero = heroOf(s, a.seat);
  if (!def || !hero) return;
  const player = s.players[a.seat];
  const cost = powerCost(s, reg, a.seat);
  const targets = picksToTargets(s, reg, powerEnv(a.seat, def), a.targets);
  player.flame -= cost;
  player.turn.powerUsed = true;
  emit(ctx, { type: 'power_used', seat: a.seat, powerId: def.id, cost, targets: a.targets });
  addLog(ctx, `${pieceName(reg, hero)} uses ${def.name}.`, a.seat);
  runEffects(
    ctx,
    def.effects,
    baseEnv({
      seat: a.seat,
      self: hero,
      targets,
      cause: 'power',
      damageKind: 'card',
      ruleSource: { kind: 'power', id: def.id },
      defaultDuration: 'turn',
      plumeSource: 'card',
      summonSource: 'card',
    }),
  );
}

function simulate(s: GameState, reg: ContentRegistry, def: PowerDef, seat: number, targets: CardTargetChoice[]): EffectPreview {
  const ctx = makeCtx(cloneState(s), reg);
  applyUsePower(ctx, { type: 'use_power', seat, targets });
  const preview = previewFromEvents(ctx.events, ctx.s);
  preview.area = effectArea(s, seat, def.effects, picksToTargets(s, reg, powerEnv(seat, def), targets));
  return preview;
}

/** Playability, valid choices and previews for the seat's Hero Power (multi-step via `query.chosen`). */
export function powerTargetInfo(s: GameState, reg: ContentRegistry, seat: number, query: TargetQuery = {}): CardTargetInfo {
  const def = powerOf(s, reg, seat);
  const base: CardTargetInfo = { playable: false, cost: powerCost(s, reg, seat), modes: null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null };
  if (!def) return { ...base, reason: 'INVALID_ACTION' };
  const ready = powerReady(s, reg, seat);
  if (!ready.ok) return { ...base, reason: ready.reason, ...(ready.params ? { params: ready.params } : {}) };
  return stepInfo(s, reg, powerEnv(seat, def), query.chosen ?? [], (targets) => simulate(s, reg, def, seat, targets), base);
}
