/**
 * Piece creation: heroes, Wickfolk units, Snuff enemies, Vigil Candles, and the placement
 * routine (GDD §9.5) that every anchored spawn, summon or teleport uses.
 */
import { compareReadingOrder, footprintDistance, isOpenTile } from './geometry';
import { addLog, pieceAtText } from './log';
import { boardQuery, emit, heroOf, newId, nextOrder, plumeAt, unitsOf } from './state';
import type { Ctx } from './state';
import type { BossDef, ContentRegistry, EnemyDef, GameConfig, GameEvent, GameState, Piece, PieceKind, Pos, Side } from './types';

interface PieceSeed {
  kind: PieceKind;
  defId: string;
  side: Side;
  owner: number | null;
  pos: Pos;
  hp: number;
  atk: number;
  flying: boolean;
  structure: boolean;
  size?: number;
}

function basePiece(s: GameState, seed: PieceSeed): Piece {
  return {
    id: newId(s, 'p'),
    kind: seed.kind,
    defId: seed.defId,
    side: seed.side,
    owner: seed.owner,
    pos: { ...seed.pos },
    size: seed.size ?? 1,
    hp: seed.hp,
    maxHp: seed.hp,
    atk: seed.atk,
    ward: false,
    burn: 0,
    dazed: false,
    charm: null,
    charmSeat: null,
    movesLeft: 0,
    strikesLeft: 0,
    exhausted: false,
    smoldering: false,
    flying: seed.flying,
    structure: seed.structure,
    summonOrder: nextOrder(s),
    initiative: 0,
    lastDisplacedBy: null,
    buffs: { atk: 0, range: 0 },
    pendingRelight: false,
    smolderedAtPlayersEnd: false,
    hauntedThisRound: false,
  };
}

function addPiece(s: GameState, piece: Piece): Piece {
  s.pieces[piece.id] = piece;
  return piece;
}

export function createHeroPiece(s: GameState, reg: ContentRegistry, seat: number, heroId: string, pos: Pos): Piece {
  const def = reg.heroes.byId[heroId];
  if (!def) throw new Error(`unknown hero "${heroId}"`);
  return addPiece(
    s,
    basePiece(s, { kind: 'hero', defId: heroId, side: 'wick', owner: seat, pos, hp: def.hp, atk: def.atk, flying: def.move.flying, structure: false }),
  );
}

export function createCandle(s: GameState, reg: ContentRegistry, pos: Pos): Piece {
  const hp = reg.overlays.byId.vigil_candle?.hp ?? 3;
  return addPiece(s, basePiece(s, { kind: 'candle', defId: 'vigil_candle', side: 'wick', owner: null, pos, hp, atk: 0, flying: false, structure: true }));
}

/** A boss piece (2×2, anchored at its lowest file and rank) with its computed max HP (§10.1). */
export function createBossPiece(s: GameState, def: BossDef, pos: Pos, maxHp: number): Piece {
  return addPiece(
    s,
    basePiece(s, { kind: 'boss', defId: def.id, side: 'snuff', owner: null, pos, hp: maxHp, atk: 0, flying: def.flying, structure: false, size: def.size[0] }),
  );
}

export function unitLimitReached(s: GameState, seat: number): boolean {
  return unitsOf(s, seat).length >= s.config.unit_limit;
}

/** `quick_build`: Wicklow's Lanterns and Wick Mortars arrive Ready (§8.1). */
function arrivesReady(s: GameState, reg: ContentRegistry, seat: number, unitId: string): boolean {
  const hero = heroOf(s, seat);
  const trait = hero ? reg.heroes.byId[hero.defId]?.trait : null;
  return trait === 'quick_build' && (unitId === 'lantern' || unitId === 'wick_mortar');
}

export type SummonSource = Extract<GameEvent, { type: 'summoned' }>['source'];

/** A Wickfolk unit for `seat`. Units arrive Exhausted unless `quick_build` applies (§6.1). */
export function createUnit(ctx: Ctx, unitId: string, seat: number, pos: Pos, source: SummonSource): Piece {
  const { s, reg } = ctx;
  const def = reg.units.byId[unitId];
  if (!def) throw new Error(`unknown unit "${unitId}"`);
  const piece = addPiece(
    s,
    basePiece(s, { kind: 'unit', defId: unitId, side: 'wick', owner: seat, pos, hp: def.hp, atk: def.atk, flying: def.move.flying, structure: def.structure }),
  );
  if (arrivesReady(s, reg, seat, unitId)) {
    piece.movesLeft = def.move.type === 'immobile' ? 0 : 1;
    piece.strikesLeft = 1;
  } else {
    piece.exhausted = true;
  }
  if (def.startStatuses.includes('ward')) piece.ward = true;
  if (def.startStatuses.includes('dazed')) piece.dazed = true;
  emit(ctx, { type: 'summoned', pieceId: piece.id, defId: unitId, seat, pos: piece.pos, side: 'wick', source });
  addLog(ctx, `${pieceAtText(reg, piece)} arrives.`, seat);
  return piece;
}

/** Enemy HP with `enemy_hp_mod` (§9.1): non_minions = +1 for soldier/elite/structure; all = +1. */
export function enemyHp(config: GameConfig, def: EnemyDef): number {
  if (config.enemy_hp_mod === 'all') return def.hp + 1;
  if (config.enemy_hp_mod === 'non_minions' && def.rank !== 'minion') return def.hp + 1;
  return def.hp;
}

/** A Snuff enemy. It takes initiative after every existing enemy (§9.4). */
export function spawnEnemy(ctx: Ctx, enemyId: string, pos: Pos, source: SummonSource): Piece {
  const { s, reg } = ctx;
  const def = reg.enemies.byId[enemyId];
  if (!def) throw new Error(`unknown enemy "${enemyId}"`);
  const piece = addPiece(
    s,
    basePiece(s, {
      kind: 'enemy',
      defId: enemyId,
      side: 'snuff',
      owner: null,
      pos,
      hp: enemyHp(s.config, def),
      atk: def.atk,
      flying: def.move.flying,
      structure: def.structure,
    }),
  );
  piece.initiative = nextOrder(s);
  if (source !== 'rise') emit(ctx, { type: 'summoned', pieceId: piece.id, defId: enemyId, seat: null, pos: piece.pos, side: 'snuff', source });
  return piece;
}

/** A test for "empty, enterable, Plume-free and outside the Gloam": where summons may appear (§5.2, §9.4). */
export function summonTileTest(s: GameState): (p: Pos) => boolean {
  const q = boardQuery(s);
  return (p) => isOpenTile(q, p) && !plumeAt(s, p) && !s.board.tiles[p.y * s.board.w + p.x]?.gloam;
}

/**
 * The placement routine (§9.5): legal tiles sorted by distance from the anchor, then reading
 * order; the first one within `maxDistance` (null = no cap, respawn) or null (the effect fizzles).
 * A multi-tile anchor (a boss footprint, `anchorSize` 2) measures from its nearest tile.
 */
export function placeNear(s: GameState, anchor: Pos, maxDistance: number | null, legal: (p: Pos) => boolean, anchorSize = 1): Pos | null {
  let best: Pos | null = null;
  let bestDistance = Infinity;
  for (let y = s.board.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.board.w; x++) {
      const p = { x, y };
      const d = footprintDistance(anchor, anchorSize, p, 1);
      if (maxDistance !== null && d > maxDistance) continue;
      if (d < bestDistance || (d === bestDistance && best !== null && compareReadingOrder(p, best) < 0)) {
        if (!legal(p)) continue;
        best = p;
        bestDistance = d;
      }
    }
  }
  return best;
}
