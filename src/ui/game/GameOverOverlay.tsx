/**
 * The finale screens (GDD §15.1.10–11, §16.9):
 * - Victory "Dawn Breaks": a gold sunrise sweep, every candle closing its eyes happily, the
 *   stars, the MVP piece and the run's stats, the seed; Play Again, Same Seed, Change Hero,
 *   Main Menu.
 * - Defeat "The Long Night Falls": the Hour Candle gutters, black, two moth eyespots open; the
 *   cause; Retry this Night (when enabled), Same Seed, Main Menu.
 * - Last Flame: the podium with placements and each player's Glory breakdown.
 * Online there is no Play Again or Same Seed: the host takes everyone back to the lobby (the
 * room follows), the others wait for that or leave; the seed is the server's reveal (§B.3).
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { DefeatEyespots, HourCandle, PieceArt, VictorySunrise } from '../../art';
import { retryOpen, voteStatus } from '../../engine';
import type { GameResult, GameState, Standing } from '../../engine/types';
import { prepareLaunch } from '../app/launch';
import type { GameRoute } from '../app/navigation';
import { useContentState, usePresentation, useServices } from '../app/services';
import { Button } from '../components/Button';
import { useController, useGameSnapshot, useRegistry } from './context';
import { nameOf } from './model';
import { useOnlineSession, useOnlineState } from './onlineContext';
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
      services.nav.replace({ screen: 'game', config: launch.config, selection: launch.selection, demo: route.demo, hostOptions: route.hostOptions });
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

function Mvp({ state, teamKills }: { state: GameState; teamKills: number }): ReactElement | null {
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
        <span className="ww-finale__mvp-line ww-num">{mvpLine(mvp.kills, teamKills, mvp.damage)}</span>
      </div>
    </div>
  );
}

/** "4 of the 9 kills · 17 damage": the MVP's share of the team's totals shown beside it. */
export function mvpLine(kills: number, teamKills: number, damage: number): string {
  const share = teamKills > kills ? `${kills} of the ${teamKills} kills` : `${kills} kill${kills === 1 ? '' : 's'}`;
  return `${share} · ${Math.round(damage)} damage`;
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

/** The seed: the game's own offline, the server's reveal online (GDD B.3). */
function Seed({ state }: { state: GameState }): ReactElement | null {
  const online = useOnlineState();
  const seed = online ? (online.game?.reveal?.seed ?? null) : state.seed;
  if (!seed) return null;
  return (
    <p className="ww-result__seed">
      Seed <span className="ww-num">{seed}</span>
    </p>
  );
}

/**
 * Online finale buttons: the host takes the room back to the lobby (everyone follows); the
 * others wait for that, or leave the room.
 */
function OnlineButtons({ extra }: { extra?: ReactNode }): ReactElement | null {
  const session = useOnlineSession();
  const services = useServices();
  useOnlineState();
  if (!session) return null;
  const host = session.isHost();
  return (
    <div className="ww-finale__buttons" data-testid="online-finale">
      {extra}
      {host ? (
        <Button variant="primary" seal="door" drips onClick={() => session.returnToLobby()} data-testid="back-to-lobby">
          Back to lobby
        </Button>
      ) : (
        <p className="ww-finale__waiting">The host will take everyone back to the lobby.</p>
      )}
      <Button variant="ghost" icon="door" sound="back" onClick={() => services.nav.reset()}>
        Leave room
      </Button>
    </div>
  );
}

function LocalButtons({ actions, changeHero }: { actions: FinaleActions; changeHero: boolean }): ReactElement {
  return (
    <div className="ww-finale__buttons">
      <Button variant="primary" seal="play" drips onClick={actions.playAgain}>
        Play Again
      </Button>
      <Button variant="secondary" onClick={actions.sameSeed}>
        Same Seed
      </Button>
      {changeHero && (
        <Button variant="secondary" icon="swords" onClick={actions.changeHero}>
          Change Hero
        </Button>
      )}
      <Button variant="ghost" icon="door" sound="back" onClick={actions.mainMenu}>
        Main Menu
      </Button>
    </div>
  );
}

function Victory({ result, state, actions }: { result: VigilResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const online = useOnlineSession();
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
          <Mvp state={state} teamKills={totals.kills} />
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
        {online ? <OnlineButtons /> : <LocalButtons actions={actions} changeHero />}
      </div>
    </div>
  );
}

function Defeat({ result, state, actions }: { result: VigilResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const snap = useGameSnapshot();
  const online = useOnlineSession();
  const totals = runTotals(state, false);
  const seat = snap.controlledSeats[0];
  const coop = state.players.filter((p) => p.kind === 'human').length > 1;
  const canRetry = result.outcome === 'defeat' && seat !== undefined && retryOpen(state).ok;
  const retry = canRetry && seat !== undefined ? <RetryButton state={state} seat={seat} coop={coop} /> : null;
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
        {online ? (
          <OnlineButtons extra={retry} />
        ) : (
          <div className="ww-finale__buttons">
            {retry}
            <Button variant={canRetry ? 'secondary' : 'primary'} onClick={actions.sameSeed}>
              Same Seed
            </Button>
            <Button variant="ghost" icon="door" sound="back" onClick={actions.mainMenu}>
              Main Menu
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Retry this Night from the defeat screen: at once solo, a unanimous vote in co-op (§13.1.7). */
function RetryButton({ state, seat, coop }: { state: GameState; seat: number; coop: boolean }): ReactElement {
  const controller = useController();
  const votes = voteStatus(state, 'retry');
  const voted = votes.votes.includes(seat);
  const label = !coop ? 'Retry this Night' : voted ? `Waiting for the others (${votes.votes.length}/${votes.needed.length})` : votes.votes.length > 0 ? `Agree to retry (${votes.votes.length}/${votes.needed.length})` : 'Vote to retry this Night';
  return (
    <Button variant="primary" seal="reset" drips disabled={voted} onClick={() => controller.dispatch({ type: 'retry_night', seat })} data-testid="retry-night">
      {label}
    </Button>
  );
}

/** "+3", "−2" (a true minus sign) or an em dash for nothing. */
export function signedGlory(n: number): string {
  if (n === 0) return '—';
  return n > 0 ? `+${n}` : `−${-n}`;
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
        {!standing.alive && <span className="ww-podium__out">{standing.eliminationBand !== null ? `Out · ${ordinal(standing.eliminationBand)} to fall` : 'Out of the Trial'}</span>}
      </div>
    </li>
  );
}

function Podium({ result, state, actions }: { result: LastFlameResult; state: GameState; actions: FinaleActions }): ReactElement {
  const presentation = usePresentation();
  const online = useOnlineSession();
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
                    {signedGlory(st.breakdown[reason] ?? 0)}
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
        {online ? <OnlineButtons /> : <LocalButtons actions={actions} changeHero />}
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
