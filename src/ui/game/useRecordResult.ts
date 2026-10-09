/**
 * Record a finished game in the local profile once (GDD §13.7 unlock ladder, stats). Demo games
 * are not the player's and are never recorded. A defeat that can still be retried is recorded
 * only when the player leaves it (a Retry continues the same game, which records its final
 * result instead).
 */
import { useEffect, useRef } from 'react';
import { recordGame, type GameRecord } from '../../config';
import { retryOpen } from '../../engine';
import type { GameState } from '../../engine/types';
import type { GameRoute } from '../app/navigation';
import { useServices } from '../app/services';
import { gameRecord } from './record';

function retryable(s: GameState): boolean {
  return s.result?.mode === 'vigil' && s.result.outcome === 'defeat' && retryOpen(s).ok;
}

export function useRecordResult(route: GameRoute, latest: GameState): void {
  const services = useServices();
  const recorded = useRef(false);
  const pending = useRef<GameRecord | null>(null);

  useEffect(() => {
    if (recorded.current || route.demo) return;
    if (!latest.result) {
      pending.current = null;
      return;
    }
    const record = gameRecord(route, latest);
    if (!record) return;
    if (retryable(latest)) {
      pending.current = record;
      return;
    }
    recorded.current = true;
    pending.current = null;
    services.profile.update((p) => recordGame(p, record));
  }, [latest, route, services]);

  // Leaving the game screen from a retryable defeat records it.
  useEffect(
    () => () => {
      const record = pending.current;
      if (recorded.current || !record) return;
      recorded.current = true;
      services.profile.update((p) => recordGame(p, record));
    },
    [services],
  );
}
