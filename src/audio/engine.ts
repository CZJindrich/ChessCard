/**
 * The realtime engine behind the `audio` facade: lazily creates the
 * AudioContext, owns the mixer graph, rate-limits and voice-limits SFX, and
 * drives the MusicDirector. Every public method is a silent no-op when
 * WebAudio is unavailable and never throws.
 */
import { disconnectAll, noiseBuffer, silentBuffer } from './dsp';
import { createAudioGraph, type AudioGraph } from './graph';
import { MusicDirector } from './music';
import { getSettings, subscribe } from './settings';
import { sfxCatalog } from './sfxCatalog';
import type { MusicMood, PlayOptions, SfxName } from './types';
import { spawnSfx, type SfxVoice } from './voices';

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/** Hard cap on simultaneous SFX voices across all names. */
const MAX_TOTAL_VOICES = 24;
/** While a resume() is in flight, sounds are still accepted for this long. */
const RESUME_GRACE_MS = 600;

function now(): number {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

function findCtor(): AudioContextCtor | null {
  try {
    const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private graph: AudioGraph | null = null;
  private music: MusicDirector | null = null;
  private unavailable = false;
  private desiredMood: MusicMood | null = null;
  private resumeUntil = 0;
  private readonly lastPlayed = new Map<SfxName, number>();
  private readonly voices = new Map<SfxName, SfxVoice[]>();
  private gestureCleanup: (() => void) | null = null;

  constructor() {
    subscribe(() => this.applySettings());
  }

  // ---------------------------------------------------------- lifecycle

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx.state === 'closed' ? null : this.ctx;
    if (this.unavailable) return null;
    const Ctor = findCtor();
    if (!Ctor) {
      this.unavailable = true;
      return null;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      try {
        ctx = new Ctor();
      } catch {
        this.unavailable = true;
        return null;
      }
    }
    try {
      this.graph = createAudioGraph(ctx, getSettings());
      this.music = new MusicDirector(ctx, { dry: this.graph.musicDry, wet: this.graph.musicWet });
    } catch {
      this.unavailable = true;
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
      this.graph = null;
      this.music = null;
      return null;
    }
    this.ctx = ctx;
    this.applySettings();
    this.installGestureUnlock();
    try {
      // Build shared buffers now so the first sound doesn't hitch.
      noiseBuffer(ctx, 'white');
      noiseBuffer(ctx, 'pink');
      noiseBuffer(ctx, 'brown');
    } catch {
      /* ignore */
    }
    try {
      ctx.addEventListener('statechange', () => {
        const state = ctx.state as string;
        if (state === 'running') this.removeGestureUnlock();
        // OS interruptions (calls, iOS backgrounding) suspend us again.
        else if (state === 'suspended' || state === 'interrupted') this.installGestureUnlock();
      });
    } catch {
      /* ignore */
    }
    if (this.desiredMood) this.music.setMood(this.desiredMood);
    return ctx;
  }

  /** Browsers only allow audio after a gesture; resume on the first one we see. */
  private installGestureUnlock(): void {
    if (this.gestureCleanup || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const handler = (): void => this.unlock();
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    for (const e of events) window.addEventListener(e, handler, { capture: true, passive: true });
    this.gestureCleanup = () => {
      for (const e of events) window.removeEventListener(e, handler, { capture: true });
    };
  }

  private removeGestureUnlock(): void {
    this.gestureCleanup?.();
    this.gestureCleanup = null;
  }

  private applySettings(): void {
    const s = getSettings();
    try {
      this.graph?.apply(s, 0.06);
      this.music?.setSilent(s.muted || s.master <= 0 || s.music <= 0);
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- API

  unlock(): void {
    try {
      const ctx = this.ensure();
      if (!ctx) return;
      const state = ctx.state as string;
      if (state === 'suspended' || state === 'interrupted') {
        this.resumeUntil = now() + RESUME_GRACE_MS;
        // iOS: starting a buffer inside the gesture unlocks output.
        try {
          const src = ctx.createBufferSource();
          src.buffer = silentBuffer(ctx);
          src.connect(ctx.destination);
          src.onended = () => disconnectAll([src]);
          src.start(0);
        } catch {
          /* ignore */
        }
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(
            () => this.removeGestureUnlock(),
            () => undefined,
          );
        }
      } else if (state === 'running') {
        this.removeGestureUnlock();
      }
    } catch {
      /* never throw */
    }
  }

  play(name: SfxName, opts?: PlayOptions): void {
    try {
      const def = sfxCatalog[name];
      if (!def) return;
      const settings = getSettings();
      if (settings.muted || settings.master <= 0 || settings.sfx <= 0) return;
      if (opts && typeof opts.volume === 'number' && opts.volume <= 0) return;
      const ctx = this.ensure();
      const graph = this.graph;
      if (!ctx || !graph) return;
      const ms = now();
      // A suspended context would queue sounds and blast them on resume: drop
      // them, except right after unlock() while resume() is in flight.
      if (ctx.state !== 'running' && !(ms < this.resumeUntil)) return;

      const last = this.lastPlayed.get(name);
      if (last !== undefined && ms - last < def.minIntervalMs) return;
      this.lastPlayed.set(name, ms);

      const t = ctx.currentTime;
      this.pruneVoices(t);
      const list = this.voices.get(name) ?? [];
      while (list.length >= def.maxVoices) {
        const oldest = list.shift();
        if (oldest) this.stealVoice(oldest, t);
      }
      if (this.totalVoices() >= MAX_TOTAL_VOICES) this.stealOldestOverall(t);

      const voice = spawnSfx(ctx, { dry: graph.sfxDry, wet: graph.sfxWet }, name, t + 0.005, opts ?? {});
      list.push(voice);
      this.voices.set(name, list);
      // Disconnect the voice strip once it (and its reverb send) is done.
      const ttl = (voice.end - t) * 1000 + 250;
      setTimeout(() => this.releaseVoice(voice), ttl);
    } catch {
      /* never throw from play() */
    }
  }

  setMusic(mood: MusicMood | null): void {
    try {
      this.desiredMood = mood;
      // Don't create a context just for music; it starts on unlock()/play().
      if (this.ctx && this.music) this.music.setMood(mood);
    } catch {
      /* ignore */
    }
  }

  getMusic(): MusicMood | null {
    return this.desiredMood;
  }

  // ------------------------------------------------------------- voices

  private totalVoices(): number {
    let n = 0;
    for (const l of this.voices.values()) n += l.length;
    return n;
  }

  private pruneVoices(t: number): void {
    for (const [name, list] of this.voices) {
      const alive = list.filter((v) => v.end > t);
      if (alive.length) this.voices.set(name, alive);
      else this.voices.delete(name);
    }
  }

  private stealOldestOverall(t: number): void {
    let oldest: SfxVoice | null = null;
    for (const l of this.voices.values()) {
      for (const v of l) if (!oldest || v.start < oldest.start) oldest = v;
    }
    if (!oldest) return;
    const list = this.voices.get(oldest.name);
    if (list) {
      const i = list.indexOf(oldest);
      if (i >= 0) list.splice(i, 1);
    }
    this.stealVoice(oldest, t);
  }

  /** Quick fade instead of a hard cut, then disconnect. */
  private stealVoice(v: SfxVoice, t: number): void {
    try {
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.04);
    } catch {
      /* ignore */
    }
    v.end = Math.min(v.end, t + 0.05);
    setTimeout(() => disconnectAll(v.nodes), 120);
  }

  private releaseVoice(v: SfxVoice): void {
    disconnectAll(v.nodes);
    const list = this.voices.get(v.name);
    if (!list) return;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.voices.delete(v.name);
  }
}
