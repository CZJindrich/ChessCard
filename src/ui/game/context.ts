/**
 * The game screen's React plumbing: the controller in context and hooks that read its
 * snapshot through `useSyncExternalStore`. `useGameSelector` subscribes to a slice of the
 * snapshot, so a component re-renders only when its slice changes (hovering a tile changes the
 * selection, not the top bar).
 */
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { ContentRegistry } from '../../engine/types';
import type { ControllerSnapshot, GameController } from '../../game';
import { useContentState } from '../app/services';

export const GameControllerContext = createContext<GameController | null>(null);

export function useController(): GameController {
  const controller = useContext(GameControllerContext);
  if (!controller) throw new Error('useController must be used inside the game screen');
  return controller;
}

export function useGameSnapshot(): ControllerSnapshot {
  const controller = useController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/** Objects whose own keys hold the same values (Object.is), e.g. a selector's small record. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a) as Array<keyof T>;
  const kb = Object.keys(b) as Array<keyof T>;
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}

/**
 * A slice of the controller snapshot. The component re-renders only when `select` returns a
 * value `equal` (default: shallowEqual) says is different.
 */
export function useGameSelector<T>(select: (snap: ControllerSnapshot) => T, equal: (a: T, b: T) => boolean = shallowEqual): T {
  const controller = useController();
  const live = useRef({ select, equal });
  live.current = { select, equal };
  const cache = useRef<{ snap: ControllerSnapshot; select: (snap: ControllerSnapshot) => T; value: T } | null>(null);
  const read = useCallback((): T => {
    const snap = controller.getSnapshot();
    const { select: current, equal: same } = live.current;
    const prev = cache.current;
    // A new selector (new props) is re-run even on the same snapshot.
    if (prev && prev.snap === snap && prev.select === current) return prev.value;
    const next = current(snap);
    const value = prev && same(prev.value, next) ? prev.value : next;
    cache.current = { snap, select: current, value };
    return value;
  }, [controller]);
  return useSyncExternalStore(controller.subscribe, read, read);
}

/** The active content registry (mods included). */
export function useRegistry(): ContentRegistry {
  return useContentState().registry;
}
