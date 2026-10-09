/**
 * The online session of the game on screen (null for local games), shared through context so
 * the plaques, the decision timer and the finale can read the room without prop drilling.
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { OnlineSession, SessionState } from '../../net';

export const OnlineGameContext = createContext<OnlineSession | null>(null);

export function useOnlineSession(): OnlineSession | null {
  return useContext(OnlineGameContext);
}

const noSubscribe = (): (() => void) => () => undefined;
const noState = (): null => null;

/** The session's snapshot (re-rendering on every change), or null in a local game. */
export function useOnlineState(): SessionState | null {
  const session = useOnlineSession();
  return useSyncExternalStore(session ? session.subscribe : noSubscribe, session ? session.get : noState, session ? session.get : noState);
}

/** A clock that ticks every `ms` while `active` (countdowns), else frozen at its last value. */
export function useTicker(active: boolean, now: () => number, ms = 250): number {
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!active) return undefined;
    setTime(now());
    const timer = window.setInterval(() => setTime(now()), ms);
    return () => window.clearInterval(timer);
  }, [active, now, ms]);
  return time;
}
