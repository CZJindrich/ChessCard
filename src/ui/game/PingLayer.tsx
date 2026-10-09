/**
 * Pings (GDD §15.7): transient marks a player drops on a tile (right-click an empty tile, G over
 * a tile, a two-finger tap). Drawn in the pinging seat's House colour; never in the log.
 */
import type { CSSProperties, ReactElement } from 'react';
import { PALETTE } from '../../art';
import { useGameSnapshot } from './context';
import { tileXY, type BoardMetrics } from './geometry';
import { houseColorOf } from './pieceView';
import { useGameUiState } from './uiStore';

export function PingLayer({ metrics }: { metrics: BoardMetrics }): ReactElement | null {
  const { pings } = useGameUiState();
  const { state } = useGameSnapshot();
  if (pings.length === 0) return null;
  return (
    <div className="ww-pings" aria-hidden="true">
      {pings.map((ping) => {
        const o = tileXY(ping.pos, metrics);
        const color = houseColorOf(state, ping.seat) ?? PALETTE.candleGold;
        return (
          <div key={ping.id} className="ww-ping" style={{ transform: `translate(${o.x}px, ${o.y}px)`, width: metrics.tile, height: metrics.tile, '--ww-ping': color } as CSSProperties}>
            <span className="ww-ping__ring" />
            <span className="ww-ping__ring ww-ping__ring--late" />
            <span className="ww-ping__pin" />
          </div>
        );
      })}
    </div>
  );
}
