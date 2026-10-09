/** Every one-shot sound effect the game can trigger. */
export type SfxName =
  | 'uiClick' | 'uiHover' | 'uiConfirm' | 'uiBack' | 'uiError'
  | 'cardDraw' | 'cardHover' | 'cardPlay' | 'cardShuffle' | 'cardDiscard'
  | 'pieceSelect' | 'pieceMove' | 'pieceLeap' | 'pieceSlide'
  | 'attackMelee' | 'attackRanged' | 'attackMagic' | 'hit' | 'crit' | 'block' | 'death'
  | 'spellFire' | 'spellFrost' | 'spellHoly' | 'spellShadow' | 'spellNature' | 'heal' | 'shield' | 'buff' | 'debuff' | 'summon' | 'teleport'
  | 'diceRoll' | 'diceLand' | 'eventReveal' | 'doomTick' | 'doomSurge' | 'coin' | 'reward'
  | 'turnStart' | 'enemyTurn' | 'roundStart' | 'zoneClose' | 'portalOpen' | 'telegraph'
  | 'bossAppear' | 'bossRoar' | 'bossPhase' | 'bossSlam' | 'bossDefeated'
  | 'victory' | 'defeat' | 'playerEliminated';

/** Generative music moods. */
export type MusicMood = 'menu' | 'explore' | 'battle' | 'boss' | 'victory' | 'defeat';

/** User-facing mixer settings. Volumes are 0..1. */
export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

/** Options accepted by `audio.play`. */
export interface PlayOptions {
  /** Linear gain multiplier (default 1, clamped 0..2). */
  volume?: number;
  /** Playback-rate-like multiplier: 2 = an octave up and twice as fast (clamped 0.25..4). */
  pitch?: number;
  /** Stereo position -1 (left) .. 1 (right). */
  pan?: number;
}

/** The public audio facade. */
export interface AudioApi {
  /** Must be called from a user gesture; safe to call many times. Resumes a suspended context. */
  unlock(): void;
  play(name: SfxName, opts?: PlayOptions): void;
  /** Crossfades (~1.5 s) to a new mood; `null` fades the music out. */
  setMusic(mood: MusicMood | null): void;
  getSettings(): AudioSettings;
  /** Merges, clamps, persists (localStorage `chesscard.audio`) and applies settings. */
  setSettings(patch: Partial<AudioSettings>): void;
  /** Listen for settings changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The mood most recently requested via `setMusic`. */
  getMusic(): MusicMood | null;
}
