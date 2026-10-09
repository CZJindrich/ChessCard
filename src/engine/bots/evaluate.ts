/**
 * The bots' scoring function (GDD §12.5). Every planner ranks plans by
 *
 *   endScore(state)  = value(outcome(state)) + turnTerms(state)
 *   nodeScore(state) = endScore(state) + opportunity(state)
 *
 * `outcome` ends the players phase on a clone: the Guttered King's CHECKMATE check, the Snuff
 * Strike (the very code `previewSnuffStrike` runs, so red tiles, pushes, Ward and friendly fire
 * are exact) and the Rise (a blocked Plume hurts its blocker, an open one becomes an enemy). The
 * Tally that follows is approximated statically (Gloam, Hot Wax, self-relight Dread).
 *
 * `value` is from the planning seat's point of view (weights in `W`):
 * - Vigil (shared by the team): −Dread (steeper near the Long Night), Candle HP and standing
 *   Candles, hero HP / Ward / Smoldering, unit worth, −Snuff worth (so kills count), −boss HP
 *   (worth more as the Hour Candle fills: the Boss Night is a race), Lit Shrines, and baits
 *   (Lit Shrines, Lanterns) for a boss intent that bites the brightest light; victory and
 *   defeat dominate everything.
 * - Last Flame: own Glory (the best rival's Glory weighed by the level), own hero safety, Gloam
 *   safety (a Wick in the closing ring is an elimination), own units, rival threat (rival pieces
 *   able to strike our hero next turn); elimination and the final placement dominate.
 * - Both: −Hot Wax under our pieces (Tally damage), and the seat's mobile pieces stay near
 *   the fight (the Snuff and the boss).
 *
 * `turnTerms` read the state before the phase ends: Flame spent (+) and cards kept in hand (+),
 * so a card is played only when it does something, and the Guttered King's open escapes (−),
 * since CHECKMATE needs all 8 blocked.
 *
 * `opportunity` credits Strikes still unused this turn (the best target each piece could hit
 * now), so the beam keeps a move that sets up a kill; it never counts for the final choice.
 */
import { bossPlayersPhaseEnd, bossTurnIntents } from '../bosses';
import { footprintDistance } from '../geometry';
import { runSnuffStrikeStep } from '../phases';
import { riseAll } from '../snuff';
import { cloneState, isOver, isRivalOf, makeCtx, pieceList } from '../state';
import { strikeOption, strikePlans } from '../strike';
import type { ContentRegistry, GameState, Piece, StrikeOption } from '../types';

export const W = {
  win: 1_000_000,
  eliminated: 100_000,
  dread: 30,
  /** Extra per Dread point within 3 of the Long Night. */
  dreadNearMax: 30,
  candleHp: 5,
  candleStanding: 8,
  heroHp: 3,
  heroSmolder: 15,
  ward: 2,
  unitBase: 3,
  unitHp: 1.5,
  unitAtk: 2,
  enemyBase: 8,
  enemyAtk: 6,
  enemyHp: 2,
  enemyRank: 2,
  belch: 6,
  plumeFactor: 0.75,
  /** Per boss HP point at no Dread; the Boss Night is a race, so it grows with the Dread already on the Hour Candle. */
  bossHp: 12,
  bossUrgency: 1.5,
  escape: 1.5,
  litShrine: 2,
  /** A Lit Shrine or Lantern a "brightest light" boss intent (Hunger) would bite instead of a Candle. */
  bait: 25,
  flameSpent: 0.3,
  cardInHand: 0.8,
  engage: 0.4,
  glory: 10,
  placement: 500,
  gloamHero: 12,
  gloamUnit: 4,
  hotWax: 2,
  rivalThreat: 2.5,
  rivalLethal: 8,
  /** On top of the Glory, for felling a rival piece (it stops threatening us). */
  rivalKill: 10,
  /** Share of an unused Strike's best target credited to a node (beam ordering only). */
  opportunity: 0.6,
} as const;

export interface EvalEnv {
  reg: ContentRegistry;
  seat: number;
  /** Last Flame: weight of the best rival's Glory relative to own Glory. */
  rivalGlory: number;
  /** The state the plan starts from (Flame spent is measured against it). */
  root: GameState;
}

// =============================================================================================
// Piece worth
// =============================================================================================

/** Worth of one boss HP point this turn: W.bossHp, up to (1 + bossUrgency)× as the Hour Candle fills. */
export function bossWeight(env: EvalEnv): number {
  const vigil = env.root.vigil;
  const fill = vigil && vigil.dreadMax > 0 ? Math.min(1, vigil.dread / vigil.dreadMax) : 0;
  return W.bossHp * (1 + W.bossUrgency * fill);
}

/** Worth of a Snuff (as a threat while it stands, as a kill when it falls). */
export function enemyWorth(reg: ContentRegistry, defId: string, hp: number, atk: number): number {
  const def = reg.enemies.byId[defId];
  const belch = def?.traits.includes('belch') ? W.belch : 0;
  return W.enemyBase + W.enemyAtk * atk + W.enemyHp * hp + W.enemyRank * (def?.glory ?? 1) + belch;
}

/** Worth of the enemy a Plume would raise. */
export function plumeWorth(reg: ContentRegistry, enemyId: string): number {
  const def = reg.enemies.byId[enemyId];
  return def ? W.plumeFactor * enemyWorth(reg, enemyId, def.hp, def.atk) : 0;
}

export function unitWorth(p: Piece): number {
  return W.unitBase + W.unitHp * p.hp + W.unitAtk * p.atk + (p.ward ? W.ward / 2 : 0);
}

function heroWorth(p: Piece): number {
  if (p.smoldering) return -W.heroSmolder;
  return W.heroHp * p.hp + (p.ward ? W.ward : 0);
}

// =============================================================================================
// Outcome of ending the players phase now
// =============================================================================================

/** CHECKMATE check, Snuff Strike and Rise on a clone: what ending the players phase now does. */
export function outcomeOf(s: GameState, reg: ContentRegistry): GameState {
  const ctx = makeCtx(cloneState(s), reg);
  if (!isOver(ctx.s) && ctx.s.phase === 'players') bossPlayersPhaseEnd(ctx);
  if (!isOver(ctx.s) && (ctx.s.phase === 'players' || ctx.s.phase === 'snuff_strike')) runSnuffStrikeStep(ctx);
  if (!isOver(ctx.s) && ctx.s.phase === 'rise') riseAll(ctx);
  return ctx.s;
}

// =============================================================================================
// Shared terms
// =============================================================================================

function nearestDistance(from: Piece, targets: readonly Piece[]): number {
  let best = Infinity;
  for (const t of targets) best = Math.min(best, footprintDistance(from.pos, from.size, t.pos, t.size));
  return best;
}

function isMobile(reg: ContentRegistry, p: Piece): boolean {
  if (p.kind === 'hero') return true;
  return !p.structure && reg.units.byId[p.defId]?.move.type !== 'immobile';
}

/** The seat's mobile pieces stay within reach of the fight. */
function engagement(s: GameState, env: EvalEnv, foes: readonly Piece[]): number {
  if (foes.length === 0) return 0;
  let total = 0;
  for (const p of pieceList(s)) {
    if (p.owner !== env.seat || p.smoldering || !isMobile(env.reg, p)) continue;
    const d = Math.min(6, nearestDistance(p, foes));
    total -= W.engage * d * (p.kind === 'hero' ? 2 : 1);
  }
  return total;
}

interface TileFlags {
  gloam: boolean;
  warning: boolean;
  hotWax: boolean;
}

function flagsUnder(s: GameState, p: Piece): TileFlags {
  const out: TileFlags = { gloam: false, warning: false, hotWax: false };
  for (let dx = 0; dx < p.size; dx++) {
    for (let dy = 0; dy < p.size; dy++) {
      const tile = s.board.tiles[(p.pos.y + dy) * s.board.w + p.pos.x + dx];
      if (!tile) continue;
      out.gloam ||= tile.gloam;
      out.warning ||= tile.gloamWarning;
      out.hotWax ||= tile.type === 'hot_wax';
    }
  }
  return out;
}

function litShrines(s: GameState): number {
  let n = 0;
  for (const t of s.board.tiles) if (t.type === 'votive_shrine' && t.shrineLit) n += 1;
  return n;
}

/** Boss intents of the current phase that bite the brightest light (Nocturna's Hunger), with their reach. */
function lightBiters(s: GameState, reg: ContentRegistry): number[] {
  const boss = s.boss;
  const def = boss ? reg.bosses.byId[boss.id] : undefined;
  const phase = boss ? def?.phases[boss.phase - 1] : undefined;
  const reaches: number[] = [];
  for (const id of def && phase ? bossTurnIntents(s, reg, def, phase) : []) {
    const def = reg.bossIntents.byId[id];
    if (def?.targeting === 'brightest_light') reaches.push(def.reach.kind === 'within' ? def.reach.max : Math.max(s.board.w, s.board.h));
  }
  return reaches;
}

/**
 * Baits for "brightest light" intents (§10.4 weakness): Lit Shrines and Lanterns within reach
 * draw Hunger away from the Candles and heroes at the next Snuff Move.
 */
function baitValue(s: GameState, reg: ContentRegistry): number {
  const reaches = lightBiters(s, reg);
  const boss = s.boss ? s.pieces[s.boss.pieceId] : undefined;
  if (reaches.length === 0 || !boss) return 0;
  const reach = Math.max(...reaches);
  let baits = 0;
  for (let i = 0; i < s.board.tiles.length; i++) {
    const t = s.board.tiles[i];
    if (t.type !== 'votive_shrine' || !t.shrineLit) continue;
    if (footprintDistance(boss.pos, boss.size, { x: i % s.board.w, y: Math.floor(i / s.board.w) }, 1) <= reach) baits += 1;
  }
  for (const p of pieceList(s)) if (p.defId === 'lantern' && footprintDistance(boss.pos, boss.size, p.pos, 1) <= reach) baits += 1;
  return W.bait * Math.min(reaches.length, baits);
}

/** The Snuff on the board, the boss included (the fight to stay near). */
function snuffOf(s: GameState): Piece[] {
  return pieceList(s).filter((p) => p.side === 'snuff');
}

// =============================================================================================
// Vigil
// =============================================================================================

function dreadValue(s: GameState): number {
  const vigil = s.vigil;
  if (!vigil) return 0;
  const nearMax = Math.max(0, vigil.dread - (vigil.dreadMax - 3));
  return -W.dread * vigil.dread - W.dreadNearMax * nearMax;
}

function vigilPieceValue(s: GameState, env: EvalEnv, p: Piece): number {
  const { reg } = env;
  if (p.kind === 'candle') return W.candleStanding + W.candleHp * p.hp + (p.ward ? W.ward : 0);
  if (p.kind === 'boss') return -bossWeight(env) * p.hp;
  if (p.side === 'snuff') return -enemyWorth(reg, p.defId, p.hp, p.atk);
  const flags = flagsUnder(s, p);
  const wax = flags.hotWax ? W.hotWax : 0;
  if (p.kind === 'hero') return vigilHeroValue(p) - wax;
  return unitWorth(p) - wax;
}

/** A Wick relit this turn returns at the end of the seat turn; one still Smoldering at Tally costs Dread. */
function vigilHeroValue(p: Piece): number {
  if (p.smoldering && p.pendingRelight) return W.heroHp * Math.ceil(p.maxHp / 2);
  return heroWorth(p) - (p.smoldering ? W.dread : 0);
}

function vigilValue(s: GameState, env: EvalEnv): number {
  const result = s.result;
  if (result?.mode === 'vigil') return result.outcome === 'victory' ? W.win : -W.win;
  let value = dreadValue(s) + W.litShrine * litShrines(s) + baitValue(s, env.reg);
  for (const p of pieceList(s)) value += vigilPieceValue(s, env, p);
  for (const plume of s.plumes) value -= plumeWorth(env.reg, plume.enemyId);
  return value + engagement(s, env, snuffOf(s));
}

// =============================================================================================
// Last Flame
// =============================================================================================

function placementValue(s: GameState, env: EvalEnv): number {
  const result = s.result;
  if (result?.mode !== 'last_flame') return 0;
  const mine = result.standings.find((st) => st.seat === env.seat);
  if (!mine) return 0;
  return W.placement * (s.players.length - mine.placement) + W.glory * mine.score;
}

function gloryValue(s: GameState, env: EvalEnv): number {
  const own = s.players[env.seat]?.glory ?? 0;
  let rival = 0;
  for (const p of s.players) if (p.seat !== env.seat) rival = Math.max(rival, p.glory);
  return W.glory * (own - env.rivalGlory * rival);
}

function gloamValue(s: GameState, p: Piece): number {
  const flags = flagsUnder(s, p);
  if (!flags.gloam && !flags.warning) return 0;
  if (p.kind === 'hero') return p.smoldering ? -W.eliminated : -W.gloamHero;
  return -W.gloamUnit;
}

/** Rival pieces that could strike our hero from where they stand (§12.5 "rival threat"). */
function rivalThreat(s: GameState, env: EvalEnv, hero: Piece): number {
  if (hero.smoldering) return 0;
  let threat = 0;
  for (const p of pieceList(s)) {
    if (!isRivalOf(s, env.seat, p) || p.smoldering) continue;
    for (const plan of strikePlans(s, env.reg, p)) {
      if (!plan.victimIds.includes(hero.id)) continue;
      const option = strikeOption(s, env.reg, p, plan);
      threat -= W.rivalThreat * option.damage + (option.lethal ? W.rivalLethal : 0);
    }
  }
  return threat;
}

function lastFlameValue(s: GameState, env: EvalEnv): number {
  if (s.result) return placementValue(s, env);
  const player = s.players[env.seat];
  if (!player || player.eliminated) return -W.eliminated + W.glory * (player?.glory ?? 0);
  let value = gloryValue(s, env);
  for (const p of pieceList(s)) {
    if (p.owner !== env.seat) continue;
    const wax = flagsUnder(s, p).hotWax ? W.hotWax : 0;
    value += (p.kind === 'hero' ? heroWorth(p) : unitWorth(p)) - wax + gloamValue(s, p);
  }
  const hero = s.pieces[player.heroPieceId];
  if (hero) value += rivalThreat(s, env, hero);
  return value + engagement(s, env, snuffOf(s));
}

// =============================================================================================
// Scores
// =============================================================================================

/** The value of a state after the phase ended (or of a finished game). */
export function stateValue(s: GameState, env: EvalEnv): number {
  return s.config.mode === 'last_flame' ? lastFlameValue(s, env) : vigilValue(s, env);
}

/** CHECKMATEs the boss can still take (the Guttered King's `smothered_mate`), or 0. */
function checkmatesLeft(s: GameState, reg: ContentRegistry): number {
  const special = s.boss ? reg.bosses.byId[s.boss.id]?.special : null;
  if (!s.boss || special?.op !== 'custom' || special.id !== 'smothered_mate') return 0;
  const max = special.args.maxCrowns;
  return Math.max(0, (typeof max === 'number' ? max : 3) - s.boss.crowns);
}

/** Terms read from the state before the phase ends: Flame spent, cards kept, open escapes. */
function turnTerms(s: GameState, env: EvalEnv): number {
  const player = s.players[env.seat];
  const rootPlayer = env.root.players[env.seat];
  if (!player || !rootPlayer) return 0;
  const spent = Math.max(0, rootPlayer.flame - player.flame);
  let value = W.flameSpent * spent + W.cardInHand * player.hand.length;
  if (s.boss && checkmatesLeft(s, env.reg) > 0) value -= W.escape * s.boss.escapes;
  return value;
}

/** Score of ending the turn in `s`. */
export function endScore(s: GameState, env: EvalEnv): number {
  if (s.result) return stateValue(s, env);
  return stateValue(outcomeOf(s, env.reg), env) + turnTerms(s, env);
}

/** Worth of the best target among a piece's strike options (0 when none is worth it). */
export function strikeWorth(s: GameState, env: EvalEnv, options: readonly StrikeOption[]): number {
  let best = 0;
  for (const o of options) best = Math.max(best, optionWorth(s, env, o));
  return best;
}

/** What one strike option is worth to the seat (kills full worth, chip damage a little). */
export function optionWorth(s: GameState, env: EvalEnv, o: StrikeOption): number {
  if (o.isPlume) {
    const plume = s.plumes.find((m) => m.pos.x === o.target.x && m.pos.y === o.target.y);
    return plume ? plumeWorth(env.reg, plume.enemyId) : 0;
  }
  const victim = o.targetPieceId ? s.pieces[o.targetPieceId] : undefined;
  if (!victim) return 0;
  const dealt = o.blockedByWard ? 0 : o.damage;
  if (victim.kind === 'boss') return bossWeight(env) * Math.min(dealt, victim.hp) * (s.config.mode === 'last_flame' ? 0.5 : 1);
  if (victim.side === 'snuff') {
    const worth = enemyWorth(env.reg, victim.defId, victim.hp, victim.atk);
    return o.lethal ? worth : (worth * Math.min(dealt, victim.hp)) / (2 * Math.max(1, victim.hp));
  }
  const glory = victim.kind === 'hero' ? env.reg.rules.glory.rivalHero : env.reg.rules.glory.rivalUnit;
  return o.lethal ? W.glory * glory + W.rivalKill : dealt * W.heroHp;
}

/** An unlit Shrine (outside the Gloam) next to `p`: lighting it is one Strike away. */
export function unlitShrineNear(s: GameState, p: { x: number; y: number }): boolean {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= s.board.w || y >= s.board.h) continue;
      const t = s.board.tiles[y * s.board.w + x];
      if (t.type === 'votive_shrine' && !t.shrineLit && !t.gloam) return true;
    }
  }
  return false;
}

/** What lighting a Shrine is worth now (Last Flame: Glory; Vigil: healing, and bait for Hunger). */
export function shrineWorth(s: GameState, reg: ContentRegistry): number {
  if (s.config.mode === 'last_flame') return W.glory * reg.rules.glory.shrine;
  return W.litShrine + (lightBiters(s, reg).length > 0 ? W.bait : 0);
}

/** Unused Strikes: the best target each ready piece could hit (or the Shrine it could light) now. */
function opportunity(s: GameState, env: EvalEnv): number {
  let total = 0;
  for (const p of pieceList(s)) {
    if (p.owner !== env.seat || p.exhausted || p.smoldering || p.strikesLeft <= 0) continue;
    const options = strikePlans(s, env.reg, p).map((plan) => strikeOption(s, env.reg, p, plan));
    const shrine = unlitShrineNear(s, p.pos) ? shrineWorth(s, env.reg) : 0;
    total += Math.max(strikeWorth(s, env, options), shrine);
  }
  return W.opportunity * total;
}

export interface Scored {
  end: number;
  node: number;
}

export function scoreState(s: GameState, env: EvalEnv): Scored {
  const end = endScore(s, env);
  const ownTurn = !s.result && s.phase === 'players' && s.activeSeat === env.seat;
  return { end, node: ownTurn ? end + opportunity(s, env) : end };
}
