/**
 * Last Flame flow (GDD §13.2, §4, §11.2, §13.2.9): setup and deploy, neutrals and Plume quadrants,
 * the Snuff's Glory tie-break, turn order and First Light, the Boss Night's end conditions and
 * placements, whole games for 2-4 seats, determinism, and per-seat views.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  compareStandings,
  eventsForSeat,
  getContent,
  GLORY_REASONS,
  lastFlameStandings,
  quadrantOf,
  sq,
  sqName,
  validateAction,
  viewFor,
} from '../../../src/engine';
import type { Action, GameEvent, GameState, LengthId, SeatKind } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { neutralEnemyCount } from '../../../src/engine/modes/lastFlame';
import { plumePlacement } from '../../../src/engine/setup';
import { makeCtx } from '../../../src/engine/state';
import { bossNight, bossPiece, toBossPlayers } from './bossHelpers';
import { act, enemyAt, eventsOf, heroPiece } from './helpers';
import { advanceUntil, lfGame, lfNextAction, lfScenario, playLastFlame } from './lastFlameHelpers';

describe('setup (§13.2.1, §4.2)', () => {
  it('heroes start on their start tiles and may deploy within 1; the start tile stays the seat start', () => {
    const s = lfGame({ seats: 3 });
    expect(s.players.map((p) => sqName(heroPiece(s, p.seat).pos))).toEqual(['c3', 'h3', 'h8']);
    const hero = heroPiece(s, 0);
    expect(validateAction(s, { type: 'deploy', seat: 0, pieceId: hero.id, to: sq('e3') })).toMatchObject({ ok: false, reason: 'NOT_DEPLOY_ZONE' });
    const moved = act(s, { type: 'deploy', seat: 0, pieceId: hero.id, to: sq('d4') }).state;
    expect(sqName(moved.players[0].startTile ?? { x: -1, y: -1 })).toBe('c3');
    // A second deploy is still measured from c3, never from d4.
    expect(validateAction(moved, { type: 'deploy', seat: 0, pieceId: hero.id, to: sq('e5') })).toMatchObject({ ok: false, reason: 'NOT_DEPLOY_ZONE' });
  });

  it('later Nights keep every piece where it stands', () => {
    let s = lfGame({ seats: 2, overrides: { neutrals: 'off' } });
    s = advanceUntil(s, (q) => q.phase === 'players');
    heroPiece(s, 0).pos = sq('e6');
    s = advanceUntil(s, (q) => q.night === 2 && q.phase === 'night_setup', 400);
    expect(sqName(heroPiece(s, 0).pos)).toBe('e6');
    expect(validateAction(s, { type: 'deploy', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('e5') })).toMatchObject({ ok: false });
  });
});

describe('neutrals (§13.2.1, §13.2.5)', () => {
  it('initial enemies: L + initial_enemies_mod in the central 4×4; L counts heroes still in the game', () => {
    const s = lfGame({ seats: 3, overrides: { initial_enemies_mod: 1 } });
    const snuff = Object.values(s.pieces).filter((p) => p.side === 'snuff');
    expect(snuff).toHaveLength(4);
    for (const p of snuff) expect(p.pos.x >= 3 && p.pos.x <= 6 && p.pos.y >= 3 && p.pos.y <= 6, sqName(p.pos)).toBe(true);
    s.players[2].eliminated = true;
    expect(neutralEnemyCount(s)).toBe(3);
  });

  it('Plumes go round-robin by quadrant from the First Light holder start quadrant, clockwise', () => {
    const s = lfScenario(['c3', 'h3', 'h8'], { overrides: { neutrals: 'swarm', plumes_mod: 1 } });
    // max(1, 3 − 1 + 1) + 1 (swarm) = 4 Plumes.
    const quadrants = (state: GameState) => state.plumes.map((m) => quadrantOf(m.pos, state.board.w, state.board.h));
    plumePlacement(makeCtx(s), 1);
    expect(quadrants(s)).toEqual([0, 1, 2, 3]);
    s.plumes = [];
    s.firstLight = 2;
    plumePlacement(makeCtx(s), 1);
    expect(quadrants(s)).toEqual([2, 3, 0, 1]);
    s.plumes = [];
    s.config = { ...s.config, plumes_mod: 0, neutrals: 'normal' };
    s.firstLight = 1;
    plumePlacement(makeCtx(s), 1);
    expect(quadrants(s)).toEqual([1, 2]);
  });

  it('the Snuff tie-break: among equal targets, the hero of the higher-Glory owner', () => {
    for (const leader of [0, 1]) {
      let s = lfScenario(['c5', 'g5'], { overrides: { neutrals: 'off' } });
      const hound = enemyAt(s, 'smokehound', 'e5');
      heroPiece(s, 0).hp = 5;
      heroPiece(s, 1).hp = 5;
      s.players[leader].glory = 3;
      s = advanceUntil(s, (q) => q.round === 2 && q.phase === 'players');
      const intent = s.intents.find((i) => i.attackerId === hound.id);
      expect(intent?.targetId).toBe(heroPiece(s, leader).id);
    }
  });
});

describe('turn order and First Light (§11.2)', () => {
  it('seats act clockwise from First Light, which passes at every Tally and skips the eliminated', () => {
    let s = lfScenario(['c3', 'h3', 'h8'], { overrides: { neutrals: 'off' } });
    const order: number[][] = [];
    const record = (q: GameState): void => {
      if (q.phase !== 'players' || q.activeSeat === null) return;
      order[q.round - 1] ??= [];
      if (order[q.round - 1].at(-1) !== q.activeSeat) order[q.round - 1].push(q.activeSeat);
    };
    for (let guard = 0; guard < 200 && s.round <= 3; guard++) {
      record(s);
      if (s.round === 2 && s.phase === 'players' && s.activeSeat === 2 && !s.players[0].eliminated) {
        s = act(s, { type: 'concede', seat: 0 }).state;
        continue;
      }
      s = act(s, lfNextAction(s, 'pass')).state;
    }
    expect(order).toEqual([
      [0, 1, 2],
      [1, 2],
      [2, 1],
    ]);
  });
});

/** Run from `start` (all seats ending turns) until the game is over; collect every event. */
function runOut(start: GameState, keepAlive = false, maxSteps = 2000): { state: GameState; events: GameEvent[]; overAt: string } {
  let s = start;
  let events: GameEvent[] = [];
  let overAt = '';
  for (let step = 0; step < maxSteps && !s.result; step++) {
    if (keepAlive) for (const p of Object.values(s.pieces)) if (p.kind === 'hero' && !p.smoldering) p.hp = p.maxHp = 60;
    const before = s;
    const result = act(s, lfNextAction(s, 'pass'));
    events = events.concat(result.events);
    s = result.state;
    if (s.result) overAt = `${before.phase} N${before.night}R${before.round}`;
  }
  return { state: s, events, overAt };
}

describe('the Boss Night and the end of the game (§13.2.9)', () => {
  it('the boss spawns at the centre with HP for the heroes still in the game', () => {
    const s = bossNight({ boss: 'nocturna', seats: 3, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } });
    expect(sqName(bossPiece(s).pos)).toBe('e5');
    const { base, perPlayer } = getContent().bosses.byId.nocturna.hp;
    expect(s.boss?.maxHp).toBe(base + perPlayer * 3);
  });

  it('ends after the Tally of the round in which the boss falls: killing blow +2, standing heroes +5', () => {
    let s = toBossPlayers(bossNight({ boss: 'hush_hierophant', seats: 2, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } }));
    const boss = bossPiece(s);
    dealDamage(makeCtx(s), boss, boss.hp, { cause: 'strike', sourceKind: 'player_strike', sourceId: null, seat: 1 });
    expect(s.pieces[boss.id]).toBeUndefined();
    expect(s.result).toBeNull();
    s = advanceUntil(s, (q) => q.phase === 'tally');
    expect(s.result).toBeNull();
    const { state, overAt } = runOut(s);
    expect(overAt).toBe(`tally N${s.night}R1`);
    expect(state.result).toMatchObject({ mode: 'last_flame', reason: 'boss_fell' });
    if (state.result?.mode !== 'last_flame') return;
    const winner = state.result.standings.find((st) => st.seat === 1);
    expect(winner).toMatchObject({ placement: 1, alive: true, standingBonus: 5 });
    expect(winner?.breakdown).toMatchObject({ boss_kill: 2, boss_damage: 10, survival: 5 });
  });

  it('ends at the Tally of the last boss round', () => {
    const s = toBossPlayers(bossNight({ boss: 'guttered_king', seats: 2, mode: 'last_flame', overrides: { boss_rounds: 3, boss_hp_multiplier: 2 } }));
    const { state, overAt } = runOut(s, true);
    expect(state.result).toMatchObject({ mode: 'last_flame', reason: 'boss_rounds' });
    expect(overAt).toBe(`tally N${s.night}R3`);
    expect(state.lastFlame?.gloam.closingsDone).toBe(state.lastFlame?.gloam.total);
  });

  it('ends at a Tally with one or no heroes standing', () => {
    const s = toBossPlayers(bossNight({ boss: 'nocturna', seats: 3, mode: 'last_flame' }));
    expect(s.activeSeat).toBe(1);
    const ctx = makeCtx(s);
    for (const seat of [0, 2]) dealDamage(ctx, heroPiece(s, seat), 99, { cause: 'strike', sourceKind: 'rival_strike', sourceId: null, seat: 1 });
    expect(s.players.map((p) => p.eliminated)).toEqual([true, false, true]);
    expect(s.players[0].eliminationBand).toBe(1);
    expect(s.players[2].eliminationBand).toBe(2);
    const { state, overAt } = runOut(s, true);
    expect(overAt).toBe(`tally N${s.night}R1`);
    expect(state.result).toMatchObject({ mode: 'last_flame', reason: 'last_standing' });
    if (state.result?.mode !== 'last_flame') return;
    // Seat 1 took 6 Glory from two rival heroes; seat 2 went out in the later band.
    expect(state.result.standings.map((st) => [st.seat, st.placement])).toEqual([
      [0, 3],
      [1, 1],
      [2, 2],
    ]);
  });

  it('placement ties: still standing, then the later band, then boss damage, then shared', () => {
    const s = lfScenario(['c3', 'j3', 'j10', 'c10']);
    const lf = s.lastFlame;
    if (!lf) throw new Error('no Last Flame state');
    s.players.forEach((p) => (p.glory = 10));
    Object.assign(s.players[1], { eliminated: true, eliminationBand: 2 });
    Object.assign(s.players[2], { eliminated: true, eliminationBand: 1 });
    Object.assign(s.players[3], { eliminated: true, eliminationBand: 1 });
    s.boss = { id: 'nocturna', pieceId: 'gone', phase: 1, crowns: 0, maxHp: 40, escapes: 0, damageBySeat: [0, 0, 5, 5], killerSeat: null, clapperSwinging: false };
    expect(lastFlameStandings(s).map((st) => st.placement)).toEqual([1, 2, 3, 3]);
    s.boss.damageBySeat = [0, 0, 5, 7];
    expect(lastFlameStandings(s).map((st) => st.placement)).toEqual([1, 2, 4, 3]);
    s.players[2].glory = 11;
    expect(lastFlameStandings(s).map((st) => st.placement)).toEqual([2, 3, 1, 4]);
  });
});

describe('whole games (2-4 seats)', () => {
  const runs: Array<{ seats: number; length: LengthId; kinds: SeatKind[] }> = [
    { seats: 2, length: 'short', kinds: ['human', 'bot_warden'] },
    { seats: 2, length: 'standard', kinds: ['human', 'human'] },
    { seats: 3, length: 'short', kinds: ['human', 'bot_warden', 'bot_warden'] },
    { seats: 3, length: 'long', kinds: ['human', 'human', 'human'] },
    { seats: 4, length: 'short', kinds: ['human', 'human', 'bot_warden', 'human'] },
    { seats: 4, length: 'standard', kinds: ['human', 'human', 'human', 'human'] },
  ];
  for (const run of runs) {
    it(`${run.seats} seats, ${run.length}: greedy play reaches game_over with sane standings`, () => {
      const start = lfGame({ seats: run.seats, kinds: run.kinds, length: run.length, seed: `whole-${run.seats}-${run.length}`, overrides: { moth_die: true } });
      const { state } = playLastFlame(start, 'greedy', 30_000, (s) => {
        for (const p of s.players) {
          if (!p.eliminated) continue;
          expect(s.pieces[p.heroPieceId], `eliminated seat ${p.seat} hero`).toBeUndefined();
          expect(Object.values(s.pieces).some((q) => q.owner === p.seat)).toBe(false);
        }
      });
      expect(state.phase).toBe('game_over');
      const result = state.result;
      expect(result?.mode).toBe('last_flame');
      if (result?.mode !== 'last_flame') return;
      expect(['boss_fell', 'boss_rounds', 'last_standing']).toContain(result.reason);
      expect(result.standings).toHaveLength(run.seats);
      expect(Math.min(...result.standings.map((st) => st.placement))).toBe(1);
      for (const st of result.standings) {
        const player = state.players[st.seat];
        expect(st.score).toBe(player.glory);
        expect(st.score).toBe(st.glory + st.standingBonus);
        expect(st.standingBonus).toBe(st.alive ? 5 : 0);
        expect(st.alive).toBe(!player.eliminated);
        expect(GLORY_REASONS.reduce((sum, r) => sum + st.breakdown[r], 0)).toBe(st.score);
        expect(st.placement).toBe(1 + result.standings.filter((o) => compareStandings(o, st) < 0).length);
        for (const other of result.standings) if (other.score > st.score) expect(other.placement).toBeLessThan(st.placement);
      }
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    }, 120_000);
  }
});

describe('determinism', () => {
  it('the same seed and actions give the same game', () => {
    const start = () => lfGame({ seats: 3, kinds: ['human', 'bot_warden', 'human'], seed: 'twin', overrides: { moth_die: true } });
    const a = playLastFlame(start(), 'greedy');
    const b = playLastFlame(start(), 'greedy');
    expect(b.actions).toEqual(a.actions);
    expect(b.state).toEqual(a.state);
    let replayed = start();
    for (const action of a.actions) {
      const result = applyAction(replayed, action);
      if (!result.ok) throw new Error(`replay: ${action.type} ${result.reason}`);
      replayed = result.state;
    }
    expect(replayed).toEqual(a.state);
  }, 60_000);
});

describe('views (§11.5, §13.6, B.4)', () => {
  /** A Last Flame game in its first Chandlery. */
  function atChandlery(): GameState {
    return advanceUntil(lfGame({ seats: 2, overrides: { neutrals: 'off' } }), (q) => q.phase === 'chandlery', 400);
  }

  it('other seats see neither a rival hand, deck, Chandlery offer nor pick; deck orders are hidden', () => {
    const s = atChandlery();
    const actions: Action[] = [{ type: 'draft_pick', seat: 1, cardId: s.players[1].chandlery?.offer[0] ?? '' }];
    const picked = act(s, actions[0]);
    const view = viewFor(picked.state, 0);
    const rival = view.players[1];
    expect(rival.hand).toHaveLength(picked.state.players[1].hand.length);
    expect(rival.deck).toHaveLength(picked.state.players[1].deck.length);
    expect([...rival.hand, ...rival.deck].every((c) => c.id === 'hidden' && !c.tempered)).toBe(true);
    const realUids = new Set([...picked.state.players[1].hand, ...picked.state.players[1].deck].map((c) => c.uid));
    expect([...rival.hand, ...rival.deck].some((c) => realUids.has(c.uid))).toBe(false);
    expect(rival.chandlery).toMatchObject({ offer: [], heirloomOffer: [], picked: ['hidden'] });
    const own = view.players[0];
    expect(own.chandlery?.offer).toEqual(picked.state.players[0].chandlery?.offer);
    expect(own.deck.map((c) => c.id)).toEqual(own.deck.map((c) => c.id).sort());
    expect(view.rng).toEqual({});
    // The same event batch, as seat 0 may see it.
    const seen = eventsForSeat(picked.events, 0, 'last_flame');
    expect(eventsOf(seen, 'card_drafted')).toEqual([{ type: 'card_drafted', seat: 1, cardId: 'hidden' }]);
    expect(eventsForSeat(picked.events, 1, 'last_flame')).toEqual(picked.events);
    expect(getContent().cards.byId.hidden).toBeUndefined();
  });

  it('drawn cards and Chandlery offers of other seats are filtered from events', () => {
    const events: GameEvent[] = [
      { type: 'cards_drawn', seat: 1, count: 1, cards: [{ uid: 'c1', id: 'spark', tempered: false }] },
      { type: 'chandlery_opened', offers: [{ seat: 0, cards: ['spark'] }, { seat: 1, cards: ['flare'] }] },
      { type: 'boon_picked', seat: 1, boon: 'temper', args: { cardUid: 'c1' } },
    ];
    expect(eventsForSeat(events, 0, 'last_flame')).toEqual([
      { type: 'cards_drawn', seat: 1, count: 1, cards: [] },
      { type: 'chandlery_opened', offers: [{ seat: 0, cards: ['spark'] }] },
      { type: 'boon_picked', seat: 1, boon: 'temper', args: {} },
    ]);
    expect(eventsForSeat(events, 0, 'vigil')).toEqual(events);
  });
});
