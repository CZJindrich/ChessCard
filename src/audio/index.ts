/**
 * Procedural audio for ChessCard: every sound and all music is synthesised
 * at runtime with WebAudio (no sample files).
 *
 *   import { audio } from './audio';
 *   button.onclick = () => { audio.unlock(); audio.play('uiClick'); };
 *   audio.setMusic('battle');
 */
export type { AudioApi, AudioSettings, MusicMood, PlayOptions, SfxName } from './types';
export { audio } from './api';
export { useAudioSettings } from './useAudioSettings';
export { sfxCatalog, SFX_NAMES, type SfxDef, type SfxRecipe, type SfxRecipeOptions } from './sfxCatalog';
export { DEFAULT_SETTINGS, STORAGE_KEY } from './settings';
