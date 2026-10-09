/**
 * React to playback cues in a component: `useCueMoment(match)` returns the latest matching
 * moment (with a fresh id, to restart CSS animations) for as long as it lasts, then null.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../../engine/types';
import { useController } from './context';

export interface CueMoment<T> {
  id: number;
  value: T;
  /** How long the moment shows, ms. */
  duration: number;
}

/**
 * `match` maps an event to a value (or null to ignore it); the moment lasts the event's
 * playback duration, at least `minMs`.
 */
export function useCueMoment<T>(match: (event: GameEvent) => T | null, minMs = 0): CueMoment<T> | null {
  const controller = useController();
  const [moment, setMoment] = useState<CueMoment<T> | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => {
    let timer: number | null = null;
    let next = 1;
    const off = controller.onCue((step) => {
      if (step.duration <= 0) return;
      const value = matchRef.current(step.event);
      if (value === null) return;
      const id = next++;
      const duration = Math.max(minMs, step.duration);
      setMoment({ id, value, duration });
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setMoment((m) => (m?.id === id ? null : m)), duration);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [controller, minMs]);
  return moment;
}
