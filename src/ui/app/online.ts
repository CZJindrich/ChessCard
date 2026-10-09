/**
 * The app's online service (src/net plugged into the UI): Title "Join Online" and Setup "Host
 * Online" reach the lobby, which drives one `OnlineSession`. The service also
 * - toasts the server's errors and notices,
 * - enters the game route (with the session) when the room's game starts,
 * - leaves the room when the player navigates somewhere unrelated (title, Quick Play, ...).
 */
import { customSelection } from '../../config';
import type { ConfigSelection, KeyValueStorage } from '../../config';
import type { GameConfig } from '../../engine/types';
// The session and protocol modules, not the src/net barrel: the barrel also exports the game's
// NetTransport, which would pull the whole engine into the entry chunk (see app/lazyScreens.ts).
import { errorText } from '../../net/protocol';
import { OnlineSession, type SessionOptions, type SessionState } from '../../net/session';
import type { GameRoute, Navigator, Route } from './navigation';
import type { ToastStore } from './toasts';

export interface LobbyActions {
  /** Open a room for this config (host). With a room already hosted, update its settings. */
  openRoom(config: GameConfig, selection: ConfigSelection): void;
  /** Join the room with this 4-letter code. */
  joinRoom(code: string): void;
  /** The live session (src/net); absent when a test stubs the two actions. */
  readonly session?: OnlineSession;
  /** Watch (or return to) the room's running game. */
  enterGame?(): void;
}

export interface OnlineService extends LobbyActions {
  readonly session: OnlineSession;
  enterGame(): void;
  /** Leave the room and close the connection. */
  leave(): void;
  dispose(): void;
}

export interface OnlineServiceDeps {
  nav: Navigator;
  toasts: ToastStore;
  storage: KeyValueStorage | null;
  session?: SessionOptions;
}

declare global {
  interface Window {
    /** Debug / e2e handle on the online session. */
    __wwNet?: { session: OnlineSession };
  }
}

/** The game route for the room's running game. */
export function onlineGameRoute(session: OnlineSession, state: SessionState = session.get()): GameRoute | null {
  const game = state.game;
  const room = state.room;
  if (!game || !room || room.phase !== 'playing') return null;
  const config = game.view.config;
  const selection = room.selection ?? customSelection({ mode: config.mode, length: config.length, difficulty: config.difficulty });
  return { screen: 'game', config, selection, online: session };
}

function belongsOnline(route: Route, session: OnlineSession): boolean {
  if (route.screen === 'lobby' || route.screen === 'setup' || route.screen === 'settings') return true;
  return route.screen === 'game' && route.online === session;
}

export function createOnlineService(deps: OnlineServiceDeps): OnlineService {
  const { nav, toasts } = deps;
  const session = new OnlineSession({ storage: deps.storage, ...deps.session });
  const offs: Array<() => void> = [];

  offs.push(
    session.errors.on((error) => {
      if (error.code === 'rate_limited') return;
      toasts.show({ title: errorText(error.code, error.message), lines: error.code === 'bad_config' || error.code === 'not_ready' ? [error.message] : [], tone: 'warning' });
    }),
    session.notices.on((notice) => toasts.show({ title: notice.text, tone: notice.tone === 'warning' ? 'warning' : 'info' })),
  );

  // Follow the room: into the game when it starts, back to the lobby when the host returns
  // there, to the title when the room is gone.
  let previous = session.get();
  offs.push(
    session.subscribe(() => {
      const state = session.get();
      const before = previous;
      previous = state;
      const route = nav.current();
      const onlineGame = route.screen === 'game' && route.online === session;
      if (state.room?.phase === 'playing' && state.game && route.screen === 'lobby' && session.mySeat() !== null) {
        const next = onlineGameRoute(session, state);
        if (next) nav.replace(next);
        return;
      }
      if (onlineGame && state.room?.phase === 'lobby') {
        nav.replace({ screen: 'lobby', role: 'join', code: state.room.code });
        return;
      }
      if (onlineGame && before.room && !state.room) {
        toasts.show({ title: 'You are no longer in the room.', tone: 'warning' });
        nav.reset();
      }
    }),
  );

  // Navigating away from everything online leaves the room (Esc to the title, Quick Play, ...).
  offs.push(
    nav.subscribe(() => {
      const state = session.get();
      const live = state.room !== null || state.pending !== null || (state.status !== 'idle' && state.status !== 'closed');
      if (live && !belongsOnline(nav.current(), session)) session.leave();
    }),
  );

  if (typeof window !== 'undefined') window.__wwNet = { session };

  return {
    session,
    openRoom(config, selection) {
      const state = session.get();
      if (state.room && state.room.phase === 'lobby' && session.isHost()) {
        session.updateConfig(config, selection);
        return;
      }
      session.createRoom(config, selection);
    },
    joinRoom(code) {
      session.joinRoom(code);
    },
    enterGame() {
      const route = onlineGameRoute(session);
      if (route) nav.replace(route);
    },
    leave() {
      session.leave();
    },
    dispose() {
      for (const off of offs) off();
      session.leave();
    },
  };
}
