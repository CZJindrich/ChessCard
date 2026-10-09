/**
 * A minimal observable store (no state library, ARCHITECTURE §1) and its React binding.
 * Snapshots are replaced, never mutated, so `useSyncExternalStore` can compare by identity.
 */
import { useSyncExternalStore } from 'react';

export interface ReadableStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface WritableStore<T> extends ReadableStore<T> {
  set(next: T): void;
  update(fn: (current: T) => T): void;
}

export function createStore<T>(initial: T): WritableStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  const set = (next: T): void => {
    if (Object.is(next, current)) return;
    current = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    get: () => current,
    set,
    update: (fn) => set(fn(current)),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
