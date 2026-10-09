import { describe, expect, it, vi } from 'vitest';
import type { Action, BotLevel, GameState } from '../../../src/engine/types';
import { BotDriver, type BotHost } from '../../../src/game/botDriver';
import type { BotRunner } from '../../../src/game';
import { configWithSeats, flushMicrotasks, newGame } from './harness';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A runner whose answers the test releases by hand. */
function manualRunner(): { runner: BotRunner; plans: Array<Deferred<Action[]>>; choices: Array<Deferred<Action | null>> } {
  const plans: Array<Deferred<Action[]>> = [];
  const choices: Array<Deferred<Action | null>> = [];
  const runner: BotRunner = {
    planTurn: (_s: GameState, _seat: number, _level: BotLevel) => {
      const d = deferred<Action[]>();
      plans.push(d);
      return d.promise;
    },
    choice: () => {
      const d = deferred<Action | null>();
      choices.push(d);
      return d.promise;
    },
    hint: async () => null,
    dispose: () => undefined,
  };
  return { runner, plans, choices };
}

function host(state: GameState): BotHost & { sent: Action[]; stampValue: number } {
  const h = {
    sent: [] as Action[],
    stampValue: 1,
    latest: () => state,
    stamp: () => h.stampValue,
    send: (action: Action) => {
      h.sent.push(action);
      return { ok: true } as const;
    },
    wait: (_ms: number, then: () => void) => then(),
    pump: vi.fn(),
    settings: () => ({ animation_speed: 1, enemy_turn_speed: 'normal' as const, reduced_motion: false }),
  };
  return h;
}

/** A bot seat with a decision to make: choosing the Night's Toll. */
function tollState(): GameState {
  const base = newGame(configWithSeats([{ kind: 'bot_warden', hero: null, name: 'Warden' }], 'driver'));
  return { ...base, phase: 'toll', toll: { offer: { blessing: 'lucky_wick', curse: 'soot_fog' }, chooser: 0, active: null, curseReward: false, history: [] } };
}

describe('BotDriver', () => {
  it('answers a bot seat’s decision once, with a legal action', async () => {
    const h = host(tollState());
    const { runner, choices } = manualRunner();
    const driver = new BotDriver(h, runner);
    driver.drive();
    driver.drive();
    expect(choices).toHaveLength(1);
    choices[0].resolve({ type: 'choose_toll', seat: 0, tollId: 'lucky_wick' });
    await flushMicrotasks();
    expect(h.sent).toEqual([{ type: 'choose_toll', seat: 0, tollId: 'lucky_wick' }]);
  });

  it('does not spin on an illegal answer until the state changes', async () => {
    const h = host(tollState());
    const { runner, choices } = manualRunner();
    const driver = new BotDriver(h, runner);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    driver.drive();
    choices[0].resolve({ type: 'choose_toll', seat: 0, tollId: 'black_sun' });
    await flushMicrotasks();
    driver.drive();
    expect(choices).toHaveLength(1);
    h.stampValue = 2;
    driver.drive();
    expect(choices).toHaveLength(2);
    expect(h.sent).toEqual([]);
    errors.mockRestore();
  });

  it('drops an answer that arrives after the state moved on and asks again', async () => {
    const h = host(tollState());
    const { runner, choices } = manualRunner();
    const driver = new BotDriver(h, runner);
    driver.drive();
    h.stampValue = 2;
    choices[0].resolve({ type: 'choose_toll', seat: 0, tollId: 'lucky_wick' });
    await flushMicrotasks();
    expect(h.sent).toEqual([]);
    expect(h.pump).toHaveBeenCalled();
    driver.drive();
    expect(choices).toHaveLength(2);
  });

  it('stops asking once disposed', () => {
    const h = host(tollState());
    const { runner, choices } = manualRunner();
    const driver = new BotDriver(h, runner);
    driver.dispose();
    driver.drive();
    expect(choices).toHaveLength(0);
  });
});
