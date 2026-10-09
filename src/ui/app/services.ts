/**
 * App-wide services shared through React context: navigation, toasts, presentation settings,
 * the local profile, the active content, global overlays, audio and the environment
 * (clock, random seeds, clipboard). Tests build their own with in-memory storage.
 */
import { createContext, useContext } from 'react';
import { audio as defaultAudio } from '../../audio';
import type { AudioApi, SfxName } from '../../audio';
import { browserStorage, createPresentationStore, randomSeedText } from '../../config';
import type { AudioBridge, KeyValueStorage, LocalProfile, PresentationSettings, PresentationStore } from '../../config';
import { createContentStore, type ContentState, type ContentStore } from './contentStore';
import { createNavigator, type Navigator, type Route } from './navigation';
import { createOnlineService, type LobbyActions } from './online';
import { createProfileStore, type ProfileStore } from './profileStore';
import { createStore, useStore, type WritableStore } from './store';
import { createToastStore, type ToastStore } from './toasts';

/** The audio calls the UI makes. The `audio` singleton from src/audio satisfies it. */
export type UiAudio = Pick<AudioApi, 'unlock' | 'play' | 'setMusic'>;

/**
 * Sounds are dropped until the first user gesture has unlocked audio: browsers refuse to
 * start an AudioContext earlier, and a hover before any click would only produce warnings.
 */
export function gatedAudio(audio: UiAudio): UiAudio {
  let unlocked = false;
  return {
    unlock() {
      unlocked = true;
      audio.unlock();
    },
    play(name, opts) {
      if (unlocked) audio.play(name, opts);
    },
    setMusic: (mood) => audio.setMusic(mood),
  };
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface AppEnv {
  now(): Date;
  /** A fresh seed text for 'random' seeds (UI only; the engine never calls this). */
  randomSeed(): string;
  clipboard: ClipboardLike | null;
}

export interface OverlayState {
  settingsOpen: boolean;
}

export interface AppServices {
  nav: Navigator;
  toasts: ToastStore;
  presentation: PresentationStore;
  profile: ProfileStore;
  content: ContentStore;
  overlays: WritableStore<OverlayState>;
  audio: UiAudio;
  env: AppEnv;
  /** The online client (src/net); tests may pass a stub or null. */
  online: LobbyActions | null;
}

export interface AppServicesOptions {
  storage?: KeyValueStorage | null;
  /** Mixer bridge for the presentation store's audio keys (null: in-memory only). */
  audioBridge?: AudioBridge | null;
  audio?: UiAudio;
  initialRoute?: Route;
  env?: Partial<AppEnv>;
  online?: LobbyActions | null;
}

function browserClipboard(): ClipboardLike | null {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  return clipboard && typeof clipboard.writeText === 'function' ? clipboard : null;
}

export function createAppServices(opts: AppServicesOptions = {}): AppServices {
  const storage = opts.storage === undefined ? browserStorage() : opts.storage;
  const audioBridge = opts.audioBridge === undefined ? defaultAudio : opts.audioBridge;
  const nav = createNavigator(opts.initialRoute);
  const toasts = createToastStore();
  return {
    nav,
    toasts,
    presentation: createPresentationStore({ storage, audio: audioBridge }),
    profile: createProfileStore(storage),
    content: createContentStore(),
    overlays: createStore<OverlayState>({ settingsOpen: false }),
    audio: gatedAudio(opts.audio ?? defaultAudio),
    env: {
      now: opts.env?.now ?? (() => new Date()),
      randomSeed: opts.env?.randomSeed ?? randomSeedText,
      clipboard: opts.env?.clipboard === undefined ? browserClipboard() : opts.env.clipboard,
    },
    // Passing `online` (even undefined) selects exactly that; without the key the app gets the
    // real online client, which stays idle until the lobby uses it.
    online: 'online' in opts ? (opts.online ?? null) : createOnlineService({ nav, toasts, storage }),
  };
}

export const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesContext.Provider>');
  return services;
}

export function usePresentation(): PresentationSettings {
  return useStore(useServices().presentation);
}

export function useProfile(): LocalProfile {
  return useStore(useServices().profile);
}

export function useContentState(): ContentState {
  return useStore(useServices().content);
}

/** UI sound cues (GDD §16.11). */
export type UiSound = 'hover' | 'click' | 'confirm' | 'back' | 'error';

const UI_SFX: Readonly<Record<UiSound, SfxName>> = {
  hover: 'uiHover',
  click: 'uiClick',
  confirm: 'uiConfirm',
  back: 'uiBack',
  error: 'uiError',
};

export function useUiSound(): (sound: UiSound) => void {
  const { audio } = useServices();
  return (sound) => audio.play(UI_SFX[sound]);
}
