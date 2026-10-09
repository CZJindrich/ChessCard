/**
 * Candidate actions for one node of a seat turn (GDD §12.5), each with a cheap `prior` used to
 * order and prune them before the planner spends expansions on simulating them:
 *
 * - strikes: every legal target of every Ready piece (kills first);
 * - moves: the top-K destinations per piece by a move prior (Snuff Strike danger avoided, Plumes
 *   blocked, lines on Candles or heroes body-blocked, a strike set up from the tile, the Gloam
 *   avoided, distance to the fight);
 * - cards: full multi-step target sequences walked with the engine's own pick options (the same
 *   `TargetQuery` steps `cardTargets` answers, without its per-option simulated previews), the
 *   best few combinations per card; identical cards in hand are tried once;
 * - the Hero Power the same way; the Bell of Saint Tallow on enemies with a locked intent;
 * - relight (Vigil) and light_shrine with a piece's Strike.
 *
 * end_turn is never a candidate: every node is also scored as "end the turn here".
 */
import { freeActionTargetInfo } from '../actions';
import { cardCost, cardPlan } from '../cards';
import { chebyshev, footprintDistance, posKey } from '../geometry';
import { powerCost, powerOf } from '../powers';
import { dangerTiles, intentHits } from '../snuff';
import { unitLimitReached } from '../spawn';
import { cardLimitOf, heroOf, isEnemyOfSeat, pieceList, plumeAt } from '../state';
import { moveDestinations, strikeOption, strikePlans } from '../strike';
import { countsFromHero, pickPlan, stepOptions } from '../targeting';
import type { Pick, PickEnv, PickPlan } from '../targeting';
import { enemyWorth, optionWorth, plumeWorth, shrineWorth, unlitShrineNear } from './evaluate';
import type { EvalEnv } from './evaluate';
import type { LevelProfile } from './profiles';
import type { Action, CardDef, CardTargetChoice, GameState, Piece, Pos } from '../types';

export type CandidateKind = 'strike' | 'move' | 'card' | 'power' | 'free' | 'relight' | 'shrine';

/**
 * Prior weights: they only order and prune candidates (the planner scores the simulated result
 * with bots/evaluate.ts), so they are rough on purpose.
 */
const PRIOR = {
  /** Strikes: bonus for a kill, and for breaking a Ward. */
  lethal: 20,
  breakWard: 2,
  /** Moves, per point of incoming Snuff Strike damage on the destination (hero / other piece). */
  dangerHero: 6,
  dangerUnit: 3,
  /** Moving off a red tile onto a safe one. */
  dodge: 4,
  /** Standing on a Plume: a unit, a healthy hero (> 2 HP), a hurt hero. */
  blockUnit: 8,
  blockHero: 6,
  blockHurtHero: -4,
  /** Stepping into a line aimed at a Candle or one of our heroes (unit / hero). */
  bodyBlockUnit: 10,
  bodyBlockHero: 4,
  /** Last Flame: ending a move in the Gloam or its warned ring. */
  gloam: -15,
  /** Share of the best strike (or Shrine) the piece would have from the destination. */
  setUp: 0.8,
  /** Per tile to the nearest Snuff. */
  distance: -1.2,
  /** Picks: a boss, a rival piece, a Snuff with a locked intent, an ally in danger. */
  boss: 20,
  rival: 15,
  hasIntent: 6,
  allyDanger: 4,
  allyMissingHp: 2,
  allyHero: 4,
  allyCandle: 6,
  /** Tile picks: Snuff and Plumes within 1, danger, distance to the fight. */
  tileSnuff: 6,
  tilePlume: 3,
  tileDanger: -2,
  tileDistance: -0.5,
  /** Base priors: cards, the Hero Power, the Bell on an intent, relighting a Wick. */
  card: 2,
  power: 1,
  bell: 10,
  relight: 45,
} as const;

export interface Candidate {
  action: Action;
  prior: number;
  kind: CandidateKind;
  /** Pruning group: each group keeps at least its best candidate. */
  group: string;
}

export interface GenEnv extends EvalEnv {
  profile: LevelProfile;
}

/** Per-node lookups shared by every generator. */
interface Board {
  s: GameState;
  env: GenEnv;
  danger: Record<string, number>;
  /** Tiles where a piece would take a line attack aimed at a Candle or a hero of ours. */
  blocks: Set<string>;
  snuff: Piece[];
  /** What lighting a Shrine is worth this turn. */
  shrine: number;
}

function readBoard(s: GameState, env: GenEnv): Board {
  return {
    s,
    env,
    danger: dangerTiles(s),
    blocks: blockTiles(s, env),
    snuff: pieceList(s).filter((p) => p.side === 'snuff'),
    shrine: shrineWorth(s, env.reg),
  };
}

function guarded(s: GameState, env: GenEnv, p: Piece): boolean {
  if (p.kind === 'candle') return true;
  if (p.kind !== 'hero' || p.smoldering) return false;
  return s.config.mode === 'vigil' || p.owner === env.seat;
}

function blockTiles(s: GameState, env: GenEnv): Set<string> {
  const out = new Set<string>();
  for (const intent of s.intents) {
    if (!intent.firstHit) continue;
    const hit = intentHits(s, intent);
    const victims = hit.victimIds.map((id) => s.pieces[id]).filter((p): p is Piece => p !== undefined);
    if (!victims.some((v) => guarded(s, env, v))) continue;
    const victimTiles = new Set(victims.map((v) => posKey(v.pos)));
    for (const t of hit.tiles) if (!victimTiles.has(posKey(t))) out.add(posKey(t));
  }
  return out;
}

function dangerAt(b: Board, p: Pos): number {
  return b.danger[posKey(p)] ?? 0;
}

function ownReady(s: GameState, seat: number): Piece[] {
  return pieceList(s).filter((p) => p.owner === seat && p.side === 'wick' && !p.exhausted && !p.smoldering);
}

function nearestSnuff(b: Board, p: Pos): number {
  let best = 8;
  for (const e of b.snuff) best = Math.min(best, footprintDistance(e.pos, e.size, p, 1));
  return best;
}

// =============================================================================================
// Strikes
// =============================================================================================

function strikeCandidates(b: Board, piece: Piece): Candidate[] {
  const { s, env } = b;
  return strikePlans(s, env.reg, piece).map((plan) => {
    const option = strikeOption(s, env.reg, piece, plan);
    const prior = optionWorth(s, env, option) + (option.lethal && !option.isPlume ? PRIOR.lethal : 0) + (option.blockedByWard ? PRIOR.breakWard : 0);
    return { action: { type: 'strike', seat: env.seat, pieceId: piece.id, target: { ...plan.target } }, prior, kind: 'strike', group: `strike:${piece.id}` };
  });
}

// =============================================================================================
// Moves
// =============================================================================================

/** The piece standing on `to` (shallow copies only: cheap to build per destination). */
function movedTo(s: GameState, piece: Piece, to: Pos): { s: GameState; piece: Piece } {
  const moved: Piece = { ...piece, pos: to };
  return { s: { ...s, pieces: { ...s.pieces, [piece.id]: moved } }, piece: moved };
}

function bestStrikeFrom(b: Board, piece: Piece, to: Pos): number {
  const view = movedTo(b.s, piece, to);
  let best = 0;
  for (const plan of strikePlans(view.s, b.env.reg, view.piece)) {
    best = Math.max(best, optionWorth(view.s, b.env, strikeOption(view.s, b.env.reg, view.piece, plan)));
  }
  return best;
}

function gloamTile(s: GameState, p: Pos): boolean {
  const tile = s.board.tiles[p.y * s.board.w + p.x];
  return tile !== undefined && (tile.gloam || tile.gloamWarning);
}

function plumeBlockPrior(piece: Piece): number {
  if (piece.kind !== 'hero') return PRIOR.blockUnit;
  return piece.hp > 2 ? PRIOR.blockHero : PRIOR.blockHurtHero;
}

function movePrior(b: Board, piece: Piece, to: Pos): number {
  const { s } = b;
  const hero = piece.kind === 'hero';
  const danger = dangerAt(b, to);
  let prior = -danger * (hero ? PRIOR.dangerHero : PRIOR.dangerUnit);
  if (dangerAt(b, piece.pos) > 0 && danger === 0) prior += PRIOR.dodge;
  if (plumeAt(s, to)) prior += plumeBlockPrior(piece);
  if (b.blocks.has(posKey(to))) prior += hero ? PRIOR.bodyBlockHero : PRIOR.bodyBlockUnit;
  if (s.config.mode === 'last_flame' && gloamTile(s, to)) prior += PRIOR.gloam;
  if (piece.strikesLeft > 0) prior += PRIOR.setUp * Math.max(bestStrikeFrom(b, piece, to), unlitShrineNear(s, to) ? b.shrine : 0);
  return prior + PRIOR.distance * nearestSnuff(b, to);
}

function moveCandidates(b: Board, piece: Piece): Candidate[] {
  if (piece.movesLeft <= 0) return [];
  const { s, env } = b;
  const dests = moveDestinations(s, env.reg, piece).map((d) => ({ to: d.to, prior: movePrior(b, piece, d.to) }));
  dests.sort((a, c) => c.prior - a.prior);
  return dests.slice(0, env.profile.movesPerPiece).map((d) => ({
    action: { type: 'move', seat: env.seat, pieceId: piece.id, to: { ...d.to } },
    prior: d.prior,
    kind: 'move',
    group: `move:${piece.id}`,
  }));
}

// =============================================================================================
// Card and Power target sequences
// =============================================================================================

/** How promising one pick looks (enemies we can finish, allies in danger, tiles near the fight). */
function pickPrior(b: Board, pick: Pick): number {
  const { s, env } = b;
  const piece = pick.target.pieceId ? s.pieces[pick.target.pieceId] : undefined;
  if (pick.choice.kind === 'piece' && piece) {
    if (isEnemyOfSeat(s, env.seat, piece)) {
      if (piece.kind === 'boss') return PRIOR.boss;
      const worth = piece.side === 'snuff' ? enemyWorth(env.reg, piece.defId, piece.hp, piece.atk) : PRIOR.rival;
      const intent = s.intents.some((i) => i.attackerId === piece.id) ? PRIOR.hasIntent : 0;
      return worth / Math.max(1, piece.hp) + intent;
    }
    const missing = Math.max(0, piece.maxHp - piece.hp);
    const kind = piece.kind === 'hero' ? PRIOR.allyHero : piece.kind === 'candle' ? PRIOR.allyCandle : 0;
    return dangerAt(b, piece.pos) * PRIOR.allyDanger + missing * PRIOR.allyMissingHp + kind;
  }
  if (pick.choice.kind === 'tile') {
    const at = pick.target.pos;
    const plume = plumeAt(s, at);
    let near = 0;
    for (const e of b.snuff) if (footprintDistance(e.pos, e.size, at, 1) <= 1) near += 1;
    const plumesNear = s.plumes.filter((m) => chebyshev(m.pos, at) <= 1).length;
    const pop = plume ? 0.5 * plumeWorth(env.reg, plume.enemyId) : 0;
    return PRIOR.tileSnuff * near + PRIOR.tilePlume * plumesNear + PRIOR.tileDanger * dangerAt(b, at) + PRIOR.tileDistance * nearestSnuff(b, at) + pop;
  }
  return 0;
}

interface Play {
  targets: CardTargetChoice[];
  prior: number;
}

/** Complete target sequences of a pick plan, best first (at most `cap`). */
function enumeratePlays(b: Board, env: PickEnv, cap: number): Play[] {
  const { s } = b;
  const reg = b.env.reg;
  const plays: Play[] = [];
  const walk = (chosen: Pick[], prior: number): void => {
    if (plays.length >= cap * 4) return;
    const index = chosen.length;
    if (index >= env.plan.specs.length) {
      plays.push({ targets: chosen.map((p) => p.choice), prior });
      return;
    }
    const options = stepOptions(s, reg, env, chosen).list;
    if (options.length === 0) {
      if (index >= env.plan.required) plays.push({ targets: chosen.map((p) => p.choice), prior });
      return;
    }
    const ranked = options.map((o) => ({ o, p: pickPrior(b, o) })).sort((x, y) => y.p - x.p);
    for (const { o, p } of ranked.slice(0, index === 0 ? cap : 3)) walk([...chosen, o], prior + p);
  };
  walk([], 0);
  return plays.sort((x, y) => y.prior - x.prior).slice(0, cap);
}

function needsUnitSlot(def: CardDef): boolean {
  const effects = [...def.effects, ...(def.modes ?? []).flatMap((m) => m.effects)];
  return def.type === 'summon' || effects.some((op) => op.op === 'transform' && op.owner === 'player');
}

function heroDown(s: GameState, seat: number): boolean {
  const hero = heroOf(s, seat);
  return !hero || hero.smoldering;
}

function cardCandidates(b: Board): Candidate[] {
  const { s, env } = b;
  const { reg, seat } = env;
  const player = s.players[seat];
  const limit = cardLimitOf(s, seat);
  if (limit !== null && player.turn.cardsPlayed >= limit) return [];
  const tried = new Set<string>();
  const out: Candidate[] = [];
  for (const card of player.hand) {
    const def = reg.cards.byId[card.id];
    const key = `${card.id}:${card.tempered}`;
    if (!def || tried.has(key)) continue;
    tried.add(key);
    if (cardCost(s, reg, seat, card) > player.flame) continue;
    if (needsUnitSlot(def) && unitLimitReached(s, seat)) continue;
    const modes = def.modes ? def.modes.map((_, i) => i) : [undefined];
    for (const mode of modes) {
      const plan = cardPlan(def, mode, card.tempered);
      if (!plan || (countsFromHero(plan) && heroDown(s, seat))) continue;
      for (const play of enumeratePlays(b, { seat, kind: 'card', plan }, env.profile.playsPerCard)) {
        out.push({
          action: { type: 'play_card', seat, cardUid: card.uid, targets: play.targets, ...(mode !== undefined ? { mode } : {}) },
          prior: PRIOR.card + play.prior / Math.max(1, play.targets.length),
          kind: 'card',
          group: `card:${key}`,
        });
      }
    }
  }
  return out;
}

function powerCandidates(b: Board): Candidate[] {
  const { s, env } = b;
  const { reg, seat } = env;
  const player = s.players[seat];
  const def = powerOf(s, reg, seat);
  if (!def || player.turn.powerUsed || player.flame < powerCost(s, reg, seat) || heroDown(s, seat)) return [];
  const plan: PickPlan = pickPlan(def.target, def.then, def.effects);
  return enumeratePlays(b, { seat, kind: 'power', plan }, env.profile.playsPerCard).map((play) => ({
    action: { type: 'use_power', seat, targets: play.targets },
    prior: PRIOR.power + play.prior / Math.max(1, play.targets.length),
    kind: 'power',
    group: 'power',
  }));
}

// =============================================================================================
// Free actions, relight, Shrines
// =============================================================================================

function bellCandidates(b: Board): Candidate[] {
  const { s, env } = b;
  const player = s.players[env.seat];
  const owns = player.heirlooms.some((h) => env.reg.heirlooms.byId[h]?.freeAction === 'ring_bell');
  if (!owns || player.bellUsedThisNight) return [];
  const info = freeActionTargetInfo(s, env.reg, env.seat, 'ring_bell');
  const out: Candidate[] = [];
  for (const option of info.targets) {
    if (option.choice.kind !== 'piece') continue;
    const target = s.pieces[option.choice.pieceId];
    if (!target || !s.intents.some((i) => i.attackerId === target.id)) continue;
    const prior = PRIOR.bell + pickPrior(b, { choice: option.choice, target: { pieceId: target.id, pos: target.pos } });
    out.push({ action: { type: 'free_action', seat: env.seat, kind: 'ring_bell', pieceId: target.id }, prior, kind: 'free', group: 'bell' });
  }
  return out;
}

function supportCandidates(b: Board, piece: Piece): Candidate[] {
  const { s, env } = b;
  if (piece.strikesLeft <= 0) return [];
  const out: Candidate[] = [];
  if (s.config.mode === 'vigil') {
    for (const wick of pieceList(s)) {
      if (wick.kind !== 'hero' || !wick.smoldering || wick.pendingRelight) continue;
      if (footprintDistance(piece.pos, piece.size, wick.pos, 1) !== 1) continue;
      out.push({ action: { type: 'relight', seat: env.seat, pieceId: piece.id, wickId: wick.id }, prior: PRIOR.relight, kind: 'relight', group: `relight:${piece.id}` });
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const at = { x: piece.pos.x + dx, y: piece.pos.y + dy };
      const tile = s.board.tiles[at.y * s.board.w + at.x];
      if (at.x < 0 || at.y < 0 || at.x >= s.board.w || at.y >= s.board.h || !tile) continue;
      if (tile.type !== 'votive_shrine' || tile.shrineLit || tile.gloam) continue;
      out.push({ action: { type: 'light_shrine', seat: env.seat, pieceId: piece.id, shrine: at }, prior: b.shrine, kind: 'shrine', group: `shrine:${piece.id}` });
    }
  }
  return out;
}

// =============================================================================================
// Selection
// =============================================================================================

/** Keep the best of each group, then fill up to `max` by prior; best first. */
function select(cands: Candidate[], max: number): Candidate[] {
  const sorted = cands.slice().sort((a, c) => c.prior - a.prior);
  const kept = new Set<Candidate>();
  const groups = new Set<string>();
  for (const c of sorted) {
    if (groups.has(c.group)) continue;
    groups.add(c.group);
    kept.add(c);
  }
  for (const c of sorted) {
    if (kept.size >= max) break;
    kept.add(c);
  }
  return sorted.filter((c) => kept.has(c)).slice(0, Math.max(max, groups.size));
}

export function candidateActions(s: GameState, env: GenEnv): Candidate[] {
  const b = readBoard(s, env);
  const out: Candidate[] = [];
  for (const piece of ownReady(s, env.seat)) {
    if (piece.strikesLeft > 0) out.push(...strikeCandidates(b, piece), ...supportCandidates(b, piece));
    out.push(...moveCandidates(b, piece));
  }
  out.push(...cardCandidates(b), ...powerCandidates(b), ...bellCandidates(b));
  return select(out, env.profile.maxCandidates);
}
