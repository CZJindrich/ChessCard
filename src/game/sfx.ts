/**
 * Game events → sound cues (GDD §16.11) and game state → music mood (§16.12). Pure; the
 * controller plays the cues as each event starts. Pitch jitter is cosmetic randomness (B.3).
 */
import { currentThreshold, getContent } from '../engine';
import type { ContentRegistry, GameEvent, GameState, Piece } from '../engine/types';
import type { MusicMood, PlayOptions, SfxName } from '../audio';

export interface SfxCue {
  name: SfxName;
  opts?: PlayOptions;
  /** Play this long after the event starts (ms at 1×; scaled with the event). */
  delay?: number;
}

const TURN_PITCH = [1, 1.12, 1.26, 1.33] as const;

const FIRE_CARDS = new Set(['spark', 'tinder_bolt', 'flare', 'searing_edge', 'strike_a_cinder', 'crimson_finale']);
const NATURE_CARDS = new Set(['velvet_pull', 'moonlit_hex', 'swarm_of_wings', 'loose_a_moth', 'spin_the_silk', 'cocoon']);
const SHADOW_CARDS = new Set(['moth_dust', 'turnabout', 'feint']);
const HOLY_CARDS = new Set(['dawnbreak', 'aegis_of_dawn', 'kindle_hope', 'mend_the_wick', 'waxen_ward', 'beeswax_seal']);

const POWER_SFX: Readonly<Record<string, SfxName>> = {
  lantern_oath: 'shield',
  flutterswap: 'spellNature',
  castle: 'teleport',
  shadowstep: 'teleport',
};

function jitter(spread = 0.05): number {
  return 1 - spread + Math.random() * spread * 2;
}

function cardSpell(cardId: string): SfxName | null {
  if (FIRE_CARDS.has(cardId)) return 'spellFire';
  if (NATURE_CARDS.has(cardId)) return 'spellNature';
  if (SHADOW_CARDS.has(cardId)) return 'spellShadow';
  if (HOLY_CARDS.has(cardId)) return 'spellHoly';
  return null;
}

function moveCue(event: Extract<GameEvent, { type: 'piece_moved' }>): SfxCue[] {
  switch (event.kind) {
    case 'step':
    case 'deploy':
      return [{ name: 'pieceMove' }];
    case 'slide':
    case 'take':
      return [{ name: 'pieceSlide' }];
    case 'leap':
    case 'fly':
      return [{ name: 'pieceLeap' }];
    case 'chimney':
    case 'swap':
    case 'teleport':
    case 'respawn':
      return [{ name: 'teleport' }];
    case 'push':
    case 'pull':
      return [{ name: 'pieceSlide', opts: { volume: 0.7, pitch: 0.85 } }];
    case 'boss_step':
      return [{ name: 'pieceMove', opts: { pitch: 0.6, volume: 1.2 } }];
  }
}

function attackerKind(view: GameState, reg: ContentRegistry, attackerId: string): 'melee' | 'ranged' | 'artillery' {
  const piece: Piece | undefined = view.pieces[attackerId];
  const def = piece ? (reg.enemies.byId[piece.defId] ?? reg.units.byId[piece.defId]) : undefined;
  const kind = def?.attack.kind;
  return kind === 'ranged' || kind === 'artillery' ? kind : 'melee';
}

function strikeCue(event: Extract<GameEvent, { type: 'strike' }>, view: GameState, reg: ContentRegistry): SfxCue[] {
  switch (event.kind) {
    case 'melee':
      return [{ name: 'attackMelee', opts: { pitch: jitter() } }];
    case 'ranged':
      return [{ name: 'attackRanged', opts: { pitch: jitter() } }];
    case 'artillery':
      return [{ name: 'attackRanged', opts: { pitch: 0.8 } }];
    case 'boss': {
      const intent = event.intentId ? view.intents.find((i) => i.id === event.intentId) : undefined;
      const def = intent?.bossIntentId ? reg.bossIntents.byId[intent.bossIntentId] : undefined;
      if (def?.id === 'hunger') return [{ name: 'bossRoar' }];
      if (def?.id === 'sceptre_sweep') return [{ name: 'spellFrost' }];
      if (def?.id === 'silencing_peal') return [{ name: 'spellShadow' }];
      return [{ name: def?.heavy ? 'bossSlam' : 'attackMelee', opts: def?.heavy ? undefined : { pitch: 0.7 } }];
    }
    case 'snuff': {
      const kind = attackerKind(view, reg, event.attackerId);
      if (kind === 'melee') return [{ name: 'attackMelee', opts: { pitch: jitter() * 0.9 } }];
      return [{ name: 'attackRanged', opts: { pitch: kind === 'artillery' ? 0.8 : jitter() * 0.92 } }];
    }
  }
}

function dieLandPitch(face: number): number {
  if (face >= 5) return 1.26;
  if (face >= 3) return 1;
  return 0.71;
}

function phaseCue(event: Extract<GameEvent, { type: 'phase_changed' }>, view: GameState): SfxCue[] {
  const cues: SfxCue[] = [];
  if (event.round > view.round && event.round > 0) cues.push({ name: 'roundStart' });
  if (event.phase === 'snuff_move' || event.phase === 'snuff_strike') cues.push({ name: 'enemyTurn' });
  return cues;
}

/** The cues to play when `event` starts; `view` is the shown state before the event. */
export function cuesForEvent(event: GameEvent, view: GameState, reg: ContentRegistry = getContent()): SfxCue[] {
  switch (event.type) {
    case 'piece_moved':
      return moveCue(event);
    case 'strike':
      return strikeCue(event, view, reg);
    case 'damage':
      if (event.blockedByWard) return [{ name: 'block' }];
      return [{ name: event.lethal ? 'crit' : 'hit' }];
    case 'heal':
      return [{ name: 'heal' }];
    case 'piece_died':
      if (event.kind === 'boss') return [{ name: 'bossDefeated' }];
      return [{ name: 'death', opts: { pitch: event.side === 'snuff' ? 1.3 : 1 } }];
    case 'hero_smoldered':
      return [{ name: 'death', opts: { pitch: 0.85 } }];
    case 'hero_relit':
      return [{ name: 'spellHoly' }];
    case 'status_changed':
      if (!event.active) return [];
      return [{ name: event.status === 'ward' ? 'shield' : 'debuff' }];
    case 'charm_changed':
      return event.cardId ? [{ name: 'buff' }] : [];
    case 'actions_granted':
      return [{ name: 'buff', opts: { volume: 0.7 } }];
    case 'summoned':
      return event.source === 'rise' || event.source === 'setup' ? [] : [{ name: 'summon' }];
    case 'transformed':
      return [{ name: 'spellNature' }];
    case 'card_played': {
      const spell = cardSpell(event.cardId);
      return spell ? [{ name: 'cardPlay' }, { name: spell, delay: 120 }] : [{ name: 'cardPlay' }];
    }
    case 'power_used':
      return [{ name: POWER_SFX[event.powerId] ?? 'buff' }];
    case 'free_action_used':
      return [{ name: event.kind === 'ring_bell' ? 'spellShadow' : 'cardDiscard' }];
    case 'cards_drawn':
      return event.count > 0 ? [{ name: 'cardDraw' }] : [];
    case 'deck_shuffled':
      return [{ name: 'cardShuffle' }];
    case 'cards_discarded':
      return event.count > 0 ? [{ name: 'cardDiscard' }] : [];
    case 'card_drafted':
    case 'boon_picked':
    case 'heirloom_gained':
      return [{ name: 'reward' }];
    case 'omen_rolled':
      return [{ name: 'diceRoll' }, { name: 'diceLand', opts: { pitch: dieLandPitch(event.face) }, delay: 900 }];
    case 'dread_changed':
      if (event.to <= event.from) return [];
      return event.threshold ? [{ name: 'doomTick' }, { name: 'doomSurge', delay: 160 }] : [{ name: 'doomTick' }];
    case 'glory_changed':
      return event.to > event.from ? [{ name: 'coin' }] : [];
    case 'toll_revealed':
      return [{ name: 'eventReveal' }];
    case 'toll_chosen':
      return [{ name: 'uiConfirm' }];
    case 'turn_started':
      return [{ name: 'turnStart', opts: { pitch: TURN_PITCH[event.seat] ?? 1 } }];
    case 'phase_changed':
      return phaseCue(event, view);
    case 'gloam_closed':
      return [{ name: 'zoneClose' }];
    case 'plume_rose':
      return [{ name: 'portalOpen' }];
    case 'plume_blocked':
      return [{ name: 'block', opts: { pitch: 0.8 } }];
    case 'plume_popped':
      return [{ name: 'hit', opts: { pitch: 1.3, volume: 0.7 } }];
    case 'intent_declared':
      return [{ name: 'telegraph' }];
    case 'intent_reversed':
      return [{ name: 'spellShadow', opts: { volume: 0.6 } }];
    case 'shrine_changed':
      return event.lit ? [{ name: 'spellHoly', opts: { volume: 0.7 } }] : [];
    case 'boss_spawned':
      return [{ name: 'bossAppear' }];
    case 'boss_phase':
      return [{ name: 'bossPhase' }];
    case 'checkmate':
      return [{ name: 'bossSlam' }, { name: 'crit', delay: 120 }];
    case 'check':
      return [{ name: 'telegraph', opts: { pitch: 1.2 } }];
    case 'player_eliminated':
      return [{ name: 'playerEliminated' }];
    case 'game_over': {
      const won = event.result.mode === 'vigil' ? event.result.outcome === 'victory' : true;
      return [{ name: won ? 'victory' : 'defeat' }];
    }
    default:
      return [];
  }
}

/** Sounds that still play when an event is skipped instantly (the beat matters even unseen). */
export function isEssentialCue(name: SfxName): boolean {
  return name === 'doomTick' || name === 'doomSurge' || name === 'victory' || name === 'defeat' || name === 'bossPhase';
}

/** The music for a state (§16.12). */
export function musicMoodFor(state: GameState, reg: ContentRegistry = getContent()): MusicMood {
  if (state.result) {
    if (state.result.mode === 'vigil') return state.result.outcome === 'victory' ? 'victory' : 'defeat';
    return 'victory';
  }
  if (state.isBossNight) return 'boss';
  if (state.config.mode === 'vigil') {
    const band = currentThreshold(state, reg);
    return band === 'deep_dark' || band === 'long_night_falls' ? 'battle' : 'explore';
  }
  return state.night >= state.config.nights - 1 ? 'battle' : 'explore';
}
