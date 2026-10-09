/**
 * Which effects each playback event spawns (GDD §16.9): sparks on melee hits, silver dust when a
 * Snuff bursts, smoke as Wickfolk melt, ember bolts and artillery arcs, dust on landings and
 * pushes, Ward shards, heal motes, Plume smoke columns, the phase-change flash, shockwave and
 * shake, the Dread vignette. Pure: positions come from the state shown before the event.
 * Cards (the flight to the target) are handled by the game screen, which knows the DOM.
 */
import type { ContentRegistry, GameEvent, GameState, Piece, Pos } from '../../engine/types';
import { centreOf, type BoardPoint, type FxCommand } from './bus';
import { COLORS, type Rgb } from './particles';

export interface DirectedStep {
  event: GameEvent;
  /** Scaled playback duration, ms. */
  duration: number;
}

const MAX_GLOAM_PUFFS = 48;

function pieceCentre(state: GameState, pieceId: string): BoardPoint | null {
  const piece = state.pieces[pieceId];
  return piece ? centreOf(piece.pos, piece.size) : null;
}

function tileCentre(pos: Pos): BoardPoint {
  return centreOf(pos);
}

function burst(burst: Extract<FxCommand, { kind: 'burst' }>['burst'], at: BoardPoint | null, delay = 0, color?: Rgb): FxCommand[] {
  return at ? [{ kind: 'burst', burst, at, delay, color }] : [];
}

function moveFx(e: Extract<GameEvent, { type: 'piece_moved' }>, before: GameState, duration: number): FxCommand[] {
  const piece = before.pieces[e.pieceId];
  const size = piece?.size ?? 1;
  const to = centreOf(e.to, size);
  switch (e.kind) {
    case 'slide': {
      const path = e.path && e.path.length > 0 ? e.path : [e.to];
      const points = [e.from, ...path].map((p) => centreOf(p, size));
      return [{ kind: 'trail', points, msPerTile: duration / Math.max(1, path.length) }];
    }
    case 'leap':
    case 'fly':
      return burst('dust_puff', to, duration * 0.85);
    case 'push':
    case 'pull': {
      const out = burst('dust_puff', to, duration * 0.55);
      if (e.bump) out.push(...burst('dust', centreOf(e.bump.at), duration * 0.75, COLORS.dust));
      return out;
    }
    case 'chimney':
    case 'teleport':
    case 'swap':
    case 'respawn':
      return [...burst('ward_glint', centreOf(e.from, size), 0, COLORS.snuffRim), ...burst('summon', to, duration * 0.5, COLORS.moonsilver)];
    case 'boss_step':
      return [...burst('dust_puff', { x: to.x - 0.5, y: to.y - 0.6 }, duration * 0.8), ...burst('dust_puff', { x: to.x + 0.5, y: to.y - 0.6 }, duration * 0.8), { kind: 'shake', strength: 2, duration: 180 }];
    case 'step':
    case 'take':
    case 'deploy':
      return [];
  }
}

function isRangedSnuff(attacker: Piece | undefined, end: Pos): boolean {
  if (!attacker) return false;
  return Math.max(Math.abs(end.x - attacker.pos.x), Math.abs(end.y - attacker.pos.y)) > attacker.size;
}

function bossIntentHeavy(e: Extract<GameEvent, { type: 'strike' }>, before: GameState, reg: ContentRegistry): boolean {
  const intent = e.intentId ? before.intents.find((i) => i.id === e.intentId) : undefined;
  const def = intent?.bossIntentId ? reg.bossIntents.byId[intent.bossIntentId] : undefined;
  return def?.heavy ?? false;
}

function strikeFx(e: Extract<GameEvent, { type: 'strike' }>, before: GameState, reg: ContentRegistry, duration: number): FxCommand[] {
  const end = e.target ?? e.tiles?.[0] ?? null;
  if (!end) return [];
  const from = centreOf(e.from, before.pieces[e.attackerId]?.size ?? 1);
  const to = tileCentre(end);
  switch (e.kind) {
    case 'melee':
      return burst('sparks', to, duration * 0.5);
    case 'ranged':
      return [{ kind: 'bolt', from, to, arc: 0, duration: Math.max(120, duration), color: COLORS.ember }];
    case 'artillery':
      return [{ kind: 'bolt', from, to, arc: 1.3, duration: Math.max(160, duration), color: COLORS.ember }];
    case 'snuff': {
      if (isRangedSnuff(before.pieces[e.attackerId], end)) return [{ kind: 'bolt', from, to, arc: 0, duration: Math.max(140, duration), color: COLORS.snuffRim }];
      return burst('snuff_sparks', to, duration * 0.5);
    }
    case 'boss': {
      const tiles = (e.tiles ?? [end]).slice(0, 8);
      const out: FxCommand[] = tiles.map((t, i) => ({ kind: 'burst', burst: 'dust_puff', at: tileCentre(t), delay: duration * 0.6 + i * 15 }));
      if (bossIntentHeavy(e, before, reg)) out.push({ kind: 'shake', strength: 4, duration: 260 });
      return out;
    }
  }
}

function damageFx(e: Extract<GameEvent, { type: 'damage' }>, before: GameState): FxCommand[] {
  const at = pieceCentre(before, e.pieceId);
  if (e.blockedByWard) return burst('ward_shards', at);
  switch (e.cause) {
    case 'card':
    case 'power':
    case 'pop':
    case 'riposte':
      return burst('sparks', at);
    case 'burn':
    case 'hot_wax':
      return burst('embers', at);
    case 'bump':
      return burst('dust', at, 0, COLORS.dust);
    default:
      return [];
  }
}

function deathFx(e: Extract<GameEvent, { type: 'piece_died' }>, before: GameState): FxCommand[] {
  const piece = before.pieces[e.pieceId];
  const at = centreOf(e.pos, piece?.size ?? 1);
  if (e.kind === 'boss') {
    return [
      ...burst('dust', at),
      ...burst('dust', { x: at.x - 0.6, y: at.y + 0.3 }, 120),
      ...burst('dust', { x: at.x + 0.6, y: at.y - 0.3 }, 240),
      { kind: 'ring', at, radius: 6, ttl: 900, color: COLORS.moonsilver },
      { kind: 'flash', tone: 'white', duration: 500 },
      { kind: 'shake', strength: 6, duration: 420 },
    ];
  }
  return e.side === 'snuff' ? burst('dust', at) : burst('melt_smoke', at);
}

function summonFx(e: Extract<GameEvent, { type: 'summoned' }>): FxCommand[] {
  if (e.source === 'setup' || e.source === 'rise') return [];
  return burst('summon', tileCentre(e.pos), 0, e.side === 'snuff' ? COLORS.snuffRim : COLORS.candleGold);
}

function statusFx(e: Extract<GameEvent, { type: 'status_changed' }>, before: GameState): FxCommand[] {
  if (!e.active) return [];
  const at = pieceCentre(before, e.pieceId);
  if (e.status === 'ward') return burst('ward_glint', at);
  if (e.status === 'burn') return burst('embers', at);
  return burst('dust', at, 0, COLORS.snuffRim);
}

function bossCentre(before: GameState): BoardPoint | null {
  const piece = before.boss ? before.pieces[before.boss.pieceId] : undefined;
  return piece ? centreOf(piece.pos, piece.size) : null;
}

function bossMomentFx(before: GameState, color: Rgb): FxCommand[] {
  const at = bossCentre(before);
  return [
    { kind: 'flash', tone: 'white', duration: 420 },
    { kind: 'shake', strength: 6, duration: 420 },
    ...(at ? [{ kind: 'ring', at, radius: 5, ttl: 800, color } as FxCommand, { kind: 'ring', at, radius: 3.4, ttl: 650, color: COLORS.white, delay: 90 } as FxCommand] : []),
  ];
}

/** The Gloam closing sweeps around the ring: fog rolls in tile by tile, clockwise from the top. */
function gloamFx(e: Extract<GameEvent, { type: 'gloam_closed' }>, before: GameState, duration: number): FxCommand[] {
  const cx = before.board.w / 2;
  const cy = before.board.h / 2;
  const step = Math.max(1, Math.ceil(e.tiles.length / MAX_GLOAM_PUFFS));
  const sweep = Math.max(300, duration * 0.8);
  return e.tiles
    .filter((_, i) => i % step === 0)
    .map((t) => {
      const angle = Math.atan2(t.x + 0.5 - cx, t.y + 0.5 - cy);
      const turn = (angle + Math.PI) / (2 * Math.PI);
      return { kind: 'burst', burst: 'plume_small', at: tileCentre(t), delay: turn * sweep, color: COLORS.gloam } as FxCommand;
    });
}

/** The FX commands for one playback step. */
export function fxForStep(step: DirectedStep, before: GameState, reg: ContentRegistry): FxCommand[] {
  const e = step.event;
  switch (e.type) {
    case 'piece_moved':
      return moveFx(e, before, step.duration);
    case 'strike':
      return strikeFx(e, before, reg, step.duration);
    case 'damage':
      return damageFx(e, before);
    case 'heal':
      return e.amount > 0 ? burst('heal', pieceCentre(before, e.pieceId)) : [];
    case 'piece_died':
      return deathFx(e, before);
    case 'hero_smoldered':
      return burst('melt_smoke', tileCentre(e.pos));
    case 'hero_relit':
    case 'transformed':
      return burst('summon', 'pos' in e ? tileCentre(e.pos) : pieceCentre(before, e.pieceId), 0, COLORS.candleGold);
    case 'summoned':
      return summonFx(e);
    case 'status_changed':
      return statusFx(e, before);
    case 'plume_placed':
      return burst('plume_small', tileCentre(e.pos));
    case 'plume_rose':
      return burst('plume', tileCentre(e.pos));
    case 'plume_popped':
      return burst('dust', tileCentre(e.pos), 0, COLORS.plume);
    case 'plume_blocked':
      return [...burst('plume_small', tileCentre(e.pos)), ...burst('dust_puff', tileCentre(e.pos))];
    case 'tile_changed':
      return e.to === 'hot_wax' ? burst('embers', tileCentre(e.pos)) : burst('dust_puff', tileCentre(e.pos));
    case 'shrine_changed':
      return e.lit ? burst('summon', tileCentre(e.pos), 0, COLORS.verdigris) : burst('melt_smoke', tileCentre(e.pos), 0);
    case 'dread_changed':
      return e.to > e.from ? [{ kind: 'vignette', strength: e.threshold ? 1 : 0.7, duration: Math.max(450, step.duration) }] : [];
    case 'boss_phase':
      return bossMomentFx(before, COLORS.snuffRim);
    case 'checkmate':
      return bossMomentFx(before, COLORS.sunrise);
    case 'boss_spawned':
      return [{ kind: 'ring', at: centreOf(e.anchor, 2), radius: 4, ttl: 800, color: COLORS.snuffRim }, { kind: 'shake', strength: 3, duration: 300 }];
    case 'gloam_closed':
      return gloamFx(e, before, step.duration);
    case 'player_eliminated': {
      const hero = before.players[e.seat] ? before.pieces[before.players[e.seat].heroPieceId] : undefined;
      return hero ? [{ kind: 'ring', at: centreOf(hero.pos), radius: 2.5, ttl: 700, color: COLORS.gloam }] : [];
    }
    case 'dawn':
      return [{ kind: 'flash', tone: 'gold', duration: 700 }];
    default:
      return [];
  }
}
