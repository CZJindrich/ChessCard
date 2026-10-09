/**
 * Helpers for the online tests: a server on an ephemeral port, sessions over real `ws`
 * sockets, waiting on session state, and a tiny "player" that answers whatever decision the
 * session's seat owes (ready, Toll, claim, a move, end turn, carry-over, draft).
 */
import { WebSocket } from 'ws';
import { customSelection, memoryStorage, resolveConfig } from '../../../src/config';
import type { ConfigSelection } from '../../../src/config';
import { activeSeats, botChoice, legalMoves } from '../../../src/engine';
import type { Action, GameConfig, GameState, SeatConfig } from '../../../src/engine/types';
import { OnlineSession, type SessionState, type WebSocketLike } from '../../../src/net';
import { startServer, type RunningServer } from '../../../server/app';
import { silentLogger } from '../../../server/log';
import { nullRoomStore } from '../../../server/persist';

export async function testServer(): Promise<RunningServer> {
  return startServer({ port: 0, host: '127.0.0.1', log: silentLogger, store: nullRoomStore, restore: false, distDir: '/nonexistent', driver: { paceScale: 0 }, heartbeatMs: 60_000 });
}

export function session(server: RunningServer, name: string): OnlineSession {
  const s = new OnlineSession({
    storage: memoryStorage(),
    url: `ws://127.0.0.1:${server.port}/ws`,
    socket: (url) => new WebSocket(url) as unknown as WebSocketLike,
    backoff: { baseMs: 50, maxMs: 200 },
  });
  s.setName(name);
  return s;
}

export function waitFor(s: OnlineSession, predicate: (state: SessionState) => boolean, what: string, timeoutMs = 8000): Promise<SessionState> {
  return new Promise((resolve, reject) => {
    if (predicate(s.get())) {
      resolve(s.get());
      return;
    }
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timed out waiting for ${what}; state: ${JSON.stringify({ status: s.get().status, room: s.get().room?.phase, phase: s.get().game?.view.phase, round: s.get().game?.view.round })}`));
    }, timeoutMs);
    const off = s.subscribe(() => {
      if (!predicate(s.get())) return;
      clearTimeout(timer);
      off();
      resolve(s.get());
    });
  });
}

export function onlineConfig(mode: 'vigil' | 'last_flame', seats: SeatConfig[], extra: Partial<ConfigSelection['overrides']> = {}): { config: GameConfig; selection: ConfigSelection } {
  const selection: ConfigSelection = { ...customSelection({ mode }), locked: { seats }, overrides: { seed: 'net-test', ...extra } };
  const resolved = resolveConfig(selection, { online: true });
  if (!resolved.validation.ok) throw new Error(resolved.validation.issues.map((i) => i.message).join(' '));
  return { config: resolved.config, selection };
}

/** The next action this seat owes on this view, or null when it has nothing to do. */
export function decisionFor(view: GameState, seat: number, opts: { move?: boolean } = {}): Action | null {
  if (view.result) return null;
  const me = view.players[seat];
  if (!me) return null;
  if (view.phase === 'players') {
    if (view.activeSeat === null) return !me.turnEnded && !me.eliminated && activeSeats(view).includes(seat) ? { type: 'claim_turn', seat } : null;
    if (view.activeSeat !== seat) return null;
    if (opts.move !== false && me.turn && view.pieces[me.heroPieceId]?.movesLeft) {
      const to = legalMoves(view, me.heroPieceId)[0];
      if (to) return { type: 'move', seat, pieceId: me.heroPieceId, to };
    }
    return { type: 'end_turn', seat };
  }
  if (!activeSeats(view).includes(seat)) return null;
  return botChoice(view, seat);
}
