/**
 * Game-screen UI state that is neither engine state nor the controller's selection: the open
 * overlay (pause menu, deck viewer, rules), board zoom / pan, and pings (GDD §15.7: transient
 * marks outside the game log). One store per game session, shared through context.
 */
import { createContext, useContext } from 'react';
import type { Pos } from '../../engine/types';
import { createStore, useStore, type WritableStore } from '../app/store';
import { clampZoom, NO_ZOOM, panBy, sameZoom, zoomAround, ZOOM_STEP, type BoardZoom } from './zoom';

export type GameOverlay = 'pause' | 'deck' | 'rules';

export interface Ping {
  id: number;
  pos: Pos;
  seat: number | null;
}

export interface GameUiState {
  overlay: GameOverlay | null;
  zoom: BoardZoom;
  pings: readonly Ping[];
  /** Last Flame: the right-rail drawer (intent queue and log) is open (§15.4). */
  drawer: boolean;
}

export const PING_MS = 2400;
/** At most this many pings at once (the oldest gives way). */
const MAX_PINGS = 4;

export interface GameUi {
  store: WritableStore<GameUiState>;
  open(overlay: GameOverlay): void;
  close(): void;
  toggle(overlay: GameOverlay): void;
  /** Open or close the Last Flame right-rail drawer (no argument: toggle). */
  setDrawer(open?: boolean): void;
  /** Board size (CSS px, unzoomed) the zoom is clamped to; the board reports it. */
  setBoardSize(width: number, height: number): void;
  /** Zoom by a factor about a point given in px from the unzoomed board's centre. */
  zoomBy(factor: number, focus?: { x: number; y: number }): void;
  pan(dx: number, dy: number): void;
  resetZoom(): void;
  ping(pos: Pos, seat: number | null): void;
  dispose(): void;
}

export function createGameUi(schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => window.setTimeout(fn, ms)): GameUi {
  const store = createStore<GameUiState>({ overlay: null, zoom: NO_ZOOM, pings: [], drawer: false });
  let size = { w: 0, h: 0 };
  let nextPing = 1;
  let disposed = false;
  const setZoom = (zoom: BoardZoom): void => {
    const current = store.get();
    if (!sameZoom(current.zoom, zoom)) store.set({ ...current, zoom });
  };
  return {
    store,
    open: (overlay) => store.update((s) => (s.overlay === overlay ? s : { ...s, overlay })),
    close: () => store.update((s) => (s.overlay === null ? s : { ...s, overlay: null })),
    toggle: (overlay) => store.update((s) => ({ ...s, overlay: s.overlay === overlay ? null : overlay })),
    setDrawer: (open) => store.update((s) => {
      const next = open ?? !s.drawer;
      return next === s.drawer ? s : { ...s, drawer: next };
    }),
    setBoardSize(width, height) {
      size = { w: width, h: height };
      setZoom(clampZoom(store.get().zoom, width, height));
    },
    zoomBy(factor, focus = { x: 0, y: 0 }) {
      const z = store.get().zoom;
      setZoom(zoomAround(z, z.scale * factor, focus, size.w, size.h));
    },
    pan(dx, dy) {
      setZoom(panBy(store.get().zoom, dx, dy, size.w, size.h));
    },
    resetZoom: () => setZoom(NO_ZOOM),
    ping(pos, seat) {
      const id = nextPing++;
      store.update((s) => ({ ...s, pings: [...s.pings.slice(-(MAX_PINGS - 1)), { id, pos, seat }] }));
      schedule(() => {
        if (!disposed) store.update((s) => ({ ...s, pings: s.pings.filter((p) => p.id !== id) }));
      }, PING_MS);
    },
    dispose() {
      disposed = true;
    },
  };
}

export { ZOOM_STEP };

export const GameUiContext = createContext<GameUi | null>(null);

export function useGameUi(): GameUi {
  const ui = useContext(GameUiContext);
  if (!ui) throw new Error('useGameUi must be used inside the game screen');
  return ui;
}

export function useGameUiState(): GameUiState {
  return useStore(useGameUi().store);
}
