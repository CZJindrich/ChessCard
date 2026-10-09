/**
 * The Chandlery's facts and words (GDD §13.6, §15.1.8): the Night summary (kills, Dread or Glory
 * change, Candles standing, the next site), the synergy tags of an offered card and how many of
 * the deck's cards share each one, and the sigils drawn for Heirlooms and Boons. Pure.
 */
import { applyAction, pendingAutomation } from '../../engine';
import type { Action, BoonDef, CardDef, CardInstance, ContentRegistry, EffectOp, GameState, PlayerState } from '../../engine/types';
import { siteName } from './model';

// =============================================================================================
// Night summary
// =============================================================================================

export interface NightSummary {
  night: number;
  kills: number;
  /** Vigil: Dread change over the Night (Dawn recovery included). */
  dreadChange: number | null;
  dread: number | null;
  dreadMax: number | null;
  /** Last Flame: this seat's Glory change. */
  gloryChange: number | null;
  candlesStanding: number | null;
  nextSite: string | null;
}

function kills(players: readonly Pick<PlayerState, 'stats'>[]): number {
  return players.reduce((sum, p) => sum + p.stats.kills, 0);
}

/** Candles still lit: the Dawn event's count if the state has one, else the candles on the board. */
function candlesLit(s: GameState): number | null {
  if (s.config.mode !== 'vigil') return null;
  return Object.values(s.pieces).filter((p) => p.kind === 'candle' && p.hp > 0).length;
}

export function nightSummary(s: GameState, reg: ContentRegistry, seat: number | null): NightSummary {
  const start = s.nightSnapshot;
  const vigil = s.vigil;
  const startPlayer = seat !== null ? start?.players[seat] : undefined;
  const player = seat !== null ? s.players[seat] : undefined;
  return {
    night: s.night,
    kills: kills(s.players) - (start ? kills(start.players) : 0),
    dreadChange: vigil ? vigil.dread - (start?.vigil?.dread ?? vigil.dread) : null,
    dread: vigil?.dread ?? null,
    dreadMax: vigil?.dreadMax ?? null,
    gloryChange: s.config.mode === 'last_flame' && player ? player.glory - (startPlayer?.glory ?? 0) : null,
    candlesStanding: candlesLit(s),
    nextSite: nextSiteName(s, reg),
  };
}

function finishChoices(s: GameState): Action[] {
  const out: Action[] = [];
  for (const p of s.players) {
    if (!p.chandlery) continue;
    if (p.chandlery.picksLeft > 0) out.push({ type: 'skip_pick', seat: p.seat });
    if (!p.chandlery.boonDone && s.config.boons) out.push({ type: 'boon_pick', seat: p.seat, boon: null, args: {} });
  }
  return out;
}

/**
 * The next Night's site. The site comes from the `map` stream, which the draft never touches, so
 * finishing every seat's choices on a copy and stepping into the next night_setup shows it.
 */
export function nextSiteName(s: GameState, reg: ContentRegistry): string | null {
  if (s.phase !== 'chandlery') return null;
  let state = s;
  for (const action of finishChoices(s)) {
    const result = applyAction(state, action);
    if (result.ok) state = result.state;
  }
  for (let i = 0; i < 4 && state.phase === 'chandlery' && pendingAutomation(state); i++) {
    const result = applyAction(state, { type: 'advance' });
    if (!result.ok) return null;
    state = result.state;
  }
  return state.night > s.night ? siteName(state, reg) : null;
}

// =============================================================================================
// Synergy tags
// =============================================================================================

const OP_TAGS: Partial<Record<EffectOp['op'], string>> = {
  damage: 'Damage',
  heal: 'Healing',
  ward: 'Ward',
  push: 'Push & pull',
  pull: 'Push & pull',
  daze: 'Daze',
  burn: 'Burn',
  summon: 'Summons',
  extra_move: 'Extra actions',
  extra_strike: 'Extra actions',
  swap: 'Repositioning',
  teleport: 'Repositioning',
  reverse_intent: 'Turn attacks',
  remove_plume: 'Plumes',
  relight: 'Relight',
  transform: 'Transform',
  attach_charm: 'Charm',
};

function effectsOf(def: CardDef): EffectOp[] {
  return [...def.effects, ...(def.modes?.flatMap((m) => m.effects) ?? [])];
}

/** The tags of a card: its type, what its effects do, its unit, and Lanterns for Lampwright engines. */
export function cardTags(def: CardDef, reg: ContentRegistry): string[] {
  const tags = new Set<string>();
  for (const op of effectsOf(def)) {
    const tag = OP_TAGS[op.op];
    if (tag) tags.add(tag);
    if (op.op === 'custom' && op.id === 'lantern_volley') tags.add('Lanterns');
  }
  if (def.target.allowPlume) tags.add('Plumes');
  if (def.unit) {
    tags.add('Summons');
    const unit = reg.units.byId[def.unit];
    if (unit?.structure) tags.add('Structures');
    if (def.unit === 'lantern' || def.unit === 'wick_mortar') tags.add('Lanterns');
    if (def.unit === 'velvet_moth') tags.add('Moths');
  }
  if (def.id === 'swarm_of_wings' || def.id === 'loose_a_moth' || def.id === 'moonlit_hex') tags.add('Moths');
  if (def.type === 'charm') tags.add('Charm');
  return [...tags];
}

export interface SynergyTag {
  tag: string;
  /** Cards in the deck (all piles) sharing this tag. */
  inDeck: number;
}

export function synergy(def: CardDef, deck: readonly CardInstance[], reg: ContentRegistry): SynergyTag[] {
  const deckTags = deck.map((card) => {
    const d = reg.cards.byId[card.id];
    return d ? cardTags(d, reg) : [];
  });
  return cardTags(def, reg)
    .map((tag) => ({ tag, inDeck: deckTags.filter((tags) => tags.includes(tag)).length }))
    .sort((a, b) => b.inDeck - a.inDeck || a.tag.localeCompare(b.tag));
}

export function ownedCards(p: PlayerState): CardInstance[] {
  return [...p.deck, ...p.discard, ...p.hand];
}

// =============================================================================================
// Sigils for Heirlooms and Boons (the art library has no dedicated drawings)
// =============================================================================================

export const HEIRLOOM_SIGILS: Readonly<Record<string, string[]>> = {
  ever_burning_wick: ['wick', 'flame'],
  brass_thimble: ['shield', 'heart'],
  lamplighters_hook: ['lantern', 'arrow'],
  moth_velvet_cloak: ['moth', 'wing'],
  candlemakers_mold: ['candle', 'seal'],
  bell_of_saint_tallow: ['bell', 'star'],
};

export const BOON_SIGILS: Readonly<Record<BoonDef['id'], string[]>> = {
  heirloom: ['key', 'crown'],
  temper: ['flame', 'seal'],
  prune: ['blade', 'spark'],
};
