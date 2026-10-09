/**
 * Game over, minimal (GDD §15.1 screens 10–11): Victory ("Dawn Breaks") with stars or Defeat
 * ("The Long Night Falls") with its cause, or the Last Flame standings; Play Again (same
 * selection, new seed), Same Seed and Main Menu. The finale scenes replace the visuals later.
 */
import type { ReactElement } from 'react';
import { DefeatEyespots, VictorySunrise } from '../../art';
import type { GameResult, GameState } from '../../engine/types';
import { prepareLaunch } from '../app/launch';
import type { GameRoute } from '../app/navigation';
import { useContentState, usePresentation, useServices } from '../app/services';
import { Button } from '../components/Button';
import { useGameSnapshot } from './context';
import { GameDialog } from './GameDialog';

function Stars({ count }: { count: number }): ReactElement {
  return (
    <div className="ww-result-stars" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`ww-result-star${n <= count ? ' ww-result-star--on' : ''}`} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  );
}

function VigilSummary({ result, state }: { result: Extract<GameResult, { mode: 'vigil' }>; state: GameState }): ReactElement {
  const kills = state.players.reduce((sum, p) => sum + p.stats.kills, 0);
  return (
    <div className="ww-result">
      {result.outcome === 'victory' && <Stars count={result.stars} />}
      {result.cause && <p className="ww-result__cause">{result.cause}</p>}
      <dl className="ww-result__stats">
        <div>
          <dt>Nights</dt>
          <dd className="ww-num">{state.stats.nightsCompleted + (result.outcome === 'victory' ? 1 : 0)}</dd>
        </div>
        <div>
          <dt>Final Dread</dt>
          <dd className="ww-num">
            {result.finalDread}/{state.vigil?.dreadMax ?? '?'}
          </dd>
        </div>
        <div>
          <dt>Snuff slain</dt>
          <dd className="ww-num">{kills}</dd>
        </div>
        <div>
          <dt>Candles saved</dt>
          <dd className="ww-num">{state.stats.candlesSaved}</dd>
        </div>
      </dl>
    </div>
  );
}

function Standings({ result, state }: { result: Extract<GameResult, { mode: 'last_flame' }>; state: GameState }): ReactElement {
  return (
    <ol className="ww-standings">
      {result.standings
        .slice()
        .sort((a, b) => a.placement - b.placement)
        .map((st) => (
          <li key={st.seat} className={st.placement === 1 ? 'ww-standings__winner' : undefined}>
            <span className="ww-num">{st.placement}</span>
            <span>{state.players[st.seat]?.name ?? `Seat ${st.seat + 1}`}</span>
            <span className="ww-num">{st.score} Glory</span>
          </li>
        ))}
    </ol>
  );
}

function titleFor(result: GameResult): { title: string; eyebrow: string; won: boolean } {
  if (result.mode === 'last_flame') return { title: 'The Last Flame', eyebrow: 'The Trial ends', won: true };
  if (result.outcome === 'victory') return { title: 'Dawn Breaks', eyebrow: 'Victory', won: true };
  if (result.outcome === 'conceded') return { title: 'The Vigil Is Abandoned', eyebrow: 'Conceded', won: false };
  return { title: 'The Long Night Falls', eyebrow: 'Defeat', won: false };
}

export function GameOverOverlay({ route }: { route: GameRoute }): ReactElement | null {
  const snap = useGameSnapshot();
  const services = useServices();
  const content = useContentState();
  const presentation = usePresentation();
  const result = snap.state.result;
  if (!result || snap.animating) return null;
  const { title, eyebrow, won } = titleFor(result);

  const playAgain = (): void => {
    const launch = prepareLaunch({ ...route.selection, overrides: { ...route.selection.overrides, seed: 'random' } }, {
      content: content.registry,
      modded: content.modded,
      now: services.env.now(),
      randomSeed: services.env.randomSeed,
    });
    if (!launch.ok) {
      services.toasts.show({ title: 'This game cannot start', lines: launch.issues.map((i) => i.message), tone: 'warning' });
      return;
    }
    services.nav.replace({ screen: 'game', config: launch.config, selection: launch.selection, demo: route.demo });
  };

  return (
    <div className={`ww-game-over ww-game-over--${won ? 'won' : 'lost'}`} data-testid="game-over">
      {won ? <VictorySunrise className="ww-game-over__scene" reducedMotion={presentation.reduced_motion} /> : <DefeatEyespots className="ww-game-over__scene" reducedMotion={presentation.reduced_motion} />}
      <GameDialog
        full
        eyebrow={eyebrow}
        title={title}
        size="md"
        footer={
          <>
            <Button variant="primary" seal="play" drips onClick={playAgain}>
              Play Again
            </Button>
            <Button variant="secondary" onClick={() => services.nav.replace({ ...route })}>
              Same Seed
            </Button>
            <Button variant="ghost" icon="door" sound="back" onClick={() => services.nav.reset()}>
              Main Menu
            </Button>
          </>
        }
      >
        {result.mode === 'vigil' ? <VigilSummary result={result} state={snap.state} /> : <Standings result={result} state={snap.state} />}
        <p className="ww-result__seed">
          Seed <span className="ww-num">{snap.state.seed}</span>
        </p>
      </GameDialog>
    </div>
  );
}
