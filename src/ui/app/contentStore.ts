/**
 * The active content registry as UI state. Loading a mod merges it over the BASE content
 * (a new mod replaces the previous one) and installs the result with the engine's
 * `setContent`, so config presets, validation and the Codex all see the same data.
 */
import { contentHash, getContent, mergeMod, setContent } from '../../engine/content';
import type { ContentError } from '../../engine/content';
import type { ContentRegistry } from '../../engine/types';
import { createStore, type ReadableStore } from './store';

export interface ContentState {
  registry: ContentRegistry;
  /** contentHash of the active registry (settings codes, online lobbies). */
  hash: string;
  baseHash: string;
  modded: boolean;
  /** Where the mod came from ("pasted JSON", a file name), or null for base content. */
  modLabel: string | null;
}

export type ModLoadResult = { ok: true; state: ContentState } | { ok: false; errors: ContentError[] };

export interface ContentStore extends ReadableStore<ContentState> {
  loadMod(source: string, label: string): ModLoadResult;
  resetToBase(): void;
}

export function createContentStore(): ContentStore {
  const base = getContent();
  const baseHash = contentHash(base);
  const baseState: ContentState = { registry: base, hash: baseHash, baseHash, modded: false, modLabel: null };
  const store = createStore(baseState);
  return {
    get: store.get,
    subscribe: store.subscribe,
    loadMod(source, label) {
      const { registry, errors } = mergeMod(base, source);
      if (errors.length > 0) return { ok: false, errors };
      setContent(registry);
      const next: ContentState = { registry, hash: contentHash(registry), baseHash, modded: true, modLabel: label };
      store.set(next);
      return { ok: true, state: next };
    },
    resetToBase() {
      setContent(base);
      store.set(baseState);
    },
  };
}
