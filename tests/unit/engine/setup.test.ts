import { describe, expect, it } from 'vitest';
import { activeSeats, createGame, ENGINE_VERSION, getContent, pendingAutomation, sqName, standardStreamNames, STATE_VERSION } from '../../../src/engine';
import type { GameState, SeatKind } from '../../../src/engine';
import { configFor, newGame } from './helpers';

const reg = getContent();

function seatsOf(kinds: SeatKind[], heroes: Array<string | null> = []) {
  return kinds.map((kind, i) => ({ kind, hero: heroes[i] ?? null }));
}

function checkCommon(s: GameState, seatCount: number): void {
  expect(s.version).toBe(STATE_VERSION);
  expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(s.phase).toBe('night_setup');
  expect(s.night).toBe(1);
  expect(s.round).toBe(0);
  expect(Object.keys(s.rng).sort()).toEqual(standardStreamNames(seatCount).sort());
  expect(s.players.map((p) => p.house)).toEqual(reg.houses.list.slice(0, seatCount).map((h) => h.id));
  expect(new Set(s.players.map((p) => p.hero)).size).toBe(seatCount);
  for (const p of s.players) {
    expect(reg.heroes.byId[p.hero]).toBeDefined();
    const all = [...p.deck, ...p.hand, ...p.discard];
    expect(all).toHaveLength(reg.rules.startingDeckSize);
    expect(p.hand).toHaveLength(s.config.hand_size);
    expect(all.filter((c) => c.id === 'spark')).toHaveLength(2);
    const hero = s.pieces[p.heroPieceId];
    expect(hero.kind).toBe('hero');
    expect(hero.owner).toBe(p.seat);
    expect(hero.hp).toBe(reg.heroes.byId[p.hero].hp);
    expect(p.startTile).toEqual(hero.pos);
  }
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('createGame: Vigil', () => {
  for (const seatCount of [1, 2, 3, 4]) {
    it(`${seatCount} seat(s): board, Candles, heroes on default starts, enemies, Plumes`, () => {
      const kinds: SeatKind[] = ['human', 'bot_warden', 'bot_apprentice', 'bot_elder'].slice(0, seatCount) as SeatKind[];
      const s = newGame({ seed: `vigil-${seatCount}`, seats: seatsOf(kinds) });
      checkCommon(s, seatCount);
      const edge = seatCount <= 2 ? 8 : 10;
      expect([s.board.w, s.board.h]).toEqual([edge, edge]);
      expect(s.siteId).toBe('cathedral_of_tallow');
      expect(s.tier).toBe(1);
      expect(s.roundsThisNight).toBe(4);
      const starts = reg.rules.vigilHeroStarts[edge === 8 ? '8x8' : '10x10'];
      expect(s.players.map((p) => sqName(s.pieces[p.heroPieceId].pos))).toEqual(starts.slice(0, seatCount));
      const pieces = Object.values(s.pieces);
      expect(pieces.filter((p) => p.kind === 'candle')).toHaveLength(3);
      const enemies = pieces.filter((p) => p.side === 'snuff');
      expect(enemies).toHaveLength(Math.max(1, seatCount + 1 + s.config.initial_enemies_mod));
      expect(s.plumes).toHaveLength(Math.max(1, 1 + Math.floor(seatCount / 2) + s.config.plumes_mod));
      expect(s.vigil).toMatchObject({ dread: s.config.starting_dread, dreadMax: s.config.dread_max });
      // Every seat readies itself (bots deploy and Ready through botChoice).
      expect(s.players.map((p) => p.ready)).toEqual(kinds.map(() => false));
      expect(s.nightSnapshot).not.toBeNull();
      expect(activeSeats(s)).toEqual(kinds.map((_, i) => i));
      expect(pendingAutomation(s)).toBeNull();
    });
  }

  it('keeps given heroes and fills empty seats with distinct unpicked heroes from the setup stream', () => {
    const s = newGame({ seats: seatsOf(['human', 'bot_warden', 'bot_warden'], ['lampwright', null, null]) });
    expect(s.players[0].hero).toBe('lampwright');
    expect(s.players.slice(1).every((p) => p.hero !== 'lampwright')).toBe(true);
    const again = newGame({ seats: seatsOf(['human', 'bot_warden', 'bot_warden'], ['lampwright', null, null]) });
    expect(again.players.map((p) => p.hero)).toEqual(s.players.map((p) => p.hero));
    expect(again).toEqual(s);
  });

  it('builds the starting deck from the hero class starters (§7.2)', () => {
    const s = newGame({ seats: seatsOf(['human'], ['ember_duelist']) });
    const ids = [...s.players[0].deck, ...s.players[0].hand].map((c) => c.id).sort();
    expect(ids).toEqual(
      ['spark', 'spark', 'light_a_taper', 'mend_the_wick', 'strike_a_cinder', 'strike_a_cinder', 'feint', 'feint', 'searing_edge', 'searing_edge'].sort(),
    );
  });

  it('first-ever game starts on first_vigil with the scripted Sootlings and Plume', () => {
    const s = newGame({ seats: seatsOf(['human'], ['sconce_paladin']), flags: { tutorial: true, firstGame: true } });
    expect(s.siteId).toBe('first_vigil');
    expect(sqName(s.pieces[s.players[0].heroPieceId].pos)).toBe('d2');
    const sootlings = Object.values(s.pieces).filter((p) => p.defId === 'sootling').map((p) => sqName(p.pos)).sort();
    expect(sootlings).toEqual(['c4', 'f5']);
    expect(s.plumes.map((m) => [sqName(m.pos), m.enemyId])).toEqual([['c6', 'sootling']]);
    expect(s.tutorial).toMatchObject({ heroId: 'sconce_paladin', scripted: true });
  });

  it('rejects invalid configs', () => {
    expect(() => createGame(configFor({ seats: seatsOf(['human', 'human'], ['moth_witch', 'moth_witch']) }))).toThrow(/unique/);
    expect(() => createGame({ ...configFor(), seats: [] })).toThrow(/seats/);
  });
});

describe('createGame: Last Flame', () => {
  for (const seatCount of [2, 3, 4]) {
    it(`${seatCount} seats: last_flame_ring, start tiles, neutrals in the centre`, () => {
      const kinds: SeatKind[] = ['human', 'bot_warden', 'bot_warden', 'bot_warden'].slice(0, seatCount) as SeatKind[];
      const s = newGame({ mode: 'last_flame', seed: `lf-${seatCount}`, seats: seatsOf(kinds) });
      checkCommon(s, seatCount);
      expect(s.siteId).toBe('last_flame_ring');
      const edge = seatCount <= 3 ? 10 : 12;
      expect(s.board.w).toBe(edge);
      const layout = reg.maps.byId.last_flame_ring.layouts.find((l) => l.w === edge);
      const starts = seatCount === 2 ? layout?.heroStarts2 : layout?.heroStarts;
      expect(s.players.map((p) => sqName(s.pieces[p.heroPieceId].pos))).toEqual(starts?.slice(0, seatCount));
      expect(Object.values(s.pieces).some((p) => p.kind === 'candle')).toBe(false);
      const enemies = Object.values(s.pieces).filter((p) => p.side === 'snuff');
      expect(enemies).toHaveLength(Math.max(0, seatCount + s.config.initial_enemies_mod));
      const lo = edge / 2 - 2;
      for (const e of enemies) {
        expect(e.pos.x).toBeGreaterThanOrEqual(lo);
        expect(e.pos.x).toBeLessThan(lo + 4);
      }
      expect(s.lastFlame?.gloam.schedule.length).toBe(reg.rules.gloam.closings[edge === 10 ? '10x10' : '12x12']);
      expect(s.vigil).toBeNull();
      expect(s.plumes.length).toBeGreaterThanOrEqual(1);
    });
  }
});
