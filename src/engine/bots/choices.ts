/**
 * Bot decisions outside a seat turn (GDD §12.5 "fixed heuristics per level"). A human seat that
 * timed out gets the defaults of §11.4: Ready with the default tiles, the Blessing, the default
 * carry-over, the Apprentice's draft pick, no Boon.
 *
 * | Decision   | Apprentice                | Warden                                  | Elder                                  |
 * |------------|---------------------------|-----------------------------------------|----------------------------------------|
 * | deploy     | default tiles             | hero by its Candle (Last Flame: toward the centre), units beside it | same      |
 * | Toll       | the Blessing              | a mild Curse (severity 1) over a weak Blessing | Curse when its extra pick outweighs the gap |
 * | carry-over | default (highest HP)      | most valuable units                     | same                                   |
 * | draft      | the cheapest card         | value + class synergy + Flame curve     | same, deck-aware, skips weak picks     |
 * | Boon       | the first Heirloom offered | best of Heirloom / Temper / Prune      | same, deck-aware values                |
 * | Haunt      | the Glory leader's hero, from the closest legal tile (all levels)                                     |
 *
 * Retry and Concede votes need no answer: the engine counts AI allies as agreeing (votes.ts).
 */
import { getContent } from '../content';
import { chebyshev, compareReadingOrder } from '../geometry';
import { botHauntTile } from '../modes/haunt';
import { validateAction } from '../reducer';
import { canDeployTo } from '../setup';
import { heroOf, pieceAt, pieceList, plumeAt, unitsOf } from '../state';
import { unitWorth } from './evaluate';
import type { Action, BotLevel, BoonArgs, CardInstance, ContentRegistry, GameState, PlayerState, Pos } from '../types';

/** Card worth for drafting and tempering (hand-tuned; 1 = filler, 6 = a game changer). */
export const CARD_VALUE: Readonly<Record<string, number>> = {
  spark: 3,
  light_a_taper: 3,
  mend_the_wick: 2,
  quickwick: 2,
  beeswax_seal: 3,
  saddle_the_wickhorse: 4,
  ordain_an_acolyte: 3,
  flare: 5,
  rally_the_captain: 5,
  turnabout: 5,
  kindle_hope: 4,
  dawnbreak: 4,
  shield_bash: 5,
  waxen_ward: 3,
  call_the_squire: 4,
  sunshield_charge: 5,
  muster_the_ram: 5,
  oath_of_tallow: 5,
  aegis_of_dawn: 4,
  loose_a_moth: 3,
  velvet_pull: 4,
  moth_dust: 5,
  cocoon: 2,
  spin_the_silk: 4,
  moonlit_hex: 6,
  swarm_of_wings: 4,
  tinder_bolt: 5,
  hang_a_lantern: 5,
  trim_the_wicks: 3,
  prime_the_mortar: 5,
  lens_of_brass: 4,
  stoke_the_golem: 4,
  grand_illumination: 5,
  strike_a_cinder: 3,
  feint: 3,
  searing_edge: 4,
  hire_a_twinwick: 4,
  ember_waltz: 3,
  riposte: 3,
  crimson_finale: 5,
};

const BLESSING_VALUE: Readonly<Record<string, number>> = {
  candlemas_blessing: 3,
  lucky_wick: 2.5,
  hearthwind: 3,
  peddler_of_wicks: 4,
  moth_migration: 3,
};

const CURSE_SEVERITY: Readonly<Record<string, number>> = {
  soot_fog: 3,
  bell_of_embers: 3.5,
  waxen_rain: 2.5,
  ill_omen: 1,
  crumbling_nave: 1,
  restless_soot: 4,
  shifting_chimneys: 1,
  muffled_nave: 2,
  black_sun: 4.5,
};

/** Worth of the Curse reward (an extra draft pick at the next Chandlery). */
const CURSE_REWARD = 3;

const HEIRLOOM_VALUE: Readonly<Record<string, number>> = {
  brass_thimble: 5,
  ever_burning_wick: 4.5,
  bell_of_saint_tallow: 4,
  lamplighters_hook: 3.5,
  candlemakers_mold: 3,
  moth_velvet_cloak: 3,
};

function legal(s: GameState, action: Action, reg: ContentRegistry): Action | null {
  return validateAction(s, action, reg).ok ? action : null;
}

function cardValue(id: string): number {
  return CARD_VALUE[id] ?? 3;
}

function ownedCards(p: PlayerState): CardInstance[] {
  return [...p.deck, ...p.hand, ...p.discard];
}

// =============================================================================================
// Deploy (night_setup)
// =============================================================================================

/** Where each of the seat's pieces should stand (own pieces ignored, so the layout is stable). */
function deployLayout(s: GameState, seat: number): Map<string, Pos> {
  const layout = new Map<string, Pos>();
  const taken = new Set<string>();
  const free = (p: Pos) => {
    const occupant = pieceAt(s, p);
    return canDeployTo(s, seat, p) && (!occupant || occupant.owner === seat) && !taken.has(`${p.x},${p.y}`);
  };
  const tiles: Pos[] = [];
  for (let y = s.board.h - 1; y >= 0; y--) for (let x = 0; x < s.board.w; x++) tiles.push({ x, y });
  const pick = (score: (p: Pos) => number): Pos | null => {
    let best: Pos | null = null;
    let bestScore = Infinity;
    for (const t of tiles) {
      if (!free(t)) continue;
      const v = score(t);
      if (v < bestScore || (v === bestScore && best && compareReadingOrder(t, best) < 0)) {
        best = t;
        bestScore = v;
      }
    }
    if (best) taken.add(`${best.x},${best.y}`);
    return best;
  };
  const hero = heroOf(s, seat);
  if (!hero) return layout;
  const anchor = deployAnchor(s, seat);
  const heroTile = pick((t) => chebyshev(t, anchor) * 2 + Math.abs(t.x - anchor.x) * 0.1);
  if (heroTile) layout.set(hero.id, heroTile);
  const near = heroTile ?? hero.pos;
  for (const unit of unitsOf(s, seat).sort((a, b) => a.summonOrder - b.summonOrder)) {
    const tile = pick((t) => chebyshev(t, near) * 2 + chebyshev(t, anchor));
    if (tile) layout.set(unit.id, tile);
  }
  return layout;
}

/** What a seat deploys toward: its Vigil Candle (by seat), or the board centre in Last Flame. */
function deployAnchor(s: GameState, seat: number): Pos {
  if (s.config.mode === 'last_flame') return { x: s.board.w / 2 - 0.5, y: s.board.h / 2 - 0.5 };
  const candles = pieceList(s)
    .filter((p) => p.kind === 'candle')
    .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
  const candle = candles[seat % Math.max(1, candles.length)];
  return candle ? candle.pos : { x: s.board.w / 2, y: s.board.h / 2 };
}

function deployChoice(s: GameState, seat: number, reg: ContentRegistry): Action | null {
  for (const [pieceId, to] of deployLayout(s, seat)) {
    const piece = s.pieces[pieceId];
    if (!piece || (piece.pos.x === to.x && piece.pos.y === to.y) || plumeAt(s, to)) continue;
    const action = legal(s, { type: 'deploy', seat, pieceId, to }, reg);
    if (action) return action;
  }
  return null;
}

// =============================================================================================
// Toll, carry-over
// =============================================================================================

function tollChoice(s: GameState, seat: number, level: BotLevel | null): string | null {
  const offer = s.toll.offer;
  if (!offer) return null;
  const blessing = (BLESSING_VALUE[offer.blessing] ?? 3) + (offer.blessing === 'moth_migration' && s.players[seat].hero === 'moth_witch' ? 1 : 0);
  const severity = CURSE_SEVERITY[offer.curse] ?? 3;
  if (level === 'bot_warden' && severity <= 1 && blessing <= 2.5) return offer.curse;
  if (level === 'bot_elder' && CURSE_REWARD - severity >= blessing - 1) return offer.curse;
  return offer.blessing;
}

function carryOverChoice(s: GameState, seat: number, level: BotLevel | null, reg: ContentRegistry): string[] | null {
  const carry = s.players[seat].carryOver;
  if (!carry || carry.chosen !== null) return null;
  if (level === null || level === 'bot_apprentice') return carry.defaults;
  return unitsOf(s, seat)
    .sort((a, b) => unitWorth(b) - unitWorth(a) || b.summonOrder - a.summonOrder)
    .slice(0, reg.rules.carryOverMax)
    .map((p) => p.id);
}

// =============================================================================================
// Chandlery: draft and Boon
// =============================================================================================

function draftScore(s: GameState, seat: number, cardId: string, level: BotLevel, reg: ContentRegistry): number {
  const def = reg.cards.byId[cardId];
  if (!def) return 0;
  const player = s.players[seat];
  let score = cardValue(cardId) + (def.class === player.hero ? 0.5 : 0);
  if (def.cost >= 4) score -= 1;
  if (level === 'bot_elder') {
    const cards = ownedCards(player).map((c) => reg.cards.byId[c.id]).filter((d) => d !== undefined);
    const heavy = cards.filter((d) => d.cost >= 3).length;
    const summons = cards.filter((d) => d.type === 'summon').length;
    if (def.cost >= 3 && heavy >= 3) score -= 1;
    if (def.type === 'summon' && summons >= s.config.unit_limit + 3) score -= 1;
    if (def.type !== 'summon' && summons <= 2) score += 0.5;
  }
  return score;
}

/** The draft pick (null = skip): Apprentice the cheapest card, the others the best score. */
function draftChoice(s: GameState, seat: number, level: BotLevel | null, reg: ContentRegistry): string | null {
  const ch = s.players[seat].chandlery;
  if (!ch) return null;
  const open = ch.offer.filter((id) => !ch.picked.includes(id));
  if (open.length === 0) return null;
  if (level === null || level === 'bot_apprentice') {
    return open.reduce((best, id) => ((reg.cards.byId[id]?.cost ?? 9) < (reg.cards.byId[best]?.cost ?? 9) ? id : best));
  }
  const scored = open.map((id) => ({ id, score: draftScore(s, seat, id, level, reg) })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return level === 'bot_elder' && best.score < 3 ? null : best.id;
}

interface BoonOption {
  boon: 'heirloom' | 'temper' | 'prune';
  args: BoonArgs;
  value: number;
}

function heirloomValue(s: GameState, seat: number, id: string, reg: ContentRegistry): number {
  const player = s.players[seat];
  const heroDef = reg.heroes.byId[player.hero];
  let value = HEIRLOOM_VALUE[id] ?? 3;
  if (id === 'moth_velvet_cloak' && heroDef?.move.type === 'leap') value = 0;
  if (id === 'candlemakers_mold') value += 0.3 * ownedCards(player).filter((c) => reg.cards.byId[c.id]?.type === 'summon').length - 1;
  return value;
}

function boonOptions(s: GameState, seat: number, level: BotLevel, reg: ContentRegistry): BoonOption[] {
  const player = s.players[seat];
  const ch = player.chandlery;
  const out: BoonOption[] = [];
  for (const id of ch?.heirloomOffer ?? []) out.push({ boon: 'heirloom', args: { heirloomId: id }, value: heirloomValue(s, seat, id, reg) });
  const owned = ownedCards(player);
  const temperable = owned.filter((c) => !c.tempered && (reg.cards.byId[c.id]?.cost ?? 0) >= 1).sort((a, b) => cardValue(b.id) - cardValue(a.id) || (reg.cards.byId[b.id]?.cost ?? 0) - (reg.cards.byId[a.id]?.cost ?? 0));
  if (temperable[0]) out.push({ boon: 'temper', args: { cardUid: temperable[0].uid }, value: 2 + 0.4 * cardValue(temperable[0].id) });
  const room = Math.min(reg.boons.byId.prune?.amount ?? 2, owned.length - reg.rules.deckMin);
  const weak = owned.filter((c) => cardValue(c.id) <= (level === 'bot_elder' ? 3 : 2)).sort((a, b) => cardValue(a.id) - cardValue(b.id)).slice(0, Math.max(0, room));
  if (weak.length > 0) out.push({ boon: 'prune', args: { cardUids: weak.map((c) => c.uid) }, value: weak.reduce((sum, c) => sum + (4 - cardValue(c.id)), 0) * 0.9 });
  return out;
}

function boonChoice(s: GameState, seat: number, level: BotLevel | null, reg: ContentRegistry): Action {
  const none: Action = { type: 'boon_pick', seat, boon: null, args: {} };
  if (level === null) return none;
  const offer = s.players[seat].chandlery?.heirloomOffer ?? [];
  if (level === 'bot_apprentice') return offer[0] ? { type: 'boon_pick', seat, boon: 'heirloom', args: { heirloomId: offer[0] } } : none;
  const best = boonOptions(s, seat, level, reg).sort((a, b) => b.value - a.value)[0];
  return best ? { type: 'boon_pick', seat, boon: best.boon, args: best.args } : none;
}

function chandleryChoice(s: GameState, seat: number, level: BotLevel | null, reg: ContentRegistry): Action | null {
  const ch = s.players[seat].chandlery;
  if (!ch) return null;
  if (ch.picksLeft > 0) {
    const card = draftChoice(s, seat, level, reg);
    return legal(s, card ? { type: 'draft_pick', seat, cardId: card } : { type: 'skip_pick', seat }, reg);
  }
  if (ch.boonDone) return null;
  return legal(s, boonChoice(s, seat, level, reg), reg) ?? legal(s, { type: 'boon_pick', seat, boon: null, args: {} }, reg);
}

// =============================================================================================
// Entry point
// =============================================================================================

/** The level whose heuristics decide for a seat (null: a human seat's timeout defaults). */
function levelOf(player: PlayerState): BotLevel | null {
  return player.kind === 'human' ? null : player.kind;
}

/**
 * A bot's next non-turn decision: Haunt, deploy / Ready, Toll, carry-over, draft and Boon
 * (null when the seat owes nothing now). Deploys come one piece at a time, then Ready.
 */
export function botChoice(s: GameState, seat: number, reg: ContentRegistry = getContent()): Action | null {
  const player = s.players[seat];
  if (!player || s.result) return null;
  const level = levelOf(player);
  if (player.haunt.pending) return legal(s, { type: 'haunt', seat, at: botHauntTile(s, seat, reg) }, reg);
  switch (s.phase) {
    case 'night_setup': {
      if (player.ready || player.eliminated) return null;
      const deploy = level === null || level === 'bot_apprentice' ? null : deployChoice(s, seat, reg);
      return deploy ?? legal(s, { type: 'ready', seat }, reg);
    }
    case 'toll': {
      if (s.toll.chooser !== seat) return null;
      const toll = tollChoice(s, seat, level);
      return toll ? legal(s, { type: 'choose_toll', seat, tollId: toll }, reg) : null;
    }
    case 'dawn': {
      const keep = carryOverChoice(s, seat, level, reg);
      return keep ? legal(s, { type: 'carry_over', seat, keep }, reg) : null;
    }
    case 'chandlery':
      return chandleryChoice(s, seat, level, reg);
    default:
      return null;
  }
}
