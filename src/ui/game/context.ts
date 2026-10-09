/**
 * The game screen's React plumbing: the controller in context and hooks that read its
 * snapshot through `useSyncExternalStore`.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
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

/** The active content registry (mods included). */
export function useRegistry(): ContentRegistry {
  return useContentState().registry;
}
