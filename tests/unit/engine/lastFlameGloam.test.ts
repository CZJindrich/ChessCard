/**
 * The Gloam (GDD §13.2.8, §5.4, B.6): the closing schedule for every board and length, closings
 * at step 1 of the right Tally with `gloam_warning` during that round, the Gloam Bell, the final
 * 4×4 zones, what a closing does to the tiles it covers, and the Gloam damage step.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, legalMoves, sq, sqName } from '../../../src/engine';
import type { GameEvent, GameState, LengthId } from '../../../src/engine';
import { makeCtx } from '../../../src/engine/state';
import { createPlume } from '../../../src/engine/snuff';
import { act, enemyAt, eventsOf, heroPiece, setTile, unitAt } from './helpers';
import { lfGame, lfNextAction, lfScenario } from './lastFlameHelpers';

const NIGHTS: Record<LengthId, number> = { short: 3, standard: 4, long: 5 };

/** GDD §13.2.8 table: "N<night>R<round>:<open size>". Regular Nights have 4 rounds (Dawn = round 4). */
const TABLE: Array<{ board: '10x10' | '12x12'; length: LengthId; closings: string[] }> = [
  { board: '12x12', length: 'short', closings: ['N1R4:10', 'N2R4:8', 'N3R1:6', 'N3R3:4'] },
  { board: '12x12', length: 'standard', closings: ['N1R4:10', 'N2R4:8', 'N3R4:6', 'N4R3:4'] },
  { board: '12x12', length: 'long', closings: ['N2R4:10', 'N3R4:8', 'N4R4:6', 'N5R3:4'] },
  { board: '10x10', length: 'short', closings: ['N1R4:8', 'N2R4:6', 'N3R3:4'] },
  { board: '10x10', length: 'standard', closings: ['N2R4:8', 'N3R4:6', 'N4R3:4'] },
  { board: '10x10', length: 'long', closings: ['N3R4:8', 'N4R4:6', 'N5R3:4'] },
];

function gameFor(board: '10x10' | '12x12', length: LengthId, seed = 'gloam'): GameState {
  return lfGame({ seats: 3, length, seed, overrides: { board_size: board, neutrals: 'off' } });
}

interface Closed {
  at: string;
  ring: number;
  warnedThisRound: boolean;
  bellBefore: number | null;
}

/** Play a whole game with every hero kept alive; record each closing and the warning before it. */
function recordClosings(start: GameState): { closings: Closed[]; end: GameState } {
  let s = start;
  const closings: Closed[] = [];
  for (let step = 0; step < 5000 && !s.result; step++) {
    for (const p of Object.values(s.pieces)) if (p.kind === 'hero' && !p.smoldering) p.hp = p.maxHp = 60;
    const action = lfNextAction(s, 'pass');
    const before = s;
    const result = applyAction(s, action);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.reason}`);
    for (const e of eventsOf(result.events, 'gloam_closed')) {
      closings.push({
        at: `N${before.night}R${before.round}:${e.openSize}`,
        ring: e.ring,
        warnedThisRound: before.lastFlame?.gloam.warningRing === e.ring,
        bellBefore: before.lastFlame?.gloam.roundsToNext ?? null,
      });
    }
    s = result.state;
  }
  return { closings, end: s };
}

describe('Gloam schedule (B.6, §13.2.8 table)', () => {
  for (const row of TABLE) {
    it(`${row.board} ${row.length}: the schedule in the state matches the table`, () => {
      const s = gameFor(row.board, row.length);
      expect(s.config.nights).toBe(NIGHTS[row.length]);
      const gloam = s.lastFlame?.gloam;
      expect(gloam?.total).toBe(row.board === '12x12' ? 4 : 3);
      expect(gloam?.schedule.map((c) => `N${c.night}R${c.round}:${c.openSize}`)).toEqual(row.closings);
      expect(gloam?.schedule.map((c) => c.ring)).toEqual(row.closings.map((_, i) => i));
      expect(gloam?.schedule.map((c) => c.atDawn)).toEqual(row.closings.map((c) => !c.startsWith(`N${NIGHTS[row.length]}R`)));
    });

    it(`${row.board} ${row.length}: every closing lands at step 1 of its Tally, warned during that round`, () => {
      const { closings, end } = recordClosings(gameFor(row.board, row.length, `play-${row.board}-${row.length}`));
      expect(end.result?.mode).toBe('last_flame');
      expect(closings.map((c) => c.at)).toEqual(row.closings);
      expect(closings.map((c) => c.ring)).toEqual(row.closings.map((_, i) => i));
      expect(closings.every((c) => c.warnedThisRound && c.bellBefore === 0)).toBe(true);
      expect(end.lastFlame?.gloam.roundsToNext).toBeNull();
    }, 60_000);
  }

  it('the final 4×4 zone is e5–h8 on 12×12 and d4–g7 on 10×10', () => {
    for (const [board, lo, hi] of [
      ['12x12', 'e5', 'h8'],
      ['10x10', 'd4', 'g7'],
    ] as const) {
      const { end } = recordClosings(gameFor(board, 'short', `zone-${board}`));
      const open: string[] = [];
      end.board.tiles.forEach((t, i) => {
        if (!t.gloam) open.push(sqName({ x: i % end.board.w, y: Math.floor(i / end.board.w) }));
      });
      expect(open).toHaveLength(16);
      const [a, b] = [sq(lo), sq(hi)];
      for (const name of open) {
        const p = sq(name);
        expect(p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y).toBe(true);
      }
    }
  }, 60_000);
});

describe('Gloam Bell and warning', () => {
  it('counts rounds down to the closing and marks the ring from the start of its round', () => {
    let s = lfGame({ seats: 2, seed: 'bell', overrides: { neutrals: 'off' } });
    // 10×10 short: the first closing is at Night 1's round 4 Tally.
    expect(s.lastFlame?.gloam.roundsToNext).toBe(4);
    const seen: Array<{ round: number; bell: number | null; warned: number }> = [];
    let warnings: GameEvent[] = [];
    for (let guard = 0; guard < 400 && !(s.night === 1 && s.round === 4 && s.phase === 'players'); guard++) {
      const result = act(s, lfNextAction(s, 'pass'));
      warnings = warnings.concat(eventsOf(result.events, 'gloam_warning'));
      s = result.state;
      if (s.phase === 'players' && seen.at(-1)?.round !== s.round) {
        seen.push({ round: s.round, bell: s.lastFlame?.gloam.roundsToNext ?? null, warned: s.board.tiles.filter((t) => t.gloamWarning).length });
      }
    }
    expect(seen).toEqual([
      { round: 1, bell: 3, warned: 0 },
      { round: 2, bell: 2, warned: 0 },
      { round: 3, bell: 1, warned: 0 },
      { round: 4, bell: 0, warned: 36 },
    ]);
    expect(warnings).toEqual([{ type: 'gloam_warning', ring: 0 }]);
    expect(s.lastFlame?.gloam.warningRing).toBe(0);
  });

  it('Plumes are never placed in the Gloam or on the warned ring', () => {
    let s = lfGame({ seats: 3, seed: 'plume-ring', overrides: { plumes_mod: 2, board_size: '12x12', moth_die: true } });
    let warnedRounds = 0;
    for (let guard = 0; guard < 3000 && !s.result; guard++) {
      const result = act(s, lfNextAction(s, 'pass'));
      // Tally placements come after that Tally's closing (step 1), when no ring is warned.
      const atTally = s.phase === 'tally';
      for (const e of eventsOf(result.events, 'plume_placed')) {
        const tile = result.state.board.tiles[e.pos.y * result.state.board.w + e.pos.x];
        expect(tile.gloam || (!atTally && tile.gloamWarning), `Plume at ${sqName(e.pos)} in Night ${s.night}`).toBe(false);
      }
      if (result.state.lastFlame?.gloam.warningRing !== null) warnedRounds += 1;
      for (const p of Object.values(result.state.pieces)) if (p.kind === 'hero' && !p.smoldering) p.hp = p.maxHp = 60;
      s = result.state;
    }
    expect(s.lastFlame?.gloam.closingsDone).toBe(4);
    expect(warnedRounds).toBeGreaterThan(0);
  }, 60_000);
});

/** A blank Night 1 scenario fast-forwarded to the Tally of round 4, where ring 0 closes (10×10). */
function atClosingTally(heroes: string[], opts: Parameters<typeof lfScenario>[1] = {}): GameState {
  const s = lfScenario(heroes, { ...opts, overrides: { neutrals: 'off', ...(opts.overrides ?? {}) } });
  s.round = 4;
  s.phase = 'tally';
  s.activeSeat = null;
  return s;
}

describe('a closing covers its ring (§5.4)', () => {
  it('removes Plumes, Lanterns, Wick Mortars and Smokestacks, puts out Shrines and breaks Chimneys', () => {
    const s = atClosingTally(['e5', 'f6']);
    const lantern = unitAt(s, 'lantern', 'a5', 0);
    const mortar = unitAt(s, 'wick_mortar', 'j4', 1);
    const taper = unitAt(s, 'taper', 'e1', 0);
    taper.hp = taper.maxHp = 3;
    const stack = enemyAt(s, 'smokestack', 'f10');
    const sootling = enemyAt(s, 'sootling', 'a9');
    createPlume(makeCtx(s), sq('c1'), 'sootling', 'schedule');
    setTile(s, 'j7', 'votive_shrine');
    s.board.tiles[sq('j7').y * s.board.w + sq('j7').x].shrineLit = true;
    setTile(s, 'a3', 'chimney', 0);
    setTile(s, 'b2', 'chimney', 0);
    const brannoc = heroPiece(s, 0);
    brannoc.pos = sq('c2');
    expect(legalMoves(s, brannoc.id).map(sqName)).toContain('a3');
    const { state, events } = act(s, { type: 'advance' });
    expect(eventsOf(events, 'gloam_closed')[0]).toMatchObject({ ring: 0, openSize: 8 });
    expect(eventsOf(events, 'gloam_closed')[0].tiles).toHaveLength(36);
    expect(state.pieces[lantern.id]).toBeUndefined();
    expect(state.pieces[mortar.id]).toBeUndefined();
    expect(state.pieces[stack.id]).toBeUndefined();
    expect(state.pieces[sootling.id]).toBeDefined();
    // A mobile unit stays (and takes the step-5 Gloam damage).
    expect(state.pieces[taper.id]?.hp).toBe(1);
    expect(state.plumes.some((m) => sqName(m.pos) === 'c1')).toBe(false);
    expect(state.board.tiles[sq('j7').y * state.board.w + sq('j7').x]).toMatchObject({ gloam: true, shrineLit: false });
    expect(state.players.map((p) => p.glory)).toEqual([0, 0]);
    // The Chimney at b2 no longer leads anywhere: its pair (a3) is in the Gloam.
    expect(legalMoves(state, brannoc.id).map(sqName)).not.toContain('a3');
  });

  it('a Smoldering Wick under a closing ring means elimination', () => {
    const s = atClosingTally(['a1', 'f6']);
    const hero = heroPiece(s, 0);
    Object.assign(hero, { hp: 0, smoldering: true });
    const taper = unitAt(s, 'taper', 'e5', 0);
    const { state, events } = act(s, { type: 'advance' });
    expect(state.players[0]).toMatchObject({ eliminated: true, eliminationBand: 1 });
    expect(state.pieces[hero.id]).toBeUndefined();
    expect(state.pieces[taper.id]).toBeUndefined();
    expect(eventsOf(events, 'piece_died').find((e) => e.pieceId === hero.id)?.cause).toBe('gloam_wick');
    expect(eventsOf(events, 'player_eliminated')).toEqual([{ type: 'player_eliminated', seat: 0, band: 1 }]);
  });
});

describe('Gloam damage at Tally (step 5)', () => {
  it('2 damage to Wickfolk ending a Tally in the Gloam, through Ward; Snuff are immune', () => {
    const s = atClosingTally(['a5', 'f6']);
    const hero = heroPiece(s, 0);
    hero.ward = true;
    const taper = unitAt(s, 'taper', 'a8', 1);
    taper.hp = taper.maxHp = 3;
    const hound = enemyAt(s, 'smokehound', 'j9');
    const { state, events } = act(s, { type: 'advance' });
    const gloam = eventsOf(events, 'damage').filter((e) => e.cause === 'gloam');
    expect(gloam.map((e) => [e.pieceId, e.amount, e.blockedByWard])).toEqual([
      [taper.id, 2, false],
      [hero.id, 2, false],
    ]);
    expect(heroPiece(state, 0)).toMatchObject({ hp: hero.maxHp - 2, ward: true });
    expect(state.pieces[hound.id].hp).toBe(hound.hp);
  });

  it('a hero felled by the Gloam smolders inside it and is eliminated in that step', () => {
    const s = atClosingTally(['a5', 'j6', 'e5'], { seats: 3 });
    heroPiece(s, 0).hp = 2;
    heroPiece(s, 1).hp = 1;
    const { state, events } = act(s, { type: 'advance' });
    expect(state.players.map((p) => p.eliminated)).toEqual([true, true, false]);
    // Same Tally step: one shared band.
    expect(eventsOf(events, 'player_eliminated').map((e) => e.band)).toEqual([1, 1]);
    expect(state.result?.mode).toBe('last_flame');
    if (state.result?.mode === 'last_flame') {
      expect(state.result.reason).toBe('last_standing');
      expect(state.result.standings.map((st) => st.placement)).toEqual([2, 2, 1]);
    }
  });
});
