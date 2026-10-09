/**
 * The game screen (GDD §15.4): a top bar, the player plaques on the left, the board in the
 * centre, the intent queue and log on the right and the hand at the bottom, plus the phase
 * overlays (deploy, Toll, carry-over, Chandlery, game over). One `GameController` per game
 * route drives everything; this component owns its lifecycle.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { CardMini, SkyBackdrop } from '../../art';
import { createGame } from '../../engine';
import type { GameState } from '../../engine/types';
import { GameController, LocalTransport, type ControllerSettings } from '../../game';
import type { GameRoute } from '../app/navigation';
import { usePresentation, useServices, type AppServices } from '../app/services';
import { FxBus, FxBusContext, ScreenFx, type CardFlightSpec } from '../fx';
import { cardArtData } from '../model/describe';
import { Board } from './Board';
import { BoardLocatorContext, useBoardLocatorRef } from './boardLocator';
import { Banners } from './Banners';
import { CardPrompt } from './CardPrompt';
import { CarryOverPanel } from './CarryOverPanel';
import { ClaimPrompt } from './ClaimPrompt';
import { ChandleryPanel } from './ChandleryPanel';
import { GameControllerContext, useGameSnapshot, useRegistry } from './context';
import { EndTurnConfirm } from './EndTurnConfirm';
import { GameOverOverlay } from './GameOverOverlay';
import { HandBar } from './HandBar';
import { IntentRail } from './IntentRail';
import { NoticeLine } from './NoticeLine';
import { PlayerRail } from './PlayerRail';
import { TollModal } from './TollModal';
import { TopBar } from './TopBar';
import { createGameUi, GameUiContext, type GameUi } from './uiStore';
import { useFxDirector } from './useFxDirector';
import { useGameKeys } from './useGameKeys';
import { useRecordResult } from './useRecordResult';
import './game.css';

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
  transport: LocalTransport;
  bus: FxBus;
  ui: GameUi;
}

function createSession(route: GameRoute, services: AppServices): Session {
  const transport = new LocalTransport(createGame(route.config));
  return {
    transport,
    controller: new GameController({ transport, audio: services.audio, settings: controllerSettings(services) }),
    bus: new FxBus(),
    ui: createGameUi(),
  };
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
  const [{ controller, transport, bus, ui }] = useState(() => createSession(route, services));

  // start/stop (not dispose): StrictMode mounts, unmounts and mounts again in development.
  useEffect(() => {
    controller.start();
    window.__ww = { controller, load: (state) => transport.load(state) };
    return () => {
      controller.stop();
      if (window.__ww?.controller === controller) delete window.__ww;
    };
  }, [controller, transport]);

  useEffect(() => () => ui.dispose(), [ui]);

  return (
    <GameControllerContext.Provider value={controller}>
      <FxBusContext.Provider value={bus}>
        <GameUiContext.Provider value={ui}>
          <GameLayout route={route} bus={bus} />
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

function GameLayout({ route, bus }: { route: GameRoute; bus: FxBus }): ReactElement {
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const locator = useBoardLocatorRef();
  const renderCard = useFlightCard();
  useGameKeys(rootRef);
  useRecordResult(route, snap.latest);
  useFxDirector(bus, locator);
  const s = snap.state;
  // The sky only follows Dread in coarse steps, so it is not redrawn for every event.
  const dread = s.vigil ? Math.round((s.vigil.dread / Math.max(1, s.vigil.dreadMax)) * 20) / 20 : 0;
  const sky = useMemo(() => <SkyBackdrop dread={dread} reducedMotion={presentation.reduced_motion} className="ww-game__sky" />, [dread, presentation.reduced_motion]);
  const className = ['ww-game', s.config.mode === 'last_flame' && 'ww-game--last-flame', snap.selection.card && 'ww-game--targeting', snap.animating && 'ww-game--animating']
    .filter(Boolean)
    .join(' ');
  return (
    <BoardLocatorContext.Provider value={locator}>
      <div ref={rootRef} className={className} data-testid="game-screen" data-phase={snap.latest.phase} tabIndex={-1}>
        {sky}
        <div className="ww-game__veil" aria-hidden="true" />
        <TopBar />
        <PlayerRail />
        <main className="ww-game__centre">
          <Board />
          <CardPrompt />
          <ClaimPrompt />
          <Banners />
          <NoticeLine />
        </main>
        <IntentRail />
        <HandBar />
        <TollModal />
        <CarryOverPanel />
        <ChandleryPanel />
        <EndTurnConfirm />
        <GameOverOverlay route={route} />
        <ScreenFx bus={bus} reducedMotion={presentation.reduced_motion} renderCard={renderCard} />
      </div>
    </BoardLocatorContext.Provider>
  );
}
