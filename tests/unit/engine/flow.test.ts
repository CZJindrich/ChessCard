import { describe, expect, it } from 'vitest';
import { applyAction, previewSnuffStrike, viewFor } from '../../../src/engine';
import type { GameState, RuleValues, SeatKind } from '../../../src/engine';
import { newGame } from './helpers';
import { replay, runGame } from './driver';

const GENTLE: Partial<RuleValues> = { dread_max: 16, starting_dread: 0, initial_enemies_mod: -2, plumes_mod: -2 };

function seats(kinds: SeatKind[]) {
  return kinds.map((kind) => ({ kind, hero: null }));
}

describe('determinism (GDD B.6)', () => {
  it('the same seed and action list give identical states', () => {
    for (const seed of ['det-a', 'det-b', 'det-c']) {
      const opts = { seed, seats: seats(['human', 'bot_warden']), overrides: { tolls: true, moth_die: true } };
      const first = runGame(newGame(opts), { policy: 'play', maxSteps: 400 });
      const again = replay(newGame(opts), first.actions);
      expect(JSON.stringify(again)).toBe(JSON.stringify(first.state));
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
    }
  }, 60_000);

  it('applyAction never mutates its input', () => {
    const s = newGame({ seed: 'immutable' });
    const before = JSON.stringify(s);
    applyAction(s, { type: 'ready', seat: 0 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('preview parity (§6.8 step 7)', () => {
  it('previewSnuffStrike(state).state equals advancing through snuff_strike', () => {
    let checked = 0;
    const check = (s: GameState) => {
      if (s.phase !== 'snuff_strike') return;
      const preview = previewSnuffStrike(s);
      const real = applyAction(s, { type: 'advance' });
      if (!real.ok) throw new Error(real.reason);
      expect(preview.state).toEqual(real.state);
      expect(preview.events).toEqual(real.events);
      checked += 1;
    };
    for (let i = 0; i < 60; i++) {
      const kinds: SeatKind[] = i % 3 === 0 ? ['human'] : i % 3 === 1 ? ['human', 'bot_warden'] : ['human', 'human', 'bot_warden'];
      runGame(newGame({ seed: `parity-${i}`, seats: seats(kinds), overrides: { moth_die: true, tolls: true } }), {
        policy: i % 2 === 0 ? 'play' : 'pass',
        maxSteps: 220,
        onState: check,
      });
    }
    expect(checked).toBeGreaterThan(200);
  }, 120_000);
});

describe('whole Nights', () => {
  it('a regular Vigil Night with players only ending their turns reaches dawn and the Chandlery', () => {
    const reached: string[] = [];
    for (const seed of ['night-1', 'night-2', 'night-3', 'night-4']) {
      const start = newGame({ seed, seats: seats(['human', 'bot_apprentice']), overrides: { ...GENTLE, moth_die: true } });
      const { state } = runGame(start, { policy: 'pass', maxSteps: 400, stopWhen: (s) => s.phase === 'chandlery' });
      if (state.result) {
        expect(state.result).toMatchObject({ mode: 'vigil', outcome: 'defeat' });
        continue;
      }
      expect(state.phase).toBe('chandlery');
      expect(state.night).toBe(1);
      expect(state.stats.nightsCompleted).toBe(1);
      expect(state.stats.roundsPlayed).toBe(4);
      expect(Object.values(state.pieces).some((p) => p.side === 'snuff')).toBe(false);
      reached.push(seed);
    }
    expect(reached.length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('a 3-Night run ends on the Boss Night: a victory means the boss fell', () => {
    let victories = 0;
    for (const seed of ['run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6']) {
      const start = newGame({ seed, seats: seats(['human']), overrides: { ...GENTLE, length: 'short', nights: 3, tolls: true, moth_die: true, boons: true } });
      const { state } = runGame(start, { policy: 'play', maxSteps: 3000 });
      expect(state.result).not.toBeNull();
      expect(state.phase).toBe('game_over');
      if (state.result?.mode === 'vigil' && state.result.outcome === 'victory') {
        victories += 1;
        expect(state.night).toBe(3);
        expect(state.isBossNight).toBe(true);
        expect(state.siteId).toBe('hollow_nave');
        expect(state.boss).not.toBeNull();
        expect(state.pieces[state.boss?.pieceId ?? '']).toBeUndefined();
        expect(state.result.stars).toBeGreaterThanOrEqual(1);
      }
    }
    expect(victories).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('Last Flame runs its rounds with clockwise seat turns', () => {
    const start = newGame({ mode: 'last_flame', seed: 'lf-run', seats: seats(['human', 'bot_warden', 'bot_warden']), overrides: { moth_die: true } });
    const order: number[] = [];
    const { state } = runGame(start, {
      policy: 'play',
      maxSteps: 3000,
      onState: (s) => {
        if (s.phase === 'players' && s.round === 1 && s.night === 1 && s.activeSeat !== null && order.at(-1) !== s.activeSeat) order.push(s.activeSeat);
      },
    });
    expect(order).toEqual([0, 1, 2]);
    expect(state.result?.mode).toBe('last_flame');
  }, 60_000);
});

describe('viewFor', () => {
  it('hides deck order and RNG; Last Flame also hides rivals hands', () => {
    const s = newGame({ mode: 'last_flame', seed: 'view', seats: seats(['human', 'bot_warden']) });
    const view = viewFor(s, 0);
    expect(view.rng).toEqual({});
    expect(view.nightSnapshot).toBeNull();
    expect(view.players[0].hand).toEqual(s.players[0].hand);
    expect(view.players[1].hand.every((c) => c.id === 'hidden')).toBe(true);
    const ids = view.players[0].deck.map((c) => c.id);
    expect(ids).toEqual(ids.slice().sort());
  });
});
