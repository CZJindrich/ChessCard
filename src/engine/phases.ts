/**
 * The phase machine (GDD §4): night_setup → (boss_intro) → (toll) → rounds of omen → snuff_move
 * → players → snuff_strike → rise → tally → dawn → chandlery → next Night … → game_over.
 *
 * Automated phases advance only through `{ type: 'advance' }` (see `pendingAutomation`). Entering
 * a phase does its bookkeeping (the players phase claims and starts a seat turn, dawn computes the
 * carry-over defaults, the Chandlery draws offers); advancing out of it does the phase's work.
 */
import { bossPlayersPhaseEnd } from './bosses';
import { returnCharm } from './charms';
import { clearStatuses, dealDamage, dismissUnit, halfMaxHp, healPiece, relightHero, standsOnHotWax, takesHotWax } from './combat';
import { discardHand, drawCards, drawUpTo } from './decks';
import { baseEnv, runCharmTrigger, runEffects, runTraitTrigger, runTriggered } from './effects';
import { runHeirloomTriggers } from './heirlooms';
import { chebyshev, compareReadingOrder, sortReadingOrder } from './geometry';
import { addLog, pieceName } from './log';
import {
  clockwiseFromFirstLight,
  endLastFlameGame,
  passFirstLight,
  tallyEndOfRoundChecks,
  tallyGloamClose,
  tallyGloamDamage,
} from './modes/lastFlame';
import { changeDread, dawnDreadRecovery } from './modes/vigil';
import { seatStream, streamDie, streamPick, streamShuffle, streamWeighted } from './rng';
import { enterNightSetup, freshTurnState, plumePlacement } from './setup';
import { refreshIntentTiles, resolveSnuffStrike, riseAll, runSnuffMovement } from './snuff';
import { endScriptedTurn, runScriptedSnuffMove, tutorialTurnStart } from './tutorial';
import {
  clearUndo,
  emit,
  expireRules,
  heroOf,
  heroPieces,
  isOver,
  pieceList,
  removePiece,
  ruleDelta,
  ruleValue,
  syncTurnState,
  unitsOf,
} from './state';
import type { Ctx } from './state';
import type { CardDef, GameState, OmenDef, PendingAutomation, PhaseId, Piece, PlayerState, TollDef, TriggerId } from './types';

export function setPhase(ctx: Ctx, phase: PhaseId): void {
  ctx.s.phase = phase;
  emit(ctx, { type: 'phase_changed', phase, night: ctx.s.night, round: ctx.s.round });
}

// =============================================================================================
// Automation queries
// =============================================================================================

function seatsInPlay(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.eliminated);
}

function chandleryDone(p: PlayerState): boolean {
  return p.chandlery === null || (p.chandlery.picksLeft === 0 && p.chandlery.boonDone);
}

/** Whether an `advance` is due now, and for which phase. */
export function pendingAutomation(s: GameState): PendingAutomation | null {
  if (s.result) return null;
  switch (s.phase) {
    case 'night_setup':
      return seatsInPlay(s).every((p) => p.ready) ? { phase: s.phase } : null;
    case 'toll':
      return s.toll.active !== null ? { phase: s.phase } : null;
    case 'dawn':
      return seatsInPlay(s).every((p) => p.carryOver === null || p.carryOver.chosen !== null) ? { phase: s.phase } : null;
    case 'chandlery':
      return seatsInPlay(s).every(chandleryDone) ? { phase: s.phase } : null;
    case 'players':
    case 'game_over':
      return null;
    default:
      return { phase: s.phase };
  }
}

/**
 * Seats allowed to act right now. In the players phase: the active seat, or (Vigil, nobody
 * active) every seat that may still claim its turn.
 */
export function activeSeats(s: GameState): number[] {
  if (s.result) return [];
  const live = seatsInPlay(s);
  switch (s.phase) {
    case 'night_setup':
      return live.filter((p) => !p.ready).map((p) => p.seat);
    case 'toll':
      return s.toll.active === null && s.toll.chooser !== null ? [s.toll.chooser] : [];
    case 'players':
      if (s.activeSeat !== null) return [s.activeSeat];
      return live.filter((p) => !p.turnEnded).map((p) => p.seat);
    case 'dawn':
      return live.filter((p) => p.carryOver !== null && p.carryOver.chosen === null).map((p) => p.seat);
    case 'chandlery':
      return live.filter((p) => !chandleryDone(p)).map((p) => p.seat);
    default:
      return [];
  }
}

/** Step the current automated phase. Callers check `pendingAutomation` first. */
export function advance(ctx: Ctx): void {
  switch (ctx.s.phase) {
    case 'night_setup':
      finishNightSetup(ctx);
      return;
    case 'boss_intro':
      runBossIntro(ctx);
      return;
    case 'toll':
      startRound(ctx);
      return;
    case 'omen':
      runOmen(ctx);
      return;
    case 'snuff_move':
      if (!runScriptedSnuffMove(ctx)) runSnuffMovement(ctx);
      if (!isOver(ctx.s)) enterPlayers(ctx);
      return;
    case 'snuff_strike':
      runSnuffStrikeStep(ctx);
      return;
    case 'rise':
      riseAll(ctx);
      if (!isOver(ctx.s)) setPhase(ctx, 'tally');
      return;
    case 'tally':
      runTally(ctx);
      return;
    case 'dawn':
      runDawn(ctx);
      return;
    case 'chandlery':
      enterNightSetup(ctx);
      return;
    case 'players':
    case 'game_over':
      return;
  }
}

// =============================================================================================
// Night start, boss intro, Toll
// =============================================================================================

function tollEnv(def: TollDef) {
  return baseEnv({ seat: null, ruleSource: { kind: 'toll', id: def.id }, defaultDuration: 'night', summonSource: 'toll', plumeSource: 'card' });
}

/** Run the active Toll's effects for one trigger (tally: Hearthwind; plume_placement: Waxen Rain). */
export function runTollTrigger(ctx: Ctx, trigger: TriggerId): void {
  const def = ctx.s.toll.active ? ctx.reg.tolls.byId[ctx.s.toll.active] : undefined;
  if (def) runTriggered(ctx, def.effects, trigger, tollEnv(def));
}

function finishNightSetup(ctx: Ctx): void {
  runHeirloomTriggers(ctx, 'night_start');
  if (isOver(ctx.s)) return;
  if (ctx.s.isBossNight) setPhase(ctx, 'boss_intro');
  else if (tollDue(ctx.s)) enterToll(ctx);
  else startRound(ctx);
}

/**
 * boss_intro: the boss already stands on the board (it spawns at night_setup, bosses.ts
 * `spawnBoss`); this phase is the intro screen, then the first round starts. The Vigil Boss
 * Night has no round cap: it ends when the boss dies or Dread is full.
 */
function runBossIntro(ctx: Ctx): void {
  startRound(ctx);
}

function tollDue(s: GameState): boolean {
  return s.config.tolls && !s.isBossNight && s.night >= 2;
}

/** A Toll's `requires` are met on this Night (§13.4). */
export function tollEligible(s: GameState, def: TollDef): boolean {
  return def.requires.every((req) => {
    switch (req) {
      case 'moth_die':
        return s.config.moth_die;
      case 'plumes':
        return s.config.mode === 'vigil' || s.config.neutrals !== 'off';
      case 'pillar':
        return s.board.tiles.some((t) => t.type === 'pillar');
      case 'chimney_pair':
        return s.board.tiles.some((t) => t.type === 'chimney');
    }
  });
}

/** Vigil: the First Light holder. Last Flame: the lowest Glory (ties: turn order from First Light). */
export function tollChooser(s: GameState): number {
  if (s.config.mode === 'vigil') return s.firstLight;
  const order = clockwiseFromFirstLight(s);
  return order.reduce((best, seat) => (s.players[seat].glory < s.players[best].glory ? seat : best), order[0]);
}

function enterToll(ctx: Ctx): void {
  const { s, reg } = ctx;
  const eligible = reg.tolls.list.filter((t) => tollEligible(s, t));
  const blessings = eligible.filter((t) => t.kind === 'blessing').map((t) => t.id);
  const curses = eligible.filter((t) => t.kind === 'curse').map((t) => t.id);
  if (blessings.length === 0 || curses.length === 0) {
    startRound(ctx);
    return;
  }
  const blessing = streamPick(s, 'toll', blessings);
  const curse = streamPick(s, 'toll', curses);
  s.toll.offer = { blessing, curse };
  s.toll.chooser = tollChooser(s);
  s.toll.active = null;
  setPhase(ctx, 'toll');
  emit(ctx, { type: 'toll_revealed', blessing, curse, chooser: s.toll.chooser });
  addLog(ctx, `The Toll: ${reg.tolls.byId[blessing].name} or ${reg.tolls.byId[curse].name}.`);
}

/** choose_toll: the Toll is in force for the whole Night (§13.4). */
export function applyToll(ctx: Ctx, seat: number, tollId: string): void {
  const { s, reg } = ctx;
  const def = reg.tolls.byId[tollId];
  s.toll.active = tollId;
  s.toll.history.push(tollId);
  s.toll.curseReward = def.kind === 'curse';
  emit(ctx, { type: 'toll_chosen', tollId, seat });
  addLog(ctx, `${s.players[seat].name} chooses ${def.name}.`, seat);
  runEffects(
    ctx,
    def.effects.filter((op) => op.trigger === undefined),
    tollEnv(def),
  );
  runTriggered(ctx, def.effects, 'night_start', tollEnv(def));
}

// =============================================================================================
// Rounds: omen and Snuff Move
// =============================================================================================

function startRound(ctx: Ctx): void {
  const { s } = ctx;
  s.round += 1;
  s.omen = { face: null, omenId: null };
  for (const p of pieceList(s)) {
    p.lastDisplacedBy = null;
    p.hauntedThisRound = false;
  }
  for (const intent of s.intents) intent.reversedBy = null;
  addLog(ctx, `Round ${s.round}${s.roundsThisNight !== null ? `/${s.roundsThisNight}` : ''}.`);
  setPhase(ctx, s.config.moth_die ? 'omen' : 'snuff_move');
}

/** The Moth Die (§13.5); Ill Omen turns faces 5 and 6 into Stillness. */
function runOmen(ctx: Ctx): void {
  const { s, reg } = ctx;
  const face = streamDie(s, 'omen', 6);
  const rolled = reg.omens.list.find((o) => o.face === face);
  if (!rolled) throw new Error(`no Moth Die face ${face}`);
  const calm = ruleValue(s, 'omen_good_faces_calm', null) === true && rolled.tone === 'good';
  const effective: OmenDef = calm ? (reg.omens.list.find((o) => o.id === 'stillness') ?? rolled) : rolled;
  s.omen = { face, omenId: effective.id };
  emit(ctx, { type: 'omen_rolled', face, omenId: rolled.id, effectiveId: effective.id });
  addLog(ctx, `The Moth Die shows ${rolled.name}${calm ? ' (Ill Omen: Calm)' : ''}: ${effective.label}.`);
  const plumesOff = s.config.mode === 'last_flame' && s.config.neutrals === 'off';
  const effects = effective.effects.filter((op) => !(plumesOff && op.op === 'place_plume'));
  runEffects(ctx, effects, baseEnv({ ruleSource: { kind: 'omen', id: effective.id }, defaultDuration: 'round', plumeSource: 'smoke' }));
  if (!isOver(s)) setPhase(ctx, 'snuff_move');
}

// =============================================================================================
// Players phase and seat turns (§4.3, §11.2-11.3)
// =============================================================================================

function enterPlayers(ctx: Ctx): void {
  const { s } = ctx;
  setPhase(ctx, 'players');
  for (const p of s.players) p.turnEnded = p.eliminated;
  s.activeSeat = null;
  s.claimQueue = [];
  activateNextSeat(ctx);
}

/**
 * Who acts next. Vigil: the FIFO claim queue; otherwise the only human still to act; once every
 * human has ended, AI allies in seat order. With two or more humans still to act, nobody is
 * active until someone claims. Last Flame: clockwise from the First Light holder.
 */
export function nextSeat(s: GameState): number | null {
  const pending = s.players.filter((p) => !p.turnEnded && !p.eliminated);
  if (s.config.mode === 'last_flame') return clockwiseFromFirstLight(s).find((seat) => !s.players[seat].turnEnded) ?? null;
  const queued = s.claimQueue.find((seat) => !s.players[seat].turnEnded);
  if (queued !== undefined) return queued;
  const humans = pending.filter((p) => p.kind === 'human');
  if (humans.length === 1) return humans[0].seat;
  if (humans.length === 0) return pending[0]?.seat ?? null;
  return null;
}

function activateNextSeat(ctx: Ctx): void {
  const { s } = ctx;
  if (s.players.every((p) => p.turnEnded || p.eliminated)) {
    enterSnuffStrike(ctx);
    return;
  }
  const seat = nextSeat(s);
  s.claimQueue = s.claimQueue.filter((q) => q !== seat && !s.players[q].turnEnded);
  if (seat !== null) startSeatTurn(ctx, seat);
}

function readyPiece(ctx: Ctx, p: Piece): void {
  const def = p.kind === 'hero' ? ctx.reg.heroes.byId[p.defId] : p.kind === 'unit' ? ctx.reg.units.byId[p.defId] : undefined;
  p.exhausted = false;
  p.buffs = { atk: 0, range: 0 };
  if (p.smoldering || !def) {
    p.movesLeft = 0;
    p.strikesLeft = 0;
    return;
  }
  p.movesLeft = def.move.type === 'immobile' ? 0 : 1;
  p.strikesLeft = def.attack.kind === 'none' ? 0 : 1;
  if (p.dazed) {
    p.strikesLeft = 0;
    p.dazed = false;
    emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'dazed', active: false, value: 0 });
  }
}

/** Seat turn start: draw to hand size, set Flame, ready the seat's pieces (§4.3). */
export function startSeatTurn(ctx: Ctx, seat: number): void {
  const { s, reg } = ctx;
  const player = s.players[seat];
  s.activeSeat = seat;
  player.turn = freshTurnState(reg);
  syncTurnState(s, seat);
  drawUpTo(ctx, seat, s.config.hand_size + ruleDelta(s, 'hand_size', seat));
  const extra = ruleDelta(s, 'draw_extra', seat);
  if (extra > 0) drawCards(ctx, seat, extra);
  player.flame = Math.min(reg.rules.flameCap, Math.max(0, s.config.flame_per_turn + ruleDelta(s, 'flame_per_turn', seat)));
  for (const p of pieceList(s)) if (p.owner === seat) readyPiece(ctx, p);
  tutorialTurnStart(ctx, seat);
  clearUndo(s);
  emit(ctx, { type: 'turn_started', seat, flame: player.flame });
  addLog(ctx, `${player.name} takes the turn.`, seat);
}

/** claim_turn: act now if nobody is acting, otherwise queue (FIFO). */
export function claimTurn(ctx: Ctx, seat: number): void {
  const { s } = ctx;
  if (s.activeSeat === null) startSeatTurn(ctx, seat);
  else if (!s.claimQueue.includes(seat)) s.claimQueue.push(seat);
}

/** End of a seat turn: Flame is lost, "this turn" effects end, pending relights return (§4.3, §6.6). */
export function endSeatTurn(ctx: Ctx, seat: number): void {
  const { s, reg } = ctx;
  const player = s.players[seat];
  player.flame = 0;
  player.turnEnded = true;
  for (const hero of heroPieces(s)) {
    if (hero.pendingRelight && hero.smoldering) relightHero(ctx, hero, halfMaxHp(hero), 'relight', true);
  }
  for (const p of pieceList(s)) {
    if (p.owner !== seat) continue;
    p.movesLeft = 0;
    p.strikesLeft = 0;
    p.buffs = { atk: 0, range: 0 };
  }
  expireRules(s, 'turn', seat);
  player.turn = freshTurnState(reg);
  syncTurnState(s, seat);
  s.activeSeat = null;
  clearUndo(s);
  emit(ctx, { type: 'turn_ended', seat });
  addLog(ctx, `${player.name} ends the turn.`, seat);
  if (!isOver(s)) activateNextSeat(ctx);
}

function enterSnuffStrike(ctx: Ctx): void {
  const { s } = ctx;
  s.activeSeat = null;
  for (const hero of heroPieces(s)) hero.smolderedAtPlayersEnd = hero.smoldering;
  endScriptedTurn(s);
  bossPlayersPhaseEnd(ctx);
  if (isOver(s)) return;
  expireRules(s, 'next_players_phase');
  setPhase(ctx, 'snuff_strike');
}

/** snuff_strike's advance: resolve every intent, then rise. `previewSnuffStrike` runs this too. */
export function runSnuffStrikeStep(ctx: Ctx): void {
  resolveSnuffStrike(ctx);
  if (!isOver(ctx.s)) setPhase(ctx, 'rise');
}

// =============================================================================================
// Tally (§6.9)
// =============================================================================================

function burnStep(ctx: Ctx, side: 'snuff' | 'wick'): void {
  const burning = sortReadingOrder(
    pieceList(ctx.s).filter((p) => p.side === side && p.burn > 0),
    (p) => p.pos,
  );
  for (const p of burning) {
    if (isOver(ctx.s)) return;
    p.burn -= 1;
    emit(ctx, { type: 'status_changed', pieceId: p.id, status: 'burn', active: p.burn > 0, value: p.burn });
    dealDamage(ctx, p, ctx.reg.statuses.byId.burn?.damage ?? 1, { cause: 'burn', sourceKind: 'hazard', sourceId: null, seat: p.lastDisplacedBy });
  }
}

/** Step 4: 1 damage to each piece still standing on Hot Wax (a boss once, whatever its footprint covers). */
function hotWaxStep(ctx: Ctx): void {
  const amount = ctx.reg.tiles.byId.hot_wax?.damage ?? 1;
  const onWax = sortReadingOrder(
    pieceList(ctx.s).filter((p) => standsOnHotWax(ctx, p) && takesHotWax(ctx.reg, p)),
    (p) => p.pos,
  );
  for (const p of onWax) {
    if (isOver(ctx.s)) return;
    dealDamage(ctx, p, amount, { cause: 'hot_wax', sourceKind: 'hazard', sourceId: null, seat: p.lastDisplacedBy });
  }
}

/** Step 6: Lit Shrines, Censer, Cocoon and Hearthwind. */
function healStep(ctx: Ctx): void {
  const { s } = ctx;
  s.board.tiles.forEach((tile, i) => {
    if (tile.type !== 'votive_shrine' || !tile.shrineLit) return;
    const shrine = { x: i % s.board.w, y: Math.floor(i / s.board.w) };
    const near = pieceList(s).filter((p) => p.side === 'wick' && p.kind !== 'candle' && chebyshev(p.pos, shrine) <= 1);
    for (const p of sortReadingOrder(near, (q) => q.pos)) healPiece(ctx, p, 1);
  });
  const wick = sortReadingOrder(
    pieceList(s).filter((p) => p.side === 'wick'),
    (p) => p.pos,
  );
  for (const p of wick) runTraitTrigger(ctx, p, 'tally');
  for (const p of wick) runCharmTrigger(ctx, p, 'tally');
  runTollTrigger(ctx, 'tally');
}

/** Step 7 (Vigil): a hero Smoldering since the end of the players phase relights with 1 HP, Dread +1. */
function selfRelightStep(ctx: Ctx): void {
  const { s, reg } = ctx;
  if (s.config.mode !== 'vigil') return;
  for (const hero of heroPieces(s).sort((a, b) => compareReadingOrder(a.pos, b.pos))) {
    if (isOver(s)) return;
    if (!hero.smoldering || !hero.smolderedAtPlayersEnd) continue;
    relightHero(ctx, hero, reg.rules.selfRelightHp, 'self', false);
    changeDread(ctx, reg.rules.dread.selfRelight, 'self_relight', `${pieceName(reg, hero)} relit alone in the dark.`);
  }
  for (const hero of heroPieces(s)) hero.smolderedAtPlayersEnd = false;
}

function plumesDueAtTally(s: GameState): boolean {
  if (s.siteId === 'first_vigil') return true;
  if (s.roundsThisNight === null) return true;
  return s.round <= s.roundsThisNight - 2;
}

function runTally(ctx: Ctx): void {
  const { s, reg } = ctx;
  const steps: Array<() => void> = [
    () => tallyGloamClose(ctx),
    () => burnStep(ctx, 'snuff'),
    () => burnStep(ctx, 'wick'),
    () => hotWaxStep(ctx),
    () => tallyGloamDamage(ctx),
    () => healStep(ctx),
    () => selfRelightStep(ctx),
    () => {
      if (s.config.mode === 'vigil' && s.isBossNight && s.boss) changeDread(ctx, reg.rules.dread.bossToll, 'boss_toll', 'The boss tolled.');
    },
    () => tallyEndOfRoundChecks(ctx),
    () => {
      if (!plumesDueAtTally(s)) return;
      plumePlacement(ctx, s.round);
      runTollTrigger(ctx, 'plume_placement');
    },
    () => {
      if (s.config.mode === 'last_flame') passFirstLight(ctx);
    },
  ];
  for (const step of steps) {
    if (isOver(s)) return;
    step();
  }
  if (isOver(s)) return;
  expireRules(s, 'round');
  s.stats.roundsPlayed += 1;
  refreshIntentTiles(s);
  if (s.roundsThisNight === null || s.round < s.roundsThisNight) startRound(ctx);
  else if (s.isBossNight) endBossNight(ctx);
  else enterDawn(ctx);
}

/** The Boss Night's round cap was reached: Last Flame's `boss_rounds` (the Vigil Boss Night has no cap). */
function endBossNight(ctx: Ctx): void {
  if (ctx.s.config.mode === 'last_flame') endLastFlameGame(ctx, 'boss_rounds');
}

// =============================================================================================
// Dawn and Chandlery (§13.6)
// =============================================================================================

/** Carry-over default: the 2 units with the highest HP, ties to the most recently summoned. */
export function defaultCarryOver(s: GameState, seat: number, max: number): string[] {
  return unitsOf(s, seat)
    .sort((a, b) => b.hp - a.hp || b.summonOrder - a.summonOrder)
    .slice(0, max)
    .map((p) => p.id);
}

function enterDawn(ctx: Ctx): void {
  const { s, reg } = ctx;
  setPhase(ctx, 'dawn');
  for (const player of seatsInPlay(s)) {
    const units = unitsOf(s, player.seat);
    const defaults = defaultCarryOver(s, player.seat, reg.rules.carryOverMax);
    const noChoice = player.kind !== 'human' || units.length <= reg.rules.carryOverMax;
    player.carryOver = { defaults, chosen: noChoice ? defaults.slice() : null };
  }
}

function runDawn(ctx: Ctx): void {
  const { s, reg } = ctx;
  for (const p of pieceList(s)) if (p.side === 'snuff') removePiece(s, p.id);
  s.plumes = [];
  s.intents = [];
  const candlesLit = dawnDreadRecovery(ctx);
  if (isOver(s)) return;
  for (const hero of heroPieces(s)) if (hero.smoldering) relightHero(ctx, hero, reg.rules.dawnRelightHp, 'dawn', false);
  for (const player of seatsInPlay(s)) {
    const keep = player.carryOver?.chosen ?? player.carryOver?.defaults ?? [];
    for (const unit of unitsOf(s, player.seat)) if (!keep.includes(unit.id)) dismissUnit(ctx, unit, 'dawn');
    const hero = heroOf(s, player.seat);
    for (const p of [hero, ...unitsOf(s, player.seat)]) if (p) healPiece(ctx, p, s.config.heal_between_nights);
    emit(ctx, { type: 'units_kept', seat: player.seat, pieceIds: keep.filter((id) => s.pieces[id]) });
  }
  for (const p of pieceList(s)) {
    if (p.side !== 'wick') continue;
    clearStatuses(ctx, p);
    returnCharm(ctx, p);
  }
  for (const player of seatsInPlay(s)) discardHand(ctx, player.seat);
  for (const tile of s.board.tiles) tile.shrineLit = false;
  expireRules(s, 'night');
  s.toll.active = null;
  s.toll.offer = null;
  s.toll.chooser = null;
  s.stats.nightsCompleted += 1;
  s.stats.candlesSaved += candlesLit;
  emit(ctx, { type: 'dawn', night: s.night, candlesLit });
  addLog(ctx, `Dawn breaks over Night ${s.night}.`);
  if (s.config.mode === 'vigil') passFirstLight(ctx);
  enterChandlery(ctx);
}

function rarityEntries(cards: CardDef[], weights: Record<CardDef['rarity'], number>) {
  return cards.map((c) => ({ item: c.id, weight: weights[c.rarity] }));
}

/** 3 different cards from the class + neutral pools, at least 1 class card (`draft:<seat>`). */
export function draftOffer(ctx: Ctx, seat: number): string[] {
  const { s, reg } = ctx;
  const stream = seatStream('draft', seat);
  const hero = s.players[seat].hero;
  const rules = reg.rules.chandlery;
  const classCards = reg.cards.list.filter((c) => c.class === hero);
  const pool = reg.cards.list.filter((c) => c.class === hero || c.class === null);
  const offer: string[] = [];
  for (let i = 0; i < rules.minClassCards && classCards.length > 0; i++) {
    offer.push(streamWeighted(s, stream, rarityEntries(classCards.filter((c) => !offer.includes(c.id)), rules.rarityWeights)));
  }
  while (offer.length < rules.offer) {
    const rest = pool.filter((c) => !offer.includes(c.id));
    if (rest.length === 0) break;
    offer.push(streamWeighted(s, stream, rarityEntries(rest, rules.rarityWeights)));
  }
  return streamShuffle(s, stream, offer);
}

function heirloomOffer(ctx: Ctx, seat: number, count: number): string[] {
  const owned = new Set(ctx.s.players[seat].heirlooms);
  const pool = ctx.reg.heirlooms.list.map((h) => h.id).filter((id) => !owned.has(id));
  return streamShuffle(ctx.s, seatStream('draft', seat), pool).slice(0, count);
}

function enterChandlery(ctx: Ctx): void {
  const { s, reg } = ctx;
  setPhase(ctx, 'chandlery');
  const picks = s.toll.curseReward ? reg.rules.chandlery.picksAfterCurse : reg.rules.chandlery.picks;
  const boonAmount = reg.boons.byId.heirloom?.amount ?? 2;
  const offers: Array<{ seat: number; cards: string[] }> = [];
  for (const player of seatsInPlay(s)) {
    const offer = draftOffer(ctx, player.seat);
    player.chandlery = {
      offer,
      picksLeft: picks,
      picked: [],
      skipped: false,
      heirloomOffer: s.config.boons ? heirloomOffer(ctx, player.seat, boonAmount) : [],
      boonDone: !s.config.boons,
      boonPicked: null,
    };
    offers.push({ seat: player.seat, cards: offer });
  }
  s.toll.curseReward = false;
  emit(ctx, { type: 'chandlery_opened', offers });
}
