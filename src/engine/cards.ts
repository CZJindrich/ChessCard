/**
 * Card play (GDD §7): Flame costs (tempered, Candlemaker's Mold), card limits (Muffled Nave,
 * Silencing Peal), unit limits, Smoldering heroes, multi-step targeting (targeting.ts) and
 * simulated previews. Effects run through the interpreter in effects.ts; a Charm card is not
 * discarded but attached by its `attach_charm` effect.
 */
import { checkTurn } from './actions';
import { baseEnv, runEffects } from './effects';
import { sqName } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { effectArea, previewFromEvents } from './previewEvents';
import { unitLimitReached } from './spawn';
import { cardLimitOf, cloneState, emit, getPiece, heroOf, makeCtx, ruleDelta, unitsOf } from './state';
import type { Ctx } from './state';
import { checkPicks, completes, countsFromHero, effectiveRangeMax, pickPlan, picksToTargets, rangeOrigin } from './targeting';
import type { PickEnv, PickPlan } from './targeting';
import { stepInfo } from './targetInfo';
import { fail, OK } from './validation';
import type {
  ActionOf,
  CardDef,
  CardInstance,
  CardModeOption,
  CardTargetChoice,
  CardTargetInfo,
  ContentRegistry,
  EffectOp,
  EffectPreview,
  GameState,
  ReasonCode,
  ReasonParams,
  TargetQuery,
  Validation,
} from './types';

// =============================================================================================
// Costs and limits
// =============================================================================================

export function cardInHand(s: GameState, seat: number, cardUid: string): CardInstance | null {
  return s.players[seat]?.hand.find((c) => c.uid === cardUid) ?? null;
}

/** Flame cost: −1 when tempered, −Candlemaker's Mold on the first Summon each turn, minimum 0. */
export function cardCost(s: GameState, reg: ContentRegistry, seat: number, card: CardInstance): number {
  const def = reg.cards.byId[card.id];
  if (!def) return 0;
  let cost = def.cost - (card.tempered ? 1 : 0);
  if (def.type === 'summon' && s.players[seat].turn.summonsThisTurn === 0) cost -= ruleDelta(s, 'first_summon_discount', seat);
  return Math.max(0, cost);
}

/** Which rule set the tightest card limit, for the reason string ("(Muffled Nave)"). */
function cardLimitSource(s: GameState, reg: ContentRegistry, seat: number, limit: number): string {
  const rule = s.activeRules.find((r) => r.rule === 'card_limit' && r.value === limit && (r.seat === null || r.seat === seat));
  if (!rule) return 'limit';
  if (rule.source.kind === 'toll') return reg.tolls.byId[rule.source.id]?.name ?? rule.source.id;
  return reg.bossIntents.byId[rule.source.id]?.name ?? rule.source.id;
}

/** Summons and Moonlit Hex need a free unit slot (§7.1, §7.3). */
function needsUnitSlot(def: CardDef): boolean {
  const effects = [...def.effects, ...(def.modes ?? []).flatMap((m) => m.effects)];
  return def.type === 'summon' || effects.some((op) => op.op === 'transform' && op.owner === 'player');
}

/** Cards that summon next to the hero or count from it cannot be played while it is Smoldering. */
function needsStandingHero(plan: PickPlan): boolean {
  return countsFromHero(plan) || plan.effects.some((op) => op.op === 'summon' && op.near?.anchor === 'hero');
}

// =============================================================================================
// Plans and validation
// =============================================================================================

/** The pick plan of a card (of one mode for "choose one" cards), or null for a missing mode. */
export function cardPlan(def: CardDef, mode: number | undefined, tempered = false): PickPlan | null {
  if (def.modes) {
    const chosen = mode === undefined ? undefined : def.modes[mode];
    return chosen ? pickPlan(chosen.target, chosen.then, chosen.effects) : null;
  }
  return pickPlan(def.target, def.then, tempered && def.temperedEffects ? def.temperedEffects : def.effects);
}

type Playability = { ok: true; def: CardDef; card: CardInstance; cost: number } | { ok: false; reason: ReasonCode; params?: ReasonParams };

/** Everything except the mode and the targets. */
function playability(s: GameState, reg: ContentRegistry, seat: number, cardUid: string): Playability {
  const turn = checkTurn(s, seat);
  if (!turn.ok) return turn;
  const card = cardInHand(s, seat, cardUid);
  const def = card ? reg.cards.byId[card.id] : undefined;
  if (!card || !def) return { ok: false, reason: 'NOT_IN_HAND' };
  const player = s.players[seat];
  const limit = cardLimitOf(s, seat);
  if (limit !== null && player.turn.cardsPlayed >= limit) return { ok: false, reason: 'CARD_LIMIT', params: { source: cardLimitSource(s, reg, seat, limit) } };
  const cost = cardCost(s, reg, seat, card);
  if (cost > player.flame) return { ok: false, reason: 'NEED_FLAME', params: { n: cost } };
  if (needsUnitSlot(def) && unitLimitReached(s, seat)) {
    return { ok: false, reason: 'UNIT_LIMIT', params: { n: unitsOf(s, seat).length, max: s.config.unit_limit } };
  }
  return { ok: true, def, card, cost };
}

function heroGate(s: GameState, seat: number, plan: PickPlan): Validation {
  const hero = heroOf(s, seat);
  return needsStandingHero(plan) && (!hero || hero.smoldering) ? fail('HERO_SMOLDERING') : OK;
}

function cardEnv(seat: number, plan: PickPlan): PickEnv {
  return { seat, kind: 'card', plan };
}

/** A mode's playability ("choose one" cards), targets not yet chosen. */
function modeStatus(s: GameState, reg: ContentRegistry, seat: number, def: CardDef, mode: number): Validation {
  const plan = cardPlan(def, mode);
  if (!plan) return fail('INVALID_ACTION');
  const gate = heroGate(s, seat, plan);
  return gate.ok ? completes(s, reg, cardEnv(seat, plan), []) : gate;
}

export function validatePlayCard(s: GameState, reg: ContentRegistry, a: ActionOf<'play_card'>): Validation {
  const play = playability(s, reg, a.seat, a.cardUid);
  if (!play.ok) return fail(play.reason, play.params);
  const plan = cardPlan(play.def, a.mode, play.card.tempered);
  if (!plan) return fail('INVALID_ACTION');
  const gate = heroGate(s, a.seat, plan);
  if (!gate.ok) return gate;
  return checkPicks(s, reg, cardEnv(a.seat, plan), a.targets);
}

// =============================================================================================
// Play
// =============================================================================================

function targetText(s: GameState, reg: ContentRegistry, choices: readonly CardTargetChoice[]): string {
  const first = choices[0];
  if (!first) return '';
  if (first.kind === 'piece') {
    const piece = getPiece(s, first.pieceId);
    return piece ? ` on ${pieceAtText(reg, piece)}` : '';
  }
  return first.kind === 'tile' ? ` at ${sqName(first.pos)}` : '';
}

function playEffects(def: CardDef, card: CardInstance, mode: number | undefined): readonly EffectOp[] {
  if (def.modes) return def.modes[mode ?? 0]?.effects ?? [];
  return card.tempered && def.temperedEffects ? def.temperedEffects : def.effects;
}

/** Pay, discard the card (a Charm attaches instead) and run its effects (validation already passed). */
export function applyPlayCard(ctx: Ctx, a: ActionOf<'play_card'>): void {
  const { s, reg } = ctx;
  const player = s.players[a.seat];
  const card = cardInHand(s, a.seat, a.cardUid);
  if (!card) return;
  const def = reg.cards.byId[card.id];
  const plan = cardPlan(def, a.mode, card.tempered);
  const cost = cardCost(s, reg, a.seat, card);
  const targets = plan ? picksToTargets(s, reg, cardEnv(a.seat, plan), a.targets) : [];
  player.flame -= cost;
  player.hand = player.hand.filter((c) => c.uid !== card.uid);
  if (def.type !== 'charm') player.discard.push(card);
  player.turn.cardsPlayed += 1;
  player.stats.cardsPlayed += 1;
  if (def.type === 'summon') player.turn.summonsThisTurn += 1;
  emit(ctx, { type: 'card_played', seat: a.seat, cardUid: card.uid, cardId: card.id, cost, targets: a.targets, ...(a.mode !== undefined ? { mode: a.mode } : {}) });
  const hero = heroOf(s, a.seat);
  addLog(ctx, `${hero ? pieceName(reg, hero) : player.name} plays ${def.name}${targetText(s, reg, a.targets)}.`, a.seat);
  runEffects(
    ctx,
    playEffects(def, card, a.mode),
    baseEnv({
      seat: a.seat,
      self: hero,
      targets,
      cause: 'card',
      damageKind: 'card',
      ruleSource: { kind: 'card', id: def.id },
      defaultDuration: 'turn',
      plumeSource: 'card',
      summonSource: 'card',
      card,
    }),
  );
  if (def.type === 'charm' && !Object.values(s.pieces).some((p) => p.charm?.uid === card.uid)) player.discard.push(card);
}

// =============================================================================================
// Previews (cardTargets)
// =============================================================================================

function simulate(s: GameState, reg: ContentRegistry, plan: PickPlan, a: ActionOf<'play_card'>): EffectPreview {
  const ctx = makeCtx(cloneState(s), reg);
  applyPlayCard(ctx, a);
  const preview = previewFromEvents(ctx.events, ctx.s);
  preview.area = effectArea(s, a.seat, plan.effects, picksToTargets(s, reg, cardEnv(a.seat, plan), a.targets));
  return preview;
}

function modeOptions(s: GameState, reg: ContentRegistry, seat: number, def: CardDef): CardModeOption[] {
  return (def.modes ?? []).map((mode, i) => {
    const status = modeStatus(s, reg, seat, def, i);
    return { label: mode.label, text: mode.text, playable: status.ok, ...(status.ok ? {} : { reason: status.reason, params: status.params }) };
  });
}

/**
 * Playability, valid choices and previews for one card in hand (§15.5 "Card selected").
 * Multi-step cards: pass the picks made so far (and the mode of a "choose one" card) in `query`;
 * the answer lists the options of the next pick.
 */
export function cardTargetInfo(s: GameState, reg: ContentRegistry, seat: number, cardUid: string, query: TargetQuery = {}): CardTargetInfo {
  const card = cardInHand(s, seat, cardUid);
  const def = card ? reg.cards.byId[card.id] : undefined;
  const cost = card ? cardCost(s, reg, seat, card) : 0;
  const base: CardTargetInfo = { playable: false, cost, modes: def?.modes?.map((m) => m.label) ?? null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null };
  if (!card || !def) return { ...base, reason: 'NOT_IN_HAND' };
  const plan = cardPlan(def, query.mode, card.tempered);
  const play = playability(s, reg, seat, cardUid);
  if (!play.ok) return { ...base, rangeRing: plan ? ringOf(s, seat, plan) : null, reason: play.reason, params: play.params };
  if (def.modes && query.mode === undefined) {
    const options = modeOptions(s, reg, seat, def);
    const first = options.find((o) => o.playable) ?? options[0];
    return { ...base, playable: options.some((o) => o.playable), modeOptions: options, ...(first && !first.playable ? { reason: first.reason, params: first.params } : {}) };
  }
  if (!plan) return { ...base, reason: 'INVALID_ACTION' };
  const gate = heroGate(s, seat, plan);
  if (!gate.ok) return { ...base, rangeRing: ringOf(s, seat, plan), reason: gate.reason, params: gate.params };
  const preview = (targets: CardTargetChoice[]) => simulate(s, reg, plan, { type: 'play_card', seat, cardUid, targets, ...(query.mode !== undefined ? { mode: query.mode } : {}) });
  return stepInfo(s, reg, cardEnv(seat, plan), query.chosen ?? [], preview, base);
}

/** The range ring of a plan's first pick when it counts from the hero. */
function ringOf(s: GameState, seat: number, plan: PickPlan): CardTargetInfo['rangeRing'] {
  const spec = plan.specs[0];
  if (!spec || spec.range.from !== 'hero') return null;
  const origin = rangeOrigin(s, seat, spec, []);
  const radius = effectiveRangeMax(s, seat, spec.range, 'card');
  return origin && radius !== null ? { centre: origin.pos, radius } : null;
}
