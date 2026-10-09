/**
 * The top bar's game menu: Settings, Concede (Vigil) and Main Menu, with a confirmation
 * before leaving a game in progress.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useServices } from '../app/services';
import { Button } from '../components/Button';
import { useController, useGameSnapshot } from './context';

export function GameMenu({ onClose }: { onClose: () => void }): ReactElement {
  const services = useServices();
  const controller = useController();
  const snap = useGameSnapshot();
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const over = snap.latest.result !== null;
  const humanSeat = snap.controlledSeats[0];
  const canConcede = !over && snap.latest.config.mode === 'vigil' && humanSeat !== undefined;

  useEffect(() => {
    const onDown = (event: PointerEvent): void => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target) && !(event.target instanceof Element && event.target.closest('.ww-topbar__menu-btn'))) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div ref={ref} className="ww-game-menu ww-panel ww-panel--night" role="menu">
      {leaving ? (
        <>
          <p className="ww-game-menu__ask">Leave this game? The Vigil will not be saved.</p>
          <Button variant="primary" size="sm" sound="back" onClick={() => services.nav.reset()}>
            Leave to Main Menu
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLeaving(false)}>
            Stay
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon="gear"
            onClick={() => {
              services.overlays.update((o) => ({ ...o, settingsOpen: true }));
              onClose();
            }}
          >
            Settings
          </Button>
          {canConcede && (
            <Button
              variant="ghost"
              size="sm"
              icon="flame"
              onClick={() => {
                controller.dispatch({ type: 'concede', seat: humanSeat });
                onClose();
              }}
            >
              Concede
            </Button>
          )}
          <Button variant="ghost" size="sm" icon="door" sound="back" onClick={() => (over ? services.nav.reset() : setLeaving(true))}>
            Main Menu
          </Button>
        </>
      )}
    </div>
  );
}
