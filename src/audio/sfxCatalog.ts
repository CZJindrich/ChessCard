/**
 * SFX catalog: one small, tweakable recipe per sound.
 *
 * Each entry's `recipe` has the shape `(ctx, dest, t, opts) => void` and only
 * schedules nodes into `dest` starting at time `t`, so it renders identically
 * in a realtime AudioContext and an OfflineAudioContext.
 *
 * Recipes are written with the `Synth` toolkit (see synth.ts) in natural
 * units: times in seconds relative to the start, frequencies in Hz, gains
 * linear (aim for peaks of ~0.1 for UI, ~0.3-0.5 for combat, <=0.6 for boss).
 * `opts.pitch` is applied automatically (frequencies x pitch, times / pitch).
 *
 * Metadata per sound:
 *   duration     - nominal length (s) before the reverb tail (the exact end is
 *                  returned by the recipe and used for voice tracking)
 *   reverb       - send level into the shared stone-hall reverb (0..1)
 *   gain         - trim applied to the whole voice
 *   minIntervalMs- identical triggers closer than this are dropped
 *   maxVoices    - overlapping voices of this sound (oldest is faded out)
 */
import { midiToFreq as m } from './dsp';
import { Synth } from './synth';
import type { SfxName } from './types';

export interface SfxRecipeOptions {
  /** Playback-rate-like multiplier (already clamped). */
  pitch: number;
  /** Random source; seeded in tests, Math.random in the game. */
  rng: () => number;
}

/**
 * Schedules a sound into `dest` starting at `t`. May return the absolute time
 * at which everything it scheduled has stopped (Synth-based recipes do); if it
 * returns nothing, `t + duration / pitch` is assumed.
 */
export type SfxRecipe = (ctx: BaseAudioContext, dest: AudioNode, t: number, opts: SfxRecipeOptions) => number | void;

export interface SfxDef {
  recipe: SfxRecipe;
  duration: number;
  reverb: number;
  gain: number;
  minIntervalMs: number;
  maxVoices: number;
}

type Meta = Partial<Pick<SfxDef, 'reverb' | 'gain' | 'minIntervalMs' | 'maxVoices'>>;

/** Wraps a Synth-based builder into a plain `(ctx, dest, t, opts)` recipe. */
function sfx(duration: number, build: (s: Synth) => void, meta: Meta = {}): SfxDef {
  return {
    duration,
    reverb: meta.reverb ?? 0.15,
    gain: meta.gain ?? 1,
    minIntervalMs: meta.minIntervalMs ?? 30,
    maxVoices: meta.maxVoices ?? 4,
    recipe: (ctx, dest, t, opts) => {
      const s = new Synth(ctx, dest, t, opts.pitch, opts.rng);
      build(s);
      return s.tracker.end;
    },
  };
}

// ------------------------------------------------------------ shared layers

/** Small stone-on-stone contact. */
function stoneClack(s: Synth, at: number, gain: number): void {
  s.noise({ at, decay: 0.035, gain: gain * 0.85, filter: { type: 'bandpass', freq: 1300, q: 3 } });
  s.tone({ at, freq: 190, to: 118, decay: 0.09, gain });
  s.tone({ at, type: 'triangle', freq: 1150, decay: 0.03, gain: gain * 0.22 });
}

/** Ringing steel: FM clang plus a few inharmonic partials. */
function steelRing(s: Synth, at: number, freq: number, gain: number, decay = 0.45): void {
  s.fm({ at, freq, ratio: 1.414, index: 3, indexEnd: 0.2, indexDecay: 0.15, attack: 0.001, decay, gain });
  s.tone({ at, freq: freq * 1.9, decay: decay * 0.65, gain: gain * 0.38 });
  s.tone({ at, freq: freq * 2.56, decay: decay * 0.5, gain: gain * 0.3 });
  s.tone({ at, freq: freq * 3.56, decay: decay * 0.33, gain: gain * 0.22 });
  s.noise({ at, decay: 0.05, gain: gain * 1.6, filter: { type: 'highpass', freq: 2500 } });
}

/** Body blow: pitched thump + low noise. */
function thump(s: Synth, at: number, gain: number, freq = 150, decay = 0.18): void {
  s.tone({ at, freq, to: freq * 0.35, decay, gain, drive: 0.3 });
  s.noise({ at, decay: decay * 0.5, gain: gain * 0.55, color: 'pink', filter: { type: 'lowpass', freq: 1600, to: 500 } });
}

function sparkle(s: Synth, at: number, notes: readonly number[], step: number, gain: number, decay = 0.9): void {
  notes.forEach((n, i) =>
    s.chime(m(n), { at: at + i * step, decay, gain, ratio: 2, index: 1.1, pan: (i % 2 ? 0.25 : -0.25) }),
  );
}

// ------------------------------------------------------------------ catalog

export const sfxCatalog: Record<SfxName, SfxDef> = {
  // ---------------------------------------------------------------- UI
  uiClick: sfx(
    0.12,
    (s) => {
      s.tone({ type: 'triangle', freq: 1500, to: 950, glide: 0.03, decay: 0.05, gain: 0.12, filter: { freq: 5000 } });
      s.noise({ decay: 0.018, gain: 0.08, filter: { type: 'bandpass', freq: 2800, q: 1.4 } });
      s.tone({ freq: 240, to: 180, decay: 0.06, gain: 0.08 });
    },
    { gain: 1.22, reverb: 0.05 },
  ),
  uiHover: sfx(
    0.06,
    (s) => {
      s.tone({ freq: 2100, to: 1900, decay: 0.035, gain: 0.04 });
      s.noise({ decay: 0.02, gain: 0.025, filter: { type: 'highpass', freq: 4500 } });
    },
    { gain: 1.38, reverb: 0.05, minIntervalMs: 40, maxVoices: 3 },
  ),
  uiConfirm: sfx(
    0.9,
    (s) => {
      s.tone({ type: 'triangle', freq: m(64), decay: 0.25, gain: 0.06 });
      s.noise({ decay: 0.015, gain: 0.05, filter: { type: 'bandpass', freq: 3000 } });
      s.chime(m(76), { decay: 0.7, gain: 0.1, index: 1.2 });
      s.chime(m(83), { at: 0.075, decay: 0.8, gain: 0.1, index: 1.2 });
    },
    { gain: 0.84, reverb: 0.3 },
  ),
  uiBack: sfx(
    0.4,
    (s) => {
      s.tone({ type: 'triangle', freq: m(71), decay: 0.12, gain: 0.09, filter: { freq: 2500 } });
      s.tone({ type: 'triangle', freq: m(64), at: 0.07, decay: 0.2, gain: 0.09, filter: { freq: 2000 } });
      s.whoosh({ dur: 0.16, from: 3000, to: 900, gain: 0.04, q: 1 });
    },
    { gain: 1.36, reverb: 0.15 },
  ),
  uiError: sfx(
    0.45,
    (s) => {
      for (const at of [0, 0.13]) {
        s.tone({
          at, type: 'sawtooth', freq: 138, attack: 0.005, hold: 0.05, decay: 0.12, gain: 0.08, unison: 2, spread: 40,
          filter: { freq: 900, to: 400, q: 1 },
        });
        s.tone({ at, type: 'square', freq: 146.8, attack: 0.005, hold: 0.04, decay: 0.1, gain: 0.03, filter: { freq: 700 } });
      }
    },
    { gain: 0.74, reverb: 0.1, minIntervalMs: 80 },
  ),

  // ------------------------------------------------------------- cards
  cardDraw: sfx(
    0.3,
    (s) => {
      s.noise({ attack: 0.04, decay: 0.16, gain: 0.45, color: 'pink', filter: { type: 'bandpass', freq: 1200, to: 4200, q: 0.9 } });
      s.noise({ at: 0.13, decay: 0.03, gain: 0.1, filter: { type: 'bandpass', freq: 3500, q: 0.8 } });
      s.tone({ at: 0.13, freq: 900, to: 700, decay: 0.03, gain: 0.05 });
    },
    { gain: 1.28, reverb: 0.1 },
  ),
  cardHover: sfx(
    0.1,
    (s) => {
      s.noise({ attack: 0.01, decay: 0.05, gain: 0.05, color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 1 } });
      s.tone({ freq: 1300, to: 1450, decay: 0.04, gain: 0.02 });
    },
    { gain: 1.81, reverb: 0.05, minIntervalMs: 50, maxVoices: 3 },
  ),
  cardPlay: sfx(
    0.8,
    (s) => {
      s.whoosh({ dur: 0.12, from: 700, to: 2600, gain: 0.12, q: 1.2, peak: 0.7 });
      s.tone({ at: 0.09, freq: 170, to: 70, decay: 0.16, gain: 0.32 });
      s.noise({ at: 0.09, decay: 0.06, gain: 0.18, color: 'pink', filter: { freq: 1400 } });
      s.noise({ at: 0.09, decay: 0.02, gain: 0.08, filter: { type: 'bandpass', freq: 3200, q: 2 } });
      s.fm({ at: 0.1, freq: 1760, ratio: 1.414, index: 0.8, attack: 0.002, decay: 0.6, gain: 0.025 });
    },
    { gain: 0.88, reverb: 0.25 },
  ),
  cardShuffle: sfx(
    0.6,
    (s) => {
      s.ticks({ count: 16, span: 0.42, curve: 1.15, freq: 3200, freqVar: 0.25, q: 1.2, gain: 0.12, fade: 0.6, decay: 0.022, color: 'pink' });
      s.noise({ attack: 0.05, hold: 0.25, decay: 0.12, gain: 0.03, color: 'pink', filter: { type: 'bandpass', freq: 2500, q: 0.7 } });
      s.noise({ at: 0.47, decay: 0.04, gain: 0.08, color: 'pink', filter: { freq: 1800 } });
      s.tone({ at: 0.47, freq: 160, to: 90, decay: 0.07, gain: 0.12 });
    },
    { gain: 1.55, reverb: 0.1, maxVoices: 2, minIntervalMs: 120 },
  ),
  cardDiscard: sfx(
    0.45,
    (s) => {
      s.whoosh({ dur: 0.28, from: 3200, to: 500, gain: 0.12, q: 1.3, peak: 0.3 });
      s.tone({ at: 0.06, freq: 130, to: 55, decay: 0.25, gain: 0.15 });
      s.noise({ at: 0.05, decay: 0.3, gain: 0.04, color: 'brown', filter: { freq: 700 } });
    },
    { gain: 0.99, reverb: 0.2 },
  ),

  // ------------------------------------------------------------ pieces
  pieceSelect: sfx(
    0.35,
    (s) => {
      s.tone({ type: 'triangle', freq: 880, to: 820, decay: 0.05, gain: 0.07 });
      s.noise({ decay: 0.02, gain: 0.08, filter: { type: 'bandpass', freq: 1900, q: 2.5 } });
      s.tone({ freq: 330, decay: 0.12, gain: 0.08 });
      s.fm({ at: 0.01, freq: 880, ratio: 2, index: 0.6, attack: 0.01, decay: 0.3, gain: 0.03 });
    },
    { gain: 1.45, reverb: 0.2 },
  ),
  pieceMove: sfx(
    0.4,
    (s) => {
      s.noise({ attack: 0.03, decay: 0.12, gain: 0.05, color: 'pink', filter: { type: 'bandpass', freq: 700, to: 1100, q: 0.8 } });
      stoneClack(s, 0.12, 0.25);
    },
    { gain: 1.3, reverb: 0.15 },
  ),
  pieceLeap: sfx(
    0.65,
    (s) => {
      s.whoosh({ dur: 0.26, from: 400, to: 2400, gain: 0.1, q: 1.5, peak: 0.7 });
      s.tone({ at: 0.26, freq: 130, to: 42, decay: 0.3, gain: 0.42 });
      s.noise({ at: 0.26, decay: 0.14, gain: 0.2, color: 'pink', filter: { freq: 700 } });
      s.noise({ at: 0.26, decay: 0.03, gain: 0.14, filter: { type: 'bandpass', freq: 1500, q: 3 } });
      s.ticks({ at: 0.3, count: 4, span: 0.15, freq: 2200, q: 3, gain: 0.04, decay: 0.012, fade: 0.4 });
    },
    { gain: 0.88, reverb: 0.25 },
  ),
  pieceSlide: sfx(
    0.65,
    (s) => {
      s.noise({
        attack: 0.06, hold: 0.25, decay: 0.12, gain: 0.14, color: 'brown',
        filter: { type: 'bandpass', freq: 380, to: 520, q: 1.2 }, tremolo: { rate: 23, depth: 0.5 },
      });
      s.noise({
        attack: 0.06, hold: 0.25, decay: 0.1, gain: 0.035, color: 'pink',
        filter: { type: 'bandpass', freq: 1800, q: 1 }, tremolo: { rate: 31, depth: 0.6 },
      });
      s.ticks({ at: 0.04, count: 7, span: 0.36, freq: 2600, q: 4, gain: 0.025, decay: 0.01 });
      stoneClack(s, 0.44, 0.2);
    },
    { gain: 1.43, reverb: 0.15, maxVoices: 3 },
  ),

  // ------------------------------------------------------------ combat
  attackMelee: sfx(
    0.8,
    (s) => {
      s.whoosh({ dur: 0.17, from: 600, to: 3200, gain: 0.16, q: 1.2, peak: 0.75, color: 'white' });
      steelRing(s, 0.13, 1240, 0.08);
      s.tone({ at: 0.13, freq: 160, to: 80, decay: 0.12, gain: 0.25 });
    },
    { gain: 1.88, reverb: 0.2 },
  ),
  attackRanged: sfx(
    0.6,
    (s) => {
      s.pluck(98, { gain: 0.25, bright: 0.3, dur: 0.35 });
      s.tone({ type: 'triangle', freq: 210, to: 150, decay: 0.15, gain: 0.07, filter: { freq: 900 } });
      s.noise({ at: 0.04, attack: 0.08, decay: 0.2, gain: 0.07, filter: { type: 'bandpass', freq: 2200, to: 5200, q: 6 } });
      s.tone({ at: 0.34, freq: 320, to: 140, decay: 0.07, gain: 0.2 });
      s.noise({ at: 0.34, decay: 0.03, gain: 0.12, color: 'pink', filter: { type: 'bandpass', freq: 900, q: 2 } });
    },
    { gain: 2.32, reverb: 0.15 },
  ),
  attackMagic: sfx(
    1.2,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 220, to: 880, glide: 0.25, attack: 0.05, hold: 0.15, decay: 0.15, gain: 0.08, unison: 3, spread: 30,
        filter: { type: 'bandpass', freq: 600, to: 3000, q: 5, time: 0.3 },
      });
      s.whoosh({ dur: 0.32, from: 500, to: 4000, gain: 0.07, q: 2, peak: 0.8 });
      const b = s.after(0.32);
      b.tone({ freq: 110, to: 55, decay: 0.4, gain: 0.3 });
      b.noise({ decay: 0.25, gain: 0.12, color: 'pink', filter: { freq: 2500, to: 400 } });
      b.chime(m(81), { decay: 0.8, gain: 0.05 });
      b.chime(m(88), { at: 0.03, decay: 0.7, gain: 0.04 });
    },
    { gain: 1.25, reverb: 0.45 },
  ),
  hit: sfx(
    0.4,
    (s) => {
      thump(s, 0, 0.45);
      s.noise({ decay: 0.025, gain: 0.1, filter: { type: 'bandpass', freq: 3000, q: 1.5 } });
    },
    { gain: 0.94, reverb: 0.12 },
  ),
  crit: sfx(
    1.2,
    (s) => {
      s.whoosh({ dur: 0.12, from: 800, to: 4000, gain: 0.1, peak: 0.85 });
      const h = s.after(0.1);
      thump(h, 0, 0.5, 170, 0.3);
      h.tone({ freq: 62, to: 32, decay: 0.7, gain: 0.35 });
      h.noise({ decay: 0.04, gain: 0.14, filter: { type: 'bandpass', freq: 3500, q: 1.2 } });
      steelRing(h, 0, 980, 0.07, 0.8);
    },
    { gain: 0.95, reverb: 0.3, maxVoices: 3 },
  ),
  block: sfx(
    0.6,
    (s) => {
      s.fm({ freq: 720, ratio: 2.76, index: 3.5, indexEnd: 0.2, indexDecay: 0.08, attack: 0.001, decay: 0.4, gain: 0.08 });
      s.tone({ freq: 1580, decay: 0.25, gain: 0.035 });
      s.tone({ freq: 2510, decay: 0.18, gain: 0.025 });
      s.noise({ decay: 0.05, gain: 0.16, filter: { type: 'bandpass', freq: 2000, q: 1.6 } });
      s.tone({ freq: 210, to: 120, decay: 0.1, gain: 0.25 });
      s.noise({ decay: 0.06, gain: 0.12, color: 'pink', filter: { freq: 900 } });
    },
    { gain: 1.67, reverb: 0.2 },
  ),
  death: sfx(
    2.7,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 200, to: 60, attack: 0.08, hold: 0.4, decay: 0.7, gain: 0.09, unison: 2, spread: 25,
        vibrato: 30, vibratoRate: 6, filter: { type: 'bandpass', freq: 700, to: 300, q: 2.5 },
      });
      s.tone({ at: 0.15, freq: 90, to: 32, decay: 1.0, gain: 0.35 });
      s.noise({ at: 0.15, decay: 0.6, gain: 0.08, color: 'brown', filter: { freq: 500 } });
      s.ticks({ at: 0.2, count: 12, span: 0.7, curve: 1.4, freq: 1400, freqVar: 0.5, q: 2, gain: 0.08, fade: 0.3, decay: 0.03, color: 'pink' });
      s.bell(116.5, { at: 0.15, decay: 2.0, gain: 0.06, bright: 0.2 });
    },
    { gain: 1.08, reverb: 0.4, maxVoices: 3 },
  ),

  // ------------------------------------------------------------ spells
  spellFire: sfx(
    1.3,
    (s) => {
      s.noise({ attack: 0.12, decay: 0.7, gain: 0.16, color: 'pink', filter: { type: 'bandpass', freq: 300, to: 1600, q: 0.9, time: 0.3 } });
      s.noise({
        attack: 0.15, hold: 0.2, decay: 0.6, gain: 0.12, color: 'brown', filter: { freq: 900 },
        tremolo: { rate: 9, depth: 0.4 },
      });
      s.ticks({ at: 0.08, count: 18, span: 0.9, curve: 1.2, freq: 3500, freqVar: 0.4, q: 1.5, gain: 0.07, fade: 0.4, decay: 0.012 });
      s.tone({ freq: 110, to: 55, attack: 0.02, decay: 0.5, gain: 0.25, drive: 0.2 });
    },
    { gain: 1.09, reverb: 0.3, maxVoices: 3 },
  ),
  spellFrost: sfx(
    1.6,
    (s) => {
      s.noise({ decay: 0.06, gain: 0.12, filter: { type: 'bandpass', freq: 2600, q: 3 } });
      s.noise({ attack: 0.2, decay: 0.9, gain: 0.05, filter: { type: 'highpass', freq: 5000 } });
      s.tone({ freq: 330, to: 300, decay: 0.5, gain: 0.06 });
      [79, 84, 83, 88, 86, 91].forEach((n, i) =>
        s.bell(m(n), { at: 0.02 + i * 0.055, decay: 0.9, gain: 0.05, kind: 'glass', strike: 0.1, pan: i % 2 ? 0.3 : -0.3 }),
      );
    },
    { gain: 3.37, reverb: 0.55, maxVoices: 3 },
  ),
  spellHoly: sfx(
    2.4,
    (s) => {
      s.pad([m(57), m(61), m(64), m(69)], { dur: 0.5, attack: 0.12, release: 1.2, gain: 0.14, vowel: 'ah', bright: 0.6 });
      s.bell(m(81), { at: 0.05, decay: 1.8, gain: 0.07, bright: 0.7 });
      s.chime(m(88), { at: 0.12, decay: 1.2, gain: 0.04, ratio: 2 });
      s.chime(m(93), { at: 0.2, decay: 1.0, gain: 0.03, ratio: 2 });
      s.noise({ attack: 0.3, decay: 0.9, gain: 0.03, filter: { type: 'highpass', freq: 6000 } });
    },
    { gain: 1.47, reverb: 0.6, maxVoices: 3 },
  ),
  spellShadow: sfx(
    1.5,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 65.4, attack: 0.25, hold: 0.3, decay: 0.7, gain: 0.12, unison: 3, spread: 35,
        filter: { freq: 200, to: 1100, time: 0.45, q: 4 },
      });
      s.tone({ type: 'sawtooth', freq: 69.3, attack: 0.25, hold: 0.3, decay: 0.7, gain: 0.08, filter: { freq: 180, to: 700, q: 2 } });
      s.noise({
        attack: 0.35, decay: 0.6, gain: 0.07, color: 'pink', filter: { type: 'bandpass', freq: 1500, to: 2400, q: 4 },
        tremolo: { rate: 7, depth: 0.7 },
      });
      s.tone({ freq: 98, to: 36, attack: 0.3, decay: 0.8, gain: 0.25 });
      s.whoosh({ dur: 0.6, from: 2000, to: 300, gain: 0.06, peak: 0.6 });
    },
    { gain: 0.79, reverb: 0.5, maxVoices: 3 },
  ),
  spellNature: sfx(
    2.3,
    (s) => {
      [62, 65, 67, 69, 72, 74].forEach((n, i) => s.pluck(m(n), { at: i * 0.06, gain: 0.16, bright: 0.6, pan: (i - 2.5) * 0.12 }));
      s.bell(m(74), { at: 0.36, kind: 'bar', decay: 1.0, gain: 0.05 });
      s.whoosh({ dur: 1.0, from: 500, to: 1400, gain: 0.04, q: 0.8, peak: 0.4 });
      s.ticks({ at: 0.1, count: 10, span: 0.8, freq: 3800, freqVar: 0.3, q: 2, gain: 0.025, decay: 0.015, color: 'pink' });
    },
    { gain: 3.05, reverb: 0.4, maxVoices: 3 },
  ),
  heal: sfx(
    1.6,
    (s) => {
      sparkle(s, 0, [72, 76, 79, 84], 0.09, 0.07, 1.2);
      s.tone({ type: 'triangle', freq: m(60), attack: 0.2, hold: 0.3, decay: 0.9, gain: 0.06, vibrato: 8 });
      s.tone({ type: 'triangle', freq: m(67), attack: 0.25, hold: 0.25, decay: 0.9, gain: 0.04 });
      s.noise({ attack: 0.4, decay: 0.8, gain: 0.025, filter: { type: 'highpass', freq: 7000 } });
    },
    { gain: 2.16, reverb: 0.55, maxVoices: 3 },
  ),
  shield: sfx(
    1.1,
    (s) => {
      s.whoosh({ dur: 0.25, from: 400, to: 2500, gain: 0.08, q: 2, peak: 0.85 });
      const b = s.after(0.2);
      b.fm({ freq: 523, ratio: 1.5, index: 2.5, indexEnd: 0.5, attack: 0.005, decay: 0.8, gain: 0.08 });
      b.fm({ freq: 784, ratio: 2.01, index: 1.5, attack: 0.005, decay: 0.7, gain: 0.05 });
      b.tone({ freq: 110, attack: 0.02, hold: 0.2, decay: 0.5, gain: 0.12, tremolo: { rate: 11, depth: 0.5 } });
      b.tone({ type: 'triangle', freq: 220, attack: 0.02, hold: 0.15, decay: 0.5, gain: 0.05, tremolo: { rate: 11, depth: 0.5 } });
      b.noise({ decay: 0.04, gain: 0.1, filter: { type: 'bandpass', freq: 3000, q: 2 } });
    },
    { gain: 1.51, reverb: 0.35, maxVoices: 3 },
  ),
  buff: sfx(
    1.2,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 300, to: 900, glide: 0.35, attack: 0.05, hold: 0.15, decay: 0.3, gain: 0.05, unison: 2, spread: 20,
        filter: { type: 'bandpass', freq: 800, to: 2500, q: 4, time: 0.35 },
      });
      s.chime(m(74), { at: 0.15, decay: 0.7, gain: 0.07, ratio: 2, index: 1 });
      s.chime(m(81), { at: 0.28, decay: 0.8, gain: 0.07, ratio: 2, index: 1 });
      s.whoosh({ dur: 0.35, from: 800, to: 4000, gain: 0.04, peak: 0.8 });
    },
    { gain: 3.91, reverb: 0.35 },
  ),
  debuff: sfx(
    1.0,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 600, to: 140, glide: 0.5, attack: 0.02, hold: 0.15, decay: 0.45, gain: 0.06, unison: 2, spread: 30,
        filter: { freq: 2200, to: 300, q: 3 },
      });
      s.chime(m(64), { at: 0.05, decay: 0.9, gain: 0.06, ratio: 1.414, index: 2.2 });
      s.chime(m(70), { at: 0.05, decay: 0.9, gain: 0.05, ratio: 1.414, index: 2 });
      s.tone({ freq: 90, to: 50, attack: 0.05, decay: 0.5, gain: 0.15 });
    },
    { gain: 1.24, reverb: 0.35 },
  ),
  summon: sfx(
    3.3,
    (s) => {
      s.noise({ attack: 0.7, decay: 0.4, gain: 0.12, color: 'brown', filter: { freq: 150, to: 900, time: 0.8, q: 2 } });
      s.pad([m(38), m(45), m(51)], { dur: 0.6, attack: 0.6, release: 0.9, gain: 0.14, vowel: 'oh', morph: 'ah' });
      const b = s.after(0.75);
      b.drum(55, { gain: 0.45, decay: 0.9, snap: 0.3, drive: 0.3 });
      b.bell(m(50), { decay: 2.0, gain: 0.08, bright: 0.3 });
      b.noise({ decay: 0.4, gain: 0.08, color: 'pink', filter: { freq: 2000, to: 300 } });
    },
    { gain: 0.84, reverb: 0.5, maxVoices: 2 },
  ),
  teleport: sfx(
    0.8,
    (s) => {
      s.fm({ freq: 300, to: 2400, glide: 0.16, ratio: 1.5, index: 2, indexEnd: 0.5, attack: 0.01, hold: 0.1, decay: 0.08, gain: 0.07 });
      s.whoosh({ dur: 0.18, from: 600, to: 5000, gain: 0.06, q: 2, peak: 0.8 });
      s.fm({ at: 0.22, freq: 2400, to: 350, glide: 0.18, ratio: 1.5, index: 2, attack: 0.005, hold: 0.08, decay: 0.15, gain: 0.07 });
      s.whoosh({ at: 0.22, dur: 0.2, from: 5000, to: 600, gain: 0.05, q: 2, peak: 0.2 });
      s.chime(m(96), { at: 0.2, decay: 0.4, gain: 0.025 });
    },
    { gain: 2.25, reverb: 0.4 },
  ),

  // -------------------------------------------------------- board/game
  diceRoll: sfx(
    0.8,
    (s) => {
      s.ticks({ count: 13, span: 0.62, curve: 1.6, freq: 2600, freqVar: 0.35, q: 2.5, gain: 1.0, fade: 0.45, decay: 0.022, jitter: 0.5 });
      s.ticks({ at: 0.02, count: 9, span: 0.6, curve: 1.5, freq: 1300, freqVar: 0.3, q: 3, gain: 0.6, fade: 0.4, decay: 0.03, jitter: 0.6, color: 'pink' });
      s.noise({ attack: 0.05, hold: 0.3, decay: 0.25, gain: 0.1, color: 'pink', filter: { type: 'bandpass', freq: 900, q: 0.8 } });
    },
    { gain: 2.8, reverb: 0.12, maxVoices: 2, minIntervalMs: 100 },
  ),
  diceLand: sfx(
    0.35,
    (s) => {
      s.noise({ decay: 0.025, gain: 0.2, filter: { type: 'bandpass', freq: 2400, q: 3.5 } });
      s.tone({ freq: 320, to: 260, decay: 0.05, gain: 0.12 });
      s.tone({ type: 'triangle', freq: 1650, decay: 0.03, gain: 0.04 });
      s.noise({ at: 0.07, decay: 0.02, gain: 0.08, filter: { type: 'bandpass', freq: 2800, q: 3.5 } });
      s.tone({ at: 0.07, freq: 300, decay: 0.04, gain: 0.05 });
      s.tone({ freq: 120, to: 80, decay: 0.08, gain: 0.12 });
    },
    { gain: 1.88, reverb: 0.15 },
  ),
  eventReveal: sfx(
    3.1,
    (s) => {
      s.bell(110, { decay: 2.4, gain: 0.12, bright: 0.25 });
      s.noise({ attack: 0.6, decay: 0.6, gain: 0.05, filter: { type: 'bandpass', freq: 1500, to: 6000, q: 1.2, time: 0.9 } });
      s.pad([m(50), m(53), m(57)], { at: 0.1, dur: 0.6, attack: 0.4, release: 1, gain: 0.08, vowel: 'oo' });
      sparkle(s, 0.25, [62, 65, 69, 74], 0.12, 0.05, 1.2);
    },
    { gain: 2.33, reverb: 0.55, maxVoices: 2 },
  ),
  doomTick: sfx(
    0.8,
    (s) => {
      s.tone({ freq: 330, to: 290, decay: 0.07, gain: 0.12 });
      s.tone({ type: 'triangle', freq: 660, decay: 0.035, gain: 0.05 });
      s.noise({ decay: 0.02, gain: 0.1, filter: { type: 'bandpass', freq: 1600, q: 3 } });
      s.tone({ freq: 82, to: 70, attack: 0.005, decay: 0.45, gain: 0.25 });
    },
    { gain: 0.86, reverb: 0.3, minIntervalMs: 100, maxVoices: 2 },
  ),
  doomSurge: sfx(
    3.9,
    (s) => {
      s.noise({ attack: 1.0, decay: 0.5, gain: 0.14, color: 'brown', filter: { freq: 100, to: 900, time: 1.1, q: 3 } });
      s.pad([m(38), m(39), m(45)], { dur: 0.9, attack: 0.9, release: 0.9, gain: 0.16, vowel: 'oo', morph: 'ah' });
      const b = s.after(1.05);
      b.drum(48, { gain: 0.5, decay: 1.1, snap: 0.3, drive: 0.35 });
      b.bell(m(44), { decay: 2.2, gain: 0.08, bright: 0.2 });
      b.noise({ decay: 0.6, gain: 0.08, color: 'pink', filter: { freq: 1800, to: 200 } });
    },
    { gain: 0.77, reverb: 0.5, maxVoices: 2, minIntervalMs: 250 },
  ),
  coin: sfx(
    0.6,
    (s) => {
      s.fm({ freq: m(95), ratio: 2.4, index: 1.2, indexEnd: 0.1, indexDecay: 0.1, attack: 0.001, decay: 0.12, gain: 0.06 });
      s.fm({ at: 0.06, freq: m(100), ratio: 2.4, index: 1.0, indexEnd: 0.1, indexDecay: 0.15, attack: 0.001, decay: 0.45, gain: 0.07 });
      s.noise({ decay: 0.015, gain: 0.06, filter: { type: 'highpass', freq: 5000 } });
    },
    { gain: 2.71, reverb: 0.2, minIntervalMs: 45 },
  ),
  reward: sfx(
    1.8,
    (s) => {
      sparkle(s, 0, [74, 78, 81, 86], 0.08, 0.07, 1.2);
      s.bell(m(86), { at: 0.32, kind: 'glass', decay: 1.4, gain: 0.04, bright: 0.5 });
      s.pad([m(62), m(66), m(69)], { at: 0.05, dur: 0.6, attack: 0.15, release: 1.0, gain: 0.08, vowel: 'ah', bright: 0.5 });
      s.noise({ at: 0.2, attack: 0.3, decay: 0.8, gain: 0.025, filter: { type: 'highpass', freq: 7000 } });
    },
    { gain: 2.11, reverb: 0.5, maxVoices: 2 },
  ),

  // ---------------------------------------------------- turns & rounds
  turnStart: sfx(
    1.2,
    (s) => {
      s.brass([m(57)], { dur: 0.14, attack: 0.04, release: 0.12, gain: 0.1, bright: 0.45 });
      s.brass([m(62), m(57)], { at: 0.18, dur: 0.45, attack: 0.06, release: 0.35, gain: 0.11, bright: 0.5 });
      s.chime(m(74), { at: 0.18, decay: 1.0, gain: 0.035, ratio: 2, index: 0.8 });
    },
    { gain: 1.98, reverb: 0.4, maxVoices: 2 },
  ),
  enemyTurn: sfx(
    2.1,
    (s) => {
      s.brass([m(38), m(45)], { dur: 0.55, attack: 0.18, release: 0.5, gain: 0.13, bright: 0.25, scoop: 50 });
      s.drum(52, { gain: 0.38, decay: 0.7, snap: 0.3 });
      s.bell(m(56), { at: 0.05, decay: 1.6, gain: 0.05, bright: 0.2 });
    },
    { gain: 0.93, reverb: 0.4, maxVoices: 2 },
  ),
  roundStart: sfx(
    3.0,
    (s) => {
      s.drum(58, { gain: 0.42, decay: 0.6, snap: 0.45, drive: 0.25 });
      s.drum(52, { at: 0.2, gain: 0.48, decay: 0.8, snap: 0.45, drive: 0.25 });
      s.bell(m(50), { at: 0.2, decay: 2.2, gain: 0.08, bright: 0.35 });
      s.noise({ at: 0.2, attack: 0.002, decay: 1.2, gain: 0.03, filter: { type: 'bandpass', freq: 3000, q: 0.5 } });
    },
    { gain: 0.78, reverb: 0.4, maxVoices: 2 },
  ),
  zoneClose: sfx(
    2.0,
    (s) => {
      s.noise({
        attack: 0.8, hold: 0.4, decay: 0.7, gain: 0.12, color: 'brown', filter: { freq: 200, to: 700, q: 2 },
        tremolo: { rate: 6, depth: 0.5 },
      });
      s.tone({
        type: 'sawtooth', freq: 55, to: 62, attack: 0.6, hold: 0.6, decay: 0.6, gain: 0.08, unison: 2, spread: 30,
        filter: { freq: 250, to: 700, q: 4 }, tremolo: { rate: 6, depth: 0.6 },
      });
      s.whoosh({ dur: 1.6, from: 300, to: 2000, gain: 0.05, q: 1.2, peak: 0.7 });
      s.tone({ freq: m(81), to: m(82), attack: 0.8, hold: 0.4, decay: 0.6, gain: 0.015, vibrato: 20 });
    },
    { gain: 2.22, reverb: 0.35, maxVoices: 2, minIntervalMs: 250 },
  ),
  portalOpen: sfx(
    2.2,
    (s) => {
      s.noise({
        attack: 0.6, hold: 0.5, decay: 0.9, gain: 0.08, color: 'pink',
        filter: { type: 'bandpass', freq: 400, to: 2400, q: 4, time: 1.2 }, tremolo: { rate: 5, depth: 0.6 },
      });
      for (const [n, g] of [[50, 0.05], [57, 0.04]] as const) {
        s.tone({
          type: 'sawtooth', freq: m(n), attack: 0.7, hold: 0.4, decay: 0.9, gain: g, unison: 3, spread: 25,
          filter: { type: 'bandpass', freq: 400, to: 2000, q: 3, time: 1.2 },
        });
      }
      s.tone({ freq: m(38), attack: 0.5, hold: 0.5, decay: 0.9, gain: 0.15 });
      sparkle(s, 0.6, [86, 81, 88, 93], 0.13, 0.03, 0.9);
    },
    { gain: 1.46, reverb: 0.55, maxVoices: 2 },
  ),
  telegraph: sfx(
    0.9,
    (s) => {
      for (const at of [0, 0.22]) {
        s.tone({ at, freq: 110, to: 100, attack: 0.005, decay: 0.2, gain: 0.25 });
        s.tone({ at, type: 'sawtooth', freq: 110, attack: 0.005, decay: 0.16, gain: 0.06, filter: { freq: 900, to: 200 } });
        s.chime(m(88), { at, decay: 0.3, gain: 0.03, ratio: 1.414, index: 2 });
        s.chime(m(89), { at, decay: 0.3, gain: 0.025, ratio: 1.414, index: 2 });
      }
    },
    { gain: 1.26, reverb: 0.25, minIntervalMs: 120, maxVoices: 2 },
  ),

  // -------------------------------------------------------------- boss
  bossAppear: sfx(
    5.3,
    (s) => {
      s.noise({ attack: 1.4, decay: 1.6, gain: 0.14, color: 'brown', filter: { freq: 120, to: 600, time: 1.5, q: 1.5 } });
      s.tone({ freq: 55, to: 41, attack: 1.2, hold: 0.5, decay: 1.6, gain: 0.22 });
      s.brass([m(40), m(41), m(47)], { at: 0.5, dur: 1.4, attack: 0.9, release: 1.2, gain: 0.14, bright: 0.35, scoop: 60 });
      s.pad([m(52), m(55), m(58)], { at: 0.4, dur: 1.6, attack: 1.0, release: 1.4, gain: 0.12, vowel: 'oh', morph: 'ah', bright: 0.4 });
      const b = s.after(1.5);
      b.drum(45, { gain: 0.55, decay: 1.4, snap: 0.4, drive: 0.4 });
      b.bell(m(40), { decay: 3, gain: 0.1, bright: 0.25 });
      b.noise({ decay: 0.9, gain: 0.08, color: 'pink', filter: { freq: 2500, to: 200 } });
    },
    { gain: 0.87, reverb: 0.55, maxVoices: 1, minIntervalMs: 500 },
  ),
  bossRoar: sfx(
    2.0,
    (s) => {
      const growl = { attack: 0.12, hold: 0.6, decay: 0.8, unison: 3, spread: 45, vibrato: 35, vibratoRate: 7 } as const;
      s.tone({
        ...growl, type: 'sawtooth', freq: 92, to: 70, gain: 0.16, tremolo: { rate: 27, depth: 0.55 }, drive: 0.5,
        filter: { type: 'bandpass', freq: 420, to: 750, time: 0.5, q: 1.4 },
      });
      s.tone({
        ...growl, type: 'sawtooth', freq: 92, to: 70, gain: 0.07, tremolo: { rate: 27, depth: 0.55 },
        filter: { type: 'bandpass', freq: 1000, to: 1250, time: 0.5, q: 3 },
      });
      s.tone({
        type: 'square', freq: 61, to: 47, attack: 0.15, hold: 0.6, decay: 0.8, gain: 0.08,
        tremolo: { rate: 19, depth: 0.5 }, filter: { freq: 500, to: 250 },
      });
      s.noise({
        attack: 0.1, hold: 0.6, decay: 0.8, gain: 0.12, color: 'pink',
        filter: { type: 'bandpass', freq: 600, to: 1100, time: 0.5, q: 1.5 }, tremolo: { rate: 23, depth: 0.5 },
      });
      s.noise({ attack: 0.15, hold: 0.5, decay: 0.8, gain: 0.08, color: 'brown', filter: { freq: 300 } });
    },
    { gain: 4.04, reverb: 0.35, maxVoices: 2, minIntervalMs: 300 },
  ),
  bossPhase: sfx(
    3.0,
    (s) => {
      s.noise({ attack: 0.9, decay: 0.08, gain: 0.12, color: 'pink', filter: { type: 'bandpass', freq: 300, to: 3500, time: 0.95, q: 1.2 } });
      s.tone({
        type: 'sawtooth', freq: 110, to: 440, glide: 0.95, attack: 0.9, decay: 0.08, gain: 0.06, unison: 3, spread: 30,
        filter: { freq: 400, to: 3000, time: 0.95 },
      });
      const b = s.after(0.97);
      b.drum(46, { gain: 0.55, decay: 1.2, snap: 0.5, drive: 0.4 });
      b.fm({ freq: 620, ratio: 1.414, index: 4, indexEnd: 0.3, indexDecay: 0.3, decay: 1.6, gain: 0.06 });
      b.pad([m(52), m(58), m(63)], { dur: 0.4, attack: 0.02, release: 1.4, gain: 0.14, vowel: 'ah', bright: 0.6 });
      b.brass([m(40), m(46)], { dur: 0.35, attack: 0.02, release: 0.8, gain: 0.12, bright: 0.6 });
      b.noise({ decay: 0.8, gain: 0.08, color: 'pink', filter: { freq: 3000, to: 300 } });
    },
    { gain: 0.91, reverb: 0.5, maxVoices: 1, minIntervalMs: 500 },
  ),
  bossSlam: sfx(
    2.0,
    (s) => {
      s.whoosh({ dur: 0.15, from: 300, to: 1200, gain: 0.08, peak: 0.9 });
      const b = s.after(0.12);
      b.tone({ freq: 75, to: 28, decay: 1.0, gain: 0.6, drive: 0.25 });
      b.tone({ freq: 140, to: 55, decay: 0.3, gain: 0.3 });
      b.noise({ decay: 0.45, gain: 0.25, color: 'brown', filter: { freq: 500, to: 120 } });
      b.noise({ decay: 0.15, gain: 0.18, color: 'pink', filter: { type: 'bandpass', freq: 1500, q: 1 } });
      b.ticks({ at: 0.05, count: 14, span: 0.9, curve: 1.5, freq: 1800, freqVar: 0.6, q: 2, gain: 0.07, fade: 0.2, decay: 0.03, color: 'pink' });
    },
    { gain: 1.05, reverb: 0.3, maxVoices: 3, minIntervalMs: 150 },
  ),
  bossDefeated: sfx(
    6.0,
    (s) => {
      s.tone({
        type: 'sawtooth', freq: 110, to: 38, attack: 0.1, hold: 0.8, decay: 1.4, gain: 0.13, unison: 3, spread: 40,
        vibrato: 40, vibratoRate: 6, tremolo: { rate: 22, depth: 0.5 }, drive: 0.4,
        filter: { type: 'bandpass', freq: 700, to: 250, q: 1.4 },
      });
      s.noise({
        attack: 0.1, hold: 0.7, decay: 1.2, gain: 0.1, color: 'pink', filter: { type: 'bandpass', freq: 900, to: 300, q: 1.2 },
        tremolo: { rate: 20, depth: 0.4 },
      });
      [0.4, 0.95, 1.6].forEach((at, i) => s.drum(50 - i * 5, { at, gain: 0.45 - i * 0.06, decay: 1.0, snap: 0.5, drive: 0.35 }));
      s.ticks({ at: 0.45, count: 20, span: 1.8, curve: 1.3, freq: 1500, freqVar: 0.6, q: 2, gain: 0.07, fade: 0.2, decay: 0.035, color: 'pink' });
      const r = s.after(2.0);
      r.pad([m(50), m(57), m(62), m(66)], { dur: 1.2, attack: 0.8, release: 1.8, gain: 0.12, vowel: 'ah', bright: 0.5 });
      r.bell(m(62), { at: 0.2, decay: 3, gain: 0.07, bright: 0.4 });
      sparkle(r, 0.5, [74, 78, 81, 86], 0.15, 0.04, 1.6);
    },
    { gain: 1.09, reverb: 0.55, maxVoices: 1, minIntervalMs: 1000 },
  ),

  // -------------------------------------------------------------- end
  victory: sfx(
    3.6,
    (s) => {
      const hit = { attack: 0.02, release: 0.08, gain: 0.11, bright: 0.6 } as const;
      s.brass([m(62)], { ...hit, dur: 0.1 });
      s.brass([m(62)], { ...hit, at: 0.15, dur: 0.06 });
      s.brass([m(62)], { ...hit, at: 0.24, dur: 0.06 });
      s.brass([m(69)], { at: 0.33, dur: 0.3, attack: 0.03, release: 0.12, gain: 0.12, bright: 0.65 });
      s.brass([m(62), m(66), m(69), m(74)], { at: 0.7, dur: 1.3, attack: 0.05, release: 1.0, gain: 0.16, bright: 0.7 });
      s.brass([m(38), m(50)], { at: 0.7, dur: 1.3, attack: 0.06, release: 1.0, gain: 0.1, bright: 0.3 });
      s.drum(73.4, { gain: 0.3, decay: 0.5, snap: 0.3, bend: 1.3 });
      s.drum(55, { at: 0.33, gain: 0.3, decay: 0.5, snap: 0.3, bend: 1.3 });
      s.drum(73.4, { at: 0.7, gain: 0.45, decay: 1.4, snap: 0.4, bend: 1.3 });
      s.noise({ at: 0.7, attack: 0.005, decay: 1.6, gain: 0.05, filter: { type: 'highpass', freq: 4500 } });
      s.bell(m(86), { at: 0.7, decay: 2.2, gain: 0.05, bright: 0.5 });
      s.pad([m(50), m(57), m(62), m(66)], { at: 0.7, dur: 1.4, attack: 0.3, release: 1.4, gain: 0.08, vowel: 'ah', bright: 0.5 });
    },
    { gain: 1.25, reverb: 0.45, maxVoices: 1, minIntervalMs: 1000 },
  ),
  defeat: sfx(
    6.1,
    (s) => {
      // C minor, matching the 'defeat' music mood so both can overlap.
      const seq = [[48, 51, 55], [44, 48, 51], [41, 44, 48], [36, 43, 48, 51]];
      seq.forEach((ch, i) => {
        const last = i === seq.length - 1;
        const dur = last ? 1.6 : 0.7;
        const release = last ? 1.5 : 0.3;
        s.brass(ch.map(m), { at: i * 0.75, dur, attack: 0.12, release, gain: 0.09, bright: 0.2, scoop: 15 });
        s.pad(ch.map((n) => m(n + 12)), { at: i * 0.75, dur, attack: 0.2, release, gain: 0.07, vowel: 'oo' });
      });
      s.bell(m(48), { at: 2.25, decay: 3, gain: 0.1, bright: 0.15 });
      s.drum(46, { at: 2.25, gain: 0.35, decay: 1.2, snap: 0.2 });
    },
    { gain: 1.35, reverb: 0.5, maxVoices: 1, minIntervalMs: 1000 },
  ),
  playerEliminated: sfx(
    2.9,
    (s) => {
      s.drum(50, { gain: 0.45, decay: 1.0, snap: 0.4, drive: 0.3 });
      s.tone({
        type: 'triangle', freq: 440, to: 110, glide: 1.0, attack: 0.01, hold: 0.3, decay: 0.9, gain: 0.07, vibrato: 15,
        filter: { freq: 1800 },
      });
      s.tone({ type: 'sawtooth', freq: 220, to: 55, glide: 1.0, attack: 0.01, hold: 0.3, decay: 0.9, gain: 0.04, filter: { freq: 900, to: 200 } });
      s.bell(m(56), { at: 0.05, decay: 2.2, gain: 0.07, bright: 0.25 });
      s.bell(m(62), { at: 0.05, decay: 2.0, gain: 0.04 });
      s.noise({ decay: 0.5, gain: 0.06, color: 'brown', filter: { freq: 600 } });
    },
    { gain: 0.88, reverb: 0.45, maxVoices: 2, minIntervalMs: 300 },
  ),
};

/** Every SFX name, in catalog order. */
export const SFX_NAMES = Object.keys(sfxCatalog) as SfxName[];
