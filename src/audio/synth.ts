/**
 * Synth: a tiny scheduling toolkit over the WebAudio graph.
 *
 * A Synth is bound to (context, output node, start time, pitch). Every method
 * takes times *relative* to that start (`at`) in natural units; the synth
 * applies the pitch multiplier like a playback rate (frequencies x pitch,
 * durations / pitch). Every node it creates is started, stopped and
 * disconnected automatically, so callers never leak nodes.
 *
 * The music engine uses Synth with t0 = 0 and pitch = 1, i.e. `at` is an
 * absolute AudioContext time.
 */
import { clamp, disconnectAll, driveCurve, noiseBuffer, pluckBuffer, type NoiseColor } from './dsp';

export type Vowel = 'ah' | 'oh' | 'oo' | 'eh' | 'ee';

/** Bass/tenor formants (Hz) and relative gains. */
const FORMANTS: Record<Vowel, ReadonlyArray<readonly [number, number]>> = {
  ah: [[650, 1], [1080, 0.55], [2650, 0.18]],
  oh: [[420, 1], [800, 0.5], [2600, 0.12]],
  oo: [[330, 1], [720, 0.35], [2500, 0.08]],
  eh: [[420, 1], [1700, 0.45], [2600, 0.16]],
  ee: [[300, 1], [1950, 0.3], [2800, 0.14]],
};

export interface EnvSpec {
  /** Start offset (s) relative to the synth's t0. */
  at?: number;
  attack?: number;
  hold?: number;
  /** Time (s) to fall from peak to silence (-80 dB). */
  decay: number;
  /** Peak linear gain. */
  gain?: number;
}

export interface FilterSpec {
  type?: BiquadFilterType;
  freq: number;
  /** Exponential sweep target. */
  to?: number;
  /** Sweep time (default: whole sound). */
  time?: number;
  q?: number;
}

export interface ToneSpec extends EnvSpec {
  type?: OscillatorType;
  freq: number;
  /** Exponential pitch glide target. */
  to?: number;
  /** Glide time (default: whole sound). */
  glide?: number;
  detune?: number;
  /** Number of detuned oscillators (default 1). */
  unison?: number;
  /** Total detune spread across unison voices in cents (default 14). */
  spread?: number;
  /** Vibrato depth in cents. */
  vibrato?: number;
  vibratoRate?: number;
  filter?: FilterSpec;
  /** Saturation amount 0..1. */
  drive?: number;
  pan?: number;
  /** Amplitude modulation: rate (Hz) and depth 0..1. */
  tremolo?: { rate: number; depth: number };
}

export interface NoiseSpec extends EnvSpec {
  color?: NoiseColor;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  pan?: number;
  rate?: number;
  tremolo?: { rate: number; depth: number };
}

export interface FmSpec extends EnvSpec {
  freq: number;
  /** Modulator frequency ratio. Non-integer ratios give metallic/bell tones. */
  ratio: number;
  /** Modulation index at the start. */
  index: number;
  /** Modulation index at the end of `indexDecay`. */
  indexEnd?: number;
  indexDecay?: number;
  to?: number;
  glide?: number;
  pan?: number;
  filter?: FilterSpec;
}

export interface BellSpec {
  at?: number;
  decay?: number;
  gain?: number;
  /** 0..1 upper-partial emphasis. */
  bright?: number;
  kind?: 'church' | 'glass' | 'bar';
  /** Strike transient level 0..1. */
  strike?: number;
  pan?: number;
}

export interface PluckSpec {
  at?: number;
  gain?: number;
  /** 0..1 tone brightness. */
  bright?: number;
  /** Optional max length (s); fades out at the end. */
  dur?: number;
  pan?: number;
}

export interface PadSpec {
  at?: number;
  dur: number;
  attack?: number;
  release?: number;
  gain?: number;
  vowel?: Vowel;
  /** 0..1, adds unfiltered body / air. */
  bright?: number;
  /** Detune between the two saws of each note (cents). */
  detune?: number;
  vibrato?: number;
  /** Vowel to morph into over the note. */
  morph?: Vowel;
  pan?: number;
}

export interface BrassSpec {
  at?: number;
  dur: number;
  attack?: number;
  release?: number;
  gain?: number;
  /** 0..1 filter opening. */
  bright?: number;
  detune?: number;
  /** Pitch scoop into the note (cents below). */
  scoop?: number;
  pan?: number;
}

export interface DrumSpec {
  at?: number;
  gain?: number;
  decay?: number;
  /** Skin / stick noise level 0..1. */
  snap?: number;
  /** Inharmonic overtone level 0..1. */
  tone?: number;
  /** Pitch bend depth (start = freq * bend). */
  bend?: number;
  drive?: number;
  pan?: number;
}

export interface TicksSpec {
  at?: number;
  count: number;
  /** Total time span of the ticks. */
  span: number;
  /** >1 = decelerating (spacing grows), <1 = accelerating. */
  curve?: number;
  freq: number;
  /** Random +- fraction applied to each tick's filter frequency. */
  freqVar?: number;
  q?: number;
  gain?: number;
  /** Gain per tick multiplier along the series (end/start). */
  fade?: number;
  decay?: number;
  jitter?: number;
  color?: NoiseColor;
  pan?: number;
}

export interface WhooshSpec {
  at?: number;
  dur: number;
  from: number;
  to: number;
  q?: number;
  gain?: number;
  /** Fraction of `dur` used for the swell (default 0.45). */
  peak?: number;
  color?: NoiseColor;
  pan?: number;
}

const SILENCE = 1e-5;

/** Shared by a Synth and the synths derived from it (`to`, `after`). */
export interface SynthTracker {
  /** Latest scheduled stop time of any source created so far. */
  end: number;
}

/**
 * Evaluate a param once per 128-frame block instead of per sample. Slow LFOs
 * and filter sweeps sound identical, but oscillators/biquads with modulated
 * params get far cheaper (no per-sample pow()/coefficient math). Browsers that
 * lack `automationRate` simply ignore it.
 */
export function kRate(p: AudioParam): void {
  try {
    p.automationRate = 'k-rate';
  } catch {
    /* not changeable on this param / unsupported */
  }
}

export class Synth {
  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly t0: number,
    readonly pitch: number = 1,
    readonly rng: () => number = Math.random,
    readonly tracker: SynthTracker = { end: 0 },
  ) {}

  /** Absolute time for a relative offset. */
  time(at = 0): number {
    return this.t0 + at / this.pitch;
  }

  dur(d: number): number {
    return d / this.pitch;
  }

  hz(f: number): number {
    return clamp(f * this.pitch, 10, this.ctx.sampleRate * 0.45);
  }

  /** Same timing/pitch, different destination. */
  to(out: AudioNode): Synth {
    return new Synth(this.ctx, out, this.t0, this.pitch, this.rng, this.tracker);
  }

  /** Synth whose t0 is shifted by `at` (relative). */
  after(at: number): Synth {
    return new Synth(this.ctx, this.out, this.time(at), this.pitch, this.rng, this.tracker);
  }

  rand(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rng();
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length) % items.length];
  }

  // ---------------------------------------------------------------- helpers

  /** Stops a source and records the time so callers know when all is silent. */
  private halt(src: AudioScheduledSourceNode, at: number): void {
    src.stop(at);
    if (at > this.tracker.end) this.tracker.end = at;
  }

  private envelope(spec: EnvSpec, peak: number): { g: GainNode; start: number; end: number } {
    const g = this.ctx.createGain();
    // Intrinsic value 0: a GainNode defaults to 1 until its first event, which
    // would leak a full-scale click if a source starts a frame early.
    g.gain.value = 0;
    const start = this.time(spec.at ?? 0);
    const a = Math.max(0.001, this.dur(spec.attack ?? 0.003));
    const h = Math.max(0, this.dur(spec.hold ?? 0));
    const d = Math.max(0.005, this.dur(spec.decay));
    const p = g.gain;
    p.setValueAtTime(0, start);
    p.linearRampToValueAtTime(peak, start + a);
    if (h > 0) p.setValueAtTime(peak, start + a + h);
    const end = start + a + h + d;
    p.exponentialRampToValueAtTime(Math.max(SILENCE, peak * 1e-4), end);
    p.setValueAtTime(0, end + 0.002);
    return { g, start, end: end + 0.005 };
  }

  private makeFilter(spec: FilterSpec, start: number, end: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = spec.type ?? 'lowpass';
    f.Q.value = spec.q ?? (f.type === 'bandpass' ? 1.5 : 0.7);
    const from = this.hz(spec.freq);
    f.frequency.setValueAtTime(from, start);
    if (spec.to !== undefined) {
      kRate(f.frequency);
      const sweepEnd = spec.time !== undefined ? start + this.dur(spec.time) : end;
      f.frequency.exponentialRampToValueAtTime(this.hz(spec.to), Math.max(start + 0.001, sweepEnd));
    }
    return f;
  }

  /** Optional panner node; returns null when pan is ~0 or unsupported. */
  private panner(pan: number | undefined): StereoPannerNode | null {
    if (!pan || Math.abs(pan) < 0.01) return null;
    const ctx = this.ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
    if (typeof ctx.createStereoPanner !== 'function') return null;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  /** Connects `g -> [panner] -> out`, returns nodes created. */
  private output(g: AudioNode, pan?: number): AudioNode[] {
    const p = this.panner(pan);
    if (p) {
      g.connect(p);
      p.connect(this.out);
      return [g, p];
    }
    g.connect(this.out);
    return [g];
  }

  private tremolo(
    input: AudioNode,
    spec: { rate: number; depth: number } | undefined,
    start: number,
    stop: number,
    keep: AudioNode[],
    sources: AudioScheduledSourceNode[],
  ): AudioNode {
    if (!spec || spec.depth <= 0) return input;
    const depth = clamp(spec.depth, 0, 1);
    const tg = this.ctx.createGain();
    tg.gain.value = 1 - depth / 2;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = spec.rate;
    const lg = this.ctx.createGain();
    lg.gain.value = depth / 2;
    lfo.connect(lg);
    lg.connect(tg.gain);
    lfo.start(start);
    this.halt(lfo, stop);
    tg.connect(input);
    keep.push(tg, lg);
    sources.push(lfo);
    return tg;
  }

  private cleanup(sources: AudioScheduledSourceNode[], nodes: AudioNode[]): void {
    if (sources.length === 0) return;
    const all: AudioNode[] = [...sources, ...nodes];
    let remaining = sources.length;
    const done = (): void => {
      remaining--;
      if (remaining <= 0) disconnectAll(all);
    };
    for (const s of sources) s.onended = done;
  }

  // ------------------------------------------------------------ primitives

  /** Oscillator tone with envelope, glide, unison, vibrato, filter, drive. */
  tone(spec: ToneSpec): number {
    const n = Math.max(1, Math.floor(spec.unison ?? 1));
    const peak = (spec.gain ?? 0.3) / Math.sqrt(n);
    if (peak <= 0) return this.time(spec.at ?? 0);
    const ctx = this.ctx;
    const { g, start, end } = this.envelope(spec, peak);
    const stop = end + 0.02;
    const nodes = this.output(g, spec.pan);
    const sources: AudioScheduledSourceNode[] = [];
    let input: AudioNode = g;
    if (spec.filter) {
      const f = this.makeFilter(spec.filter, start, end);
      f.connect(input);
      input = f;
      nodes.push(f);
    }
    input = this.tremolo(input, spec.tremolo, start, stop, nodes, sources);
    if (spec.drive && spec.drive > 0) {
      const w = ctx.createWaveShaper();
      w.curve = driveCurve(ctx, spec.drive);
      w.connect(input);
      input = w;
      nodes.push(w);
    }
    let vib: GainNode | null = null;
    if (spec.vibrato && spec.vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.vibratoRate ?? 5;
      vib = ctx.createGain();
      vib.gain.value = spec.vibrato;
      lfo.connect(vib);
      lfo.start(start);
      this.halt(lfo, stop);
      sources.push(lfo);
      nodes.push(vib);
    }
    const f0 = this.hz(spec.freq);
    const glideEnd = spec.glide !== undefined ? start + Math.max(0.001, this.dur(spec.glide)) : end;
    const spread = spec.spread ?? 14;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = spec.type ?? 'sine';
      o.frequency.setValueAtTime(f0, start);
      if (spec.to !== undefined) o.frequency.exponentialRampToValueAtTime(this.hz(spec.to), glideEnd);
      o.detune.value = (spec.detune ?? 0) + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      if (vib) {
        kRate(o.detune);
        if (spec.to === undefined) kRate(o.frequency);
        vib.connect(o.detune);
      }
      o.connect(input);
      o.start(start);
      this.halt(o, stop);
      sources.push(o);
    }
    this.cleanup(sources, nodes);
    return end;
  }

  /** Filtered noise burst with envelope. */
  noise(spec: NoiseSpec): number {
    const peak = spec.gain ?? 0.3;
    if (peak <= 0) return this.time(spec.at ?? 0);
    const ctx = this.ctx;
    const { g, start, end } = this.envelope(spec, peak);
    const stop = end + 0.02;
    const nodes = this.output(g, spec.pan);
    const sources: AudioScheduledSourceNode[] = [];
    let input: AudioNode = g;
    input = this.tremolo(input, spec.tremolo, start, stop, nodes, sources);
    for (const fs of [spec.filter2, spec.filter]) {
      if (!fs) continue;
      const f = this.makeFilter(fs, start, end);
      f.connect(input);
      input = f;
      nodes.push(f);
    }
    const src = ctx.createBufferSource();
    const buf = noiseBuffer(ctx, spec.color ?? 'white');
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = spec.rate ?? 1;
    src.connect(input);
    src.start(start, this.rng() * buf.duration * 0.9);
    this.halt(src, stop);
    sources.push(src);
    this.cleanup(sources, nodes);
    return end;
  }

  /** Two-operator FM voice: bells, metal, glassy sparkles, zaps. */
  fm(spec: FmSpec): number {
    const peak = spec.gain ?? 0.3;
    if (peak <= 0) return this.time(spec.at ?? 0);
    const ctx = this.ctx;
    const { g, start, end } = this.envelope(spec, peak);
    const stop = end + 0.02;
    const nodes = this.output(g, spec.pan);
    let input: AudioNode = g;
    if (spec.filter) {
      const f = this.makeFilter(spec.filter, start, end);
      f.connect(input);
      input = f;
      nodes.push(f);
    }
    const fc = this.hz(spec.freq);
    const fmod = fc * spec.ratio;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.setValueAtTime(fc, start);
    mod.frequency.setValueAtTime(fmod, start);
    if (spec.to !== undefined) {
      const ge = spec.glide !== undefined ? start + Math.max(0.001, this.dur(spec.glide)) : end;
      car.frequency.exponentialRampToValueAtTime(this.hz(spec.to), ge);
      mod.frequency.exponentialRampToValueAtTime(this.hz(spec.to) * spec.ratio, ge);
    }
    const i0 = Math.max(0.01, spec.index * fmod);
    const i1 = Math.max(0.01, (spec.indexEnd ?? spec.index * 0.05) * fmod);
    const idEnd = start + Math.max(0.005, this.dur(spec.indexDecay ?? spec.decay * 0.5));
    mg.gain.setValueAtTime(i0, start);
    mg.gain.exponentialRampToValueAtTime(i1, Math.min(idEnd, end));
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(input);
    car.start(start);
    mod.start(start);
    this.halt(car, stop);
    this.halt(mod, stop);
    nodes.push(mg);
    this.cleanup([car, mod], nodes);
    return end;
  }

  // ----------------------------------------------------------- instruments

  /** Additive bell: inharmonic partials, each with its own decay. */
  bell(freq: number, spec: BellSpec = {}): number {
    const kind = spec.kind ?? 'church';
    const partials: ReadonlyArray<readonly [number, number]> =
      kind === 'church'
        ? [[0.5, 0.45], [1, 1], [1.19, 0.5], [1.5, 0.3], [2, 0.42], [2.74, 0.16]]
        : kind === 'glass'
          ? [[1, 1], [2.32, 0.45], [4.25, 0.25], [6.63, 0.12]]
          : [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.93, 0.07]];
    const gain = spec.gain ?? 0.2;
    const decay = spec.decay ?? 3;
    const bright = spec.bright ?? 0.5;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    const start = this.time(spec.at ?? 0);
    const nodes = this.output(bus, spec.pan);
    const sources: AudioScheduledSourceNode[] = [];
    let total = 0;
    for (const [, amp] of partials) total += amp;
    bus.gain.value = gain / (total * 0.55);
    let end = start;
    const nyq = ctx.sampleRate * 0.45;
    for (const [ratio, amp] of partials) {
      const f = this.hz(freq * ratio);
      if (f >= nyq) continue;
      const a = amp * (ratio > 1.6 ? 0.4 + bright : 1);
      const pd = this.dur(decay * (ratio < 0.75 ? 1.25 : Math.pow(ratio, -0.6)));
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      o.frequency.value = f;
      o.detune.value = (this.rng() - 0.5) * 4;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(a, start + 0.002 + 0.004 / ratio);
      g.gain.exponentialRampToValueAtTime(Math.max(SILENCE, a * 1e-4), start + pd);
      g.gain.setValueAtTime(0, start + pd + 0.002);
      o.connect(g);
      g.connect(bus);
      o.start(start);
      this.halt(o, start + pd + 0.02);
      sources.push(o);
      nodes.push(g);
      end = Math.max(end, start + pd + 0.02);
    }
    this.cleanup(sources, nodes);
    const strike = spec.strike ?? 0.3;
    if (strike > 0) {
      this.noise({
        at: spec.at,
        attack: 0.001,
        decay: 0.04,
        gain: gain * strike,
        color: 'white',
        filter: { type: 'bandpass', freq: Math.min(freq * 3, 9000), q: 1.2 },
        pan: spec.pan,
      });
    }
    return end;
  }

  /** Two-op FM chime: lighter and cheaper than `bell`. */
  chime(freq: number, spec: { at?: number; decay?: number; gain?: number; ratio?: number; index?: number; pan?: number } = {}): number {
    return this.fm({
      at: spec.at,
      freq,
      ratio: spec.ratio ?? 3.5,
      index: spec.index ?? 1.6,
      indexEnd: 0.05,
      indexDecay: (spec.decay ?? 1.2) * 0.35,
      attack: 0.002,
      decay: spec.decay ?? 1.2,
      gain: spec.gain ?? 0.15,
      pan: spec.pan,
    });
  }

  /** Karplus-Strong harp / lute pluck. */
  pluck(freq: number, spec: PluckSpec = {}): number {
    const ctx = this.ctx;
    const f = this.hz(freq);
    const { buffer, rate } = pluckBuffer(ctx, f);
    const start = this.time(spec.at ?? 0);
    const natural = buffer.duration / rate;
    const len = spec.dur !== undefined ? Math.min(natural, this.dur(spec.dur)) : natural;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = clamp(f * (1.5 + (spec.bright ?? 0.5) * 8), 200, ctx.sampleRate * 0.45);
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    const gain = spec.gain ?? 0.2;
    g.gain.setValueAtTime(gain, start);
    g.gain.setValueAtTime(gain, start + Math.max(0.01, len - 0.08));
    g.gain.linearRampToValueAtTime(0, start + len);
    src.connect(lp);
    lp.connect(g);
    const nodes = [lp, ...this.output(g, spec.pan)];
    src.start(start);
    this.halt(src, start + len + 0.01);
    this.cleanup([src], nodes);
    return start + len;
  }

  /**
   * Choir-like pad: two detuned saws + a triangle per note, through a vowel
   * formant bank (parallel bandpasses) plus a little low body.
   */
  pad(freqs: readonly number[], spec: PadSpec): number {
    const ctx = this.ctx;
    const start = this.time(spec.at ?? 0);
    const attack = Math.max(0.01, this.dur(spec.attack ?? 1));
    const release = Math.max(0.05, this.dur(spec.release ?? 1.5));
    const hold = Math.max(attack, this.dur(spec.dur));
    const end = start + hold + release;
    const stop = end + 0.02;
    const gain = spec.gain ?? 0.1;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.setValueAtTime(gain, start + hold);
    env.gain.exponentialRampToValueAtTime(Math.max(SILENCE, gain * 1e-4), end);
    env.gain.setValueAtTime(0, end + 0.002);
    const nodes: AudioNode[] = this.output(env, spec.pan);
    const sources: AudioScheduledSourceNode[] = [];
    const mix = ctx.createGain();
    const voices = freqs.length * 3;
    mix.gain.value = 1 / Math.sqrt(voices);
    nodes.push(mix);
    // Formant bank.
    const vowel = FORMANTS[spec.vowel ?? 'ah'];
    const morph = spec.morph ? FORMANTS[spec.morph] : null;
    vowel.forEach(([fq, amp], i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      kRate(bp.frequency);
      bp.frequency.setValueAtTime(fq, start);
      if (morph) bp.frequency.linearRampToValueAtTime(morph[i][0], start + hold);
      bp.Q.value = 4 + i * 2;
      const fg = ctx.createGain();
      fg.gain.value = amp * (3.2 + i * 1.5);
      mix.connect(bp);
      bp.connect(fg);
      fg.connect(env);
      nodes.push(bp, fg);
    });
    // Body + air.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 380 + (spec.bright ?? 0.3) * 1600;
    body.Q.value = 0.5;
    const bg = ctx.createGain();
    bg.gain.value = 0.35 + (spec.bright ?? 0.3) * 0.25;
    mix.connect(body);
    body.connect(bg);
    bg.connect(env);
    nodes.push(body, bg);
    // Shared slow vibrato (choirs drift, they never sit perfectly still).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6 + this.rng() * 0.8;
    const vib = ctx.createGain();
    vib.gain.value = spec.vibrato ?? 6;
    lfo.connect(vib);
    lfo.start(start);
    this.halt(lfo, stop);
    sources.push(lfo);
    nodes.push(vib);
    const det = spec.detune ?? 9;
    for (const fr of freqs) {
      const f = this.hz(fr);
      for (let k = 0; k < 3; k++) {
        const o = ctx.createOscillator();
        o.type = k === 2 ? 'triangle' : 'sawtooth';
        kRate(o.frequency);
        kRate(o.detune);
        o.frequency.value = f;
        o.detune.value = k === 0 ? -det : k === 1 ? det : (this.rng() - 0.5) * 4;
        vib.connect(o.detune);
        o.connect(mix);
        o.start(start);
        this.halt(o, stop);
        sources.push(o);
      }
    }
    this.cleanup(sources, nodes);
    return end;
  }

  /** Synth brass: detuned saws through an enveloped resonant lowpass. */
  brass(freqs: readonly number[], spec: BrassSpec): number {
    const ctx = this.ctx;
    const start = this.time(spec.at ?? 0);
    const attack = Math.max(0.005, this.dur(spec.attack ?? 0.06));
    const release = Math.max(0.03, this.dur(spec.release ?? 0.25));
    const hold = Math.max(attack, this.dur(spec.dur));
    const end = start + hold + release;
    const stop = end + 0.02;
    const gain = spec.gain ?? 0.12;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.setTargetAtTime(gain * 0.78, start + attack, Math.max(0.02, hold * 0.3));
    env.gain.setValueAtTime(gain * 0.8, start + hold);
    env.gain.exponentialRampToValueAtTime(Math.max(SILENCE, gain * 1e-4), end);
    env.gain.setValueAtTime(0, end + 0.002);
    const nodes: AudioNode[] = this.output(env, spec.pan);
    const sources: AudioScheduledSourceNode[] = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.6;
    kRate(lp.frequency);
    const fs = freqs.map((f) => this.hz(f));
    const lo = Math.min(...fs);
    const bright = clamp(spec.bright ?? 0.5, 0, 1);
    const open = clamp(lo * (2.5 + bright * 7), 300, 9000);
    lp.frequency.setValueAtTime(clamp(lo * 1.2, 80, 4000), start);
    lp.frequency.exponentialRampToValueAtTime(open, start + attack * 1.2);
    lp.frequency.exponentialRampToValueAtTime(Math.max(lo * 1.5, open * 0.55), start + hold);
    lp.frequency.exponentialRampToValueAtTime(clamp(lo * 1.1, 60, 4000), end);
    lp.connect(env);
    const mix = ctx.createGain();
    mix.gain.value = 1 / Math.sqrt(fs.length * 2);
    mix.connect(lp);
    nodes.push(lp, mix);
    const det = spec.detune ?? 7;
    const scoop = spec.scoop ?? 30;
    for (const f of fs) {
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        kRate(o.frequency);
        kRate(o.detune);
        o.frequency.value = f;
        const d = k === 0 ? -det : det;
        o.detune.setValueAtTime(d - scoop, start);
        o.detune.linearRampToValueAtTime(d, start + Math.min(0.09, hold));
        o.connect(mix);
        o.start(start);
        this.halt(o, stop);
        sources.push(o);
      }
    }
    this.cleanup(sources, nodes);
    return end;
  }

  /** War drum / tom / timpani-ish membrane. */
  drum(freq: number, spec: DrumSpec = {}): number {
    const gain = spec.gain ?? 0.4;
    const decay = spec.decay ?? 0.5;
    const bend = spec.bend ?? 2.2;
    const end = this.tone({
      at: spec.at,
      type: 'sine',
      freq: freq * bend,
      to: freq,
      glide: Math.min(0.05, decay * 0.3),
      attack: 0.002,
      decay,
      gain,
      drive: spec.drive,
      pan: spec.pan,
    });
    // Body falls slightly flat as it decays.
    if ((spec.tone ?? 0.3) > 0) {
      this.tone({
        at: spec.at,
        type: 'triangle',
        freq: freq * 1.58,
        to: freq * 1.4,
        attack: 0.002,
        decay: decay * 0.35,
        gain: gain * (spec.tone ?? 0.3) * 0.5,
        pan: spec.pan,
      });
    }
    const snap = spec.snap ?? 0.4;
    if (snap > 0) {
      this.noise({
        at: spec.at,
        attack: 0.001,
        decay: 0.03 + decay * 0.08,
        gain: gain * snap * 0.6,
        color: 'pink',
        filter: { type: 'lowpass', freq: clamp(freq * 18, 900, 5000), q: 0.8 },
        pan: spec.pan,
      });
    }
    return end;
  }

  /**
   * A series of short clicks sharing one noise source, filter and gain node
   * (dice rattles, shuffles, crackles, debris) - cheap even for many ticks.
   */
  ticks(spec: TicksSpec): number {
    const ctx = this.ctx;
    const count = Math.max(1, Math.floor(spec.count));
    const startRel = spec.at ?? 0;
    const g = ctx.createGain();
    g.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = spec.q ?? 2;
    const nodes = [bp, ...this.output(g, spec.pan)];
    bp.connect(g);
    const decay = Math.max(0.003, this.dur(spec.decay ?? 0.02));
    const gain = spec.gain ?? 0.2;
    const fade = spec.fade ?? 1;
    const curve = spec.curve ?? 1;
    const jitter = spec.jitter ?? 0.15;
    const span = spec.span;
    g.gain.setValueAtTime(0, this.time(startRel));
    let prevEnd = this.time(startRel);
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1);
      const slot = span / count;
      let tt = this.time(startRel + Math.pow(u, curve) * span + (this.rng() - 0.5) * slot * jitter);
      if (tt < prevEnd + 0.002) tt = prevEnd + 0.002;
      const amp = gain * (1 + (fade - 1) * u) * (0.6 + 0.4 * this.rng());
      const f = this.hz(spec.freq * (1 + ((this.rng() - 0.5) * 2 * (spec.freqVar ?? 0.2))));
      bp.frequency.setValueAtTime(f, tt);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(amp, tt + 0.001);
      g.gain.exponentialRampToValueAtTime(Math.max(SILENCE, amp * 1e-3), tt + decay);
      g.gain.setValueAtTime(0, tt + decay + 0.001);
      prevEnd = tt + decay + 0.001;
    }
    const src = ctx.createBufferSource();
    const buf = noiseBuffer(ctx, spec.color ?? 'white');
    src.buffer = buf;
    src.loop = true;
    src.connect(bp);
    const start = this.time(startRel);
    src.start(start, this.rng() * buf.duration * 0.9);
    this.halt(src, prevEnd + 0.02);
    this.cleanup([src], nodes);
    return prevEnd;
  }

  /** Bandpass-swept noise swell. */
  whoosh(spec: WhooshSpec): number {
    const peak = clamp(spec.peak ?? 0.45, 0.05, 0.95);
    return this.noise({
      at: spec.at,
      attack: spec.dur * peak,
      decay: spec.dur * (1 - peak),
      gain: spec.gain ?? 0.2,
      color: spec.color ?? 'pink',
      filter: { type: 'bandpass', freq: spec.from, to: spec.to, q: spec.q ?? 1.4, time: spec.dur },
      pan: spec.pan,
    });
  }
}
