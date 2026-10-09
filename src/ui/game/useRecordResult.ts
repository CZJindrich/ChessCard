/**
 * Record a finished game in the local profile once (GDD §13.7 unlock ladder, stats). Demo
 * games are not the player's and are never recorded.
 */
import { useEffect, useRef } from 'react';
import { recordGame } from '../../config';
import type { GameState } from '../../engine/types';
import type { GameRoute } from '../app/navigation';
import { useServices } from '../app/services';
import { gameRecord } from './record';

export function useRecordResult(route: GameRoute, latest: GameState): void {
  const services = useServices();
  const recorded = useRef(false);
  useEffect(() => {
    if (recorded.current || route.demo || !latest.result) return;
    const record = gameRecord(route, latest);
    if (!record) return;
    recorded.current = true;
    services.profile.update((p) => recordGame(p, record));
  }, [latest, route, services]);
}
