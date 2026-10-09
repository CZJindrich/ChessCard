/**
 * The in-game pause menu (Esc with nothing selected, or the top bar's gear): Resume, Settings
 * (the shared settings panel), How to Play (the rules overlay), Retry this Night and Concede
 * (Vigil; a unanimous vote in co-op) and Main Menu, with a confirmation before leaving,
 * retrying or conceding. Playback pauses while it is open (local games only: online the server
 * keeps time). Online, Main Menu leaves the room.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { retryOpen } from '../../engine';
import { useServices } from '../app/services';
import { Button } from '../components/Button';
import { SettingsPanel } from '../screens/settings/SettingsPanel';
import { useController, useGameSnapshot } from './context';
import { GameDialog } from './GameDialog';
import { useOnlineSession } from './onlineContext';
import { useGameUi } from './uiStore';

type View = 'menu' | 'settings' | 'leave' | 'concede' | 'retry';

const CONFIRM_TEXT: Readonly<Record<'leave' | 'concede' | 'retry', { title: string; solo: string; coop: string; go: string; vote: string }>> = {
  leave: { title: 'Leave this game?', solo: 'The Vigil will not be saved.', coop: 'The Vigil will not be saved.', go: 'Leave to Main Menu', vote: 'Leave to Main Menu' },
  concede: { title: 'Concede the Vigil?', solo: 'The Long Night falls, and the game ends as a loss.', coop: 'Everyone must agree. The Long Night falls if they do.', go: 'Concede', vote: 'Vote to concede' },
  retry: {
    title: 'Retry this Night?',
    solo: 'The Night starts again from its beginning, as it was dealt. Retries are counted in the stats.',
    coop: 'Everyone must agree. The Night then starts again from its beginning.',
    go: 'Retry this Night',
    vote: 'Vote to retry',
  },
};

export function PauseMenu(): ReactElement {
  const services = useServices();
  const controller = useController();
  const ui = useGameUi();
  const snap = useGameSnapshot();
  const online = useOnlineSession();
  const [view, setView] = useState<View>('menu');
  const over = snap.latest.result !== null;
  const humanSeat = snap.controlledSeats.find((seat) => snap.latest.players[seat]?.kind === 'human');
  const canConcede = !over && snap.latest.config.mode === 'vigil' && humanSeat !== undefined;
  const canRetry = !over && humanSeat !== undefined && retryOpen(snap.latest).ok;
  const coop = snap.latest.players.filter((p) => p.kind === 'human').length > 1;

  useEffect(() => {
    if (online) return undefined;
    controller.hold('pause');
    return () => controller.release('pause');
  }, [controller, online]);

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

  if (view === 'leave' || view === 'concede' || view === 'retry') {
    const text = CONFIRM_TEXT[view];
    const leaveText = online ? 'You leave the room; a Warden takes your seat.' : text.solo;
    const confirm = (): void => {
      if (view === 'leave') {
        services.nav.reset();
        return;
      }
      if (humanSeat !== undefined) controller.dispatch(view === 'retry' ? { type: 'retry_night', seat: humanSeat } : { type: 'concede', seat: humanSeat });
      close();
    };
    return (
      <GameDialog full eyebrow="Paused" title={text.title} size="sm" className="ww-pause" onClose={() => setView('menu')} testId={`pause-${view}`}>
        <p className="ww-dialog__lead">{view === 'leave' ? leaveText : coop ? text.coop : text.solo}</p>
        <div className="ww-pause__buttons">
          <Button variant="primary" icon={view === 'leave' ? undefined : 'flame'} sound={view === 'leave' ? 'back' : undefined} onClick={confirm}>
            {view === 'leave' ? (online ? 'Leave the room' : text.go) : coop ? text.vote : text.go}
          </Button>
          <Button variant="ghost" onClick={() => setView('menu')}>
            Stay
          </Button>
        </div>
      </GameDialog>
    );
  }

  return (
    <GameDialog full eyebrow={online ? 'The game goes on' : snap.latest.config.mode === 'vigil' ? 'The Vigil waits' : 'The Trial waits'} title={online ? 'Menu' : 'Paused'} size="sm" className="ww-pause" onClose={close} testId="pause-menu">
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
        {canRetry && (
          <Button variant="secondary" icon="reset" onClick={() => setView('retry')} data-testid="pause-retry-button">
            Retry this Night
          </Button>
        )}
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
