/**
 * The finale screens (GDD §15.1.10–11, §16.9):
 * - Victory "Dawn Breaks": a gold sunrise sweep, every candle closing its eyes happily, the
 *   stars, the MVP piece and the run's stats, the seed; Play Again, Same Seed, Change Hero,
 *   Main Menu.
 * - Defeat "The Long Night Falls": the Hour Candle gutters, black, two moth eyespots open; the
 *   cause; Retry this Night (when enabled), Same Seed, Main Menu.
 * - Last Flame: the podium with placements and each player's Glory breakdown.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { DefeatEyespots, HourCandle, PieceArt, VictorySunrise } from '../../art';
import { retryOpen } from '../../engine';
import type { GameResult, GameState, Standing } from '../../engine/types';
import { prepareLaunch } from '../app/launch';
import type { GameRoute } from '../app/navigation';
import { useContentState, usePresentation, useServices } from '../app/services';
import { Button } from '../components/Button';
import { useController, useGameSnapshot, useRegistry } from './context';
import { nameOf } from './model';
import { houseColorOf } from './pieceView';
import { GLORY_LABELS, gloryLines, mvpPiece, ordinal, runTotals } from './titles';

type VigilResult = Extract<GameResult, { mode: 'vigil' }>;
type LastFlameResult = Extract<GameResult, { mode: 'last_flame' }>;

interface FinaleActions {
  playAgain: () => void;
  sameSeed: () => void;
  changeHero: () => void;
  mainMenu: () => void;
}

function useFinaleActions(route: GameRoute): FinaleActions {
  const services = useServices();
  const content = useContentState();
  return {
    playAgain() {
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
    },
    sameSeed: () => services.nav.replace({ ...route }),
    changeHero() {
      const oneClick = route.selection.oneClick;
      if (oneClick === 'quick_play' || oneClick === 'quick_last_flame') services.nav.replace({ screen: 'hero_pick', mode: oneClick });
      else services.nav.replace({ screen: 'setup', selection: route.selection });
    },
    mainMenu: () => services.nav.reset(),
  };
}

function Stars({ count }: { count: number }): ReactElement {
  return (
    <div className="ww-result-stars" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`ww-result-star${n <= count ? ' ww-result-star--on' : ''}`} style={{ '--ww-star-delay': `${900 + n * 260}ms` } as CSSProperties} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="ww-finale__stat">
      <dt>{label}</dt>
      <dd className="ww-num">{value}</dd>
    </div>
  );
}

function Mvp({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const mvp = mvpPiece(state);
  if (!mvp) return null;
  const piece = state.pieces[mvp.pieceId];
  const name = piece ? nameOf(registry, piece) : (registry.heroes.byId[mvp.defId]?.name ?? registry.units.byId[mvp.defId]?.name ?? mvp.defId);
  const hero = registry.heroes.byId[mvp.defId] !== undefined;
  return (
    <div className="ww-finale__mvp">
      <PieceArt defId={mvp.defId} kind={hero ? 'hero' : 'unit'} houseColor={houseColorOf(state, mvp.owner)} size={64} mood="happy" showStats={false} showPips={false} />
      <div>
        <span className="ww-finale__mvp-label">MVP</span>
        <span className="ww-finale__mvp-name">{name}</span>
        <span className="ww-finale__mvp-line ww-num">
          {mvp.kills} kill{mvp.kills === 1 ? '' : 's'} · {Math.round(mvp.damage)} damage
        </span>
      </div>
    </div>
  );
}

/** The candles of the Vigil, eyes closed happily (§15.1.10), led by the heroes. */
function HappyCandles({ state }: { state: GameState }): ReactElement {
  return (
    <div className="ww-finale__candles" aria-hidden="true">
      {state.players.map((p) => (
        <PieceArt key={`h${p.seat}`} defId={p.hero} kind="hero" houseColor={houseColorOf(state, p.seat)} size={58} mood="happy" showStats={false} showPips={false} seed={`fin${p.seat}`} />
      ))}
      {[0, 1, 2].map((i) => (
        <PieceArt key={`c${i}`} defId="vigil_candle" kind="candle" size={46} mood="happy" showStats={false} showPips={false} seed={`finc${i}`} />
      ))}
    </div>
  );
}

function Seed({ state }: { state: GameState }): ReactElement {
  return (
    <p className="ww-result__seed">
      Seed <span className="ww-num">{state.seed}</span>
    </p>
  );
}

function Victory({ result, state, actions }: { result: VigilResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const totals = runTotals(state, true);
  return (
    <div className="ww-finale ww-finale--victory" data-testid="game-over" data-outcome="victory">
      <VictorySunrise className="ww-finale__scene" reducedMotion={presentation.reduced_motion} />
      <div className="ww-finale__panel" role="dialog" aria-label="Dawn Breaks">
        <span className="ww-finale__eyebrow">Victory</span>
        <h2 className="ww-finale__title">Dawn Breaks</h2>
        <Stars count={result.stars} />
        <HappyCandles state={state} />
        <div className="ww-finale__body">
          <Mvp state={state} />
          <dl className="ww-finale__stats">
            <Stat label="Damage" value={totals.damage} />
            <Stat label="Snuff slain" value={totals.kills} />
            <Stat label="Plumes blocked" value={totals.plumesBlocked} />
            <Stat label="Candles saved" value={totals.candlesSaved} />
            <Stat label="Retries" value={result.retries} />
            <Stat label="Final Dread" value={`${result.finalDread}/${state.vigil?.dreadMax ?? '?'}`} />
          </dl>
        </div>
        <Seed state={state} />
        <div className="ww-finale__buttons">
          <Button variant="primary" seal="play" drips onClick={actions.playAgain}>
            Play Again
          </Button>
          <Button variant="secondary" onClick={actions.sameSeed}>
            Same Seed
          </Button>
          <Button variant="secondary" icon="swords" onClick={actions.changeHero}>
            Change Hero
          </Button>
          <Button variant="ghost" icon="door" sound="back" onClick={actions.mainMenu}>
            Main Menu
          </Button>
        </div>
      </div>
    </div>
  );
}

function Defeat({ result, state, actions }: { result: VigilResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const controller = useController();
  const snap = useGameSnapshot();
  const totals = runTotals(state, false);
  const seat = snap.controlledSeats[0];
  const coop = state.players.filter((p) => p.kind === 'human').length > 1;
  const canRetry = result.outcome === 'defeat' && seat !== undefined && retryOpen(state).ok;
  const conceded = result.outcome === 'conceded';
  const dreadMax = state.vigil?.dreadMax ?? result.finalDread;
  return (
    <div className="ww-finale ww-finale--defeat" data-testid="game-over" data-outcome={result.outcome}>
      <DefeatEyespots className="ww-finale__scene" reducedMotion={presentation.reduced_motion} />
      <div className="ww-finale__blackout" aria-hidden="true" />
      <div className="ww-finale__hour" aria-hidden="true">
        <HourCandle value={Math.min(dreadMax, result.finalDread)} max={dreadMax} size={40} guttering animated={!presentation.reduced_motion} showValue={false} />
      </div>
      <div className="ww-finale__panel" role="dialog" aria-label="The Long Night Falls">
        <span className="ww-finale__eyebrow">{conceded ? 'Conceded' : 'Defeat'}</span>
        <h2 className="ww-finale__title">{conceded ? 'The Vigil Is Abandoned' : 'The Long Night Falls'}</h2>
        <p className="ww-finale__cause">{result.cause ?? (conceded ? 'The Lanternwardens laid down their lights.' : 'The last light went out.')}</p>
        <dl className="ww-finale__stats ww-finale__stats--small">
          <Stat label="Nights survived" value={totals.nights} />
          <Stat label="Snuff slain" value={totals.kills} />
          <Stat label="Final Dread" value={`${result.finalDread}/${dreadMax}`} />
        </dl>
        <Seed state={state} />
        <div className="ww-finale__buttons">
          {canRetry && seat !== undefined && (
            <Button variant="primary" seal="reset" drips onClick={() => controller.dispatch({ type: 'retry_night', seat })} data-testid="retry-night">
              {coop ? 'Vote to retry this Night' : 'Retry this Night'}
            </Button>
          )}
          <Button variant={canRetry ? 'secondary' : 'primary'} onClick={actions.sameSeed}>
            Same Seed
          </Button>
          <Button variant="ghost" icon="door" sound="back" onClick={actions.mainMenu}>
            Main Menu
          </Button>
        </div>
      </div>
    </div>
  );
}

function PodiumStep({ standing, state }: { standing: Standing; state: GameState }): ReactElement {
  const player = state.players[standing.seat];
  const winner = standing.placement === 1;
  return (
    <li className={`ww-podium__step ww-podium__step--${Math.min(4, standing.placement)}`}>
      <div className="ww-podium__hero">
        <PieceArt defId={player?.hero ?? ''} kind="hero" houseColor={houseColorOf(state, standing.seat)} size={winner ? 84 : 64} mood={winner ? 'happy' : standing.alive ? 'open' : 'sleepy'} showStats={false} showPips={false} />
      </div>
      <div className="ww-podium__block">
        <span className="ww-podium__place">{ordinal(standing.placement)}</span>
        <span className="ww-podium__name">{player?.name ?? `Seat ${standing.seat + 1}`}</span>
        <span className="ww-podium__score ww-num">{standing.score} Glory</span>
      </div>
    </li>
  );
}

function Podium({ result, state, actions }: { result: LastFlameResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const byPlace = result.standings.slice().sort((a, b) => a.placement - b.placement || a.seat - b.seat);
  // 2nd, 1st, 3rd, 4th: the winner stands in the middle.
  const podium = [byPlace[1], byPlace[0], byPlace[2], byPlace[3]].filter((s): s is Standing => s !== undefined);
  const reasons = (Object.keys(GLORY_LABELS) as Array<keyof typeof GLORY_LABELS>).filter((r) => byPlace.some((st) => gloryLines(st).some((l) => l.reason === r)));
  return (
    <div className="ww-finale ww-finale--podium" data-testid="game-over" data-outcome="last_flame">
      <VictorySunrise className="ww-finale__scene" reducedMotion={presentation.reduced_motion} />
      <div className="ww-finale__panel ww-finale__panel--wide" role="dialog" aria-label="The Last Flame">
        <span className="ww-finale__eyebrow">The Trial ends</span>
        <h2 className="ww-finale__title">The Last Flame</h2>
        <ol className="ww-podium">
          {podium.map((st) => (
            <PodiumStep key={st.seat} standing={st} state={state} />
          ))}
        </ol>
        <table className="ww-glory-table">
          <thead>
            <tr>
              <th scope="col">Glory</th>
              {byPlace.map((st) => (
                <th key={st.seat} scope="col">
                  {state.players[st.seat]?.name ?? `Seat ${st.seat + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reasons.map((reason) => (
              <tr key={reason}>
                <th scope="row">{GLORY_LABELS[reason]}</th>
                {byPlace.map((st) => (
                  <td key={st.seat} className="ww-num">
                    {st.breakdown[reason] ? (st.breakdown[reason] > 0 ? `+${st.breakdown[reason]}` : st.breakdown[reason]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="ww-glory-table__total">
              <th scope="row">Final score</th>
              {byPlace.map((st) => (
                <td key={st.seat} className="ww-num">
                  {st.score}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <Seed state={state} />
        <div className="ww-finale__buttons">
          <Button variant="primary" seal="play" drips onClick={actions.playAgain}>
            Play Again
          </Button>
          <Button variant="secondary" onClick={actions.sameSeed}>
            Same Seed
          </Button>
          <Button variant="secondary" icon="swords" onClick={actions.changeHero}>
            Change Hero
          </Button>
          <Button variant="ghost" icon="door" sound="back" onClick={actions.mainMenu}>
            Main Menu
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GameOverOverlay({ route }: { route: GameRoute }): ReactElement | null {
  const snap = useGameSnapshot();
  const actions = useFinaleActions(route);
  const result = snap.state.result;
  if (!result || snap.animating) return null;
  if (result.mode === 'last_flame') return <Podium result={result} state={snap.state} actions={actions} />;
  if (result.outcome === 'victory') return <Victory result={result} state={snap.state} actions={actions} />;
  return <Defeat result={result} state={snap.state} actions={actions} />;
}
