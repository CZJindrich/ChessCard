/**
 * Game creation and Night setup (GDD §3.3, §4.2 night_setup, §13.3): seats, heroes and Houses,
 * starting decks, the Night's site, Candles, hero deployment, starting enemies and Plumes,
 * full deck shuffles and opening hands, and the Retry snapshot.
 */
import { boardSizeFor, gloamSchedule, tierForNight } from '../config/resolve';
import { spawnBoss } from './bosses';
import { contentHash, getContent } from './content';
import { drawUpTo, shuffleInFull, starterDeck } from './decks';
import { chebyshev, quadrantOf, rectContains, sq } from './geometry';
import { addLog, pieceAtText } from './log';
import { refreshGloamBell } from './modes/gloam';
import { requestHaunts } from './modes/haunt';
import { emptyGloryBreakdown, neutralEnemyCount, neutralPlumeCount, truceForNight } from './modes/lastFlame';
import { captureNightSnapshot } from './modes/vigil';
import { initStreams, standardStreamNames, streamPick } from './rng';
import { buildSite, LATER_NIGHT_SITES, GENERATED_SITES } from './sites';
import type { SiteLayout } from './sites';
import {
  createPlume,
  drawTierEnemy,
  isLegalPlumeTile,
  legalPlumeTiles,
  placeInitialEnemies,
  placePlumes,
  vigilPlumeCount,
  belchAll,
} from './snuff';
import { createCandle, createHeroPiece, placeNear, spawnEnemy, summonTileTest } from './spawn';
import { clearUndo, emit, heroOf, makeCtx, pieceList, plumeAt, removePiece, ruleDelta, tileAt } from './state';
import type { Ctx } from './state';
import { stackOpeningHand, tutorialConfig } from './tutorial';
import { STATE_VERSION } from './types';
import type {
  ContentRegistry,
  GameConfig,
  GameState,
  HouseId,
  PlayerState,
  PlayerStats,
  PlayerTurnState,
  Pos,
  Tier,
} from './types';

// =============================================================================================
// Players and heroes
// =============================================================================================

export function freshTurnState(reg: ContentRegistry): PlayerTurnState {
  return {
    cardsPlayed: 0,
    powerUsed: false,
    summonsThisTurn: 0,
    heroDmgBonus: 0,
    heroBurn: false,
    flourishCap: reg.rules.flourishPerTurn,
    flourishUsed: 0,
    cardLimit: null,
  };
}

function zeroStats(): PlayerStats {
  return {
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    plumesBlocked: 0,
    plumesPopped: 0,
    cardsPlayed: 0,
    summons: 0,
    heroFalls: 0,
    bossDamage: 0,
    shrinesLit: 0,
  };
}

function checkConfig(config: GameConfig, reg: ContentRegistry): void {
  const seats = config.seats.length;
  const [min, max] = config.mode === 'vigil' ? [1, 4] : [2, 4];
  if (seats < min || seats > max) throw new Error(`${config.mode} needs ${min}-${max} seats, got ${seats}`);
  if (config.nights < 2) throw new Error('a game needs at least 2 Nights');
  const given = config.seats.map((s) => s.hero).filter((h): h is string => h !== null);
  for (const hero of given) if (!reg.heroes.byId[hero]) throw new Error(`unknown hero "${hero}"`);
  if (new Set(given).size !== given.length) throw new Error('heroes must be unique');
}

/** Given heroes stay; empty seats draw a random unpicked hero from the `setup` stream (§3.3). */
function assignHeroes(s: GameState, reg: ContentRegistry, config: GameConfig): string[] {
  const taken = new Set(config.seats.map((seat) => seat.hero).filter((h): h is string => h !== null));
  return config.seats.map((seat) => {
    if (seat.hero !== null) return seat.hero;
    const pool = reg.heroes.list.map((h) => h.id).filter((id) => !taken.has(id));
    const hero = streamPick(s, 'setup', pool);
    taken.add(hero);
    return hero;
  });
}

function houseForSeat(reg: ContentRegistry, seat: number): HouseId {
  const house = reg.houses.list.find((h) => h.seat === seat + 1);
  if (!house) throw new Error(`no House for seat ${seat + 1}`);
  return house.id;
}

function emptyState(config: GameConfig, reg: ContentRegistry): GameState {
  const seats = config.seats.length;
  const size = boardSizeFor(config, reg.rules);
  return {
    version: STATE_VERSION,
    contentHash: contentHash(reg),
    config: JSON.parse(JSON.stringify(config)) as GameConfig,
    seed: config.seed,
    rng: initStreams(config.seed, standardStreamNames(seats)),
    nextId: 1,
    phase: 'night_setup',
    night: 0,
    round: 0,
    roundsThisNight: null,
    tier: 1,
    siteId: '',
    isBossNight: false,
    usedSites: [],
    board: { w: 0, h: 0, tiles: [], zones: { deploy: [], snuff: [], plume: [], candleSlots: [] } },
    pieces: {},
    plumes: [],
    intents: [],
    players: [],
    activeSeat: null,
    claimQueue: [],
    firstLight: 0,
    boss: null,
    vigil:
      config.mode === 'vigil'
        ? { dread: config.starting_dread, dreadMax: config.dread_max, retries: 0, retryVotes: [], concedeVotes: [], candlesSnuffed: 0 }
        : null,
    lastFlame:
      config.mode === 'last_flame' && size !== '8x8'
        ? {
            gloam: {
              closingsDone: 0,
              total: reg.rules.gloam.closings[size],
              schedule: gloamSchedule(size, config.nights, config.turns_per_night, reg.rules),
              warningRing: null,
              roundsToNext: null,
            },
            truce: truceForNight(config, 1),
            leader: null,
            bountiesPaid: [],
            nextBand: 1,
            bossRounds: config.boss_rounds,
            gloryBySeat: config.seats.map(() => emptyGloryBreakdown()),
            tallyPaused: false,
            creditClock: 0,
          }
        : null,
    toll: { offer: null, chooser: null, active: null, curseReward: false, history: [] },
    omen: { face: null, omenId: null },
    activeRules: [],
    undo: { frames: [], depth: 0 },
    nightSnapshot: null,
    tutorial: null,
    stats: { retries: 0, roundsPlayed: 0, candlesSnuffed: 0, candlesSaved: 0, nightsCompleted: 0, dreadPeak: config.starting_dread, pieces: {} },
    log: [],
    result: null,
  };
}

function createPlayers(s: GameState, reg: ContentRegistry): void {
  const heroes = assignHeroes(s, reg, s.config);
  s.players = s.config.seats.map(
    (seat, i): PlayerState => ({
      seat: i,
      kind: seat.kind,
      name: seat.name,
      remote: seat.remote ?? false,
      hero: heroes[i],
      house: houseForSeat(reg, i),
      heroPieceId: '',
      startTile: null,
      deck: starterDeck(s, reg, heroes[i]),
      hand: [],
      discard: [],
      flame: 0,
      heirlooms: [],
      glory: 0,
      eliminated: false,
      eliminationBand: null,
      turnEnded: false,
      ready: false,
      bellUsedThisNight: false,
      turn: freshTurnState(reg),
      chandlery: null,
      carryOver: null,
      haunt: { lastHeroId: null, pending: false },
      stats: zeroStats(),
    }),
  );
  for (const player of s.players) player.heroPieceId = createHeroPiece(s, reg, player.seat, player.hero, { x: 0, y: 0 }).id;
}

/**
 * Build the initial state from a resolved config (seed already concrete) and enter Night 1's
 * night_setup. Throws on an invalid config (validate with config/resolve first).
 */
export function createGame(given: GameConfig, opts: { content?: ContentRegistry } = {}): GameState {
  const reg = opts.content ?? getContent();
  const config = tutorialConfig(given);
  checkConfig(config, reg);
  const s = emptyState(config, reg);
  createPlayers(s, reg);
  if (config.tutorial) s.tutorial = { heroId: s.players[0].hero, step: 0, scripted: true, skipped: false };
  enterNightSetup(makeCtx(s, reg));
  return s;
}

// =============================================================================================
// Night setup
// =============================================================================================

function nightTier(s: GameState): Tier {
  return s.isBossNight ? 3 : tierForNight(s.night, s.config.nights - 1);
}

/** Night order (§13.3.1). */
function siteForNight(s: GameState): string {
  if (s.config.mode === 'last_flame') return 'last_flame_ring';
  if (s.isBossNight) return 'hollow_nave';
  if (s.config.firstGame && s.night === 1) return 'first_vigil';
  if (s.night === 1 || (s.config.firstGame && s.night === 2)) return 'cathedral_of_tallow';
  const unused = LATER_NIGHT_SITES.filter((id) => !s.usedSites.includes(id));
  return streamPick(s, 'map', unused.length > 0 ? unused : GENERATED_SITES);
}

/** Snuff, Plumes, intents and Candles never outlive a Night. */
function clearNight(s: GameState): void {
  for (const p of pieceList(s)) if (p.side === 'snuff' || p.kind === 'candle') removePiece(s, p.id);
  s.plumes = [];
  s.intents = [];
}

function inDeployZone(s: GameState, p: Pos): boolean {
  return s.board.zones.deploy.some((r) => rectContains(r, p));
}

/** Vigil: heroes on their default starts, kept units next to their hero inside the deploy zone. */
function deployVigil(ctx: Ctx, layout: SiteLayout): void {
  const { s, reg } = ctx;
  const opening = s.tutorial ? reg.maps.byId.first_vigil?.tutorial?.[s.tutorial.heroId] : undefined;
  for (const player of s.players) {
    const hero = heroOf(s, player.seat);
    if (!hero) continue;
    const start = player.seat === 0 && opening && s.siteId === 'first_vigil' ? sq(opening.heroStart) : layout.heroStarts[player.seat];
    hero.pos = { ...start };
    player.startTile = { ...start };
  }
  const kept = pieceList(s).filter((p) => p.kind === 'unit');
  for (const unit of kept) unit.pos = { x: -1, y: -1 };
  for (const unit of kept.sort((a, b) => a.summonOrder - b.summonOrder)) {
    const hero = unit.owner !== null ? heroOf(s, unit.owner) : null;
    const legal = summonTileTest(s);
    const pos = hero ? placeNear(s, hero.pos, null, (p) => inDeployZone(s, p) && legal(p)) : null;
    if (pos) unit.pos = pos;
    else removePiece(s, unit.id);
  }
}

/** Last Flame Night 1: heroes on their seat start tiles. Later Nights keep every piece in place. */
function deployLastFlame(s: GameState, layout: SiteLayout): void {
  for (const player of s.players) {
    const hero = heroOf(s, player.seat);
    if (!hero) continue;
    hero.pos = { ...layout.heroStarts[player.seat] };
    player.startTile = { ...layout.heroStarts[player.seat] };
  }
}

function resetPiecesForNight(s: GameState): void {
  for (const p of pieceList(s)) {
    p.exhausted = false;
    p.movesLeft = 0;
    p.strikesLeft = 0;
    p.lastDisplacedBy = null;
    p.pendingRelight = false;
    p.smolderedAtPlayersEnd = false;
    p.buffs = { atk: 0, range: 0 };
  }
}

function initialEnemyCount(s: GameState): number {
  if (s.config.mode === 'last_flame') return neutralEnemyCount(s);
  const p = s.players.length;
  if (s.isBossNight) return Math.max(0, p + s.config.initial_enemies_mod);
  return Math.max(1, p + s.tier + s.config.initial_enemies_mod);
}

/** first_vigil starts with the two scripted Sootlings of seat 1's hero (§15.2). */
function placeScriptedSootlings(ctx: Ctx): void {
  const { s, reg } = ctx;
  const tutorial = reg.maps.byId.first_vigil?.tutorial ?? {};
  const opening = tutorial[s.players[0].hero] ?? Object.values(tutorial)[0];
  if (!opening) return;
  for (const sootling of opening.sootlings) spawnEnemy(ctx, 'sootling', sq(sootling.at), 'setup');
}

/** Snuff are placed this game: always in Vigil; in Last Flame unless `neutrals` is off. */
function neutralsOn(s: GameState): boolean {
  return s.config.mode === 'vigil' || s.config.neutrals !== 'off';
}

/** The central 4×4 (Last Flame neutrals and its extra Smokestack). */
function inCentre(s: GameState, p: Pos): boolean {
  const lo = s.board.w / 2 - 2;
  return p.x >= lo && p.x < lo + 4 && p.y >= lo && p.y < lo + 4;
}

function centreAnchor(s: GameState): Pos {
  return { x: s.board.w / 2 - 1, y: s.board.h / 2 - 1 };
}

function placeLastFlameNeutrals(ctx: Ctx, count: number): void {
  const { s } = ctx;
  for (let i = 0; i < count; i++) {
    const legal = summonTileTest(s);
    const pos = placeNear(s, centreAnchor(s), null, (p) => inCentre(s, p) && legal(p) && tileAt(s, p)?.type !== 'hot_wax');
    if (!pos) return;
    spawnEnemy(ctx, drawTierEnemy(ctx), pos, 'setup');
  }
}

function placeExtraSmokestack(ctx: Ctx, starts: readonly Pos[]): void {
  const { s, reg } = ctx;
  let pos: Pos | null;
  if (s.config.mode === 'last_flame') {
    const legal = summonTileTest(s);
    pos = placeNear(s, centreAnchor(s), null, (p) => inCentre(s, p) && legal(p));
  } else {
    const min = reg.rules.siteGeneration.enemyMinHeroDistance;
    const tiles = legalPlumeTiles(s, reg).filter((p) => tileAt(s, p)?.type === 'flagstone' && starts.every((h) => chebyshev(h, p) > min));
    pos = tiles.length > 0 ? streamPick(s, 'spawn', tiles) : null;
  }
  if (pos) addLog(ctx, `${pieceAtText(reg, spawnEnemy(ctx, 'smokestack', pos, 'setup'))} looms over the Night.`);
}

/**
 * One Plume placement (§4.4): first_vigil uses its script; Vigil places the regular count in the
 * Plume zone; Last Flame goes round-robin by quadrant from the First Light holder's start
 * quadrant. Smokestacks then Belch. `index` = 0 at setup, n at Tally n.
 */
export function plumePlacement(ctx: Ctx, index: number): void {
  const { s, reg } = ctx;
  if (s.siteId === 'first_vigil') {
    const scripted = reg.maps.byId.first_vigil?.layouts[0].plumes ?? [];
    for (const plume of scripted.filter((p) => p.tally === index)) {
      const at = sq(plume.at);
      const pos = isLegalPlumeTile(s, reg, at) ? at : placeNear(s, at, reg.rules.placementMaxDistance, (p) => isLegalPlumeTile(s, reg, p));
      if (pos) createPlume(ctx, pos, plume.enemy, 'script');
    }
  } else if (s.config.mode === 'vigil') {
    placePlumes(ctx, { count: vigilPlumeCount(s), source: 'schedule' });
  } else {
    placeLastFlamePlumes(ctx);
  }
  belchAll(ctx);
}

/**
 * Neutral Plumes (§13.2.5): Plume i goes to quadrant (holder's start quadrant + i), clockwise;
 * a quadrant without a legal tile passes it on to the next one (all four empty: it is skipped).
 */
function placeLastFlamePlumes(ctx: Ctx): void {
  const { s, reg } = ctx;
  const count = neutralPlumeCount(s, ruleDelta(s, 'plumes_per_placement', null));
  const holder = s.players[s.firstLight];
  const start = holder?.startTile ? quadrantOf(holder.startTile, s.board.w, s.board.h) : 0;
  for (let i = 0; i < count; i++) {
    const quadrants = [0, 1, 2, 3].map((k) => (start + i + k) % 4);
    const quadrant = quadrants.find((q) => legalPlumeTiles(s, reg, { quadrant: q }).length > 0) ?? quadrants[0];
    placePlumes(ctx, { count: 1, source: 'schedule', quadrant });
  }
}

/** Enter a Night's night_setup (Night 1 from createGame, later Nights after the Chandlery). */
export function enterNightSetup(ctx: Ctx): void {
  const { s, reg } = ctx;
  s.night += 1;
  s.round = 0;
  s.isBossNight = s.night === s.config.nights;
  s.tier = nightTier(s);
  s.roundsThisNight = s.isBossNight ? (s.config.mode === 'vigil' ? null : s.config.boss_rounds) : s.config.turns_per_night;
  s.activeSeat = null;
  s.claimQueue = [];
  s.omen = { face: null, omenId: null };
  clearUndo(s);
  if (s.vigil) s.vigil = { ...s.vigil, retryVotes: [], concedeVotes: [] };
  if (s.lastFlame) s.lastFlame.truce = truceForNight(s.config, s.night);
  clearNight(s);

  const keepBoard = s.config.mode === 'last_flame' && s.night > 1;
  const siteId = siteForNight(s);
  s.siteId = siteId;
  s.usedSites.push(siteId);
  const layout = buildSite(s, reg, siteId, boardSizeFor(s.config, reg.rules), s.players.length);
  if (!keepBoard) {
    s.board = { w: layout.w, h: layout.h, tiles: layout.tiles, zones: layout.zones };
    if (s.config.mode === 'vigil') {
      for (const candle of layout.candles) createCandle(s, reg, candle);
      deployVigil(ctx, layout);
    } else {
      deployLastFlame(s, layout);
    }
  }
  resetPiecesForNight(s);
  if (s.isBossNight) spawnBoss(ctx, layout.bossAnchor);
  for (const stack of layout.smokestacks) if (!keepBoard) spawnEnemy(ctx, 'smokestack', stack, 'setup');
  if (!s.isBossNight && s.tier >= 2 && s.config.extra_smokestack && neutralsOn(s)) placeExtraSmokestack(ctx, layout.heroStarts);
  if (siteId === 'first_vigil') placeScriptedSootlings(ctx);
  else if (s.config.mode === 'vigil') placeInitialEnemies(ctx, initialEnemyCount(s), layout.heroStarts);
  else placeLastFlameNeutrals(ctx, initialEnemyCount(s));
  plumePlacement(ctx, 0);
  requestHaunts(ctx);
  refreshGloamBell(s);

  for (const player of s.players) {
    // Every seat readies itself; bot seats deploy and Ready through `botChoice` (bots/choices.ts).
    player.ready = false;
    player.turnEnded = false;
    player.bellUsedThisNight = false;
    player.carryOver = null;
    player.chandlery = null;
    player.flame = 0;
    player.turn = freshTurnState(reg);
    if (player.eliminated) continue;
    shuffleInFull(ctx, player.seat);
    stackOpeningHand(ctx, player.seat);
    drawUpTo(ctx, player.seat, s.config.hand_size);
  }
  s.phase = 'night_setup';
  emit(ctx, { type: 'night_started', night: s.night, siteId, isBossNight: s.isBossNight, tier: s.tier });
  emit(ctx, { type: 'phase_changed', phase: 'night_setup', night: s.night, round: 0 });
  const siteName = reg.sites.byId[siteId]?.name ?? reg.maps.byId[siteId]?.name ?? siteId;
  addLog(ctx, `Night ${s.night} · ${siteName}${s.isBossNight ? ' (Boss Night)' : ''}.`);
  if (s.config.mode === 'vigil') captureNightSnapshot(s);
}

/** Squares of the deploy zone (Vigil) or within 1 of the start tile (Last Flame Night 1). */
export function canDeployTo(s: GameState, seat: number, p: Pos): boolean {
  const tile = tileAt(s, p);
  if (!tile || tile.type === 'pillar' || plumeAt(s, p)) return false;
  if (s.config.mode === 'vigil') return inDeployZone(s, p);
  const start = s.players[seat]?.startTile;
  return s.night === 1 && start !== null && start !== undefined && chebyshev(start, p) <= 1;
}
