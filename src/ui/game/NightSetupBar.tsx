/**
 * Night setup (GDD §4.2): the seat's pieces stand in the deploy zone. Click (or drag) a piece,
 * then a gold tile, to move it; press Ready when done.
 */
import type { ReactElement } from 'react';
import { Button } from '../components/Button';
import { useController, useGameSnapshot } from './context';

export function NightSetupBar(): ReactElement {
  const snap = useGameSnapshot();
  const controller = useController();
  const seat = snap.uiSeat;
  const player = seat !== null ? snap.latest.players[seat] : undefined;
  const hotSeat = snap.controlledSeats.length > 1;
  const shaking = snap.notice?.anchor.kind === 'control' && snap.notice.anchor.id === 'ready';
  return (
    <div className="ww-setup-bar">
      <div className="ww-setup-bar__text">
        <span className="ww-setup-bar__title">{hotSeat && player ? `${player.name}: deploy` : 'Deploy your pieces'}</span>
        <span className="ww-setup-bar__hint">Click a piece, then a gold tile in your zone. Ready when your line is set.</span>
      </div>
      <Button key={shaking ? `ready:${snap.notice?.id}` : 'ready'} variant="primary" size="lg" seal="check" drips pulse className={shaking ? 'ww-shake' : undefined} data-testid="ready" onClick={() => controller.ready()}>
        Ready
      </Button>
    </div>
  );
}
