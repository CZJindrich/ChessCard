/**
 * The shown state during playback. Events are animated one at a time; after each one the
 * board on screen should match "the world so far", not the final state. `patchView` applies
 * what an event visibly changed to the previously shown state (pure, structural sharing).
 * When a batch ends the controller snaps to the engine's real state, so these patches only
 * need to be right for what the player sees mid-animation.
 */
import { getContent } from '../engine';
import type { ContentRegistry, GameEvent, GameState, Intent, Piece, PlayerState, Plume, Pos } from '../engine/types';

type PieceFn = (p: Piece) => Piece;

function withPiece(view: GameState, id: string, fn: PieceFn): GameState {
  const piece = view.pieces[id];
  if (!piece) return view;
  return { ...view, pieces: { ...view.pieces, [id]: fn(piece) } };
}

function withoutPiece(view: GameState, id: string): GameState {
  if (!view.pieces[id]) return view;
  const pieces = { ...view.pieces };
  delete pieces[id];
  return { ...view, pieces, intents: view.intents.filter((i) => i.attackerId !== id) };
}

function withPlayer(view: GameState, seat: number, fn: (p: PlayerState) => PlayerState): GameState {
  const player = view.players[seat];
  if (!player) return view;
  const players = view.players.slice();
  players[seat] = fn(player);
  return { ...view, players };
}

function withoutPlume(view: GameState, id: string): GameState {
  return { ...view, plumes: view.plumes.filter((m) => m.id !== id) };
}

function withoutIntent(view: GameState, id: string): GameState {
  return { ...view, intents: view.intents.filter((i) => i.id !== id) };
}

/** A piece that the event introduced: the engine's final copy, or a stub when it is already gone. */
function arrivingPiece(after: GameState, reg: ContentRegistry, e: Extract<GameEvent, { type: 'summoned' }>): Piece {
  const final = after.pieces[e.pieceId];
  if (final) return { ...final, pos: { ...e.pos } };
  const def = reg.units.byId[e.defId] ?? reg.enemies.byId[e.defId];
  const hp = def?.hp ?? 1;
  return {
    id: e.pieceId,
    kind: e.side === 'snuff' ? 'enemy' : 'unit',
    defId: e.defId,
    side: e.side,
    owner: e.seat,
    pos: { ...e.pos },
    size: 1,
    hp,
    maxHp: hp,
    atk: def?.atk ?? 0,
    ward: false,
    burn: 0,
    dazed: false,
    charm: null,
    movesLeft: 0,
    strikesLeft: 0,
    exhausted: true,
    smoldering: false,
    flying: def?.move.flying ?? false,
    structure: def?.structure ?? false,
    summonOrder: 0,
    initiative: 0,
    lastDisplacedBy: null,
    buffs: { atk: 0, range: 0 },
    pendingRelight: false,
    smolderedAtPlayersEnd: false,
    hauntedThisRound: false,
  };
}

function declaredIntent(after: GameState, e: Extract<GameEvent, { type: 'intent_declared' }>): Intent {
  const final = after.intents.find((i) => i.id === e.intentId);
  if (final) return final;
  return {
    id: e.intentId,
    attackerId: e.attackerId,
    bossIntentId: null,
    kind: 'melee',
    shape: 'single',
    dir: null,
    offset: null,
    range: null,
    minRange: 0,
    damage: e.damage,
    push: 0,
    pushMode: null,
    pull: 0,
    status: null,
    firstHit: false,
    pierce: false,
    centered: false,
    reversed: false,
    reversedBy: null,
    queue: e.queue,
    tiles: e.tiles,
    targetId: null,
    global: null,
    createsTile: null,
    extra: null,
  };
}

function placedPlume(after: GameState, e: Extract<GameEvent, { type: 'plume_placed' }>): Plume {
  return (
    after.plumes.find((m) => m.id === e.plumeId) ?? {
      id: e.plumeId,
      pos: e.pos,
      enemyId: e.enemyId,
      order: 0,
      source: e.source,
      hauntSeat: null,
      hauntedHeroId: null,
    }
  );
}

function withTile(view: GameState, pos: Pos, patch: Partial<GameState['board']['tiles'][number]>): GameState {
  const index = pos.y * view.board.w + pos.x;
  const tile = view.board.tiles[index];
  if (!tile) return view;
  const tiles = view.board.tiles.slice();
  tiles[index] = { ...tile, ...patch };
  return { ...view, board: { ...view.board, tiles } };
}

function patchStatus(p: Piece, e: Extract<GameEvent, { type: 'status_changed' }>): Piece {
  switch (e.status) {
    case 'ward':
      return { ...p, ward: e.active };
    case 'burn':
      return { ...p, burn: e.active ? Math.max(1, e.value) : 0 };
    case 'dazed':
      return { ...p, dazed: e.active };
  }
}

/** Apply one event's visible change to the shown state. `after` is the engine state after the batch. */
export function patchView(view: GameState, event: GameEvent, after: GameState, reg: ContentRegistry = getContent()): GameState {
  switch (event.type) {
    case 'night_started':
    case 'chandlery_opened':
    case 'toll_revealed':
    case 'toll_chosen':
      return after;
    case 'phase_changed':
      return { ...view, phase: event.phase, night: event.night, round: event.round };
    case 'turn_started':
      return withPlayer({ ...view, activeSeat: event.seat }, event.seat, (p) => ({ ...p, flame: event.flame, turnEnded: false }));
    case 'turn_ended':
      return withPlayer({ ...view, activeSeat: null }, event.seat, (p) => ({ ...p, flame: 0, turnEnded: true }));
    case 'piece_moved':
      return withPiece(view, event.pieceId, (p) => ({ ...p, pos: { ...event.to } }));
    case 'damage':
      return withPiece(view, event.pieceId, (p) => (event.blockedByWard ? { ...p, ward: false } : { ...p, hp: Math.max(0, event.hpAfter) }));
    case 'heal':
      return withPiece(view, event.pieceId, (p) => ({ ...p, hp: event.hpAfter }));
    case 'piece_died':
      return withoutPiece(view, event.pieceId);
    case 'hero_smoldered':
      return withPiece(view, event.pieceId, (p) => ({ ...p, hp: 0, smoldering: true, ward: false }));
    case 'hero_relit':
      return withPiece(view, event.pieceId, (p) => ({ ...p, hp: event.hp, smoldering: false, pos: { ...event.pos } }));
    case 'summoned':
      return { ...view, pieces: { ...view.pieces, [event.pieceId]: arrivingPiece(after, reg, event) } };
    case 'transformed':
      return withPiece(view, event.pieceId, (p) => ({ ...(after.pieces[event.pieceId] ?? p), pos: p.pos, defId: event.toDefId }));
    case 'status_changed':
      return withPiece(view, event.pieceId, (p) => patchStatus(p, event));
    case 'charm_changed':
      return withPiece(view, event.pieceId, (p) => ({ ...p, charm: event.cardId ? { uid: `${p.id}:charm`, id: event.cardId, tempered: false } : null }));
    case 'card_played':
      return withPlayer(view, event.seat, (p) => ({ ...p, hand: p.hand.filter((c) => c.uid !== event.cardUid), flame: Math.max(0, p.flame - event.cost) }));
    case 'power_used':
      return withPlayer(view, event.seat, (p) => ({ ...p, flame: Math.max(0, p.flame - event.cost) }));
    case 'cards_drawn':
      return event.cards.length > 0 ? withPlayer(view, event.seat, (p) => ({ ...p, hand: [...p.hand, ...event.cards.filter((c) => !p.hand.some((h) => h.uid === c.uid))] })) : view;
    case 'intent_declared':
      return { ...view, intents: [...view.intents.filter((i) => i.id !== event.intentId), declaredIntent(after, event)] };
    case 'intent_cancelled':
    case 'intent_resolved':
      return withoutIntent(view, event.intentId);
    case 'intent_reversed':
      return { ...view, intents: view.intents.map((i) => (i.id === event.intentId ? { ...i, tiles: event.tiles, reversed: !i.reversed } : i)) };
    case 'plume_placed':
      return { ...view, plumes: [...view.plumes.filter((m) => m.id !== event.plumeId), placedPlume(after, event)] };
    case 'plume_popped':
    case 'plume_rose':
    case 'plume_blocked':
      return withoutPlume(view, event.plumeId);
    case 'tile_changed':
      return withTile(view, event.pos, { type: event.to });
    case 'shrine_changed':
      return withTile(view, event.pos, { shrineLit: event.lit });
    case 'dread_changed':
      return view.vigil ? { ...view, vigil: { ...view.vigil, dread: event.to } } : view;
    case 'glory_changed':
      return withPlayer(view, event.seat, (p) => ({ ...p, glory: event.to }));
    case 'omen_rolled':
      return { ...view, omen: { face: event.face, omenId: event.effectiveId } };
    case 'boss_spawned':
      return { ...view, boss: after.boss, pieces: after.pieces[event.pieceId] ? { ...view.pieces, [event.pieceId]: after.pieces[event.pieceId] } : view.pieces };
    case 'boss_phase':
      return view.boss ? { ...view, boss: { ...view.boss, phase: event.phase } } : view;
    case 'checkmate':
      return view.boss ? { ...view, boss: { ...view.boss, crowns: event.crowns } } : view;
    case 'first_light_passed':
      return { ...view, firstLight: event.seat };
    case 'seat_ready':
      return withPlayer(view, event.seat, (p) => ({ ...p, ready: true }));
    case 'game_over':
      return { ...view, result: event.result, phase: 'game_over' };
    case 'log':
      return { ...view, log: [...view.log, event.entry] };
    default:
      return view;
  }
}
