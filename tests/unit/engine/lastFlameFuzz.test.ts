/**
 * Last Flame fuzz: random legal play (cards, Powers, strikes on rivals after the truce, haunts,
 * the occasional concede) over short games that reach the Boss Night quickly, with the Last
 * Flame invariants checked after every action.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, GLORY_REASONS, gloryLeader, roundsToNextClosing } from '../../../src/engine';
import type { Action, GameState, RuleValues, SeatKind } from '../../../src/engine';
import { Rand, randomAction } from './fuzzDriver';
import { lfGame } from './lastFlameHelpers';

function checkLastFlame(s: GameState, label: string): void {
  const lf = s.lastFlame;
  expect(lf, label).not.toBeNull();
  if (!lf) return;
  expect(lf.leader, `${label}: leader`).toBe(gloryLeader(s));
  expect(lf.gloam.roundsToNext, `${label}: Gloam Bell`).toBe(roundsToNextClosing(s));
  const closedRings = lf.gloam.schedule.slice(0, lf.gloam.closingsDone).length;
  for (const p of s.players) {
    const sum = GLORY_REASONS.reduce((total, reason) => total + lf.gloryBySeat[p.seat][reason], 0);
    expect(sum, `${label}: seat ${p.seat} breakdown`).toBe(p.glory);
    const owned = Object.values(s.pieces).filter((q) => q.owner === p.seat);
    if (p.eliminated) {
      expect(owned, `${label}: eliminated seat ${p.seat} pieces`).toHaveLength(0);
      expect(p.eliminationBand, `${label}: band`).not.toBeNull();
    } else {
      expect(s.pieces[p.heroPieceId], `${label}: seat ${p.seat} hero`).toBeDefined();
      if (s.pieces[p.heroPieceId]?.smoldering) expect(s.config.respawn_before_boss, `${label}: Wick without respawn`).toBe(true);
    }
    if (p.haunt.pending) expect(s.phase === 'tally' || s.phase === 'night_setup', `${label}: haunt in ${s.phase}`).toBe(true);
  }
  s.board.tiles.forEach((tile, i) => {
    const x = i % s.board.w;
    const y = Math.floor(i / s.board.w);
    const ring = Math.min(x, y, s.board.w - 1 - x, s.board.h - 1 - y);
    expect(tile.gloam, `${label}: Gloam at ${x},${y}`).toBe(ring < closedRings);
    if (!tile.gloam) return;
    expect(s.plumes.some((m) => m.pos.x === x && m.pos.y === y), `${label}: Plume in the Gloam`).toBe(false);
  });
  if (lf.tallyPaused) expect(s.phase, `${label}: paused Tally`).toBe('tally');
}

function scenario(i: number, r: Rand): { seats: SeatKind[]; overrides: Partial<RuleValues> } {
  const count = 2 + (i % 3);
  const seats = Array.from({ length: count }, (_, k): SeatKind => (k === 0 || r.chance(0.6) ? 'human' : 'bot_warden'));
  return {
    seats,
    overrides: {
      nights: 2 + r.int(2),
      turns_per_night: 3,
      boss_rounds: 3 + r.int(2),
      board_size: count === 2 ? '10x10' : count === 4 ? '12x12' : r.chance(0.5) ? '10x10' : '12x12',
      respawn_before_boss: r.chance(0.7),
      truce: r.chance(0.5) ? 'night_1' : 'off',
      bounty: true,
      haunting: true,
      neutrals: r.chance(0.3) ? 'swarm' : 'normal',
      moth_die: true,
      tolls: true,
      boss_hp_multiplier: 0.5,
    },
  };
}

/** Now and then a human still in the game concedes (while another human remains). */
function maybeConcede(r: Rand, s: GameState): Action | null {
  if (s.result || !r.chance(0.002)) return null;
  const humans = s.players.filter((p) => p.kind === 'human' && !p.eliminated);
  return humans.length >= 2 ? { type: 'concede', seat: humans[r.int(humans.length)].seat } : null;
}

describe('Last Flame fuzz', () => {
  it('random legal play keeps the Last Flame invariants', () => {
    let finished = 0;
    let eliminations = 0;
    let haunts = 0;
    for (let i = 0; i < 24; i++) {
      const r = new Rand(0x51ed ^ (i * 104729));
      const sc = scenario(i, r);
      let s = lfGame({ seats: sc.seats.length, kinds: sc.seats, seed: `lf-fuzz-${i}`, overrides: sc.overrides });
      for (let step = 0; step < 2500 && !s.result; step++) {
        const action = maybeConcede(r, s) ?? randomAction(r, s, 0, { retryChance: 0, maxRetries: 0 });
        if (!action) break;
        const label = `game ${i} step ${step} ${action.type} (${s.phase} N${s.night}R${s.round})`;
        const result = applyAction(s, action);
        if (!result.ok) throw new Error(`${label}: rejected ${result.reason}`);
        eliminations += result.events.filter((e) => e.type === 'player_eliminated').length;
        if (action.type === 'haunt' && action.at) haunts += 1;
        s = result.state;
        checkLastFlame(s, label);
      }
      if (s.result) finished += 1;
    }
    expect(finished).toBeGreaterThan(20);
    expect(eliminations).toBeGreaterThan(10);
    expect(haunts).toBeGreaterThan(5);
  }, 240_000);
});
