/**
 * Glory (GDD §13.2.2), the Bounty (§13.2.4) and kill credit (§6.3) in Last Flame: every Glory
 * event, the per-reason breakdown, the Wanted leader, Bounty edge cases, boss Glory, Snuff kills
 * credited to the most recent displacer, and the Toll chooser.
 */
import { describe, expect, it } from 'vitest';
import { GLORY_REASONS, gloryLeader, sq } from '../../../src/engine';
import type { GameState, Piece } from '../../../src/engine';
import { dealDamage } from '../../../src/engine/combat';
import { tollChooser } from '../../../src/engine/phases';
import { snuffCredit } from '../../../src/engine/snuff';
import { makeCtx } from '../../../src/engine/state';
import { bossNight, bossPiece, toBossPlayers } from './bossHelpers';
import { act, enemyAt, eventsOf, giveCard, heroPiece, lockMelee, playCard, setTile, unitAt } from './helpers';
import { lfScenario } from './lastFlameHelpers';

function strike(s: GameState, piece: Piece, at: string): ReturnType<typeof act> {
  Object.assign(piece, { strikesLeft: Math.max(1, piece.strikesLeft), exhausted: false });
  return act(s, { type: 'strike', seat: piece.owner ?? 0, pieceId: piece.id, target: sq(at) });
}

function breakdownSums(s: GameState): void {
  s.players.forEach((p) => {
    const sum = GLORY_REASONS.reduce((total, reason) => total + (s.lastFlame?.gloryBySeat[p.seat][reason] ?? 0), 0);
    expect(sum, `seat ${p.seat} breakdown`).toBe(p.glory);
  });
}

/** Seat 0 (Brannoc, d4) faces seat 1 (Velveteen, e5); no truce. */
function duel(opts: Parameters<typeof lfScenario>[1] = {}): GameState {
  return lfScenario(['d4', 'e5'], { ...opts, overrides: { truce: 'off', ...(opts.overrides ?? {}) } });
}

describe('Glory events (§13.2.2)', () => {
  it('a Snuff kill is worth its rank: minion 1, soldier 2, elite 3, structure 2', () => {
    let s = lfScenario(['d4', 'j10']);
    const brannoc = heroPiece(s, 0);
    for (const [enemy, at, glory] of [
      ['sootling', 'd5', 1],
      ['smokehound', 'e5', 2],
      ['knell_banshee', 'c5', 3],
      ['smokestack', 'c4', 2],
    ] as const) {
      const foe = enemyAt(s, enemy, at);
      foe.hp = 1;
      const before = s.players[0].glory;
      const result = strike(s, s.pieces[brannoc.id], at);
      expect(result.state.players[0].glory - before, enemy).toBe(glory);
      s = result.state;
      s.pieces[brannoc.id].pos = sq('d4');
    }
    expect(s.lastFlame?.gloryBySeat[0].snuff_kill).toBe(8);
    breakdownSums(s);
  });

  it('a rival unit is worth +1; a rival hero +3 and its owner loses 2 (never below 0)', () => {
    const s = duel();
    const taper = unitAt(s, 'taper', 'd5', 1);
    const afterUnit = strike(s, heroPiece(s, 0), 'd5').state;
    expect(afterUnit.players.map((p) => p.glory)).toEqual([1, 0]);
    expect(afterUnit.pieces[taper.id]).toBeUndefined();
    afterUnit.pieces[afterUnit.players[0].heroPieceId].pos = sq('d4');
    heroPiece(afterUnit, 1).hp = 2;
    afterUnit.players[1].glory = 1;
    const { state, events } = strike(afterUnit, heroPiece(afterUnit, 0), 'e5');
    expect(heroPiece(state, 1).smoldering).toBe(true);
    expect(eventsOf(events, 'glory_changed').map((e) => [e.seat, e.reason, e.from, e.to])).toEqual([
      [0, 'rival_hero', 1, 4],
      [1, 'hero_fell', 1, 0],
    ]);
    expect(state.players[0].stats.kills).toBe(2);
  });

  it('lighting a Shrine is +1; Glory changes keep the breakdown and the Wanted leader current', () => {
    const s = duel();
    setTile(s, 'c4', 'votive_shrine');
    const { state } = act(s, { type: 'light_shrine', seat: 0, pieceId: heroPiece(s, 0).id, shrine: sq('c4') });
    expect(state.players[0].glory).toBe(1);
    expect(state.lastFlame?.gloryBySeat[0].shrine).toBe(1);
    expect(state.lastFlame?.leader).toBe(0);
    breakdownSums(state);
    state.players[1].glory = 1;
    expect(gloryLeader(state)).toBeNull();
  });
});

describe('Bounty (§13.2.4)', () => {
  /** Seat 0 fells seat 1's hero with a strike (no truce); Glory set beforehand. */
  function fell(glory: number[], opts: { bounty?: boolean; paidNight?: number } = {}): ReturnType<typeof act> {
    const s = lfScenario(['d4', 'e5', 'j1'], { overrides: { truce: 'off', bounty: opts.bounty ?? true } });
    glory.forEach((g, seat) => (s.players[seat].glory = g));
    if (opts.paidNight !== undefined) s.lastFlame?.bountiesPaid.push({ victimSeat: 1, night: opts.paidNight });
    heroPiece(s, 1).hp = 1;
    return strike(s, heroPiece(s, 0), 'e5');
  }
  const bounty = (r: ReturnType<typeof act>) => eventsOf(r.events, 'glory_changed').filter((e) => e.reason === 'bounty').map((e) => [e.seat, e.to - e.from]);

  it('felling the sole leader pays +3 more', () => {
    const r = fell([0, 5, 2]);
    expect(bounty(r)).toEqual([[0, 3]]);
    expect(r.state.players.map((p) => p.glory)).toEqual([6, 3, 2]);
    expect(r.state.lastFlame?.bountiesPaid).toEqual([{ victimSeat: 1, night: 1 }]);
  });

  it('a tie for the lead means no leader and no Bounty', () => {
    expect(bounty(fell([0, 5, 5]))).toEqual([]);
  });

  it('the leader is fixed before the kill: the killer overtaking with this kill earns none', () => {
    expect(bounty(fell([4, 3, 0]))).toEqual([]);
    expect(bounty(fell([5, 3, 0]))).toEqual([]);
  });

  it('at most once per victim per Night (a Bounty from an earlier Night does not count); none with Bounty off', () => {
    expect(bounty(fell([0, 5, 0], { paidNight: 1 }))).toEqual([]);
    expect(bounty(fell([0, 5, 0], { paidNight: 0 }))).toEqual([[0, 3]]);
    expect(bounty(fell([0, 5, 0], { bounty: false }))).toEqual([]);
    // No Bounty during a truce: lastFlameTruce.test.ts (a redirected Snuff is the only way to fell a rival then).
  });
});

describe('kill credit (§6.3)', () => {
  const piece = (by: number | null, at?: number): Piece => ({ lastDisplacedBy: by, ...(at !== undefined ? { lastDisplacedAt: at } : {}) }) as Piece;
  const intent = (by: number | null, at?: number) => ({ reversedBy: by, ...(at !== undefined ? { reversedAt: at } : {}) }) as Parameters<typeof snuffCredit>[2];

  it('a Snuff kill goes to the most recent displacer of the victim or attacker, or reverser', () => {
    expect(snuffCredit(piece(1, 5), piece(2, 7), intent(null))).toBe(2);
    expect(snuffCredit(piece(1, 9), piece(2, 7), intent(3, 8))).toBe(1);
    expect(snuffCredit(piece(null), piece(null), intent(3, 2))).toBe(3);
    expect(snuffCredit(piece(null), piece(null), intent(null))).toBeNull();
    // Without clock readings (Vigil): victim, then attacker, then reverser.
    expect(snuffCredit(piece(1), piece(2), intent(3))).toBe(1);
  });

  it('pushing a Snuff so its attack fells a rival credits the pusher', () => {
    const s = duel();
    const hulk = enemyAt(s, 'drip_hulk', 'e4');
    lockMelee(s, hulk, 'e5');
    heroPiece(s, 1).pos = sq('g5');
    heroPiece(s, 1).hp = 2;
    // Shield Bash pushes the Hulk e4 → g4: its locked attack (one tile north) moves with it onto g5.
    const bashed = playCard(s, giveCard(s, 'shield_bash'), [hulk]).state;
    expect(bashed.pieces[hulk.id]).toMatchObject({ pos: sq('g4'), lastDisplacedBy: 0 });
    expect(bashed.pieces[hulk.id].lastDisplacedAt).toBeGreaterThan(0);
    let state = bashed;
    while (state.phase === 'players' && state.activeSeat !== null) state = act(state, { type: 'end_turn', seat: state.activeSeat }).state;
    const resolved = act(state, { type: 'advance' });
    expect(eventsOf(resolved.events, 'glory_changed').map((e) => [e.seat, e.reason])).toContainEqual([0, 'rival_hero']);
  });
});

describe('Burn kills (§6.3)', () => {
  it('a Burn that fells a rival at Tally is credited to the seat whose strike applied it', () => {
    const s = duel();
    heroPiece(s, 1).hp = 4;
    s.players[1].glory = 2;
    const edged = playCard(s, giveCard(s, 'searing_edge'), []).state;
    const struck = strike(edged, heroPiece(edged, 0), 'e5').state;
    expect(heroPiece(struck, 1)).toMatchObject({ hp: 1, burn: 2, burnSeat: 0 });
    let state = struck;
    const glory: Array<[number, string]> = [];
    for (let guard = 0; guard < 20 && state.round === 1; guard++) {
      const action = state.phase === 'players' && state.activeSeat !== null ? ({ type: 'end_turn', seat: state.activeSeat } as const) : ({ type: 'advance' } as const);
      const result = act(state, action);
      for (const e of eventsOf(result.events, 'glory_changed')) glory.push([e.seat, e.reason]);
      state = result.state;
    }
    // Seat 1 (2 Glory) was the sole leader: the Burn kill also pays the Bounty.
    expect(glory).toEqual([
      [0, 'rival_hero'],
      [0, 'bounty'],
      [1, 'hero_fell'],
    ]);
  });
});

describe('boss Glory (§13.2.2)', () => {
  it('+1 per full 10% of max HP dealt, as it accrues, and +2 for the killing blow', () => {
    const s = toBossPlayers(bossNight({ boss: 'guttered_king', seats: 2, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } }));
    const boss = bossPiece(s);
    // A 42-HP King (the original 18 + 12 × 2) keeps the tenths below easy to follow.
    if (s.boss) s.boss.maxHp = 42;
    boss.hp = boss.maxHp = 42;
    const ctx = makeCtx(s);
    const hit = (seat: number, amount: number) => dealDamage(ctx, boss, amount, { cause: 'strike', sourceKind: 'player_strike', sourceId: null, seat });
    hit(0, 4);
    expect(s.players[0].glory).toBe(0);
    hit(0, 1);
    expect(s.players[0].glory).toBe(1);
    hit(1, 9);
    expect(s.players[1].glory).toBe(2);
    hit(0, 28);
    expect(s.pieces[boss.id]).toBeUndefined();
    expect(s.boss?.killerSeat).toBe(0);
    // Seat 0 dealt 33 of 42 (7 full tenths) and the killing blow.
    expect(s.lastFlame?.gloryBySeat[0]).toMatchObject({ boss_damage: 7, boss_kill: 2 });
    expect(s.players.map((p) => p.glory)).toEqual([9, 2]);
  });
});

describe('Toll chooser (§13.4)', () => {
  it('the lowest Glory chooses; ties go by turn order from the First Light holder', () => {
    const s = lfScenario(['c3', 'h3', 'h8']);
    s.players.forEach((p, i) => (p.glory = [4, 2, 2][i]));
    s.firstLight = 2;
    expect(tollChooser(s)).toBe(2);
    s.firstLight = 0;
    expect(tollChooser(s)).toBe(1);
    s.players[0].glory = 0;
    expect(tollChooser(s)).toBe(0);
  });
});
