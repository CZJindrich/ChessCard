/**
 * The app shell: services in context, the screen router, global overlays (settings modal,
 * toasts), presentation settings on <html>, the audio unlock on first interaction, menu
 * music, and Esc as "Back" on menu screens.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { createAppServices, ServicesContext, usePresentation, useServices, type AppServices } from './app/services';
import { currentRoute, isMenuScreen, type Route } from './app/navigation';
import { applyPresentation } from './app/presentationEffects';
import { useStore } from './app/store';
import { Modal } from './components/Modal';
import { ToastViewport } from './components/ToastViewport';
import { GameScreenPlaceholder } from './game/GameScreenPlaceholder';
import { CodexScreen } from './screens/codex/CodexScreen';
import { HeroPickerScreen } from './screens/HeroPickerScreen';
import { HowToPlayScreen } from './screens/howto/HowToPlayScreen';
import { LobbyScreen } from './screens/lobby/LobbyScreen';
import { SettingsPanel } from './screens/settings/SettingsPanel';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { SetupScreen } from './screens/setup/SetupScreen';
import { TitleScreen } from './screens/TitleScreen';

/** The game route's screen. The game-screen engineer swaps the placeholder for the real one here. */
const GameRouteScreen = GameScreenPlaceholder;

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
      return <GameRouteScreen route={route} />;
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
  const route = currentRoute(nav);
  const depth = nav.stack.length;

  useAudioUnlock(services);

  useEffect(() => {
    applyPresentation(document.documentElement, presentation);
  }, [presentation]);

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
      <ScreenRouter key={`${depth}:${route.screen}`} route={route} />
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
