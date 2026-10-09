/**
 * NetTransport: the online `GameTransport` (src/game/transport.ts). Actions go to the server;
 * the server's `game` messages (this seat's view plus the events to animate) come back as
 * updates, and its refusals as rejections. The server runs automation, bots and timers, so
 * `runsAutomation` is false and the controller only plays back what arrives.
 */
import type { Action, GameState } from '../engine/types';
import { Emitter, type GameTransport, type SendResult, type TransportRejection, type TransportUpdate } from '../game/transport';
import type { OnlineSession } from './session';

export class NetTransport implements GameTransport {
  readonly runsAutomation = false;
  private state: GameState;
  private readonly session: OnlineSession;
  private readonly updates = new Emitter<TransportUpdate>();
  private readonly rejections = new Emitter<TransportRejection>();
  private readonly unsubscribe: Array<() => void> = [];
  private disposed = false;

  constructor(session: OnlineSession) {
    const view = session.latestView();
    if (!view) throw new Error('NetTransport needs a running online game (no game view yet)');
    this.session = session;
    this.state = view;
    this.unsubscribe.push(
      session.games.on((message) => {
        if (this.disposed) return;
        this.state = message.view;
        this.updates.emit({ state: message.view, events: message.events, action: message.action });
      }),
      session.rejects.on((message) => {
        if (this.disposed) return;
        this.rejections.emit({ action: message.action, reason: message.reason, ...(message.params ? { params: message.params } : {}) });
      }),
    );
  }

  /** The seats the server says this tab controls (it changes when a bot stands in, or on a late join). */
  controlledSeats(): number[] {
    return [...(this.session.get().game?.you ?? [])];
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * `{ ok: true }` means "sent" (queued while reconnecting); the server's verdict arrives as an
   * update or a rejection. Only a seat this tab controls may act, apart from Vigil's "Let them
   * act" claim on an AI ally, which the server checks.
   */
  send(action: Action): SendResult {
    if (action.type === 'advance') return { ok: false, reason: 'INVALID_ACTION' };
    const mine = this.controlledSeats();
    if (!mine.includes(action.seat) && action.type !== 'claim_turn') return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (!this.session.sendAction(action)) return { ok: false, reason: 'WRONG_PHASE' };
    return { ok: true };
  }

  onUpdate(listener: (update: TransportUpdate) => void): () => void {
    return this.updates.on(listener);
  }

  onReject(listener: (rejection: TransportRejection) => void): () => void {
    return this.rejections.on(listener);
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.updates.clear();
    this.rejections.clear();
  }
}

/** For the game screen: `route.online ? createNetTransport(route.online) : new LocalTransport(...)`. */
export function createNetTransport(session: OnlineSession): NetTransport {
  return new NetTransport(session);
}
