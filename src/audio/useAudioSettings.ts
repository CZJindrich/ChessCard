import { useSyncExternalStore } from 'react';
import { audio } from './api';
import type { AudioSettings } from './types';

const getSnapshot = (): AudioSettings => audio.getSettings();

/**
 * React binding for the audio mixer settings. Re-renders whenever settings
 * change (from any component or from `audio.setSettings`).
 *
 *   const [settings, setSettings] = useAudioSettings();
 *   setSettings({ music: 0.4 });
 */
export function useAudioSettings(): [AudioSettings, (patch: Partial<AudioSettings>) => void] {
  const settings = useSyncExternalStore(audio.subscribe, getSnapshot, getSnapshot);
  return [settings, audio.setSettings];
}
