/**
 * The in-game pause menu (Esc with nothing selected, or the top bar's gear): Resume, Settings
 * (the shared settings panel), How to Play (the rules overlay), Concede (Vigil) and Main Menu,
 * with a confirmation before leaving or conceding. Playback pauses while it is open.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useServices } from '../app/services';
import { Button } from '../components/Button';
import { SettingsPanel } from '../screens/settings/SettingsPanel';
import { useController, useGameSnapshot } from './context';
import { GameDialog } from './GameDialog';
import { useGameUi } from './uiStore';

type View = 'menu' | 'settings' | 'leave' | 'concede';

export function PauseMenu(): ReactElement {
  const services = useServices();
  const controller = useController();
  const ui = useGameUi();
  const snap = useGameSnapshot();
  const [view, setView] = useState<View>('menu');
  const over = snap.latest.result !== null;
  const humanSeat = snap.controlledSeats[0];
  const canConcede = !over && snap.latest.config.mode === 'vigil' && humanSeat !== undefined;
  const coop = snap.latest.players.filter((p) => p.kind === 'human').length > 1;

  useEffect(() => {
    controller.hold('pause');
    return () => controller.release('pause');
  }, [controller]);

  const close = (): void => ui.close();

  if (view === 'settings') {
    return (
      <GameDialog full eyebrow="Paused" title="Settings" size="xl" className="ww-pause ww-pause--settings" onClose={() => setView('menu')} testId="pause-settings">
        <SettingsPanel showPreview={false} />
        <div className="ww-dialog__actions">
          <Button variant="primary" seal="back" onClick={() => setView('menu')}>
            Back
          </Button>
        </div>
      </GameDialog>
    );
  }

  if (view === 'leave' || view === 'concede') {
    const leaving = view === 'leave';
    return (
      <GameDialog full eyebrow="Paused" title={leaving ? 'Leave this game?' : 'Concede the Vigil?'} size="sm" className="ww-pause" onClose={() => setView('menu')}>
        <p className="ww-dialog__lead">
          {leaving ? 'The Vigil will not be saved.' : coop ? 'Everyone must agree. The Long Night falls if they do.' : 'The Long Night falls, and the game ends as a loss.'}
        </p>
        <div className="ww-pause__buttons">
          {leaving ? (
            <Button variant="primary" sound="back" onClick={() => services.nav.reset()}>
              Leave to Main Menu
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="flame"
              onClick={() => {
                if (humanSeat !== undefined) controller.dispatch({ type: 'concede', seat: humanSeat });
                close();
              }}
            >
              {coop ? 'Vote to concede' : 'Concede'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setView('menu')}>
            Stay
          </Button>
        </div>
      </GameDialog>
    );
  }

  return (
    <GameDialog full eyebrow="The Vigil waits" title="Paused" size="sm" className="ww-pause" onClose={close} testId="pause-menu">
      <div className="ww-pause__buttons">
        <Button variant="primary" seal="play" onClick={close}>
          Resume
        </Button>
        <Button variant="secondary" icon="gear" onClick={() => setView('settings')}>
          Settings
        </Button>
        <Button variant="secondary" icon="book" onClick={() => ui.open('rules')}>
          How to Play
        </Button>
        {canConcede && (
          <Button variant="ghost" icon="flame" onClick={() => setView('concede')}>
            Concede
          </Button>
        )}
        <Button variant="ghost" icon="door" sound="back" onClick={() => (over ? services.nav.reset() : setView('leave'))}>
          Main Menu
        </Button>
      </div>
      <p className="ww-pause__keys">
        <kbd>Esc</kbd> resume · <kbd>R</kbd> rules · <kbd>D</kbd> deck · <kbd>G</kbd> ping
      </p>
    </GameDialog>
  );
}
