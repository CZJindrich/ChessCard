/**
 * The code-split screens and when to fetch them. The Title, the hero picker and Settings ship in
 * the entry chunk (the first click must be instant); the game screen (with the controller, the
 * board, FX and the bot worker), Setup, the lobby, How to Play and the Codex are separate chunks.
 *
 * - As soon as a screen shows, the screens it leads to are fetched (`preloadNextScreens`).
 * - Once the browser is idle after start-up, every chunk is fetched, the game first
 *   (`schedulePreload`), unless the browser asks to save data.
 */
import { lazyScreen, type Preloadable } from './lazyScreen';
import type { ScreenId } from './navigation';

export const GameScreenChunk = lazyScreen('GameScreen', () => import('../game/GameScreen').then((m) => m.GameScreen));
export const SetupScreenChunk = lazyScreen('SetupScreen', () => import('../screens/setup/SetupScreen').then((m) => m.SetupScreen));
export const LobbyScreenChunk = lazyScreen('LobbyScreen', () => import('../screens/lobby/LobbyScreen').then((m) => m.LobbyScreen));
export const HowToPlayScreenChunk = lazyScreen('HowToPlayScreen', () => import('../screens/howto/HowToPlayScreen').then((m) => m.HowToPlayScreen));
export const CodexScreenChunk = lazyScreen('CodexScreen', () => import('../screens/codex/CodexScreen').then((m) => m.CodexScreen));

/** In fetch order: the game first, since Quick Play is one click from the Title. */
const ALL_CHUNKS: readonly Preloadable[] = [GameScreenChunk, SetupScreenChunk, HowToPlayScreenChunk, CodexScreenChunk, LobbyScreenChunk];

/** The screens each screen leads to. */
const NEXT_CHUNKS: Partial<Record<ScreenId, readonly Preloadable[]>> = {
  hero_pick: [GameScreenChunk],
  setup: [GameScreenChunk, LobbyScreenChunk],
  lobby: [GameScreenChunk],
  how_to_play: [GameScreenChunk],
  game: [SetupScreenChunk],
};

/** A background fetch that fails is retried when the screen is opened; nothing to report here. */
function quietly(chunk: Preloadable): Promise<void> {
  return chunk.preload().catch(() => undefined);
}

/** Fetch the chunks of the screens `screen` leads to. */
export function preloadNextScreens(screen: ScreenId): void {
  for (const chunk of NEXT_CHUNKS[screen] ?? []) void quietly(chunk);
}

/** Fetch every screen chunk, one after the other. Rejects if any chunk fails to load. */
export async function preloadAllScreens(): Promise<void> {
  for (const chunk of ALL_CHUNKS) await chunk.preload();
}

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  navigator?: Navigator;
}

/** Data Saver / "Lite mode" (the Network Information API, where the browser has it). */
function savesData(nav: Navigator | undefined): boolean {
  const connection: unknown = nav && 'connection' in nav ? nav.connection : undefined;
  return typeof connection === 'object' && connection !== null && 'saveData' in connection && connection.saveData === true;
}

/** How long start-up may keep the browser busy before the idle preload runs anyway. */
const IDLE_TIMEOUT_MS = 4000;
/** Without requestIdleCallback (Safari), wait this long after start-up. */
const FALLBACK_DELAY_MS = 1500;

/**
 * Fetch every screen chunk once the browser is idle after start-up. Returns a cancel function.
 * Skipped when the browser asks to save data.
 */
export function schedulePreload(win: IdleWindow = window): () => void {
  if (savesData(win.navigator)) return () => undefined;
  const run = (): void => {
    void (async () => {
      for (const chunk of ALL_CHUNKS) await quietly(chunk);
    })();
  };
  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const cancel = win.cancelIdleCallback;
    const handle = win.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => cancel(handle);
  }
  const timer = setTimeout(run, FALLBACK_DELAY_MS);
  return () => clearTimeout(timer);
}
