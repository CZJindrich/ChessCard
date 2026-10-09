/** The local profile (unlock ladder, custom presets, stats) as UI state, saved on every change. */
import { loadProfile, saveProfile } from '../../config';
import type { KeyValueStorage, LocalProfile } from '../../config';
import { createStore, type ReadableStore } from './store';

export interface ProfileStore extends ReadableStore<LocalProfile> {
  update(fn: (profile: LocalProfile) => LocalProfile): void;
}

export function createProfileStore(storage: KeyValueStorage | null): ProfileStore {
  const store = createStore(loadProfile(storage));
  return {
    get: store.get,
    subscribe: store.subscribe,
    update(fn) {
      const next = fn(store.get());
      saveProfile(next, storage);
      store.set(next);
    },
  };
}
