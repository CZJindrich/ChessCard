/**
 * The game screen (GDD §15.4): a top bar, the player plaques on the left, the board in the
 * centre, the intent queue and log on the right and the hand at the bottom, plus the phase
 * overlays (deploy, Toll, carry-over, Chandlery, game over). One `GameController` per game
 * route drives everything; this component owns its lifecycle.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { CardMini } from '../../art';
import { HOST_OPTION_DEFAULTS } from '../../config';
import { createGame, tutorialTurnActive } from '../../engine';
import type { GameState } from '../../engine/types';
import { GameController, LocalTransport, type ControllerSettings, type GameTransport } from '../../game';
import { createNetTransport } from '../../net';
import type { GameRoute } from '../app/navigation';
import { usePresentation, useServices, type AppServices } from '../app/services';
import { FxBus, FxBusContext, ScreenFx, type CardFlightSpec } from '../fx';
import { cardArtData } from '../model/describe';
import { Board } from './Board';
import { BoardLocatorContext, useBoardLocatorRef } from './boardLocator';
import { Banners } from './Banners';
import { BossIntro } from './BossIntro';
import { CoachMarks, useTutorialReady } from './CoachMarks';
import { DeckViewer } from './DeckViewer';
import { NightTitleCard } from './NightTitleCard';
import { PassScreen } from './PassScreen';
import { PauseMenu } from './PauseMenu';
import { RulesOverlay } from './RulesOverlay';
import { TipsLayer } from './TipsLayer';
import { CardPrompt } from './CardPrompt';
import { HauntPrompt } from './HauntPrompt';
import { CarryOverPanel } from './CarryOverPanel';
import { ClaimPrompt } from './ClaimPrompt';
import { ChandleryPanel } from './ChandleryPanel';
import { GameControllerContext, useGameSelector, useRegistry } from './context';
import { GameSky } from './GameSky';
import { EndTurnConfirm } from './EndTurnConfirm';
import { GameOverOverlay } from './GameOverOverlay';
import { HandBar } from './HandBar';
import { IntentRail } from './IntentRail';
import { NoticeLine } from './NoticeLine';
import { PlayerRail } from './PlayerRail';
import { TollModal } from './TollModal';
import { TopBar } from './TopBar';
import { VoteBar } from './VoteBar';
import { createGameUi, GameUiContext, useGameUi, useGameUiState, type GameUi } from './uiStore';
import { useFxDirector } from './useFxDirector';
import { useGameKeys } from './useGameKeys';
import { OnlineGameContext } from './onlineContext';
import { useRecordResult } from './useRecordResult';
import './game.css';
import './overlays.css';
import './lastflame.css';
import './online.css';

declare global {
  interface Window {
    /** Debug / e2e handle on the running game (ARCHITECTURE §6); `load` swaps in a crafted state. */
    __ww?: { controller: GameController; load: (state: GameState) => void };
  }
}

function controllerSettings(services: AppServices): () => ControllerSettings {
  return () => {
    const p = services.presentation.get();
    return { animation_speed: p.animation_speed, enemy_turn_speed: p.enemy_turn_speed, reduced_motion: p.reduced_motion, confirm_end_turn: p.confirm_end_turn };
  };
}

interface Session {
  controller: GameController;
  transport: GameTransport;
  bus: FxBus;
  ui: GameUi;
  /** Mounted copies of the session's screen (React StrictMode mounts twice in development). */
  mounts: number;
  route: GameRoute;
}

/** Online games play through the server (`route.online`); local ones run the engine here. */
function createTransport(route: GameRoute): GameTransport {
  return route.online ? createNetTransport(route.online) : new LocalTransport(createGame(route.config));
}

/**
 * One session per route object. StrictMode calls state initialisers twice; caching by route
 * keeps that from building (and leaking) a second transport and controller.
 */
const sessions = new WeakMap<GameRoute, Session>();

function sessionFor(route: GameRoute, services: AppServices): Session {
  const cached = sessions.get(route);
  if (cached) return cached;
  const transport = createTransport(route);
  const session: Session = {
    transport,
    controller: new GameController({ transport, audio: services.audio, settings: controllerSettings(services) }),
    bus: new FxBus(),
    ui: createGameUi(),
    mounts: 0,
    route,
  };
  sessions.set(route, session);
  return session;
}

/**
 * Start the session while its screen is mounted and dispose it (controller, transport, timers)
 * once it is gone for good. Disposal waits a tick, because StrictMode's mount → unmount → mount
 * reuses the same session.
 */
function useSessionLifecycle(session: Session): void {
  useEffect(() => {
    const { controller, transport, ui } = session;
    session.mounts += 1;
    controller.start();
    window.__ww = {
      controller,
      load: (state) => {
        if (transport instanceof LocalTransport) transport.load(state);
      },
    };
    return () => {
      session.mounts -= 1;
      controller.stop();
      if (window.__ww?.controller === controller) delete window.__ww;
      window.setTimeout(() => {
        if (session.mounts > 0) return;
        sessions.delete(session.route);
        controller.dispose();
        ui.dispose();
      }, 0);
    };
  }, [session]);
}

/** A fresh key per route object, so Play Again (same screen, new route) remounts the game. */
const routeKeys = new WeakMap<GameRoute, number>();
let nextRouteKey = 1;
function routeKey(route: GameRoute): number {
  let key = routeKeys.get(route);
  if (key === undefined) {
    key = nextRouteKey++;
    routeKeys.set(route, key);
  }
  return key;
}

export function GameScreen({ route }: { route: GameRoute }): ReactElement {
  return <GameSession key={routeKey(route)} route={route} />;
}

function GameSession({ route }: { route: GameRoute }): ReactElement {
  const services = useServices();
  const [session] = useState(() => sessionFor(route, services));
  useSessionLifecycle(session);
  const { controller, bus, ui } = session;
  return (
    <GameControllerContext.Provider value={controller}>
      <FxBusContext.Provider value={bus}>
        <GameUiContext.Provider value={ui}>
          <OnlineGameContext.Provider value={route.online ?? null}>
            <GameLayout route={route} bus={bus} />
          </OnlineGameContext.Provider>
        </GameUiContext.Provider>
      </FxBusContext.Provider>
    </GameControllerContext.Provider>
  );
}

/** The card drawn while a played card flies to its target. */
function useFlightCard(): (flight: CardFlightSpec) => ReactNode {
  const registry = useRegistry();
  return useCallback(
    (flight: CardFlightSpec) => {
      const def = registry.cards.byId[flight.cardId];
      return def ? <CardMini card={{ ...cardArtData(def), tempered: flight.tempered }} width={84} animated={false} /> : null;
    },
    [registry],
  );
}

/** The overlay the player opened (pause menu, deck viewer, rules), at most one at a time. */
function OpenOverlay(): ReactElement | null {
  const { overlay } = useGameUiState();
  const ui = useGameUi();
  switch (overlay) {
    case 'pause':
      return <PauseMenu />;
    case 'deck':
      return <DeckViewer onClose={() => ui.close()} />;
    case 'rules':
      return <RulesOverlay onClose={() => ui.close()} />;
    case null:
      return null;
  }
}

interface LayersProps {
  route: GameRoute;
  bus: FxBus;
  coaching: boolean;
  reducedMotion: boolean;
}

/**
 * Everything on the game screen except its root: each part subscribes to the slice of the
 * controller it needs, so this memoised block does not re-render with the root.
 */
const Layers = memo(function Layers({ route, bus, coaching, reducedMotion }: LayersProps): ReactElement {
  const renderCard = useFlightCard();
  return (
    <>
      <div className="ww-game__veil" aria-hidden="true" />
      <TopBar />
      <PlayerRail />
      <main className="ww-game__centre">
        <Board />
        <CardPrompt />
        <HauntPrompt />
        <ClaimPrompt />
        <VoteBar />
        <Banners />
        <NoticeLine />
      </main>
      <IntentRail />
      <HandBar />
      <TollModal />
      <CarryOverPanel />
      <ChandleryPanel />
      <EndTurnConfirm />
      <TipsLayer disabled={route.demo === true || coaching} />
      <CoachMarks />
      <BossIntro />
      <NightTitleCard />
      <GameOverOverlay route={route} />
      <PassScreen privacy={route.hostOptions?.hot_seat_privacy ?? HOST_OPTION_DEFAULTS.hot_seat_privacy} />
      <OpenOverlay />
      <ScreenFx bus={bus} reducedMotion={reducedMotion} renderCard={renderCard} />
    </>
  );
});

/** What the screen's root needs from the controller (not the hover: that re-renders only the board). */
function useLayoutView(): { latest: GameState; mode: string; targeting: boolean; animating: boolean; dread: number; coaching: boolean } {
  return useGameSelector((snap) => {
    const vigil = snap.state.vigil;
    return {
      latest: snap.latest,
      mode: snap.state.config.mode,
      targeting: snap.selection.card !== null,
      animating: snap.animating,
      // The sky only follows Dread in coarse steps, so it is not redrawn for every event.
      dread: vigil ? Math.round((vigil.dread / Math.max(1, vigil.dreadMax)) * 20) / 20 : 0,
      coaching: snap.latest.tutorial !== null && tutorialTurnActive(snap.latest),
    };
  });
}

function GameLayout({ route, bus }: { route: GameRoute; bus: FxBus }): ReactElement {
  const view = useLayoutView();
  const presentation = usePresentation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const locator = useBoardLocatorRef();
  useGameKeys(rootRef);
  useRecordResult(route, view.latest);
  useFxDirector(bus, locator);
  useTutorialReady();
  const className = ['ww-game', view.mode === 'last_flame' && 'ww-game--last-flame', view.targeting && 'ww-game--targeting', view.animating && 'ww-game--animating'].filter(Boolean).join(' ');
  return (
    <BoardLocatorContext.Provider value={locator}>
      <div ref={rootRef} className={className} data-testid="game-screen" data-phase={view.latest.phase} tabIndex={-1}>
        <GameSky dread={view.dread} reducedMotion={presentation.reduced_motion} />
        <Layers route={route} bus={bus} coaching={view.coaching} reducedMotion={presentation.reduced_motion} />
      </div>
    </BoardLocatorContext.Provider>
  );
}
