/**
 * Card play (GDD §7): Flame costs (tempered, Candlemaker's Mold), card limits, unit limits,
 * target enumeration from `TargetSpec`s and simulated previews. Effects run through the
 * interpreter in effects.ts.
 *
 * E1b plays single-target and board-wide cards whose ops all have handlers (every summon card,
 * Spark, Mend the Wick and most rites). Cards with `modes`, a `then` pick, `count` > 1 or an op
 * without a handler (Charms, swaps, teleports, `custom`) report NOT_ENABLED until E2 adds them.
 */
import { checkTurn } from './actions';
import { baseEnv, effectsSupported, pieceRank, runEffects } from './effects';
import type { EffectTarget } from './effects';
import { footprintDistance, hasClearLine, isOpenTile, patternMoves, samePos, sqName, traceLine, dirsFor } from './geometry';
import { addLog, pieceAtText, pieceName } from './log';
import { canReverse } from './snuff';
import { unitLimitReached } from './spawn';
import {
  boardQuery,
  cardLimitOf,
  cloneState,
  emit,
  getPiece,
  heroOf,
  isAllyOfSeat,
  isEnemyOfSeat,
  makeCtx,
  pieceAt,
  pieceList,
  plumeAt,
  ruleDelta,
  tileAt,
  unitsOf,
} from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type {
  ActionOf,
  CardDef,
  CardInstance,
  CardTargetChoice,
  CardTargetInfo,
  ContentRegistry,
  EffectPreview,
  GameEvent,
  GameState,
  Piece,
  Pos,
  ReasonCode,
  ReasonParams,
  TargetOption,
  TargetSpec,
  Validation,
} from './types';

// =============================================================================================
// Costs, limits and support
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

/** Whether E1b can play this card (see the module comment). */
export function cardSupported(def: CardDef): boolean {
  if (def.modes || def.then || def.target.count !== 1 || def.target.kind === 'direction') return false;
  if (def.target.range.from === 'piece' || def.target.range.from === 'previous') return false;
  return effectsSupported(def.effects) && (def.temperedEffects === null || effectsSupported(def.temperedEffects));
}

/** Which rule set the tightest card limit, for the reason string ("(Muffled Nave)"). */
function cardLimitSource(s: GameState, reg: ContentRegistry, seat: number, limit: number): string {
  const rule = s.activeRules.find((r) => r.rule === 'card_limit' && r.value === limit && (r.seat === null || r.seat === seat));
  if (!rule) return 'limit';
  if (rule.source.kind === 'toll') return reg.tolls.byId[rule.source.id]?.name ?? rule.source.id;
  return reg.bossIntents.byId[rule.source.id]?.name ?? rule.source.id;
}

/** Range from the hero: +Lamplighter's Hook, −Soot Fog (minimum 1). */
function effectiveMax(s: GameState, seat: number, spec: TargetSpec): number | null {
  if (spec.range.max === null) return null;
  const hook = spec.range.from === 'hero' ? ruleDelta(s, 'card_range_from_hero', seat) : 0;
  return Math.max(1, spec.range.max + hook + ruleDelta(s, 'wickfolk_range', seat));
}

// =============================================================================================
// Targets
// =============================================================================================

interface Candidate {
  choice: CardTargetChoice;
  target: EffectTarget;
}

function sideMatches(s: GameState, seat: number, spec: TargetSpec, p: Piece): boolean {
  if (p.kind === 'candle' && !spec.includeCandles && !(spec.kinds?.includes('candle') ?? false)) return false;
  switch (spec.side) {
    case 'enemy':
      return isEnemyOfSeat(s, seat, p);
    case 'ally':
      return isAllyOfSeat(s, seat, p, spec.includeCandles);
    case 'own':
      return p.owner === seat;
    case 'any':
      return true;
  }
}

function pieceMatches(s: GameState, reg: ContentRegistry, seat: number, spec: TargetSpec, p: Piece): boolean {
  if (!sideMatches(s, seat, spec, p)) return false;
  if (spec.self === 'hero' && p.id !== s.players[seat].heroPieceId) return false;
  if (spec.kinds && !spec.kinds.includes(p.kind)) return false;
  if (spec.units && !spec.units.includes(p.defId)) return false;
  if (spec.ranks && !spec.ranks.includes(pieceRank(reg, p))) return false;
  if (spec.smoldering !== p.smoldering) return false;
  if (spec.singleTile && p.size !== 1) return false;
  if (spec.hasIntent && !s.intents.some((i) => i.attackerId === p.id)) return false;
  if (spec.notStructure && (p.structure || p.kind === 'candle')) return false;
  return true;
}

/** Pieces / Plume tiles that are the first thing on a straight line from the origin ("in a straight line"). */
function lineFirsts(s: GameState, origin: Piece, spec: TargetSpec, max: number | null): { pieces: Set<string>; plumes: Pos[] } {
  const pieces = new Set<string>();
  const plumes: Pos[] = [];
  if (!spec.line) return { pieces, plumes };
  const q = boardQuery(s);
  for (const dir of dirsFor(spec.line.dirs)) {
    const trace = traceLine(q, origin.pos, dir, max, 'firstHit', { ignoreIds: [origin.id] });
    if (trace.hits[0]) pieces.add(trace.hits[0].pieceId);
    plumes.push(...trace.plumes);
  }
  return { pieces, plumes };
}

function inRange(origin: Piece | null, spec: TargetSpec, max: number | null, pos: Pos, size: number): boolean {
  if (!origin) return true;
  const d = footprintDistance(origin.pos, origin.size, pos, size);
  return d >= spec.range.min && (max === null || d <= max);
}

/** Every valid choice for one TargetSpec (§7.1, A.2). */
export function specCandidates(s: GameState, reg: ContentRegistry, seat: number, spec: TargetSpec): Candidate[] {
  const hero = heroOf(s, seat);
  const origin = spec.range.from === 'hero' ? hero : null;
  const max = effectiveMax(s, seat, spec);
  const out: Candidate[] = [];
  if (spec.kind === 'piece') {
    const line = origin ? lineFirsts(s, origin, spec, max) : { pieces: new Set<string>(), plumes: [] };
    const q = boardQuery(s);
    for (const p of pieceList(s)) {
      if (!pieceMatches(s, reg, seat, spec, p) || !inRange(origin, spec, max, p.pos, p.size)) continue;
      if (spec.line && !line.pieces.has(p.id)) continue;
      if (spec.los && origin && !hasClearLine(q, origin.pos, p.pos)) continue;
      out.push({ choice: { kind: 'piece', pieceId: p.id }, target: { pieceId: p.id, pos: p.pos } });
    }
    if (spec.allowPlume) {
      const plumes = spec.line ? line.plumes : s.plumes.map((m) => m.pos).filter((p) => !pieceAt(s, p) && inRange(origin, spec, max, p, 1));
      for (const p of plumes) out.push({ choice: { kind: 'tile', pos: p }, target: { pieceId: null, pos: p } });
    }
    return out;
  }
  if (spec.kind === 'tile') {
    const q = boardQuery(s);
    const reachable = spec.pattern && origin ? patternMoves(q, origin.pos, spec.pattern).map((d) => d.to) : null;
    for (let y = s.board.h - 1; y >= 0; y--) {
      for (let x = 0; x < s.board.w; x++) {
        const p = { x, y };
        if (!tileAt(s, p) || !inRange(origin, spec, max, p, 1)) continue;
        if (spec.empty && !isOpenTile(q, p)) continue;
        if (spec.noPlume && plumeAt(s, p)) continue;
        if (reachable && !reachable.some((r) => samePos(r, p))) continue;
        if (spec.adjacentTo && !adjacentToSide(s, seat, spec, p)) continue;
        out.push({ choice: { kind: 'tile', pos: p }, target: { pieceId: pieceAt(s, p)?.id ?? null, pos: p } });
      }
    }
  }
  return out;
}

function adjacentToSide(s: GameState, seat: number, spec: TargetSpec, p: Pos): boolean {
  const near = spec.adjacentTo;
  if (!near) return true;
  const hero = heroOf(s, seat);
  return pieceList(s).some((other) => {
    if (footprintDistance(other.pos, other.size, p, 1) !== 1) return false;
    if (near.side === 'enemy' && !isEnemyOfSeat(s, seat, other)) return false;
    if (near.side === 'ally' && !isAllyOfSeat(s, seat, other)) return false;
    if (near.side === 'own' && other.owner !== seat) return false;
    if (near.range.max === null || !hero) return true;
    return footprintDistance(hero.pos, hero.size, other.pos, other.size) <= near.range.max;
  });
}

function sameChoice(a: CardTargetChoice, b: CardTargetChoice): boolean {
  if (a.kind === 'piece') return b.kind === 'piece' && a.pieceId === b.pieceId;
  if (a.kind === 'tile') return b.kind === 'tile' && samePos(a.pos, b.pos);
  return b.kind === 'direction' && samePos(a.dir, b.dir);
}

// =============================================================================================
// Validation
// =============================================================================================

type Playability = { ok: true; def: CardDef; cost: number } | { ok: false; reason: ReasonCode; params?: ReasonParams };

/** Everything except the target choice. */
function playability(s: GameState, reg: ContentRegistry, seat: number, cardUid: string): Playability {
  const turn = checkTurn(s, seat);
  if (!turn.ok) return turn;
  const card = cardInHand(s, seat, cardUid);
  if (!card) return { ok: false, reason: 'NOT_IN_HAND' };
  const def = reg.cards.byId[card.id];
  if (!def) return { ok: false, reason: 'NOT_IN_HAND' };
  if (!cardSupported(def)) return { ok: false, reason: 'NOT_ENABLED', params: { feature: def.name } };
  const player = s.players[seat];
  const limit = cardLimitOf(s, seat);
  if (limit !== null && player.turn.cardsPlayed >= limit) return { ok: false, reason: 'CARD_LIMIT', params: { source: cardLimitSource(s, reg, seat, limit) } };
  const cost = cardCost(s, reg, seat, card);
  if (cost > player.flame) return { ok: false, reason: 'NEED_FLAME', params: { n: cost } };
  if (needsUnitSlot(def) && unitLimitReached(s, seat)) {
    return { ok: false, reason: 'UNIT_LIMIT', params: { n: unitsOf(s, seat).length, max: s.config.unit_limit } };
  }
  if (def.target.range.from === 'hero' && def.target.range.max !== null && heroOf(s, seat)?.smoldering) return { ok: false, reason: 'HERO_SMOLDERING' };
  return { ok: true, def, cost };
}

/** Summons and Moonlit Hex need a free unit slot (§7.1, §7.3). */
function needsUnitSlot(def: CardDef): boolean {
  return def.type === 'summon' || def.effects.some((op) => op.op === 'transform' && op.owner === 'player');
}

function noTargetReason(s: GameState, seat: number, def: CardDef): Validation {
  if (def.target.kind === 'tile') return fail('NO_TILE', { r: effectiveMax(s, seat, def.target) ?? 0 });
  return fail('NO_TARGET');
}

/**
 * Valid choices for a card: its TargetSpec, narrowed by what its effects need (Turnabout: an
 * intent that can be reversed). `empty` is the reason to show when there are none.
 */
function cardCandidates(s: GameState, reg: ContentRegistry, seat: number, def: CardDef): { list: Candidate[]; empty: Validation } {
  const base = specCandidates(s, reg, seat, def.target);
  if (!def.effects.some((op) => op.op === 'reverse_intent')) return { list: base, empty: noTargetReason(s, seat, def) };
  const list = base.filter((c) => {
    const piece = c.target.pieceId ? s.pieces[c.target.pieceId] : undefined;
    return piece !== undefined && canReverse(s, piece);
  });
  return { list, empty: base.length > 0 ? fail('NO_DIRECTION') : noTargetReason(s, seat, def) };
}

export function validatePlayCard(s: GameState, reg: ContentRegistry, a: ActionOf<'play_card'>): Validation {
  const play = playability(s, reg, a.seat, a.cardUid);
  if (!play.ok) return fail(play.reason, play.params);
  const spec = play.def.target;
  if (spec.kind === 'board') return a.targets.length === 0 ? OK : fail('INVALID_TARGET');
  const candidates = cardCandidates(s, reg, a.seat, play.def);
  if (candidates.list.length === 0) return candidates.empty;
  if (a.targets.length !== 1) return fail('INVALID_TARGET');
  return candidates.list.some((c) => sameChoice(c.choice, a.targets[0])) ? OK : fail('INVALID_TARGET');
}

// =============================================================================================
// Play
// =============================================================================================

function resolveTargets(s: GameState, choices: readonly CardTargetChoice[]): EffectTarget[] {
  return choices.map((c) => {
    if (c.kind === 'piece') {
      const p = getPiece(s, c.pieceId);
      return { pieceId: c.pieceId, pos: p ? { ...p.pos } : { x: -1, y: -1 } };
    }
    if (c.kind === 'tile') return { pieceId: pieceAt(s, c.pos)?.id ?? null, pos: { ...c.pos } };
    return { pieceId: null, pos: { ...c.dir } };
  });
}

function targetText(s: GameState, reg: ContentRegistry, targets: readonly EffectTarget[]): string {
  const t = targets[0];
  if (!t) return '';
  const piece = t.pieceId ? getPiece(s, t.pieceId) : null;
  return piece ? ` on ${pieceAtText(reg, piece)}` : ` at ${sqName(t.pos)}`;
}

/** Pay, move the card to the discard pile and run its effects (validation already passed). */
export function applyPlayCard(ctx: Ctx, a: ActionOf<'play_card'>): void {
  const { s, reg } = ctx;
  const player = s.players[a.seat];
  const card = cardInHand(s, a.seat, a.cardUid);
  if (!card) return;
  const def = reg.cards.byId[card.id];
  const cost = cardCost(s, reg, a.seat, card);
  const targets = resolveTargets(s, a.targets);
  player.flame -= cost;
  player.hand = player.hand.filter((c) => c.uid !== card.uid);
  player.discard.push(card);
  player.turn.cardsPlayed += 1;
  player.stats.cardsPlayed += 1;
  if (def.type === 'summon') player.turn.summonsThisTurn += 1;
  emit(ctx, { type: 'card_played', seat: a.seat, cardUid: card.uid, cardId: card.id, cost, targets: a.targets });
  const hero = heroOf(s, a.seat);
  addLog(ctx, `${hero ? pieceName(reg, hero) : player.name} plays ${def.name}${targetText(s, reg, targets)}.`, a.seat);
  const effects = card.tempered && def.temperedEffects ? def.temperedEffects : def.effects;
  runEffects(
    ctx,
    effects,
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
    }),
  );
}

// =============================================================================================
// Previews (cardTargets)
// =============================================================================================

function emptyPreview(): EffectPreview {
  return { damage: [], heal: [], plumesPopped: [], summon: null, swap: null, push: [], area: [], reversedIntentTiles: null };
}

/** Turn the events of a simulated play into the preview shown on a target. */
export function previewFromEvents(events: readonly GameEvent[]): EffectPreview {
  const preview = emptyPreview();
  for (const e of events) {
    if (e.type === 'damage') preview.damage.push({ pieceId: e.pieceId, amount: e.amount, lethal: e.lethal, blockedByWard: e.blockedByWard });
    else if (e.type === 'heal') preview.heal.push({ pieceId: e.pieceId, amount: e.amount });
    else if (e.type === 'plume_popped') preview.plumesPopped.push(e.pos);
    else if (e.type === 'summoned' && e.side === 'wick') preview.summon = { defId: e.defId, pos: e.pos };
    else if (e.type === 'intent_reversed') preview.reversedIntentTiles = e.tiles;
    else if (e.type === 'piece_moved' && (e.kind === 'push' || e.kind === 'pull')) {
      preview.push.push({ pieceId: e.pieceId, path: e.path ?? [], bump: e.bump ?? null, endsOnHotWax: false });
    }
  }
  return preview;
}

function simulate(s: GameState, a: ActionOf<'play_card'>): EffectPreview {
  const ctx = makeCtx(cloneState(s));
  applyPlayCard(ctx, a);
  return previewFromEvents(ctx.events);
}

/** Playability, valid targets and previews for one card in hand (§15.5 "Card selected"). */
export function cardTargetInfo(s: GameState, reg: ContentRegistry, seat: number, cardUid: string): CardTargetInfo {
  const card = cardInHand(s, seat, cardUid);
  const def = card ? reg.cards.byId[card.id] : undefined;
  const cost = card ? cardCost(s, reg, seat, card) : 0;
  const base: CardTargetInfo = { playable: false, cost, modes: def?.modes?.map((m) => m.label) ?? null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null };
  if (!card || !def) return { ...base, reason: 'NOT_IN_HAND' };
  const hero = heroOf(s, seat);
  const max = effectiveMax(s, seat, def.target);
  const rangeRing = def.target.range.from === 'hero' && hero && max !== null ? { centre: hero.pos, radius: max } : null;
  const play = playability(s, reg, seat, cardUid);
  if (!play.ok) return { ...base, rangeRing, reason: play.reason, params: play.params };
  if (def.target.kind === 'board') {
    return { ...base, playable: true, steps: 0, rangeRing, preview: simulate(s, { type: 'play_card', seat, cardUid, targets: [] }) };
  }
  const candidates = cardCandidates(s, reg, seat, def);
  if (candidates.list.length === 0) {
    const v = candidates.empty;
    return { ...base, rangeRing, ...(v.ok ? {} : { reason: v.reason, params: v.params }) };
  }
  const targets: TargetOption[] = candidates.list.map((c) => ({
    choice: c.choice,
    pos: c.target.pos,
    preview: simulate(s, { type: 'play_card', seat, cardUid, targets: [c.choice] }),
  }));
  return { ...base, playable: true, rangeRing, targets };
}
