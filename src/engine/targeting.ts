/**
 * Target choice for cards, Hero Powers and the Bell of Saint Tallow (GDD §7.1, A.2 "Targets").
 *
 * - `rawCandidates`: every choice one `TargetSpec` allows (side, kinds, range, line, tile rules).
 * - Range adjustments: Lamplighter's Hook (+1, cards counting from the hero) and Soot Fog
 *   (−1, cards and Powers), minimum 1.
 * - Pick plans: a play is a sequence of picks (`count` copies of the target spec, then the
 *   optional `then` spec). Pick i fills `target` (i = 0) or `target2` (i = 1).
 * - `pickOptions` narrows the raw choices by the Truce, the spec's ranks and what the effects
 *   need (a reversible intent, a piece that can be displaced, a summon tile) and names the
 *   reason to show when nothing is left (TRUCE, RANK_RESTRICTED, NO_DIRECTION, IMMUNE, ...).
 * - `completes` / `checkPicks` make sure a whole play can be (or was) completed.
 */
import { isDisplacementImmune } from './combat';
import type { DisplaceKind } from './combat';
import { pieceRank } from './effects';
import type { EffectTarget } from './effects';
import {
  dirsFor,
  footprintDistance,
  hasClearLine,
  isOpenTile,
  patternMoves,
  samePos,
  traceLine,
} from './geometry';
import { isTruceActive } from './modes/lastFlame';
import { canReverse } from './snuff';
import { summonTileTest } from './spawn';
import {
  boardQuery,
  getPiece,
  heroOf,
  isAllyOfSeat,
  isEnemyOfSeat,
  isRivalOf,
  pieceAt,
  pieceList,
  plumeAt,
  ruleDelta,
  ruleValue,
  tileAt,
} from './state';
import { fail, OK } from './validation';
import type {
  CardTargetChoice,
  ContentRegistry,
  EffectOp,
  EffectSubject,
  GameState,
  Pattern,
  Piece,
  Pos,
  TargetRange,
  TargetSpec,
  Validation,
} from './types';

/** Which range rules apply: cards (Hook and Fog), Powers (Fog), free actions (neither). */
export type RangeKind = 'card' | 'power' | 'free';

export interface Pick {
  choice: CardTargetChoice;
  target: EffectTarget;
}

export interface PickPlan {
  specs: TargetSpec[];
  /** Picks 0 .. required-1 must be made; later ones are optional (skipped only when none is valid). */
  required: number;
  effects: readonly EffectOp[];
}

export interface PickEnv {
  seat: number;
  kind: RangeKind;
  plan: PickPlan;
}

export function pickPlan(target: TargetSpec, then: TargetSpec | null, effects: readonly EffectOp[]): PickPlan {
  if (target.kind === 'board') return { specs: [], required: 0, effects };
  const specs: TargetSpec[] = Array.from({ length: target.count }, () => target);
  if (then) specs.push(then);
  let required = specs.length;
  while (required > 0 && specs[required - 1].optional) required -= 1;
  return { specs, required, effects };
}

// =============================================================================================
// Ranges
// =============================================================================================

function rangeDelta(s: GameState, seat: number, range: TargetRange, kind: RangeKind): number {
  let delta = 0;
  if (kind === 'card' && range.from === 'hero') delta += ruleDelta(s, 'card_range_from_hero', seat);
  if (kind !== 'free') delta += ruleDelta(s, 'wickfolk_range', seat);
  return delta;
}

/** A range's maximum after the Hook and Soot Fog (minimum 1; null = unlimited). */
export function effectiveRangeMax(s: GameState, seat: number, range: TargetRange, kind: RangeKind): number | null {
  if (range.max === null) return null;
  if (range.max === 0) return 0;
  return Math.max(1, range.max + rangeDelta(s, seat, range, kind));
}

export interface Origin {
  pos: Pos;
  size: number;
}

/** Where a spec's range is measured from: the hero, the previous pick, or nowhere (board). */
export function rangeOrigin(s: GameState, seat: number, spec: TargetSpec, chosen: readonly Pick[]): Origin | null {
  switch (spec.range.from) {
    case 'hero': {
      const hero = heroOf(s, seat);
      return hero ? { pos: hero.pos, size: hero.size } : null;
    }
    case 'previous':
    case 'piece': {
      const last = chosen.at(-1);
      if (!last) {
        const hero = heroOf(s, seat);
        return hero ? { pos: hero.pos, size: hero.size } : null;
      }
      const piece = getPiece(s, last.target.pieceId);
      return piece && last.choice.kind === 'piece' ? { pos: piece.pos, size: piece.size } : { pos: last.target.pos, size: 1 };
    }
    case 'any_own':
    case 'board':
      return null;
  }
}

function withinRange(s: GameState, seat: number, spec: TargetSpec, origin: Origin | null, max: number | null, pos: Pos, size: number): boolean {
  if (spec.range.from === 'any_own') {
    return pieceList(s).some((own) => own.owner === seat && distanceOk(footprintDistance(own.pos, own.size, pos, size), spec.range.min, max));
  }
  if (!origin) return spec.range.from === 'board';
  return distanceOk(footprintDistance(origin.pos, origin.size, pos, size), spec.range.min, max);
}

function distanceOk(d: number, min: number, max: number | null): boolean {
  return d >= min && (max === null || d <= max);
}

// =============================================================================================
// Raw candidates
// =============================================================================================

function sideMatches(s: GameState, seat: number, side: TargetSpec['side'], p: Piece, includeCandles: boolean): boolean {
  switch (side) {
    case 'enemy':
      return isEnemyOfSeat(s, seat, p);
    case 'ally':
      return isAllyOfSeat(s, seat, p, includeCandles);
    case 'own':
      return p.owner === seat;
    case 'any':
      return true;
  }
}

/** Piece rules of a spec, except `ranks` (checked separately for RANK_RESTRICTED). */
function pieceMatches(s: GameState, seat: number, spec: TargetSpec, p: Piece): boolean {
  const wantsCandles = spec.includeCandles || (spec.kinds?.includes('candle') ?? false);
  if (p.kind === 'candle' && !wantsCandles) return false;
  if (!sideMatches(s, seat, spec.side, p, wantsCandles)) return false;
  if (spec.self === 'hero' && p.id !== s.players[seat]?.heroPieceId) return false;
  if (spec.kinds && !spec.kinds.includes(p.kind)) return false;
  if (spec.units && !spec.units.includes(p.defId)) return false;
  if (spec.smoldering !== p.smoldering) return false;
  if (spec.singleTile && p.size !== 1) return false;
  if (spec.hasIntent && !s.intents.some((i) => i.attackerId === p.id)) return false;
  if (spec.notStructure && (p.structure || p.kind === 'candle')) return false;
  return true;
}

/** Pieces and Plume tiles that are first on a straight line from the origin ("in a straight line"). */
function lineFirsts(s: GameState, origin: Origin, spec: TargetSpec, max: number | null): { pieces: Set<string>; plumes: Pos[] } {
  const pieces = new Set<string>();
  const plumes: Pos[] = [];
  if (!spec.line) return { pieces, plumes };
  const q = boardQuery(s);
  const self = pieceAt(s, origin.pos);
  for (const dir of dirsFor(spec.line.dirs)) {
    const trace = traceLine(q, origin.pos, dir, max, spec.line.firstHit ? 'firstHit' : 'pierce', { ignoreIds: self ? [self.id] : [] });
    for (const hit of spec.line.firstHit ? trace.hits.slice(0, 1) : trace.hits) pieces.add(hit.pieceId);
    plumes.push(...trace.plumes);
  }
  return { pieces, plumes };
}

function piecePick(p: Piece): Pick {
  return { choice: { kind: 'piece', pieceId: p.id }, target: { pieceId: p.id, pos: { ...p.pos } } };
}

function tilePick(s: GameState, p: Pos): Pick {
  return { choice: { kind: 'tile', pos: { ...p } }, target: { pieceId: pieceAt(s, p)?.id ?? null, pos: { ...p } } };
}

function pieceCandidates(s: GameState, seat: number, spec: TargetSpec, origin: Origin | null, max: number | null): Pick[] {
  const line = origin ? lineFirsts(s, origin, spec, max) : { pieces: new Set<string>(), plumes: [] };
  const q = boardQuery(s);
  const out: Pick[] = [];
  for (const p of pieceList(s)) {
    if (!pieceMatches(s, seat, spec, p) || !withinRange(s, seat, spec, origin, max, p.pos, p.size)) continue;
    if (spec.line && !line.pieces.has(p.id)) continue;
    if (spec.los && origin && !hasClearLine(q, origin.pos, p.pos)) continue;
    out.push(piecePick(p));
  }
  if (spec.allowPlume) {
    const plumes = spec.line ? line.plumes : s.plumes.map((m) => m.pos).filter((p) => !pieceAt(s, p) && withinRange(s, seat, spec, origin, max, p, 1));
    for (const p of plumes) out.push(tilePick(s, p));
  }
  return out;
}

/** A tile spec's movement pattern from the hero, stretched by the range rules (Sunshield Charge). */
function adjustedPattern(s: GameState, seat: number, spec: TargetSpec, pattern: Pattern, max: number | null): Pattern {
  const flying = pattern.flying || (spec.range.from === 'hero' && ruleValue(s, 'hero_flying', seat) === true);
  const range = pattern.range !== null && spec.range.max !== null && max !== null ? Math.max(1, pattern.range + (max - spec.range.max)) : pattern.range;
  return { ...pattern, range, flying };
}

function adjacentToSide(s: GameState, seat: number, spec: TargetSpec, kind: RangeKind, p: Pos): boolean {
  const near = spec.adjacentTo;
  if (!near) return true;
  const hero = heroOf(s, seat);
  const max = effectiveRangeMax(s, seat, near.range, kind);
  return pieceList(s).some((other) => {
    if (other.smoldering || footprintDistance(other.pos, other.size, p, 1) !== 1) return false;
    if (!sideMatches(s, seat, near.side, other, false) || other.kind === 'candle') return false;
    if (max === null || !hero || near.range.from !== 'hero') return true;
    return footprintDistance(hero.pos, hero.size, other.pos, other.size) <= max;
  });
}

function tileCandidates(s: GameState, seat: number, spec: TargetSpec, kind: RangeKind, origin: Origin | null, max: number | null): Pick[] {
  const q = boardQuery(s);
  const reachable = spec.pattern && origin ? patternMoves(q, origin.pos, adjustedPattern(s, seat, spec, spec.pattern, max)).map((d) => d.to) : null;
  const out: Pick[] = [];
  for (let y = s.board.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.board.w; x++) {
      const p = { x, y };
      if (!tileAt(s, p) || !withinRange(s, seat, spec, origin, max, p, 1)) continue;
      if (spec.empty && !isOpenTile(q, p)) continue;
      if (spec.noPlume && plumeAt(s, p)) continue;
      if (reachable && !reachable.some((r) => samePos(r, p))) continue;
      if (spec.adjacentTo && !adjacentToSide(s, seat, spec, kind, p)) continue;
      out.push(tilePick(s, p));
    }
  }
  return out;
}

export function sameChoice(a: CardTargetChoice, b: CardTargetChoice): boolean {
  if (a.kind === 'piece') return b.kind === 'piece' && a.pieceId === b.pieceId;
  if (a.kind === 'tile') return b.kind === 'tile' && samePos(a.pos, b.pos);
  return b.kind === 'direction' && samePos(a.dir, b.dir);
}

function directionCandidates(): Pick[] {
  return dirsFor('all').map((dir) => ({ choice: { kind: 'direction', dir: { ...dir } }, target: { pieceId: null, pos: { ...dir } } }));
}

/** Every choice a spec allows before the Truce, ranks and effect needs narrow it. Earlier picks are excluded. */
export function rawCandidates(s: GameState, seat: number, spec: TargetSpec, kind: RangeKind, chosen: readonly Pick[]): Pick[] {
  const origin = rangeOrigin(s, seat, spec, chosen);
  const max = effectiveRangeMax(s, seat, spec.range, kind);
  let list: Pick[];
  if (spec.kind === 'piece') list = pieceCandidates(s, seat, spec, origin, max);
  else if (spec.kind === 'tile') list = tileCandidates(s, seat, spec, kind, origin, max);
  else if (spec.kind === 'direction') list = directionCandidates();
  else list = [];
  return list.filter((c) => !chosen.some((prev) => sameChoice(prev.choice, c.choice)));
}

// =============================================================================================
// What the effects need from a pick
// =============================================================================================

interface PickNeeds {
  /** Turnabout: the piece has an intent that can be reversed. */
  reversible: boolean;
  /** Every effect on the pick moves it: it must not be immune to that kind of displacement. */
  displace: DisplaceKind | null;
  /** A summon lands on the tile: empty, Plume-free and outside the Gloam. */
  summonTile: boolean;
}

function pickIndexOf(subject: EffectSubject | undefined): number | null {
  const to = subject ?? 'target';
  if (to === 'target') return 0;
  if (to === 'target2') return 1;
  return null;
}

/** The picks an op acts on (by index), and how it moves them. */
function opPicks(op: EffectOp): Array<{ index: number; displace: DisplaceKind | null }> {
  switch (op.op) {
    case 'swap': {
      const out: Array<{ index: number; displace: DisplaceKind | null }> = [];
      for (const subject of [op.a, op.b]) {
        const index = pickIndexOf(subject);
        if (index !== null) out.push({ index, displace: op.ignoreImmunity ? null : 'swap' });
      }
      return out;
    }
    case 'push':
    case 'pull': {
      const index = pickIndexOf(op.to);
      return index === null ? [] : [{ index, displace: op.op }];
    }
    case 'teleport':
    case 'modify_rule':
    case 'gain_flame':
    case 'draw':
    case 'add_dread':
    case 'add_glory':
      return [];
    default: {
      const index = pickIndexOf(op.to);
      return index === null || op.to === 'area' || op.to === 'all' ? [] : [{ index, displace: null }];
    }
  }
}

function pickNeeds(plan: PickPlan, index: number): PickNeeds {
  const uses = plan.effects.flatMap((op) => opPicks(op).filter((u) => u.index === index).map((u) => ({ op, displace: u.displace })));
  const displacing = uses.length > 0 && uses.every((u) => u.displace !== null);
  return {
    reversible: uses.some((u) => u.op.op === 'reverse_intent'),
    displace: displacing ? uses[0].displace : null,
    summonTile: index === 0 && plan.effects.some((op) => op.op === 'summon' && !op.near),
  };
}

function meetsNeeds(s: GameState, reg: ContentRegistry, pick: Pick, needs: PickNeeds): boolean {
  const piece = getPiece(s, pick.target.pieceId);
  if (needs.reversible && (!piece || !canReverse(s, piece))) return false;
  if (needs.displace && pick.choice.kind === 'piece' && (!piece || isDisplacementImmune(reg, piece, needs.displace))) return false;
  if (needs.summonTile && !summonTileTest(s)(pick.target.pos)) return false;
  return true;
}

function needsReason(needs: PickNeeds): Validation {
  if (needs.reversible) return fail('NO_DIRECTION');
  if (needs.displace) return fail('IMMUNE');
  return fail('PLUME_TILE');
}

// =============================================================================================
// Options and completion
// =============================================================================================

export interface PickOptions {
  list: Pick[];
  /** Why `list` is empty (meaningful only then). */
  empty: Validation;
}

function noChoiceReason(s: GameState, seat: number, spec: TargetSpec, kind: RangeKind): Validation {
  const range = spec.adjacentTo && spec.range.max === null ? spec.adjacentTo.range : spec.range;
  if (spec.kind === 'tile') return fail('NO_TILE', { r: effectiveRangeMax(s, seat, range, kind) ?? 0 });
  return fail('NO_TARGET');
}

/** Valid choices for pick `index` after the picks in `chosen`. */
export function pickOptions(s: GameState, reg: ContentRegistry, env: PickEnv, index: number, chosen: readonly Pick[]): PickOptions {
  const spec = env.plan.specs[index];
  if (!spec) return { list: [], empty: fail('INVALID_TARGET') };
  const raw = rawCandidates(s, env.seat, spec, env.kind, chosen);
  const truce = isTruceActive(s);
  const afterTruce = truce ? raw.filter((c) => !isRivalPick(s, env.seat, c)) : raw;
  const ranks = spec.ranks;
  const afterRanks = ranks
    ? afterTruce.filter((c) => {
        const piece = getPiece(s, c.target.pieceId);
        return c.choice.kind !== 'piece' || (piece !== null && ranks.includes(pieceRank(reg, piece)));
      })
    : afterTruce;
  const needs = pickNeeds(env.plan, index);
  const list = afterRanks.filter((c) => meetsNeeds(s, reg, c, needs));
  let empty: Validation = OK;
  if (raw.length === 0) empty = noChoiceReason(s, env.seat, spec, env.kind);
  else if (afterTruce.length === 0) empty = fail('TRUCE');
  else if (afterRanks.length === 0) empty = fail('RANK_RESTRICTED');
  else if (list.length === 0) empty = needsReason(needs);
  return { list, empty };
}

function isRivalPick(s: GameState, seat: number, pick: Pick): boolean {
  const piece = getPiece(s, pick.target.pieceId);
  return pick.choice.kind === 'piece' && piece !== null && isRivalOf(s, seat, piece);
}

/** OK when the required picks after `chosen` can all be made; otherwise the first blocking reason. */
export function completes(s: GameState, reg: ContentRegistry, env: PickEnv, chosen: readonly Pick[]): Validation {
  const index = chosen.length;
  if (index >= env.plan.required) return OK;
  const options = pickOptions(s, reg, env, index, chosen);
  if (options.list.length === 0) return options.empty;
  let reason = options.empty;
  for (const option of options.list) {
    const next = completes(s, reg, env, [...chosen, option]);
    if (next.ok) return OK;
    reason = next;
  }
  return reason;
}

/** Options for the next pick that still allow the play to be completed. */
export function stepOptions(s: GameState, reg: ContentRegistry, env: PickEnv, chosen: readonly Pick[]): PickOptions {
  const index = chosen.length;
  const options = pickOptions(s, reg, env, index, chosen);
  if (index + 1 >= env.plan.required) return options;
  const list = options.list.filter((o) => completes(s, reg, env, [...chosen, o]).ok);
  if (list.length > 0 || options.list.length === 0) return { list, empty: options.empty };
  return { list, empty: completes(s, reg, env, [...chosen, options.list[0]]) };
}

/**
 * Match a sent choice against the options. A tile choice on a piece option's tile is accepted
 * (the UI may send the clicked tile).
 */
function matchChoice(options: readonly Pick[], choice: CardTargetChoice): Pick | null {
  const exact = options.find((o) => sameChoice(o.choice, choice));
  if (exact) return exact;
  if (choice.kind !== 'tile') return null;
  return options.find((o) => o.choice.kind === 'piece' && samePos(o.target.pos, choice.pos)) ?? null;
}

export type PicksResult = { ok: true; picks: Pick[] } | { ok: false; validation: Validation };

/** Validate a prefix of picks (each must be one of its step's options). */
export function matchPicks(s: GameState, reg: ContentRegistry, env: PickEnv, choices: readonly CardTargetChoice[]): PicksResult {
  if (choices.length > env.plan.specs.length) return { ok: false, validation: fail('INVALID_TARGET') };
  const picks: Pick[] = [];
  for (const choice of choices) {
    const options = pickOptions(s, reg, env, picks.length, picks);
    if (options.list.length === 0) return { ok: false, validation: options.empty };
    const match = matchChoice(options.list, choice);
    if (!match) return { ok: false, validation: fail('INVALID_TARGET') };
    picks.push(match);
  }
  return { ok: true, picks };
}

/**
 * A complete, legal set of picks: every required pick made with a valid choice; an optional pick
 * may be left out only when it has no valid choice.
 */
export function checkPicks(s: GameState, reg: ContentRegistry, env: PickEnv, choices: readonly CardTargetChoice[]): Validation {
  const matched = matchPicks(s, reg, env, choices);
  if (!matched.ok) return matched.validation;
  const picks = matched.picks;
  for (let i = picks.length; i < env.plan.specs.length; i++) {
    const options = pickOptions(s, reg, env, i, picks);
    if (i < env.plan.required) return options.list.length === 0 ? options.empty : fail('INVALID_TARGET');
    if (options.list.length > 0) return fail('INVALID_TARGET');
  }
  return OK;
}

/** Normalised effect targets of validated choices (a tile choice on a piece becomes that piece). */
export function picksToTargets(s: GameState, reg: ContentRegistry, env: PickEnv, choices: readonly CardTargetChoice[]): EffectTarget[] {
  const matched = matchPicks(s, reg, env, choices);
  if (matched.ok) return matched.picks.map((p) => ({ ...p.target, pos: { ...p.target.pos } }));
  return choices.map((c) => {
    if (c.kind === 'piece') {
      const p = getPiece(s, c.pieceId);
      return { pieceId: c.pieceId, pos: p ? { ...p.pos } : { x: -1, y: -1 } };
    }
    if (c.kind === 'tile') return { pieceId: pieceAt(s, c.pos)?.id ?? null, pos: { ...c.pos } };
    return { pieceId: null, pos: { ...c.dir } };
  });
}

/** Does any pick of the plan count from the hero (so a Smoldering hero blocks the play)? */
export function countsFromHero(plan: PickPlan): boolean {
  return plan.specs.some((spec) => spec.self === 'hero' || (spec.range.from === 'hero' && spec.range.max !== null) || spec.adjacentTo?.range.from === 'hero');
}

