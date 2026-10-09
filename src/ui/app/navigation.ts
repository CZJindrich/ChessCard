/**
 * Screen navigation: a typed route union and a stack-based navigator (no router library).
 * The stack is never empty; its top is the screen on show.
 */
import type { ConfigSelection } from '../../config';
import type { GameConfig } from '../../engine/types';
import { createStore, type ReadableStore } from './store';

/** How the hero picker launches: the two one-click modes, or the guided first Night. */
export type HeroPickMode = 'quick_play' | 'quick_last_flame' | 'tutorial';

export const CODEX_TABS = ['heroes', 'units', 'cards', 'snuff', 'bosses', 'tolls', 'moth_die', 'tiles', 'heirlooms'] as const;
export type CodexTab = (typeof CODEX_TABS)[number];

/**
 * The game route. `config` is a resolved GameConfig with a concrete seed, ready for
 * `createGame`; `selection` is what produced it (Play Again, Change Hero, Same Seed).
 */
export interface GameRoute {
  screen: 'game';
  config: GameConfig;
  selection: ConfigSelection;
  /** "Watch a 20-second demo" from How to Play: an all-bot Vigil the game screen autoplays. */
  demo?: boolean;
}

export type LobbyRoute =
  | { screen: 'lobby'; role: 'host'; config: GameConfig; selection: ConfigSelection }
  | { screen: 'lobby'; role: 'join'; code?: string };

export type Route =
  | { screen: 'title' }
  | { screen: 'hero_pick'; mode: HeroPickMode }
  | { screen: 'setup'; selection?: ConfigSelection }
  | { screen: 'how_to_play' }
  | { screen: 'codex'; tab?: CodexTab }
  | { screen: 'settings' }
  | LobbyRoute
  | GameRoute;

export type ScreenId = Route['screen'];

export const TITLE_ROUTE: Route = { screen: 'title' };

export interface NavState {
  readonly stack: readonly Route[];
}

export type NavAction =
  | { type: 'push'; route: Route }
  | { type: 'replace'; route: Route }
  | { type: 'back' }
  | { type: 'reset'; route: Route };

export function initialNavState(route: Route = TITLE_ROUTE): NavState {
  return { stack: [route] };
}

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'push':
      return { stack: [...state.stack, action.route] };
    case 'replace':
      return { stack: [...state.stack.slice(0, -1), action.route] };
    case 'back':
      return state.stack.length > 1 ? { stack: state.stack.slice(0, -1) } : state;
    case 'reset':
      return { stack: [action.route] };
  }
}

export function currentRoute(state: NavState): Route {
  return state.stack[state.stack.length - 1];
}

export interface Navigator extends ReadableStore<NavState> {
  current(): Route;
  canGoBack(): boolean;
  push(route: Route): void;
  replace(route: Route): void;
  back(): void;
  /** Clear the stack (default: the title screen, i.e. "Main Menu"). */
  reset(route?: Route): void;
}

export function createNavigator(initial: Route = TITLE_ROUTE): Navigator {
  const store = createStore(initialNavState(initial));
  const dispatch = (action: NavAction): void => store.set(navReducer(store.get(), action));
  return {
    get: store.get,
    subscribe: store.subscribe,
    current: () => currentRoute(store.get()),
    canGoBack: () => store.get().stack.length > 1,
    push: (route) => dispatch({ type: 'push', route }),
    replace: (route) => dispatch({ type: 'replace', route }),
    back: () => dispatch({ type: 'back' }),
    reset: (route = TITLE_ROUTE) => dispatch({ type: 'reset', route }),
  };
}

/** Screens that play the menu music (everything outside a game). */
export function isMenuScreen(screen: ScreenId): boolean {
  return screen !== 'game';
}
