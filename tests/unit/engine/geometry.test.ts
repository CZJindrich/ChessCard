import { describe, expect, it } from 'vitest';
import {
  areaTiles,
  artilleryTiles,
  chebyshev,
  clipToBoard,
  compareReadingOrder,
  createBoardQuery,
  DIR_E,
  DIR_N,
  footprint,
  footprintDistance,
  hasClearLine,
  isAdjacent,
  lineDir,
  meleeReach,
  mirrorOffset,
  parseKey,
  parseSq,
  patternMoves,
  posKey,
  pullPath,
  pushDirection,
  pushPath,
  quadrantOf,
  rangedLines,
  reachablePlumes,
  ringOf,
  ringTiles,
  rotatedArea,
  sortPositions,
  sq,
  sqName,
  TERRAIN_OPEN,
  TERRAIN_PILLAR,
  TERRAIN_RUBBLE,
  traceLine,
} from '../../../src/engine/geometry';
import type { BoardQuery } from '../../../src/engine/geometry';
import type { Pattern, Pos } from '../../../src/engine/types';

/**
 * ASCII board, top row = highest rank. Legend:
 *   .  flagstone      #  pillar        ~  rubble        *  plume (on flagstone)
 *   A-Z piece (id = letter, blocks LOS)   w  piece that does not block LOS (a Smoldering Wick)
 *   1 / 2  chimney pair ends (one pair)
 */
function board(rows: string[]): BoardQuery {
  const h = rows.length;
  const w = rows[0].length;
  const terrain = new Map<string, typeof TERRAIN_OPEN>();
  const pieces: Array<{ id: string; pos: Pos; blocksLos?: boolean }> = [];
  const plumes: Pos[] = [];
  const chimney: Pos[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, x) => {
      const p = { x, y: h - 1 - r };
      if (ch === '#') terrain.set(posKey(p), TERRAIN_PILLAR);
      else if (ch === '~') terrain.set(posKey(p), TERRAIN_RUBBLE);
      else if (ch === '*') plumes.push(p);
      else if (ch === 'w') pieces.push({ id: `w${x}${p.y}`, pos: p, blocksLos: false });
      else if (ch === '1' || ch === '2') chimney[Number(ch) - 1] = p;
      else if (/[A-Z]/.test(ch)) pieces.push({ id: ch, pos: p });
    });
  });
  return createBoardQuery({
    w,
    h,
    terrain: (p) => terrain.get(posKey(p)) ?? TERRAIN_OPEN,
    pieces,
    plumes,
    chimneys: chimney.length === 2 ? [[chimney[0], chimney[1]]] : [],
  });
}

const EMPTY8 = Array.from({ length: 8 }, () => '........');
const P = (type: Pattern['type'], dirs: Pattern['dirs'], range: number | null, flying = false): Pattern => ({
  type,
  dirs,
  range,
  offsets: type === 'leap' ? 'knight' : null,
  flying,
});
const KING = P('step', 'all', 1);
const KNIGHT = P('leap', 'all', null);
const names = (tiles: Pos[]) => tiles.map(sqName).sort();
const dests = (q: BoardQuery, from: string, pattern: Pattern, opts = {}) => names(patternMoves(q, sq(from), pattern, opts).map((m) => m.to));

describe('coordinates', () => {
  it('names squares a1-l12 and parses them back', () => {
    expect(sqName({ x: 2, y: 2 })).toBe('c3');
    expect(sqName({ x: 11, y: 11 })).toBe('l12');
    expect(parseSq('c10')).toEqual({ x: 2, y: 9 });
    expect(parseSq('m1')).toBeNull();
    expect(parseSq('a0')).toBeNull();
    expect(parseSq('a13')).toBeNull();
    for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) expect(parseSq(sqName({ x, y }))).toEqual({ x, y });
    expect(posKey({ x: 3, y: 7 })).toBe('3,7');
    expect(parseKey('3,7')).toEqual({ x: 3, y: 7 });
  });

  it('measures Chebyshev distance, including 2x2 footprints', () => {
    expect(chebyshev(sq('a1'), sq('c2'))).toBe(2);
    expect(footprint(sq('d6'), 2).map(sqName)).toEqual(['d6', 'e6', 'd7', 'e7']);
    expect(footprintDistance(sq('d6'), 2, sq('f8'), 1)).toBe(1);
    expect(footprintDistance(sq('d6'), 2, sq('d2'), 1)).toBe(4);
    expect(footprintDistance(sq('d6'), 2, sq('e7'), 1)).toBe(0);
    expect(isAdjacent(sq('c5'), sq('d6'), 1, 2)).toBe(true);
    expect(isAdjacent(sq('b5'), sq('d6'), 1, 2)).toBe(false);
  });

  it('sorts in reading order: rank descending, then file ascending', () => {
    const sorted = sortPositions(['a1', 'h8', 'a8', 'b7', 'a7'].map(sq)).map(sqName);
    expect(sorted).toEqual(['a8', 'h8', 'a7', 'b7', 'a1']);
    expect(compareReadingOrder(sq('a8'), sq('b8'))).toBeLessThan(0);
  });

  it('knows rings and quadrants', () => {
    expect(ringOf(sq('a1'), 12, 12)).toBe(0);
    expect(ringOf(sq('e5'), 12, 12)).toBe(4);
    expect(ringTiles(0, 10, 10)).toHaveLength(36);
    expect(ringTiles(3, 10, 10).map(sqName).sort()).toEqual(['d4', 'd5', 'd6', 'd7', 'e4', 'e7', 'f4', 'f7', 'g4', 'g5', 'g6', 'g7']);
    expect(['c3', 'j3', 'j10', 'c10'].map((s) => quadrantOf(sq(s), 12, 12))).toEqual([0, 1, 2, 3]);
  });

  it('finds straight lines', () => {
    expect(lineDir(sq('a1'), sq('d4'))).toEqual({ x: 1, y: 1 });
    expect(lineDir(sq('a1'), sq('a5'))).toEqual({ x: 0, y: 1 });
    expect(lineDir(sq('a1'), sq('b3'))).toBeNull();
  });
});

describe('movement patterns', () => {
  it('king step: 8 in the open, 3 in a corner, never onto pieces or pillars', () => {
    const q = board(EMPTY8);
    expect(dests(q, 'd4', KING)).toHaveLength(8);
    expect(dests(q, 'a1', KING)).toEqual(['a2', 'b1', 'b2']);
    const blocked = board(['........', '........', '........', '........', '..#X....', '...K....', '........', '........']);
    expect(dests(blocked, 'd3', KING)).toEqual(['c2', 'c3', 'd2', 'e2', 'e3', 'e4']);
  });

  it('rook slide stops before pieces and pillars and IN rubble', () => {
    const q = board(['........', '...X....', '........', '........', '...R.~..', '........', '...#....', '........']);
    expect(dests(q, 'd4', P('slide', 'orth', 3))).toEqual(['a4', 'b4', 'c4', 'd3', 'd5', 'd6', 'e4', 'f4']);
    expect(dests(q, 'd4', P('slide', 'orth', 1))).toEqual(['c4', 'd3', 'd5', 'e4']);
  });

  it('range null slides to the board edge', () => {
    const q = board(EMPTY8);
    expect(dests(q, 'a1', P('slide', 'diag', null))).toEqual(['b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']);
  });

  it('flying slides pass over pieces, pillars and rubble and land on empty tiles', () => {
    const q = board(['........', '........', '........', '........', '...M.~#.', '........', '........', '........']);
    expect(dests(q, 'd4', P('slide', 'orth', 3, true)).filter((s) => s.endsWith('4'))).toEqual(['a4', 'b4', 'c4', 'e4', 'f4']);
    const overPiece = board(['........', '........', '........', '........', '...MX#..', '........', '........', '........']);
    expect(dests(overPiece, 'd4', P('slide', 'orth', 3, true)).filter((s) => s.endsWith('4'))).toEqual(['a4', 'b4', 'c4', 'g4']);
    expect(dests(overPiece, 'd4', P('slide', 'orth', 3), { flying: true }).filter((s) => s.endsWith('4'))).toEqual(['a4', 'b4', 'c4', 'g4']);
  });

  it('knight leaps ignore pieces in between and land only on empty, enterable tiles', () => {
    const q = board(['........', '........', '..#.....', '.X.XX...', '..XNX...', '..XXX...', '........', '........']);
    expect(dests(q, 'd4', KNIGHT)).toEqual(['b3', 'c2', 'e2', 'e6', 'f3', 'f5']);
    expect(dests(board(EMPTY8), 'a1', KNIGHT)).toEqual(['b3', 'c2']);
  });

  it('pawn: moves 1 orthogonally, strikes 1 diagonally', () => {
    const q = board(['........', '........', '........', '..E.F...', '...T....', '..G.....', '........', '........']);
    const move = P('step', 'orth', 1);
    const reach = P('step', 'diag', 1);
    expect(dests(q, 'd4', move)).toEqual(['c4', 'd3', 'd5', 'e4']);
    expect(meleeReach(q, sq('d4'), reach).map((h) => sqName(h.pos)).sort()).toEqual(['c3', 'c5', 'e5']);
  });

  it('range modifiers change steps and slides (min 1) but not leaps', () => {
    const q = board(EMPTY8);
    expect(dests(q, 'a1', P('slide', 'orth', 2), { rangeDelta: 1 })).toEqual(['a2', 'a3', 'a4', 'b1', 'c1', 'd1']);
    expect(dests(q, 'a1', KING, { rangeDelta: -1 })).toEqual(['a2', 'b1', 'b2']);
    expect(dests(q, 'a1', KING, { rangeDelta: 1 })).toEqual(['a2', 'a3', 'b1', 'b2', 'c1', 'c3']);
    expect(dests(q, 'd4', KNIGHT, { rangeDelta: 2 })).toHaveLength(8);
  });

  it('chimneys: entering ends on the pair if it is empty; never chained, never passed through', () => {
    const q = board(['.......2', '........', '........', '........', '........', '........', '........', 'R..1....']);
    const moves = patternMoves(q, sq('a1'), P('slide', 'orth', 7), { useChimneys: true });
    const viaChimney = moves.find((m) => m.chimney !== null);
    expect(viaChimney && sqName(viaChimney.to)).toBe('h8');
    expect(viaChimney && sqName(viaChimney.chimney as Pos)).toBe('d1');
    expect(names(moves.map((m) => m.to)).filter((s) => s.endsWith('1'))).toEqual(['b1', 'c1']);
    const noChimneys = board(['.......X', '........', '........', '........', '........', '........', '........', 'R..1....']);
    // The chimney's pair is occupied: the chimney tile is unusable and stops the slide.
    const occupied = createBoardQuery({
      w: 8,
      h: 8,
      pieces: [
        { id: 'R', pos: sq('a1') },
        { id: 'X', pos: sq('h8') },
      ],
      chimneys: [[sq('d1'), sq('h8')]],
    });
    expect(dests(occupied, 'a1', P('slide', 'orth', 7), { useChimneys: true }).filter((s) => s.endsWith('1'))).toEqual(['b1', 'c1']);
    // Without useChimneys a Chimney is plain flagstone.
    expect(dests(noChimneys, 'a1', P('slide', 'orth', 7)).filter((s) => s.endsWith('1'))).toHaveLength(7);
  });

  it('multi-tile movers need every newly entered tile free', () => {
    const q = createBoardQuery({
      w: 8,
      h: 8,
      terrain: (p) => (sqName(p) === 'f5' ? TERRAIN_PILLAR : TERRAIN_OPEN),
      pieces: [{ id: 'B', pos: sq('d4'), size: 2 }],
    });
    const steps = dests(q, 'd4', KING, { size: 2 });
    expect(steps).toEqual(['c3', 'c4', 'c5', 'd3', 'd5', 'e3']);
    const flyingQueen = dests(q, 'd4', P('slide', 'all', 2, true), { size: 2 });
    expect(flyingQueen).toContain('f6');
    expect(flyingQueen).not.toContain('e4');
  });
});

describe('melee reach (as move)', () => {
  it('slides reach the first piece in each direction, never past it', () => {
    const q = board(['...X....', '........', '...Y....', '........', 'Z..B..#.', '........', '........', '......W.']);
    const hits = meleeReach(q, sq('d4'), P('slide', 'all', 3)).map((h) => h.pieceId).sort();
    expect(hits).toEqual(['W', 'Y', 'Z']);
  });

  it('flying slides reach past blockers; leaps reach any knight-offset piece', () => {
    const q = board(['........', '........', '...Y....', '...X....', '...B....', '........', '..K.....', '........']);
    expect(meleeReach(q, sq('d4'), P('slide', 'orth', 3, true)).map((h) => h.pieceId).sort()).toEqual(['X', 'Y']);
    expect(meleeReach(q, sq('d4'), KNIGHT).map((h) => h.pieceId)).toEqual(['K']);
  });

  it('a boss counts once, at the first footprint tile reached', () => {
    const q = createBoardQuery({
      w: 8,
      h: 8,
      pieces: [
        { id: 'H', pos: sq('c3') },
        { id: 'BOSS', pos: sq('d4'), size: 2 },
      ],
    });
    const hits = meleeReach(q, sq('c3'), P('slide', 'all', 3));
    expect(hits).toEqual([{ pieceId: 'BOSS', pos: sq('d4') }]);
  });

  it('plume tiles the pattern can land on are strike targets', () => {
    const q = board(['........', '........', '........', '...*....', '...K..*.', '........', '........', '........']);
    expect(names(reachablePlumes(q, sq('d4'), KING))).toEqual(['d5']);
  });
});

describe('line of sight', () => {
  it('firstHit stops at the first piece; Plumes before it are alternative picks', () => {
    const q = board(['........', '...X....', '...Y....', '...*....', '...L....', '........', '........', '........']);
    const trace = traceLine(q, sq('d4'), DIR_N, 4, 'firstHit', { ignoreIds: ['L'] });
    expect(trace.hits.map((h) => h.pieceId)).toEqual(['Y']);
    expect(names(trace.plumes)).toEqual(['d5']);
    expect(names(trace.tiles)).toEqual(['d5', 'd6']);
    expect(trace.blockedAt && sqName(trace.blockedAt)).toBe('d6');
  });

  it('pillars stop lines without a hit; Rubble and Plumes do not', () => {
    const q = board(['........', '........', '........', '...#....', '...L~*X.', '........', '........', '........']);
    expect(traceLine(q, sq('d4'), DIR_N, 4, 'firstHit').hits).toEqual([]);
    expect(traceLine(q, sq('d4'), DIR_E, 4, 'firstHit').hits.map((h) => h.pieceId)).toEqual(['X']);
  });

  it('pierce hits every piece up to the range; only pillars stop it', () => {
    const q = board(['........', '........', '.......X', '......Y.', '.....#..', '....Z...', '...B....', '........']);
    const diag = traceLine(q, sq('d2'), { x: 1, y: 1 }, 3, 'pierce');
    expect(diag.hits.map((h) => h.pieceId)).toEqual(['Z']);
    const open = board(['........', '........', '.......X', '......Y.', '.....W..', '....Z...', '...B....', '........']);
    expect(traceLine(open, sq('d2'), { x: 1, y: 1 }, 3, 'pierce').hits.map((h) => h.pieceId)).toEqual(['Z', 'W', 'Y']);
  });

  it('diagonal lines check only the diagonal tiles', () => {
    // Pillar c2 and piece b3 sit beside the diagonal, not on it.
    const q = board(['........', '........', '........', '........', '...X....', '.Y......', '.L#.....', '........']);
    const trace = traceLine(q, sq('b2'), { x: 1, y: 1 }, 4, 'firstHit');
    expect(trace.tiles.map(sqName)).toEqual(['c3', 'd4']);
    expect(trace.hits.map((h) => h.pieceId)).toEqual(['X']);
    expect(hasClearLine(q, sq('b2'), sq('d4'))).toBe(true);
    expect(hasClearLine(q, sq('b2'), sq('e5'))).toBe(false);
    expect(hasClearLine(q, sq('b2'), sq('d3'))).toBe(false);
  });

  it('pieces that do not block LOS are passed by firstHit lines', () => {
    const q = board(['........', '........', '........', '...X....', '...w....', '...L....', '........', '........']);
    expect(traceLine(q, sq('d3'), DIR_N, 4, 'firstHit').hits.map((h) => h.pieceId)).toEqual(['X']);
  });

  it('rangedLines traces every direction of the set from the shooter', () => {
    const q = board(['...X....', '........', '........', '........', 'Y..L....', '........', '........', '........']);
    const lines = rangedLines(q, sq('d4'), 'orth', 4, 'firstHit');
    expect(lines).toHaveLength(4);
    expect(lines.flatMap((l) => l.trace.hits.map((h) => h.pieceId)).sort()).toEqual(['X', 'Y']);
  });
});

describe('artillery', () => {
  it('hits tiles at distance min-max from the footprint, ignoring line of sight', () => {
    const q = board(EMPTY8);
    const tiles = artilleryTiles(q, sq('d4'), 1, 2, 4);
    expect(tiles.every((t) => chebyshev(t, sq('d4')) >= 2 && chebyshev(t, sq('d4')) <= 4)).toBe(true);
    expect(tiles).toHaveLength(64 - 9);
    expect(artilleryTiles(q, sq('a1'), 1, 2, 2).map(sqName).sort()).toEqual(['a3', 'b3', 'c1', 'c2', 'c3']);
    const fromBoss = artilleryTiles(q, sq('d4'), 2, 1, 1);
    expect(fromBoss).toHaveLength(12);
  });
});

describe('area shapes and rotations', () => {
  const at = (shape: Parameters<typeof areaTiles>[0], anchor: string, opts = {}) => names(areaTiles(shape, sq(anchor), opts));

  it('single, ring8, square3, plus5, block2x2', () => {
    expect(at('single', 'c3')).toEqual(['c3']);
    expect(at('ring8', 'c3')).toEqual(['b2', 'b3', 'b4', 'c2', 'c4', 'd2', 'd3', 'd4']);
    expect(at('square3', 'c3')).toEqual(['b2', 'b3', 'b4', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4']);
    expect(at('plus5', 'c3')).toEqual(['b3', 'c2', 'c3', 'c4', 'd3']);
    expect(at('block2x2', 'c3')).toEqual(['c3', 'c4', 'd3', 'd4']);
  });

  it('ring12 is the 12 tiles around a 2x2, corners included', () => {
    expect(at('ring12', 'd4')).toEqual(['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6']);
  });

  it('line rotates N/E/S/W (and runs diagonally given a diagonal direction)', () => {
    const line = (rot: 'N' | 'E' | 'S' | 'W') => names(rotatedArea('line', sq('d4'), rot, { range: 2 }));
    expect(line('N')).toEqual(['d5', 'd6']);
    expect(line('E')).toEqual(['e4', 'f4']);
    expect(line('S')).toEqual(['d2', 'd3']);
    expect(line('W')).toEqual(['b4', 'c4']);
    expect(at('line', 'd4', { dir: { x: 1, y: -1 }, range: 3 })).toEqual(['e3', 'f2', 'g1']);
  });

  it('side2 and beam2 come off one side of a 2x2 footprint', () => {
    const side = (rot: 'N' | 'E' | 'S' | 'W') => names(rotatedArea('side2', sq('d4'), rot));
    expect(side('N')).toEqual(['d6', 'e6']);
    expect(side('E')).toEqual(['f4', 'f5']);
    expect(side('S')).toEqual(['d3', 'e3']);
    expect(side('W')).toEqual(['c4', 'c5']);
    const beam = (rot: 'N' | 'E' | 'S' | 'W') => names(rotatedArea('beam2', sq('d4'), rot, { range: 3 }));
    expect(beam('N')).toEqual(['d6', 'd7', 'd8', 'e6', 'e7', 'e8']);
    expect(beam('E')).toEqual(['f4', 'f5', 'g4', 'g5', 'h4', 'h5']);
    expect(beam('S')).toEqual(['d1', 'd2', 'd3', 'e1', 'e2', 'e3']);
    expect(beam('W')).toEqual(['a4', 'a5', 'b4', 'b5', 'c4', 'c5']);
    expect(() => areaTiles('beam2', sq('d4'), { dir: { x: 1, y: 1 }, range: 2 })).toThrow();
  });

  it('parts off the board fizzle', () => {
    expect(clipToBoard(areaTiles('ring8', sq('a1')), 8, 8).map(sqName).sort()).toEqual(['a2', 'b1', 'b2']);
  });

  it('reversed artillery mirrors its offset through the attacker', () => {
    expect(mirrorOffset({ x: 2, y: -1 })).toEqual({ x: -2, y: 1 });
    // A 2x2 bell dropped from a 2x2 boss: the block's centre mirrors through the boss's centre.
    expect(mirrorOffset({ x: 3, y: 0 }, 2, 2)).toEqual({ x: -3, y: 0 });
    // A single tile hit from a 2x2 boss.
    expect(mirrorOffset({ x: 3, y: 0 }, 2, 1)).toEqual({ x: -2, y: 1 });
  });
});

describe('push and pull', () => {
  it('push direction is the sign vector from the nearest footprint tile', () => {
    expect(pushDirection(sq('c3'), 1, sq('e5'))).toEqual({ x: 1, y: 1 });
    expect(pushDirection(sq('d4'), 2, sq('f4'))).toEqual({ x: 1, y: 0 });
    expect(pushDirection(sq('d4'), 2, sq('c6'))).toEqual({ x: -1, y: 1 });
  });

  it('pushes stop at the first blocker with a bump; plumes do not block', () => {
    const q = board(['........', '........', '........', '........', '...X*.Y.', '........', '........', '........']);
    expect(pushPath(q, sq('d4'), DIR_E, 2)).toEqual({ path: [sq('e4'), sq('f4')], end: sq('f4'), bump: null });
    expect(pushPath(q, sq('d4'), DIR_E, 3)).toEqual({ path: [sq('e4'), sq('f4')], end: sq('f4'), bump: { at: sq('g4'), pieceId: 'Y' } });
    const edge = pushPath(q, sq('g4'), DIR_E, 3);
    expect(edge).toEqual({ path: [sq('h4')], end: sq('h4'), bump: { at: { x: 8, y: 3 }, pieceId: null } });
    const pillar = board(['........', '........', '........', '........', '...X#...', '........', '........', '........']);
    expect(pushPath(pillar, sq('d4'), DIR_E, 2).bump).toEqual({ at: sq('e4'), pieceId: null });
  });

  it('pulls stop adjacent to the source', () => {
    const q = board(['........', '........', '.......X', '........', '........', '........', '........', '.W......']);
    expect(pullPath(q, sq('h6'), sq('b1'), 1, 3).path.map(sqName)).toEqual(['g5', 'f4', 'e3']);
    const close = pullPath(q, sq('h6'), sq('e3'), 1, 5);
    expect(close.end).toEqual(sq('f4'));
    expect(close.bump).toBeNull();
  });
});
