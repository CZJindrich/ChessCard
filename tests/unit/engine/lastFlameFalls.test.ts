/**
 * Falling, respawn and elimination in Last Flame (GDD §13.2.6): the Smoldering Wick and its
 * respawn at the owner's next seat turn, elimination on the Boss Night or with respawn off (units
 * melt, Charms return), elimination bands, a seat eliminated during its own turn, and concede.
 */
import { describe, expect, it } from 'vitest';
import { sq, sqName } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { act, eventsOf, giveCard, heroPiece, playCard, setTile, unitAt } from './helpers';
import { advanceUntil, lfScenario } from './lastFlameHelpers';

/** Seat 0 (Brannoc, d4) next to seat 1 (Velveteen, e5, 2 HP); no truce. */
function duel(overrides: Parameters<typeof lfScenario>[1] = {}): GameState {
  const s = lfScenario(['d4', 'e5'], { ...overrides, overrides: { truce: 'off', ...(overrides.overrides ?? {}) } });
  heroPiece(s, 1).hp = 2;
  return s;
}

function strikeRival(s: GameState): ReturnType<typeof act> {
  return act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: heroPiece(s, 1).pos });
}

describe('respawn before the Boss Night (§13.2.6)', () => {
  it('a fallen hero smolders, then reappears on its start tile at its next seat turn with ⌈max/2⌉ HP, Ready', () => {
    const fallen = strikeRival(duel()).state;
    const wick = heroPiece(fallen, 1);
    expect(wick).toMatchObject({ smoldering: true, hp: 0, pos: sq('e5') });
    expect(fallen.players[1].eliminated).toBe(false);
    const { state, events } = act(fallen, { type: 'end_turn', seat: 0 });
    expect(state.activeSeat).toBe(1);
    const hero = heroPiece(state, 1);
    expect(hero).toMatchObject({ smoldering: false, hp: 3, pos: sq('h8'), movesLeft: 1, strikesLeft: 1, exhausted: false });
    expect(eventsOf(events, 'piece_moved').find((e) => e.pieceId === hero.id)).toMatchObject({ kind: 'respawn', from: sq('e5'), to: sq('h8') });
    expect(eventsOf(events, 'hero_relit')).toEqual([{ type: 'hero_relit', pieceId: hero.id, seat: 1, pos: sq('h8'), hp: 3, cause: 'respawn' }]);
  });

  it('a blocked start tile uses the placement routine with no cap, outside the Gloam', () => {
    const fallen = strikeRival(duel()).state;
    unitAt(fallen, 'taper', 'h8', 0);
    for (const name of ['g9', 'h9', 'i9', 'g8', 'i8', 'g7', 'h7', 'i7']) fallen.board.tiles[sq(name).y * fallen.board.w + sq(name).x].gloam = true;
    const state = act(fallen, { type: 'end_turn', seat: 0 }).state;
    expect(sqName(heroPiece(state, 1).pos)).toBe('f10');
  });

  it('a Wick keeps smoldering through Dawn and respawns at the next Night', () => {
    let s = strikeRival(duel({ overrides: { neutrals: 'off' } })).state;
    s.round = 4;
    s = act(s, { type: 'end_turn', seat: 0 }).state;
    // Seat 1 respawned at once; fell again: make it fall during the Snuff-free Tally instead.
    const witch = heroPiece(s, 1);
    Object.assign(witch, { hp: 0, smoldering: true, pos: sq('e5') });
    s = act(s, { type: 'end_turn', seat: 1 }).state;
    s = advanceUntil(s, (q) => q.phase === 'dawn' || q.phase === 'chandlery');
    s = advanceUntil(s, (q) => q.night === 2 && q.phase === 'night_setup');
    expect(heroPiece(s, 1)).toMatchObject({ smoldering: true, pos: sq('e5') });
    s = advanceUntil(s, (q) => q.phase === 'players' && q.activeSeat === 1);
    expect(heroPiece(s, 1)).toMatchObject({ smoldering: false, pos: sq('h8'), hp: 3 });
  });
});

describe('elimination (§13.2.6)', () => {
  it('with respawn off a fallen hero is eliminated at once: units melt, Charms return', () => {
    const s = duel({ overrides: { respawn_before_boss: false } });
    const moth = unitAt(s, 'velvet_moth', 'g6', 1);
    const witch = heroPiece(s, 1);
    witch.charm = { uid: 'c9001', id: 'cocoon', tempered: false };
    witch.charmSeat = 1;
    const { state, events } = strikeRival(s);
    expect(state.players[1]).toMatchObject({ eliminated: true, eliminationBand: 1, eliminatedAt: { night: 1, round: 1 } });
    expect(state.pieces[witch.id]).toBeUndefined();
    expect(state.pieces[moth.id]).toBeUndefined();
    expect(state.players[1].discard.map((c) => c.uid)).toContain('c9001');
    expect(eventsOf(events, 'piece_died').map((e) => [e.pieceId, e.cause, e.killerSeat])).toEqual([
      [witch.id, 'strike', 0],
      [moth.id, 'melt', null],
    ]);
    expect(eventsOf(events, 'player_eliminated')).toEqual([{ type: 'player_eliminated', seat: 1, band: 1 }]);
    expect(state.players.map((p) => p.glory)).toEqual([3, 0]);
  });

  it('Riposte answers the fatal hit before the hero leaves', () => {
    const s = duel({ overrides: { respawn_before_boss: false } });
    const witch = heroPiece(s, 1);
    witch.charm = { uid: 'c9002', id: 'riposte', tempered: false };
    witch.charmSeat = 1;
    const { state, events } = strikeRival(s);
    const brannoc = heroPiece(state, 0);
    expect(brannoc.hp).toBe(brannoc.maxHp - 1);
    expect(eventsOf(events, 'damage').map((e) => e.cause)).toEqual(['strike', 'riposte']);
    expect(state.players[1].discard.map((c) => c.uid)).toContain('c9002');
  });

  it('one action eliminating two seats puts them in one band; later eliminations get later bands', () => {
    const s = lfScenario(['d2', 'd4', 'e4', 'j10'], { overrides: { truce: 'off', respawn_before_boss: false } });
    heroPiece(s, 1).hp = 1;
    heroPiece(s, 2).hp = 1;
    const flared = playCard(s, giveCard(s, 'flare'), ['d4']);
    expect(eventsOf(flared.events, 'player_eliminated').map((e) => [e.seat, e.band])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    const later = flared.state;
    heroPiece(later, 3).hp = 1;
    heroPiece(later, 3).pos = sq('c3');
    const spark = playCard(later, giveCard(later, 'spark'), [heroPiece(later, 3)]);
    expect(eventsOf(spark.events, 'player_eliminated')).toEqual([{ type: 'player_eliminated', seat: 3, band: 2 }]);
  });

  it('a seat eliminated during its own turn forfeits it; the next seat acts', () => {
    const s = lfScenario(['d4', 'h8', 'c8'], { overrides: { respawn_before_boss: false } });
    heroPiece(s, 0).hp = 1;
    setTile(s, 'd5', 'hot_wax');
    const { state, events } = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d5') });
    expect(state.players[0].eliminated).toBe(true);
    expect(state.activeSeat).toBe(1);
    expect(eventsOf(events, 'turn_ended')).toEqual([{ type: 'turn_ended', seat: 0 }]);
    expect(state.undo.depth).toBe(0);
  });

  it('on the Boss Night a fall is always an elimination', () => {
    const s = duel();
    s.isBossNight = true;
    s.night = s.config.nights;
    const state = strikeRival(s).state;
    expect(state.players[1].eliminated).toBe(true);
  });
});

describe('concede (Last Flame)', () => {
  it('a conceding seat leaves at once; the game ends when no human is left', () => {
    const s = lfScenario(['d4', 'e5', 'j1'], { kinds: ['human', 'human', 'bot_warden'] });
    const one = act(s, { type: 'concede', seat: 1 });
    expect(one.state.players[1]).toMatchObject({ eliminated: true, eliminationBand: 1 });
    expect(one.state.result).toBeNull();
    const two = act(one.state, { type: 'concede', seat: 0 });
    expect(two.state.result).toMatchObject({ mode: 'last_flame', reason: 'conceded' });
    if (two.state.result?.mode === 'last_flame') {
      expect(two.state.result.standings.find((st) => st.seat === 2)).toMatchObject({ placement: 1, alive: true, standingBonus: 5 });
      expect(two.state.result.standings.find((st) => st.seat === 0)?.placement).toBe(2);
    }
  });
});
