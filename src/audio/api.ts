/** The singleton `audio` facade (kept separate from index.ts to avoid import cycles). */
import { AudioEngine } from './engine';
import { getSettings, setSettings, subscribe } from './settings';
import type { AudioApi } from './types';

const engine = new AudioEngine();

export const audio: AudioApi = {
  unlock: () => engine.unlock(),
  play: (name, opts) => engine.play(name, opts),
  setMusic: (mood) => engine.setMusic(mood),
  getSettings,
  setSettings: (patch) => {
    try {
      setSettings(patch);
    } catch {
      /* never throw */
    }
  },
  subscribe,
  getMusic: () => engine.getMusic(),
};
