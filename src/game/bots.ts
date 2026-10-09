/**
 * Bot planning off the main thread (GDD §12.6). A `BotRunner` answers three questions about a
 * state: a bot's whole seat turn, a bot's non-turn choice (ready, Toll, carry-over, draft,
 * Boon) and the Hint. The worker runner posts them to `bot.worker.ts`; the sync runner
 * (no Worker, e.g. jsdom tests) calls the engine directly but still answers asynchronously.
 */
import { botChoice, getContent, hint, planBotTurn } from '../engine';
import type { Action, BotLevel, GameState } from '../engine/types';
import type { BotQuestion, BotRequest, BotResponse } from './botProtocol';

export interface BotRunner {
  planTurn(state: GameState, seat: number, level: BotLevel): Promise<Action[]>;
  choice(state: GameState, seat: number): Promise<Action | null>;
  hint(state: GameState, seat: number): Promise<Action | null>;
  dispose(): void;
}

/** Runs the engine on the main thread; answers still arrive asynchronously, like the worker's. */
export function createSyncBotRunner(): BotRunner {
  let disposed = false;
  const later = <T>(fn: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      queueMicrotask(() => {
        if (disposed) return;
        try {
          resolve(fn());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  return {
    planTurn: (state, seat, level) => later(() => planBotTurn(state, seat, level)),
    choice: (state, seat) => later(() => botChoice(state, seat)),
    hint: (state, seat) => later(() => hint(state, seat)),
    dispose: () => {
      disposed = true;
    },
  };
}

interface Pending {
  resolve: (actions: Action[]) => void;
  reject: (error: Error) => void;
}

export function createWorkerBotRunner(worker: Worker): BotRunner {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  worker.onmessage = (event: MessageEvent<BotResponse>) => {
    const res = event.data;
    const entry = pending.get(res.id);
    if (!entry) return;
    pending.delete(res.id);
    if (res.ok) entry.resolve(res.actions);
    else entry.reject(new Error(res.error));
  };
  worker.onerror = (event: ErrorEvent) => {
    for (const entry of pending.values()) entry.reject(new Error(event.message || 'bot worker failed'));
    pending.clear();
  };
  // The worker plans against the same content as this tab (mods included).
  worker.postMessage({ id: 0, kind: 'content', registry: getContent() } satisfies BotRequest);

  const ask = (req: BotQuestion): Promise<Action[]> =>
    new Promise((resolve, reject) => {
      pending.set(req.id, { resolve, reject });
      worker.postMessage(req);
    });

  return {
    planTurn: (state, seat, level) => ask({ id: nextId++, kind: 'plan', state, seat, level }),
    choice: async (state, seat) => (await ask({ id: nextId++, kind: 'choice', state, seat }))[0] ?? null,
    hint: async (state, seat) => (await ask({ id: nextId++, kind: 'hint', state, seat }))[0] ?? null,
    dispose: () => {
      pending.clear();
      worker.terminate();
    },
  };
}

/** The worker runner when this environment has module workers, else the sync fallback. */
export function createBotRunner(): BotRunner {
  if (typeof Worker === 'undefined') return createSyncBotRunner();
  try {
    const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module', name: 'wickwatch-bots' });
    return createWorkerBotRunner(worker);
  } catch {
    return createSyncBotRunner();
  }
}
