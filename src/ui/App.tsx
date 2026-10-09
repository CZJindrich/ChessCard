/**
 * The app shell: services in context, the screen router, global overlays (settings modal,
 * toasts), presentation settings on <html>, the audio unlock on first interaction, menu
 * music, and Esc as "Back" on menu screens.
 *
 * The heavy screens are code-split (app/lazyScreens.ts): a themed veil shows while one loads,
 * and a screen that fails to load offers Reload or the Main Menu instead of a blank page.
 */
import { Suspense, useEffect, useState, type ReactElement } from 'react';
import { createAppServices, ServicesContext, usePresentation, useServices, type AppServices } from './app/services';
import { currentRoute, isMenuScreen, type Route } from './app/navigation';
import {
  CodexScreenChunk,
  GameScreenChunk,
  HowToPlayScreenChunk,
  LobbyScreenChunk,
  preloadNextScreens,
  schedulePreload,
  SetupScreenChunk,
} from './app/lazyScreens';
import { applyPresentation, uiScaleCap } from './app/presentationEffects';
import { useStore } from './app/store';
import { LoadingVeil } from './components/LoadingVeil';
import { Modal } from './components/Modal';
import { ScreenBoundary } from './components/ScreenBoundary';
import { ToastViewport } from './components/ToastViewport';
import { HeroPickerScreen } from './screens/HeroPickerScreen';
import { SettingsPanel } from './screens/settings/SettingsPanel';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';

const { Screen: GameScreen } = GameScreenChunk;
const { Screen: SetupScreen } = SetupScreenChunk;
const { Screen: LobbyScreen } = LobbyScreenChunk;
const { Screen: HowToPlayScreen } = HowToPlayScreenChunk;
const { Screen: CodexScreen } = CodexScreenChunk;

function ScreenRouter({ route }: { route: Route }): ReactElement {
  switch (route.screen) {
    case 'title':
      return <TitleScreen />;
    case 'hero_pick':
      return <HeroPickerScreen mode={route.mode} />;
    case 'setup':
      return <SetupScreen initial={route.selection} />;
    case 'how_to_play':
      return <HowToPlayScreen />;
    case 'codex':
      return <CodexScreen initialTab={route.tab} />;
    case 'settings':
      return <SettingsScreen />;
    case 'lobby':
      return <LobbyScreen route={route} />;
    case 'game':
      return <GameScreen route={route} />;
  }
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Unlock audio on the first pointer or key press (browsers block sound until then). */
function useAudioUnlock(services: AppServices): void {
  useEffect(() => {
    const unlock = (): void => {
      services.audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [services]);
}

function AppShell(): ReactElement {
  const services = useServices();
  const nav = useStore(services.nav);
  const overlays = useStore(services.overlays);
  const presentation = usePresentation();
  const scaleCap = useStore(uiScaleCap);
  const route = currentRoute(nav);
  const depth = nav.stack.length;

  useAudioUnlock(services);

  useEffect(() => schedulePreload(), []);

  useEffect(() => {
    preloadNextScreens(route.screen);
  }, [route.screen]);

  useEffect(() => {
    applyPresentation(document.documentElement, presentation, scaleCap);
  }, [presentation, scaleCap]);

  useEffect(() => {
    if (isMenuScreen(route.screen)) services.audio.setMusic('menu');
  }, [route.screen, services]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTextField(event.target)) return;
      const screen = services.nav.current().screen;
      if (screen === 'title' || screen === 'game' || services.overlays.get().settingsOpen) return;
      services.audio.play('uiBack');
      services.nav.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [services]);

  const closeSettings = (): void => services.overlays.update((o) => ({ ...o, settingsOpen: false }));

  return (
    <div className="ww-app">
      <ScreenBoundary key={`${depth}:${route.screen}`} onMainMenu={() => services.nav.reset()}>
        <Suspense fallback={<LoadingVeil />}>
          <ScreenRouter route={route} />
        </Suspense>
      </ScreenBoundary>
      <Modal open={overlays.settingsOpen} title="Settings" onClose={closeSettings} size="lg">
        <SettingsPanel showPreview={false} />
      </Modal>
      <ToastViewport />
    </div>
  );
}

export function App({ services }: { services?: AppServices }): ReactElement {
  const [value] = useState(() => services ?? createAppServices());
  return (
    <ServicesContext.Provider value={value}>
      <AppShell />
    </ServicesContext.Provider>
  );
}
