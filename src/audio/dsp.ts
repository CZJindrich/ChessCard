/**
 * Low-level DSP helpers shared by the SFX recipes and the music engine:
 * cached noise / Karplus-Strong / impulse-response buffers, waveshaper curves,
 * seeded randomness and pitch math. Everything works on any BaseAudioContext
 * (realtime or offline) and caches per context so buffers are built once.
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CtxCache {
  noise: Partial<Record<NoiseColor, AudioBuffer>>;
  ks: Map<number, KsEntry>;
  ir: AudioBuffer | null;
  curves: Map<string, Float32Array<ArrayBuffer>>;
  silent: AudioBuffer | null;
}

interface KsEntry {
  buffer: AudioBuffer;
  /** The frequency the buffer actually sounds at, when played at rate 1. */
  freq: number;
}

const caches = new WeakMap<BaseAudioContext, CtxCache>();

function cacheFor(ctx: BaseAudioContext): CtxCache {
  let c = caches.get(ctx);
  if (!c) {
    c = { noise: {}, ks: new Map(), ir: null, curves: new Map(), silent: null };
    caches.set(ctx, c);
  }
  return c;
}

const NOISE_SECONDS = 2;

/** 2 s mono looping noise buffer, RMS-normalised so colours have comparable loudness. */
export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor = 'white'): AudioBuffer {
  const cache = cacheFor(ctx);
  const hit = cache.noise[color];
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(color === 'white' ? 1 : color === 'pink' ? 2 : 3);
  if (color === 'white') {
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  } else if (color === 'pink') {
    // Paul Kellet's economy pink filter.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
  }
  // Remove DC and make the loop seamless (start == end) for coloured noise.
  let mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  const drift = d[len - 1] - d[0];
  let sq = 0;
  for (let i = 0; i < len; i++) {
    d[i] = d[i] - mean - (color === 'white' ? 0 : (drift * i) / (len - 1));
    sq += d[i] * d[i];
  }
  const norm = 0.3 / Math.sqrt(sq / len || 1);
  for (let i = 0; i < len; i++) d[i] = clamp(d[i] * norm, -1, 1);
  cache.noise[color] = buf;
  return buf;
}

/** A one-sample silent buffer, used to unlock audio on iOS within a gesture. */
export function silentBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cache = cacheFor(ctx);
  if (!cache.silent) cache.silent = ctx.createBuffer(1, 1, ctx.sampleRate);
  return cache.silent;
}

/**
 * Karplus-Strong plucked string, rendered once per minor-third bucket and
 * re-pitched with playbackRate (max +-1.5 semitones), so memory stays small.
 */
export function pluckBuffer(ctx: BaseAudioContext, freq: number): { buffer: AudioBuffer; rate: number } {
  const cache = cacheFor(ctx);
  const midi = 69 + 12 * Math.log2(freq / 440);
  const bucket = Math.round(midi / 3) * 3;
  let entry = cache.ks.get(bucket);
  if (!entry) {
    entry = renderKs(ctx, midiToFreq(bucket), bucket);
    cache.ks.set(bucket, entry);
  }
  return { buffer: entry.buffer, rate: freq / entry.freq };
}

function renderKs(ctx: BaseAudioContext, f: number, seed: number): KsEntry {
  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.floor(sr / f - 0.5));
  const actual = sr / (n + 0.5);
  const seconds = clamp(2.6 * Math.sqrt(196 / f), 0.7, 2.6);
  const len = Math.floor(sr * seconds);
  const t60 = clamp(seconds * 0.8, 0.6, 2.2);
  // Extra per-period loss so low strings don't ring forever.
  const stretch = Math.pow(10, -3 / (actual * t60));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const line = new Float32Array(n);
  const rnd = mulberry32(1000 + seed);
  for (let i = 0; i < n; i++) line[i] = rnd() * 2 - 1;
  // Soften the excitation (finger pluck rather than pick): two smoothing passes.
  for (let pass = 0; pass < 2; pass++) {
    let prev = line[n - 1];
    for (let i = 0; i < n; i++) {
      const cur = line[i];
      line[i] = 0.5 * (cur + prev);
      prev = cur;
    }
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += line[i];
  mean /= n;
  for (let i = 0; i < n; i++) line[i] -= mean;
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % n];
    out[i] = a;
    line[idx] = stretch * 0.5 * (a + b);
    idx = (idx + 1) % n;
    const abs = a < 0 ? -a : a;
    if (abs > peak) peak = abs;
  }
  const fade = Math.floor(len * 0.08);
  const g = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) {
    const tail = len - i < fade ? (len - i) / fade : 1;
    out[i] *= g * tail;
  }
  return { buffer: buf, freq: actual };
}

/**
 * Dark stone-hall impulse response: pre-delay, sparse early reflections, then a
 * noise tail whose damping increases over time (high frequencies die first).
 */
export function hallImpulse(ctx: BaseAudioContext, seconds = 2.8): AudioBuffer {
  const cache = cacheFor(ctx);
  if (cache.ir) return cache.ir;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(0.018 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = mulberry32(77 + ch * 13);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const p = t / seconds;
      const env = Math.exp((-6.9 * t) / (seconds * 0.85)) * (1 - p);
      const a = 0.2 + 0.72 * p; // more smoothing (darker) as the tail decays
      lp = lp * a + (rnd() * 2 - 1) * (1 - a);
      // Gentle fade-in avoids a hard onset of the diffuse tail.
      const onset = t < 0.03 ? t / 0.03 : 1;
      d[i] = lp * env * onset * (1 + a);
    }
    // Early reflections from nearby stone walls.
    for (let k = 0; k < 7; k++) {
      const at = pre + Math.floor((0.004 + rnd() * 0.07) * sr);
      if (at < len) d[at] += (rnd() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
  }
  cache.ir = buf;
  return buf;
}

/** Symmetric soft-saturation curve. amount 0..1. */
export function driveCurve(ctx: BaseAudioContext, amount: number): Float32Array<ArrayBuffer> {
  const cache = cacheFor(ctx);
  const a = clamp(Math.round(amount * 20) / 20, 0, 1);
  const key = `drive:${a}`;
  const hit = cache.curves.get(key);
  if (hit) return hit;
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + a * 12;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  cache.curves.set(key, curve);
  return curve;
}

/**
 * Master safety clipper. Expects input pre-scaled by 0.5 (so it covers +-2.0
 * of real signal): linear up to 0.75, then a tanh knee asymptotic to 0.98.
 */
export function softClipCurve(ctx: BaseAudioContext): Float32Array<ArrayBuffer> {
  const cache = cacheFor(ctx);
  const hit = cache.curves.get('softclip');
  if (hit) return hit;
  const n = 4096;
  const curve = new Float32Array(n);
  const knee = 0.75;
  const room = 0.98 - knee;
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2; // real-signal amplitude
    const a = Math.abs(u);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(u) * y;
  }
  cache.curves.set('softclip', curve);
  return curve;
}

/** Disconnects nodes, ignoring errors (already disconnected etc). */
export function disconnectAll(nodes: ReadonlyArray<AudioNode | null | undefined>): void {
  for (const n of nodes) {
    if (!n) continue;
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}
