/**
 * Haunting (GDD §13.2.7): eliminated players place one Sootling Plume per Plume placement — the
 * Tally pauses for them — on a legal tile; the haunted hero is the nearest (ties: seat order from
 * the First Light holder), never the same hero twice in a row, at most one per hero per round;
 * `at: null` skips; bots haunt the Glory leader.
 */
import { describe, expect, it } from 'vitest';
import { activeSeats, botChoice, chebyshev, hauntedHeroAt, hauntOptions, pendingAutomation, sq, sqName, validateAction } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { act, eventsOf, heroPiece } from './helpers';
import { advanceUntil, lfScenario } from './lastFlameHelpers';

/**
 * 3 humans (c3, h3, h8 on 10×10), seat 2 concedes in round 1; the round runs to its Tally, which
 * pauses at step 10 for seat 2's Haunt.
 */
function pausedTally(opts: { haunting?: boolean; at?: string[] } = {}): GameState {
  let s = lfScenario(opts.at ?? ['c3', 'h3', 'h8'], { overrides: { truce: 'off', haunting: opts.haunting ?? true } });
  s = act(s, { type: 'concede', seat: 2 }).state;
  return advanceUntil(s, (q) => q.phase === 'tally' && (q.lastFlame?.tallyPaused === true || pendingAutomation(q) !== null) && q.round === 1, 50);
}

function advanceTally(s: GameState): GameState {
  return act(s, { type: 'advance' }).state;
}

describe('the Haunt step', () => {
  it('the Tally pauses at step 10 until the eliminated seat haunts, then resumes at step 11', () => {
    const s = advanceTally(pausedTally());
    expect(s.phase).toBe('tally');
    expect(s.lastFlame?.tallyPaused).toBe(true);
    expect(s.players[2].haunt.pending).toBe(true);
    expect(pendingAutomation(s)).toBeNull();
    expect(activeSeats(s)).toEqual([2]);
    expect(s.firstLight).toBe(0);
    const option = hauntOptions(s, 2)[0];
    expect(option).toBeDefined();
    const { state, events } = act(s, { type: 'haunt', seat: 2, at: option.pos });
    const plume = state.plumes.find((m) => m.source === 'haunt');
    expect(plume).toMatchObject({ enemyId: 'sootling', hauntSeat: 2, hauntedHeroId: option.heroId, pos: option.pos });
    expect(eventsOf(events, 'plume_placed')).toEqual([{ type: 'plume_placed', plumeId: plume?.id, pos: option.pos, enemyId: 'sootling', source: 'haunt' }]);
    expect(state.players[2].haunt).toEqual({ pending: false, lastHeroId: option.heroId });
    expect(state.pieces[option.heroId].hauntedThisRound).toBe(true);
    expect(pendingAutomation(state)).toEqual({ phase: 'tally' });
    const resumed = act(state, { type: 'advance' });
    expect(resumed.state.round).toBe(2);
    expect(eventsOf(resumed.events, 'first_light_passed')).toEqual([{ type: 'first_light_passed', seat: 1 }]);
    expect(eventsOf(resumed.events, 'plume_placed')).toEqual([]);
  });

  it('`at: null` skips the Haunt', () => {
    const s = advanceTally(pausedTally());
    const { state } = act(s, { type: 'haunt', seat: 2, at: null });
    expect(state.plumes.some((m) => m.source === 'haunt')).toBe(false);
    expect(state.players[2].haunt).toEqual({ pending: false, lastHeroId: null });
  });

  it('with Haunting off nobody haunts', () => {
    const s = advanceTally(pausedTally({ haunting: false }));
    expect(s.round).toBe(2);
    expect(s.players[2].haunt.pending).toBe(false);
    expect(validateAction(s, { type: 'haunt', seat: 2, at: null })).toMatchObject({ ok: false, reason: 'NOT_ENABLED' });
  });
});

describe('Haunt constraints', () => {
  it('the tile must be legal: an empty flagstone or rubble at least 2 from every hero', () => {
    const s = advanceTally(pausedTally());
    const near = { x: heroPiece(s, 0).pos.x + 1, y: heroPiece(s, 0).pos.y };
    expect(validateAction(s, { type: 'haunt', seat: 2, at: near })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
    expect(validateAction(s, { type: 'haunt', seat: 2, at: heroPiece(s, 1).pos })).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
    expect(validateAction(s, { type: 'haunt', seat: 1, at: null })).toMatchObject({ ok: false, reason: 'INVALID_ACTION' });
    for (const option of hauntOptions(s, 2)) {
      expect(Object.values(s.pieces).filter((p) => p.kind === 'hero').every((h) => Math.max(Math.abs(h.pos.x - option.pos.x), Math.abs(h.pos.y - option.pos.y)) >= 2)).toBe(true);
    }
  });

  it('the haunted hero is the nearest; ties go by seat order from the First Light holder', () => {
    const s = advanceTally(pausedTally({ at: ['c3', 'g3', 'h8'] }));
    // e3 is 2 from c3 (seat 0) and 2 from g3 (seat 1).
    expect(hauntedHeroAt(s, sq('e3'))?.owner).toBe(0);
    s.firstLight = 1;
    expect(hauntedHeroAt(s, sq('e3'))?.owner).toBe(1);
    expect(hauntedHeroAt(s, sq('c6'))?.owner).toBe(0);
  });

  it('never the same hero twice in a row (HAUNT_REPEAT); at most one per hero per round (HAUNT_LIMIT)', () => {
    const s = advanceTally(pausedTally());
    const seat0Hero = heroPiece(s, 0);
    const towardSeat0 = hauntOptions(s, 2).find((o) => o.heroId === seat0Hero.id);
    expect(towardSeat0).toBeDefined();
    const repeat = structuredClone(s);
    repeat.players[2].haunt.lastHeroId = seat0Hero.id;
    expect(validateAction(repeat, { type: 'haunt', seat: 2, at: towardSeat0?.pos ?? null })).toMatchObject({ ok: false, reason: 'HAUNT_REPEAT' });
    expect(hauntOptions(repeat, 2).some((o) => o.heroId === seat0Hero.id)).toBe(false);
    const limit = structuredClone(s);
    limit.pieces[seat0Hero.id].hauntedThisRound = true;
    expect(validateAction(limit, { type: 'haunt', seat: 2, at: towardSeat0?.pos ?? null })).toMatchObject({ ok: false, reason: 'HAUNT_LIMIT' });
  });

  it('two haunters cannot both haunt the same hero in one round', () => {
    let s = lfScenario(['c3', 'h3', 'h8', 'c8'], { overrides: { truce: 'off', board_size: '12x12' } });
    s = act(s, { type: 'concede', seat: 2 }).state;
    s = act(s, { type: 'concede', seat: 3 }).state;
    s = advanceUntil(s, (q) => q.phase === 'tally' && q.players[2].haunt.pending, 50);
    expect(activeSeats(s)).toEqual([2, 3]);
    const first = hauntOptions(s, 2)[0];
    s = act(s, { type: 'haunt', seat: 2, at: first.pos }).state;
    expect(hauntOptions(s, 3).some((o) => o.heroId === first.heroId)).toBe(false);
  });

  it('bots haunt the Glory leader from as close as the rules allow', () => {
    const s = advanceTally(pausedTally());
    s.players[1].glory = 4;
    const choice = botChoice(s, 2);
    expect(choice?.type).toBe('haunt');
    const at = choice?.type === 'haunt' ? choice.at : null;
    expect(at).not.toBeNull();
    if (!at) return;
    const leader = heroPiece(s, 1);
    expect(hauntedHeroAt(s, at)?.owner).toBe(1);
    expect(chebyshev(at, leader.pos)).toBe(2);
    // The first such tile in reading order (hauntOptions lists tiles in reading order).
    const closest = hauntOptions(s, 2).filter((o) => o.heroId === leader.id && chebyshev(o.pos, leader.pos) === 2)[0];
    expect(sqName(at)).toBe(sqName(closest.pos));
  });

  it('night_setup placements are Haunt placements too', () => {
    let s = advanceTally(pausedTally({ at: ['c3', 'h3', 'h8'] }));
    s = act(s, { type: 'haunt', seat: 2, at: null }).state;
    s = advanceUntil(s, (q) => q.night === 2 && q.phase === 'night_setup', 400);
    expect(s.players[2].haunt.pending).toBe(true);
    expect(activeSeats(s)).toContain(2);
    for (const p of s.players) if (!p.eliminated && !p.ready) s = act(s, { type: 'ready', seat: p.seat }).state;
    expect(pendingAutomation(s)).toBeNull();
    s = act(s, { type: 'haunt', seat: 2, at: null }).state;
    expect(pendingAutomation(s)).toEqual({ phase: 'night_setup' });
  });
});
