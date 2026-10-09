/**
 * Generative, endlessly varying music.
 *
 * Each mood is a small step-sequencer "generator" (seeded RNG, modal chord
 * progressions, probabilistic patterns) that schedules notes through the Synth
 * toolkit. A MoodPlayer owns one generator plus its mixer channels and a fade
 * gain; the MusicDirector runs a lookahead scheduler (setInterval ~25 ms +
 * AudioContext time) and crossfades between players.
 *
 * MoodPlayer.scheduleUntil() is a pure "schedule everything up to time X"
 * step, so the same code renders deterministically into an
 * OfflineAudioContext for tests.
 */
import { clamp, disconnectAll, midiToFreq as m, mulberry32 } from './dsp';
import { kRate, Synth, type Vowel } from './synth';
import type { MusicMood } from './types';

export interface MusicBus {
  dry: AudioNode;
  wet: AudioNode;
}

// ------------------------------------------------------------- theory

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10] as const;
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11] as const;
const IONIAN = [0, 2, 4, 5, 7, 9, 11] as const;
type Scale = readonly number[];

/** Semitone offset of scale degree `d` (may be negative or > 6). */
function degree(scale: Scale, d: number): number {
  const o = Math.floor(d / 7);
  return scale[((d % 7) + 7) % 7] + 12 * o;
}

/** Tertian chord on degree `d` as semitone offsets. */
function chordOf(scale: Scale, d: number, size = 3): number[] {
  const out: number[] = [];
  for (let k = 0; k < size; k++) out.push(degree(scale, d + 2 * k));
  return out;
}

/** Place each chord tone (root + semis) in the octave closest to `center`. */
function voiceNear(root: number, semis: readonly number[], center: number): number[] {
  const out = new Set<number>();
  for (const s of semis) {
    let n = root + s;
    while (n < center - 7) n += 12;
    while (n > center + 5) n -= 12;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Fold a MIDI note into [lo, lo + 12). */
function fold(n: number, lo: number): number {
  let x = n;
  while (x < lo) x += 12;
  while (x >= lo + 12) x -= 12;
  return x;
}

/** All MIDI notes of a scale (rooted at `root`) within [lo, hi]. */
function scaleNotes(root: number, scale: Scale, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = lo; n <= hi; n++) {
    const pc = (((n - root) % 12) + 12) % 12;
    if (scale.includes(pc)) out.push(n);
  }
  return out;
}

// ----------------------------------------------------------- channels

type ChannelName = 'pad' | 'bell' | 'pluckL' | 'pluckR' | 'drum' | 'perc' | 'bass' | 'brass' | 'lead' | 'fx' | 'drone';

const CHANNELS: Record<ChannelName, { dry: number; wet: number; pan?: number }> = {
  pad: { dry: 0.8, wet: 0.6 },
  bell: { dry: 0.35, wet: 1 },
  pluckL: { dry: 0.75, wet: 0.45, pan: -0.35 },
  pluckR: { dry: 0.75, wet: 0.45, pan: 0.35 },
  drum: { dry: 1, wet: 0.22 },
  perc: { dry: 0.7, wet: 0.2, pan: 0.2 },
  bass: { dry: 1, wet: 0.12 },
  brass: { dry: 0.85, wet: 0.45 },
  lead: { dry: 0.75, wet: 0.6 },
  fx: { dry: 0.5, wet: 0.85 },
  drone: { dry: 0.9, wet: 0.3 },
};

/** Caps simultaneous decorative voices (bells, plucks) to keep CPU bounded. */
class VoiceBudget {
  private ends: number[] = [];
  constructor(private readonly max: number) {}
  take(start: number, end: number): boolean {
    this.ends = this.ends.filter((e) => e > start);
    if (this.ends.length >= this.max) return false;
    this.ends.push(end);
    return true;
  }
}

// ---------------------------------------------------------- generators

abstract class Gen {
  abstract readonly bpm: number;
  readonly stepsPerBeat: number = 2;
  readonly beatsPerBar: number = 4;
  /** Loudness trim so moods sit at similar levels. */
  readonly level: number = 1;

  constructor(protected readonly p: MoodPlayer) {}

  get stepDur(): number {
    return 60 / this.bpm / this.stepsPerBeat;
  }
  get barSteps(): number {
    return this.stepsPerBeat * this.beatsPerBar;
  }
  get barDur(): number {
    return this.stepDur * this.barSteps;
  }

  setup(t0: number): void {
    void t0;
  }
  abstract step(i: number, t: number): void;

  protected r(): number {
    return this.p.rng();
  }
  protected chance(x: number): boolean {
    return this.p.rng() < x;
  }
  protected pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.p.rng() * items.length) % items.length];
  }
  protected ch(name: ChannelName): Synth {
    return this.p.ch(name);
  }

  /** Continuous drone (detuned oscillators through a slowly breathing lowpass). */
  protected drone(t0: number, notes: readonly number[], opts: { type?: OscillatorType; cutoff: number; gain: number; lfo?: number }): void {
    const ctx = this.p.ctx;
    const out = this.ch('drone').out;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.gain, t0 + 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    kRate(lp.frequency);
    lp.frequency.value = opts.cutoff;
    lp.Q.value = 1.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = opts.lfo ?? 0.06;
    const lg = ctx.createGain();
    lg.gain.value = opts.cutoff * 0.45;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lp.connect(g);
    g.connect(out);
    lfo.start(t0);
    this.p.hold(lfo, [lg, lp, g]);
    notes.forEach((n, i) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = opts.type ?? 'sawtooth';
        kRate(o.frequency);
        kRate(o.detune);
        o.frequency.value = m(n);
        o.detune.value = det + i * 1.5;
        const og = ctx.createGain();
        og.gain.value = 1 / (notes.length * 2);
        o.connect(og);
        og.connect(lp);
        o.start(t0);
        this.p.hold(o, [og]);
      }
    });
  }
}

// --- menu: brooding pad, pedal drone, distant bells ---------------------------
class MenuGen extends Gen {
  readonly bpm = 56;
  override readonly level = 1.1;
  private readonly root = 38; // D2
  private readonly progs: ReadonlyArray<{ scale: Scale; degs: readonly number[] }> = [
    { scale: AEOLIAN, degs: [0, 5, 3, 4] },
    { scale: PHRYGIAN, degs: [0, 1, 0, 6] },
    { scale: AEOLIAN, degs: [0, 3, 5, 6] },
    { scale: HARMONIC_MINOR, degs: [0, 5, 3, 4] },
  ];
  private prog = this.progs[0];
  private chord: number[] = [0, 3, 7];
  private readonly bells = new VoiceBudget(6);

  override setup(t0: number): void {
    this.drone(t0, [this.root, this.root - 12, this.root + 7], { cutoff: 190, gain: 0.16, lfo: 0.05 });
  }

  step(i: number, t: number): void {
    const bar = Math.floor(i / this.barSteps);
    const s = i % this.barSteps;
    if (s === 0 && bar % 8 === 0) {
      const prev = this.prog;
      do this.prog = this.pick(this.progs);
      while (this.prog === prev && bar > 0);
    }
    if (s === 0 && bar % 2 === 0) {
      const d = this.prog.degs[(bar / 2) % this.prog.degs.length];
      this.chord = chordOf(this.prog.scale, d, this.chance(0.3) ? 4 : 3);
      const vowels: Vowel[] = ['oo', 'ah', 'oh'];
      const notes = voiceNear(this.root, this.chord, 57);
      const span = this.barDur * 2;
      this.ch('pad').pad(notes.map(m), {
        at: t, dur: span - 0.4, attack: 2.6, release: 3.4, gain: 0.1, vowel: this.pick(vowels), morph: this.pick(vowels), bright: 0.2,
      });
      this.ch('bass').tone({
        at: t, type: 'triangle', freq: m(fold(this.root + this.chord[0], 38)), attack: 2, hold: span - 2.2, decay: 2.6, gain: 0.13,
        filter: { freq: 320 },
      });
    }
    const p = s === 0 ? 0.3 : s % 2 === 0 ? 0.09 : 0.04;
    if (this.chance(p) && this.bells.take(t, t + 5)) {
      const scale = this.prog.scale;
      const base = this.root + 36 + this.pick(this.chord) + (this.chance(0.35) ? 12 : 0);
      const at = t + this.r() * 0.05;
      const pan = (this.r() - 0.5) * 1.2;
      this.ch('bell').bell(m(base), { at, decay: 4.5 + this.r() * 2, gain: 0.035 + this.r() * 0.025, bright: 0.3, strike: 0.15, pan });
      if (this.chance(0.25)) {
        // A short descending answer.
        const pc = (((base - this.root) % 12) + 12) % 12;
        const idx = scale.indexOf(pc);
        if (idx >= 0) {
          for (let k = 1; k <= 2; k++) {
            const n = base - pc + degree(scale, idx - k);
            this.ch('bell').bell(m(n), { at: at + k * this.stepDur, decay: 4, gain: 0.025, bright: 0.3, strike: 0.1, pan: -pan });
          }
        }
      }
    }
    if (s === 0 && bar % 4 === 0 && this.chance(0.7)) {
      this.ch('fx').drum(41, { at: t, gain: 0.2, decay: 2.2, snap: 0.15, tone: 0 });
    }
    if (s === 4 && this.chance(0.18)) {
      this.ch('fx').whoosh({ at: t, dur: 6, from: 300, to: 900, gain: 0.025, q: 0.8 });
    }
  }
}

// --- explore: calm tension, sparse harp ----------------------------------------
class ExploreGen extends Gen {
  readonly bpm = 68;
  override readonly level = 2.3;
  private readonly root = 45; // A2
  private readonly scale = DORIAN;
  private readonly progs: ReadonlyArray<readonly number[]> = [
    [0, 3, 0, 6],
    [0, 2, 6, 3],
    [0, 4, 2, 3],
    [0, 6, 3, 4],
  ];
  private prog = this.progs[0];
  private chord: number[] = [0, 3, 7];
  private pattern = new Set<number>([0, 3, 6]);
  private walk = 4;
  private side = 0;
  private readonly plucks = new VoiceBudget(10);

  override setup(t0: number): void {
    this.drone(t0, [this.root - 12, this.root], { cutoff: 160, gain: 0.09, lfo: 0.04 });
  }

  private newPattern(): void {
    const hits = new Set<number>([0]);
    const size = 3 + (this.chance(0.4) ? 1 : 0);
    const cands = [2, 3, 4, 5, 6, 7, 1];
    while (hits.size < size) hits.add(this.pick(cands));
    this.pattern = hits;
  }

  step(i: number, t: number): void {
    const bar = Math.floor(i / this.barSteps);
    const s = i % this.barSteps;
    if (s === 0 && bar % 8 === 0) {
      const prev = this.prog;
      do this.prog = this.pick(this.progs);
      while (this.prog === prev && bar > 0);
      this.newPattern();
    } else if (s === 0 && this.chance(0.3)) {
      // Mutate one step so the figure breathes.
      const k = 1 + Math.floor(this.r() * 7);
      if (this.pattern.has(k)) this.pattern.delete(k);
      else if (this.pattern.size < 5) this.pattern.add(k);
    }
    if (s === 0 && bar % 2 === 0) {
      const d = this.prog[(bar / 2) % this.prog.length];
      this.chord = chordOf(this.scale, d, 3);
      const span = this.barDur * 2;
      this.ch('pad').pad(voiceNear(this.root, this.chord, 57).map(m), {
        at: t, dur: span - 0.3, attack: 3, release: 3, gain: 0.075, vowel: 'oo', morph: this.pick<Vowel>(['oo', 'oh']), bright: 0.15,
      });
      this.ch('bass').pluck(m(fold(this.root + this.chord[0], 40)), { at: t, gain: 0.26, bright: 0.2 });
    } else if (s === 0) {
      this.ch('bass').pluck(m(fold(this.root + this.chord[2], 40)), { at: t, gain: 0.16, bright: 0.15 });
    }
    if (this.pattern.has(s)) {
      const pool = voiceNear(this.root, this.chord, 64)
        .concat(voiceNear(this.root, this.chord, 76))
        .filter((n) => n >= 57 && n <= 81);
      pool.sort((a, b) => a - b);
      this.walk = clamp(this.walk + this.pick([-2, -1, -1, 1, 1, 2]), 0, pool.length - 1);
      let note = pool[this.walk];
      if (this.chance(0.18)) {
        // Passing scale tone for a touch of tension.
        const sc = scaleNotes(this.root, this.scale, note - 3, note + 3).filter((n) => n !== note);
        if (sc.length) note = this.pick(sc);
      }
      const at = t + (this.r() - 0.5) * 0.012;
      if (this.plucks.take(at, at + 1.6)) {
        this.side ^= 1;
        this.ch(this.side ? 'pluckL' : 'pluckR').pluck(m(note), { at, gain: 0.13 + this.r() * 0.06, bright: 0.45 });
        if (this.chance(0.15)) {
          this.ch(this.side ? 'pluckR' : 'pluckL').pluck(m(note + this.pick([3, 4, 5, 7])), {
            at: at + this.stepDur / 2, gain: 0.08, bright: 0.4,
          });
        }
      }
    }
    if (s === 6 && this.chance(0.12)) {
      const tension = this.root + 36 + this.pick([2, 5, 9, 14]);
      this.ch('bell').bell(m(tension), { at: t, decay: 4, gain: 0.03, bright: 0.2, strike: 0.1, pan: (this.r() - 0.5) });
    }
    if (s === 0 && bar % 4 === 2 && this.chance(0.5)) {
      this.ch('drum').drum(48, { at: t, gain: 0.16, decay: 0.7, snap: 0.15, tone: 0.1 });
      this.ch('drum').drum(48, { at: t + 0.28, gain: 0.1, decay: 0.6, snap: 0.1, tone: 0.1 });
    }
  }
}

// --- battle: driving war drums + low ostinato ---------------------------------
class BattleGen extends Gen {
  readonly bpm = 100;
  override readonly stepsPerBeat = 4;
  override readonly level = 0.9;
  private readonly root = 40; // E2
  private readonly scale = PHRYGIAN;
  private readonly progs: ReadonlyArray<readonly number[]> = [
    [0, 1, 0, 6],
    [0, 5, 6, 0],
    [0, 3, 1, 0],
    [0, 1, 5, 6],
  ];
  private readonly drumPats: ReadonlyArray<{ low: readonly number[]; mid: readonly number[] }> = [
    { low: [0, 3, 8, 11], mid: [4, 12, 14] },
    { low: [0, 6, 8, 10], mid: [4, 12] },
    { low: [0, 3, 6, 8, 11], mid: [4, 12, 15] },
  ];
  private readonly ostinati: ReadonlyArray<ReadonlyArray<number | null>> = [
    [0, null, 0, 1, 0, null, 0, 2, 0, null, 0, 1, 0, null, 3, 1],
    [0, 0, null, 0, 1, null, 0, 0, null, 0, 2, null, 1, 0, null, -1],
    [0, null, 0, 0, 1, 0, null, 0, 0, null, 0, 0, 2, 1, 0, null],
  ];
  private prog = this.progs[0];
  private drums = this.drumPats[0];
  private ost = this.ostinati[0];
  private chordDeg = 0;

  override setup(t0: number): void {
    this.drone(t0, [this.root - 12], { type: 'sine', cutoff: 120, gain: 0.08 });
  }

  step(i: number, t: number): void {
    const bar = Math.floor(i / this.barSteps);
    const s = i % this.barSteps;
    const pb = bar % 4;
    if (s === 0 && pb === 0) {
      this.prog = this.pick(this.progs);
      if (bar % 8 === 0) {
        this.drums = this.pick(this.drumPats);
        this.ost = this.pick(this.ostinati);
      }
    }
    if (s === 0) {
      this.chordDeg = this.prog[pb];
      const chord = chordOf(this.scale, this.chordDeg, 3);
      this.ch('pad').pad(voiceNear(this.root, chord, 55).map(m), {
        at: t, dur: this.barDur - 0.1, attack: 0.5, release: 0.8, gain: 0.07, vowel: 'ah', bright: 0.3,
      });
      if (bar % 8 === 4) {
        this.ch('brass').brass(voiceNear(this.root, chord, 52).map(m), {
          at: t, dur: this.barDur * 2 - 0.2, attack: 1.2, release: 0.6, gain: 0.08, bright: 0.35,
        });
      }
      if (bar % 8 === 7) {
        this.ch('fx').noise({ at: t, attack: this.barDur, decay: 0.12, gain: 0.035, filter: { type: 'highpass', freq: 3500 } });
      }
    }
    // Drums.
    const drum = this.ch('drum');
    if (pb === 3 && s >= 12) {
      const f = [150, 130, 112, 95][s - 12];
      drum.drum(f, { at: t, gain: 0.2 + (s - 12) * 0.03, decay: 0.25, snap: 0.5 });
    } else {
      if (this.drums.low.includes(s)) drum.drum(56, { at: t, gain: s === 0 ? 0.5 : 0.4, decay: 0.55, snap: 0.45, drive: 0.2 });
      if (this.drums.mid.includes(s)) drum.drum(98, { at: t, gain: 0.22, decay: 0.28, snap: 0.5 });
      else if (s % 2 === 1 && this.chance(0.12)) drum.drum(98, { at: t, gain: 0.07, decay: 0.15, snap: 0.3 });
      if (s % 4 === 2) {
        const perc = this.ch('perc');
        perc.noise({ at: t, decay: 0.03, gain: 0.05, filter: { type: 'bandpass', freq: 2500, q: 2 } });
        perc.tone({ at: t, freq: 900, decay: 0.02, gain: 0.02 });
      }
    }
    // Ostinato.
    const v = this.ost[s];
    if (v !== null && v !== undefined) {
      const n = fold(this.root + degree(this.scale, this.chordDeg + v), 38);
      const accent = s % 4 === 0;
      this.ch('bass').tone({
        at: t, type: 'sawtooth', freq: m(n), unison: 2, spread: 12, attack: 0.004, hold: 0.04, decay: 0.16,
        gain: accent ? 0.13 : 0.095, filter: { freq: accent ? 1300 : 1000, to: 260, time: 0.12, q: 2 },
      });
    }
  }
}

// --- boss: faster, dissonant brass stabs, choir --------------------------------
class BossGen extends Gen {
  readonly bpm = 132;
  override readonly stepsPerBeat = 4;
  override readonly level = 0.85;
  private readonly root = 37; // C#2
  private readonly progs: ReadonlyArray<ReadonlyArray<readonly number[]>> = [
    [[0, 3, 7], [1, 5, 8], [0, 3, 7], [6, 9, 13]],
    [[0, 3, 7], [8, 12, 15], [1, 5, 8], [-1, 2, 5]],
    [[0, 3, 6], [1, 4, 8], [0, 3, 7], [7, 11, 14]],
  ];
  private readonly stabPats: ReadonlyArray<readonly number[]> = [[0, 3, 6], [0, 10], [0, 3, 10, 13], [0, 6, 12]];
  private readonly lowPats: ReadonlyArray<readonly number[]> = [
    [0, 3, 6, 8, 11, 14],
    [0, 2, 6, 8, 10, 14],
    [0, 3, 8, 9, 11],
  ];
  private readonly ost: readonly number[] = [0, 0, 1, 0, 0, 0, 12, 0, 0, 0, 1, 0, 0, 6, 1, 0];
  private prog = this.progs[0];
  private stabs = this.stabPats[0];
  private low = this.lowPats[0];
  private chord: readonly number[] = [0, 3, 7];

  override setup(t0: number): void {
    this.drone(t0, [this.root - 12, this.root - 11], { cutoff: 140, gain: 0.08, lfo: 0.11 });
  }

  step(i: number, t: number): void {
    const bar = Math.floor(i / this.barSteps);
    const s = i % this.barSteps;
    const pb = bar % 4;
    if (s === 0 && pb === 0) {
      this.prog = this.pick(this.progs);
      this.low = this.pick(this.lowPats);
    }
    if (s === 0) {
      this.chord = this.prog[pb];
      this.stabs = this.pick(this.stabPats);
      if (bar % 2 === 0) {
        const semis = this.chance(0.4) ? [...this.chord, this.chord[0] + 13] : this.chord;
        this.ch('pad').pad(voiceNear(this.root, semis, 63).map(m), {
          at: t, dur: this.barDur * 2 - 0.15, attack: 0.4, release: 1.0, gain: 0.09, vowel: 'ah', morph: 'eh', bright: 0.55,
        });
      }
      if (bar % 8 === 0) {
        this.ch('bell').bell(m(this.root + 24), { at: t, decay: 4, gain: 0.08, bright: 0.3 });
        this.ch('drum').drum(36, { at: t, gain: 0.45, decay: 1.3, snap: 0.2, drive: 0.3 });
      } else if (bar % 2 === 0) {
        this.ch('drum').drum(36, { at: t, gain: 0.32, decay: 1.0, snap: 0.2, drive: 0.3 });
      }
      if (bar % 8 === 7) {
        this.ch('fx').noise({
          at: t, attack: this.barDur * 0.95, decay: 0.06, gain: 0.05, color: 'pink',
          filter: { type: 'bandpass', freq: 300, to: 4000, q: 1.2, time: this.barDur },
        });
        this.ch('fx').tone({
          at: t, type: 'sawtooth', freq: m(this.root + 12), to: m(this.root + 36), attack: this.barDur * 0.95, decay: 0.06,
          gain: 0.035, unison: 2, spread: 30, filter: { freq: 400, to: 3500, time: this.barDur },
        });
      }
    }
    const drum = this.ch('drum');
    if (pb === 3 && s >= 8) {
      drum.drum(170 - (s - 8) * 11, { at: t, gain: 0.14 + (s - 8) * 0.02, decay: 0.2, snap: 0.5 });
    } else {
      if (this.low.includes(s)) drum.drum(58, { at: t, gain: s === 0 ? 0.48 : 0.38, decay: 0.42, snap: 0.5, drive: 0.25 });
      if (s === 4 || s === 12) drum.drum(120, { at: t, gain: 0.25, decay: 0.22, snap: 0.7 });
    }
    // Hats: tight noise ticks, accented on 8ths.
    this.ch('perc').noise({ at: t, decay: s % 2 ? 0.02 : 0.04, gain: s % 4 === 2 ? 0.035 : 0.018, filter: { type: 'highpass', freq: 7000 } });
    // Ostinato.
    const n = fold(this.root + this.chord[0] + this.ost[s], 37);
    this.ch('bass').tone({
      at: t, type: 'sawtooth', freq: m(n), unison: 2, spread: 14, attack: 0.003, hold: 0.03, decay: 0.12,
      gain: s % 4 === 0 ? 0.12 : 0.085, filter: { freq: 1500, to: 300, time: 0.1, q: 2.5 },
    });
    // Dissonant brass stabs.
    if (this.stabs.includes(s)) {
      const add = this.pick([1, 6, 13]);
      const notes = voiceNear(this.root, [...this.chord, this.chord[0] + add], 56);
      this.ch('brass').brass(notes.map(m), {
        at: t, dur: 0.14, attack: 0.012, release: 0.2, gain: s === 0 ? 0.11 : 0.085, bright: 0.85, scoop: 40,
      });
    }
  }
}

// --- victory: fanfare, then a calm major pad -----------------------------------
class VictoryGen extends Gen {
  readonly bpm = 92;
  private readonly root = 50; // D3
  private readonly scale = IONIAN;
  private readonly progs: ReadonlyArray<readonly number[]> = [
    [0, 3, 5, 4],
    [0, 4, 5, 3],
    [0, 5, 3, 4],
    [3, 4, 0, 0],
  ];
  private prog = this.progs[0];
  private chord: number[] = [0, 4, 7];
  private readonly bells = new VoiceBudget(5);

  private fanfare(t: number): void {
    const b = this.stepDur * 2; // one beat
    const brass = this.ch('brass');
    const motif: ReadonlyArray<readonly [number, number, number]> = [
      [62, 0, 0.4], [62, 0.5, 0.18], [62, 0.75, 0.18], [69, 1, 0.85], [66, 2, 0.4], [69, 2.5, 0.4],
    ];
    for (const [n, at, d] of motif) {
      brass.brass([m(n), m(n - 12)], { at: t + at * b, dur: d * b, attack: 0.025, release: 0.12, gain: 0.13, bright: 0.65 });
    }
    const final = t + 3 * b;
    brass.brass([62, 66, 69, 74].map(m), { at: final, dur: 4 * b, attack: 0.05, release: 1.6, gain: 0.17, bright: 0.7 });
    brass.brass([38, 50].map(m), { at: final, dur: 4 * b, attack: 0.06, release: 1.6, gain: 0.11, bright: 0.3 });
    brass.brass([38, 50].map(m), { at: t, dur: 0.9 * b, attack: 0.04, release: 0.2, gain: 0.09, bright: 0.3 });
    brass.brass([45, 57].map(m), { at: t + 2 * b, dur: 0.9 * b, attack: 0.04, release: 0.2, gain: 0.09, bright: 0.3 });
    const drum = this.ch('drum');
    drum.drum(73.4, { at: t, gain: 0.32, decay: 0.6, snap: 0.3, bend: 1.3 });
    drum.drum(55, { at: t + 2 * b, gain: 0.3, decay: 0.6, snap: 0.3, bend: 1.3 });
    for (let k = 0; k < 4; k++) drum.drum(55, { at: t + 2.5 * b + k * b * 0.125, gain: 0.08 + k * 0.04, decay: 0.2, snap: 0.3, bend: 1.2 });
    drum.drum(73.4, { at: final, gain: 0.48, decay: 1.6, snap: 0.4, bend: 1.3 });
    this.ch('fx').noise({ at: final, attack: 0.004, decay: 2.6, gain: 0.05, filter: { type: 'highpass', freq: 4500 } });
    this.ch('bell').bell(m(86), { at: final, decay: 3, gain: 0.05, bright: 0.5 });
    this.ch('bell').chime(m(81), { at: final + 0.05, decay: 2, gain: 0.04, ratio: 2, index: 1 });
    this.ch('pad').pad([62, 66, 69, 74].map(m), { at: final, dur: 4 * b, attack: 0.3, release: 2.5, gain: 0.09, vowel: 'ah', bright: 0.5 });
  }

  step(i: number, t: number): void {
    if (i === 0) {
      this.fanfare(t);
      return;
    }
    if (i < 16) return;
    const j = i - 16;
    const bar = Math.floor(j / this.barSteps);
    const s = j % this.barSteps;
    if (s === 0 && bar % 8 === 0) this.prog = this.pick(this.progs);
    if (s === 0 && bar % 2 === 0) {
      const d = this.prog[(bar / 2) % this.prog.length];
      this.chord = chordOf(this.scale, d, this.chance(0.3) ? 4 : 3);
      const span = this.barDur * 2;
      this.ch('pad').pad(voiceNear(this.root, this.chord, 62).map(m), {
        at: t, dur: span - 0.3, attack: 2, release: 3, gain: 0.08, vowel: 'oh', morph: 'ah', bright: 0.35,
      });
      this.ch('bass').tone({
        at: t, type: 'triangle', freq: m(fold(this.root + this.chord[0], 40)), attack: 1.2, hold: span - 1.4, decay: 2.2, gain: 0.12,
        filter: { freq: 400 },
      });
    }
    if (s === 0 && this.chance(0.5)) {
      const arp = voiceNear(this.root, this.chord, 67);
      arp.forEach((n, k) => this.ch(k % 2 ? 'pluckL' : 'pluckR').pluck(m(n), { at: t + k * this.stepDur, gain: 0.1, bright: 0.5 }));
    }
    if (this.chance(s === 4 ? 0.25 : 0.06) && this.bells.take(t, t + 4)) {
      const n = this.root + 24 + this.pick([0, 2, 4, 7, 9, 12]);
      this.ch('bell').bell(m(n), { at: t, decay: 3.5, gain: 0.03, bright: 0.4, strike: 0.1, pan: (this.r() - 0.5) * 1.2 });
    }
  }
}

// --- defeat: slow descending lament -------------------------------------------
class DefeatGen extends Gen {
  readonly bpm = 50;
  override readonly level = 0.92;
  private readonly root = 48; // C3
  private readonly laments: ReadonlyArray<ReadonlyArray<{ b: number; c: readonly number[] }>> = [
    // Chromatic lament bass (passus duriusculus).
    [
      { b: 0, c: [0, 3, 7] }, { b: -1, c: [-1, 2, 7] }, { b: -2, c: [-2, 3, 7] }, { b: -3, c: [-3, 0, 5] },
      { b: -4, c: [-4, 0, 3] }, { b: -5, c: [-5, -1, 2] }, { b: -5, c: [-5, 0, 2] }, { b: -5, c: [-5, -1, 2, 5] },
    ],
    // Diatonic descent.
    [
      { b: 0, c: [0, 3, 7] }, { b: -2, c: [-2, 2, 5] }, { b: -4, c: [-4, 0, 3] }, { b: -5, c: [-5, -1, 2] },
      { b: -7, c: [-7, -4, 0] }, { b: -9, c: [-9, -5, -2] }, { b: -4, c: [-4, 0, 3] }, { b: -5, c: [-5, -1, 2, 5] },
    ],
  ];
  private lament = this.laments[0];
  private melody = 72;
  private readonly rhythms: ReadonlyArray<readonly number[]> = [[0, 4], [0, 3, 6], [2, 4, 6], [0, 6], [0]];
  private onsets: readonly number[] = [0];

  override setup(t0: number): void {
    this.drone(t0, [this.root - 12], { type: 'sine', cutoff: 200, gain: 0.08 });
  }

  step(i: number, t: number): void {
    const bar = Math.floor(i / this.barSteps);
    const s = i % this.barSteps;
    const pb = bar % 8;
    if (s === 0 && pb === 0) {
      this.lament = this.pick(this.laments);
      this.melody = this.pick([72, 75, 74]);
    }
    const cur = this.lament[pb];
    if (s === 0) {
      this.onsets = this.pick(this.rhythms);
      this.ch('pad').pad(voiceNear(this.root, cur.c, 58).map(m), {
        at: t, dur: this.barDur - 0.2, attack: 1.5, release: 3, gain: 0.085, vowel: 'oo', bright: 0.15,
      });
      this.ch('bass').tone({
        at: t, type: 'triangle', freq: m(this.root - 12 + cur.b), attack: 1, hold: this.barDur - 1, decay: 2.5, gain: 0.14,
        filter: { freq: 400 },
      });
      if (bar % 2 === 0) this.ch('bell').bell(m(this.root + 7), { at: t, decay: 6, gain: 0.06, bright: 0.15, strike: 0.2 });
      if (pb === 3 || pb === 7) this.ch('drum').drum(44, { at: t, gain: 0.18, decay: 1.8, snap: 0.1, tone: 0 });
    }
    const k = this.onsets.indexOf(s);
    if (k >= 0) {
      const next = k + 1 < this.onsets.length ? this.onsets[k + 1] : this.barSteps;
      const dur = (next - s) * this.stepDur;
      // Mostly step downwards; land on chord tones on the downbeat.
      const scale = cur.c.includes(-1) ? HARMONIC_MINOR : AEOLIAN;
      const notes = scaleNotes(this.root, scale, 58, 80);
      let idx = notes.findIndex((n) => n >= this.melody);
      if (idx < 0) idx = notes.length - 1;
      idx += s === 0 ? 0 : this.pick([-1, -1, -2, -1, 1]);
      if (idx < 2) idx = notes.length - 1 - Math.floor(this.r() * 4);
      let note = notes[clamp(idx, 0, notes.length - 1)];
      if (s === 0) {
        const tones = voiceNear(this.root, cur.c, note).filter((n) => n <= note + 2);
        if (tones.length) note = tones[tones.length - 1];
      }
      this.melody = note;
      this.ch('lead').tone({
        at: t, type: 'triangle', freq: m(note), unison: 2, spread: 8, vibrato: 14, vibratoRate: 4.8,
        attack: 0.3, hold: Math.max(0.05, dur - 0.35), decay: 1.4, gain: 0.08, filter: { freq: 1500, q: 0.8 },
      });
    }
  }
}

function createGen(mood: MusicMood, p: MoodPlayer): Gen {
  switch (mood) {
    case 'menu':
      return new MenuGen(p);
    case 'explore':
      return new ExploreGen(p);
    case 'battle':
      return new BattleGen(p);
    case 'boss':
      return new BossGen(p);
    case 'victory':
      return new VictoryGen(p);
    case 'defeat':
      return new DefeatGen(p);
  }
}

// ------------------------------------------------------------ player

export class MoodPlayer {
  readonly rng: () => number;
  /** After this time the player is silent and can be disposed. */
  doneAt = Infinity;
  /** When true, steps advance but no notes are generated (muted / volume 0). */
  silent = false;
  /** Exceptions swallowed while generating steps (should stay 0; checked by tests). */
  errors = 0;
  private readonly fade: GainNode;
  private readonly wetFade: GainNode;
  private readonly chans = new Map<ChannelName, Synth>();
  private readonly nodes: AudioNode[] = [];
  private readonly continuous: AudioScheduledSourceNode[] = [];
  private readonly gen: Gen;
  private stepIndex = 0;
  private nextTime: number;
  private stopAt = Infinity;

  constructor(
    readonly ctx: BaseAudioContext,
    bus: MusicBus,
    readonly mood: MusicMood,
    startTime: number,
    seed: number,
    fadeIn = 1.5,
  ) {
    this.rng = mulberry32(seed);
    this.fade = ctx.createGain();
    this.wetFade = ctx.createGain();
    this.fade.gain.value = 0;
    this.wetFade.gain.value = 0;
    this.fade.connect(bus.dry);
    this.wetFade.connect(bus.wet);
    this.nodes.push(this.fade, this.wetFade);
    this.gen = createGen(mood, this);
    const level = this.gen.level;
    for (const p of [this.fade.gain, this.wetFade.gain]) {
      p.setValueAtTime(0, startTime);
      p.linearRampToValueAtTime(level, startTime + Math.max(0.01, fadeIn));
    }
    this.nextTime = startTime;
    this.gen.setup(startTime);
  }

  get stepDur(): number {
    return this.gen.stepDur;
  }

  /** Lazily created mixer channel (dry/wet send, optional pan) as a Synth. */
  ch(name: ChannelName): Synth {
    const hit = this.chans.get(name);
    if (hit) return hit;
    const ctx = this.ctx;
    const preset = CHANNELS[name];
    const input = ctx.createGain();
    let node: AudioNode = input;
    const withPanner = ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
    if (preset.pan && typeof withPanner.createStereoPanner === 'function') {
      const pan = withPanner.createStereoPanner();
      pan.pan.value = preset.pan;
      input.connect(pan);
      node = pan;
      this.nodes.push(pan);
    }
    const dry = ctx.createGain();
    dry.gain.value = preset.dry;
    const wet = ctx.createGain();
    wet.gain.value = preset.wet;
    node.connect(dry);
    node.connect(wet);
    dry.connect(this.fade);
    wet.connect(this.wetFade);
    this.nodes.push(input, dry, wet);
    const synth = new Synth(ctx, input, 0, 1, this.rng);
    this.chans.set(name, synth);
    return synth;
  }

  /** Registers a continuous source (drone) that is stopped on fade-out. */
  hold(src: AudioScheduledSourceNode, extra: AudioNode[] = []): void {
    this.continuous.push(src);
    this.nodes.push(...extra);
    if (Number.isFinite(this.stopAt)) src.stop(this.stopAt + 0.05);
  }

  /** Schedules every step that starts before `until` (and before any fade-out end). */
  scheduleUntil(now: number, until: number): void {
    const dur = this.gen.stepDur;
    if (this.nextTime < now - 0.25) {
      // We fell behind (e.g. a throttled background tab): skip, don't burst.
      const skip = Math.ceil((now - this.nextTime) / dur);
      this.stepIndex += skip;
      this.nextTime += skip * dur;
    }
    const end = Math.min(until, this.stopAt);
    let guard = 0;
    while (this.nextTime < end && guard++ < 512) {
      if (!this.silent) {
        try {
          this.gen.step(this.stepIndex, this.nextTime);
        } catch {
          // A bad note must never kill the music loop.
          this.errors++;
        }
      }
      this.stepIndex++;
      this.nextTime += dur;
    }
  }

  fadeOut(at: number, dur: number): void {
    if (Number.isFinite(this.stopAt)) return;
    for (const p of [this.fade.gain, this.wetFade.gain]) {
      const v = p.value;
      p.cancelScheduledValues(at);
      p.setValueAtTime(v, at);
      p.linearRampToValueAtTime(0, at + Math.max(0.01, dur));
    }
    this.stopAt = at + dur;
    for (const src of this.continuous) {
      try {
        src.stop(this.stopAt + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.doneAt = this.stopAt + 0.3;
  }

  dispose(): void {
    for (const src of this.continuous) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
    disconnectAll([...this.continuous, ...this.nodes]);
    this.chans.clear();
  }
}

// ----------------------------------------------------------- director

const CROSSFADE = 1.5;
const TICK_MS = 25;

export class MusicDirector {
  private players: MoodPlayer[] = [];
  private current: MoodPlayer | null = null;
  private mood: MusicMood | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private silent = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bus: MusicBus,
  ) {}

  getMood(): MusicMood | null {
    return this.mood;
  }

  setMood(mood: MusicMood | null): void {
    if (mood === this.mood) return;
    this.mood = mood;
    const now = this.ctx.currentTime;
    // The victory fanfare must land on its first note: it cuts in quickly
    // while the previous mood clears out a little faster than usual.
    const stinger = mood === 'victory';
    if (this.current) this.current.fadeOut(now, stinger ? 1.0 : CROSSFADE);
    this.current = null;
    if (mood) {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const fadeIn = stinger ? 0.05 : CROSSFADE;
      const p = new MoodPlayer(this.ctx, this.bus, mood, now + 0.06, seed, fadeIn);
      p.silent = this.silent;
      this.players.push(p);
      this.current = p;
    }
    this.tick();
    this.ensureTimer();
  }

  setSilent(silent: boolean): void {
    this.silent = silent;
    for (const p of this.players) p.silent = silent;
  }

  private ensureTimer(): void {
    if (this.timer !== null || this.players.length === 0) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick(): void {
    try {
      const now = this.ctx.currentTime;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const lookahead = hidden ? 1.5 : 0.2;
      for (const p of this.players) p.scheduleUntil(now, now + lookahead);
      const alive: MoodPlayer[] = [];
      for (const p of this.players) {
        if (p.doneAt < now) p.dispose();
        else alive.push(p);
      }
      this.players = alive;
    } catch {
      /* never throw from the timer */
    }
    if (this.players.length === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.players) p.dispose();
    this.players = [];
    this.current = null;
  }
}
