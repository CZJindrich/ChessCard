import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicMood, SfxName } from '../../src/audio';

/* ------------------------------------------------------------------------
 * A tiny validating WebAudio mock. It never throws; instead it records
 * anything a real browser would reject (non-finite values, exponential ramps
 * to 0, negative times...) so tests can assert the list is empty.
 * ---------------------------------------------------------------------- */

const issues: string[] = [];
const note = (msg: string): void => {
  if (issues.length < 50) issues.push(msg);
};

class MockParam {
  constructor(
    public value = 0,
    private readonly label = 'param',
  ) {}
  private check(v: number, t: number, what: string): void {
    if (!Number.isFinite(v)) note(`${this.label}.${what}: non-finite value ${v}`);
    if (!Number.isFinite(t) || t < 0) note(`${this.label}.${what}: bad time ${t}`);
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v, t, 'setValueAtTime');
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v, t, 'linearRamp');
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check(v, t, 'expRamp');
    if (v === 0) note(`${this.label}.expRamp to 0`);
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.check(v, t, 'setTarget');
    if (!(tc >= 0)) note(`${this.label}.setTarget bad timeConstant ${tc}`);
    return this;
  }
  cancelScheduledValues(t: number): this {
    if (!Number.isFinite(t)) note(`${this.label}.cancel bad time`);
    return this;
  }
}

class MockNode {
  connections = 0;
  constructor(readonly ctx: MockContext) {}
  connect<T>(dest: T): T {
    if (!dest) note('connect to nothing');
    this.connections++;
    return dest;
  }
  disconnect(): void {
    this.connections = 0;
  }
}

class MockSource extends MockNode {
  started = false;
  stopAt: number | null = null;
  startAt = 0;
  onended: (() => void) | null = null;
  start(t = 0): void {
    if (!Number.isFinite(t) || t < 0) note(`start bad time ${t}`);
    if (this.started) note('start called twice');
    this.started = true;
    this.startAt = t;
    this.ctx.sources.push(this);
  }
  stop(t = 0): void {
    if (!this.started) note('stop before start');
    if (!Number.isFinite(t)) note(`stop bad time ${t}`);
    this.stopAt = t;
  }
}

class MockOsc extends MockSource {
  type = 'sine';
  frequency = new MockParam(440, 'osc.frequency');
  detune = new MockParam(0, 'osc.detune');
}

class MockBufferSource extends MockSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new MockParam(1, 'buffer.playbackRate');
}

class MockBuffer {
  private readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    return this.data[i];
  }
}

class MockContext {
  sampleRate = 48000;
  currentTime = 0;
  state: string = 'suspended';
  sources: MockSource[] = [];
  destination = new MockNode(this);
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  addEventListener(): void {}
  createGain() {
    return Object.assign(new MockNode(this), { gain: new MockParam(1, 'gain') });
  }
  createOscillator() {
    return new MockOsc(this);
  }
  createBufferSource() {
    return new MockBufferSource(this);
  }
  createBiquadFilter() {
    return Object.assign(new MockNode(this), {
      type: 'lowpass',
      frequency: new MockParam(350, 'filter.frequency'),
      Q: new MockParam(1, 'filter.Q'),
      gain: new MockParam(0, 'filter.gain'),
    });
  }
  createWaveShaper() {
    return Object.assign(new MockNode(this), { curve: null as unknown, oversample: 'none' });
  }
  createStereoPanner() {
    return Object.assign(new MockNode(this), { pan: new MockParam(0, 'pan') });
  }
  createConvolver() {
    return Object.assign(new MockNode(this), { buffer: null as unknown, normalize: true });
  }
  createDynamicsCompressor() {
    return Object.assign(new MockNode(this), {
      threshold: new MockParam(-24),
      knee: new MockParam(30),
      ratio: new MockParam(12),
      attack: new MockParam(0.003),
      release: new MockParam(0.25),
    });
  }
  createBuffer(ch: number, len: number, sr: number) {
    if (!(len > 0)) note(`createBuffer bad length ${len}`);
    return new MockBuffer(ch, len, sr);
  }
}

const asCtx = (c: MockContext): BaseAudioContext => c as unknown as BaseAudioContext;

const ALL_MOODS: MusicMood[] = ['menu', 'explore', 'battle', 'boss', 'victory', 'defeat'];

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

async function freshAudio() {
  vi.resetModules();
  return import('../../src/audio');
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  issues.length = 0;
});

afterEach(() => {
  delete g.AudioContext;
  delete g.webkitAudioContext;
  delete g.localStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('audio without WebAudio (node / SSR)', () => {
  it('is a silent no-op and never throws', async () => {
    expect(g.AudioContext).toBeUndefined();
    const { audio, SFX_NAMES } = await freshAudio();
    expect(() => audio.unlock()).not.toThrow();
    for (const name of SFX_NAMES) {
      expect(() => audio.play(name)).not.toThrow();
      expect(() => audio.play(name, { volume: 0.5, pitch: 1.5, pan: -1 })).not.toThrow();
    }
    expect(() => audio.play('nope' as SfxName)).not.toThrow();
    expect(() => audio.play('hit', { volume: NaN, pitch: Infinity, pan: 99 })).not.toThrow();
    for (const mood of ALL_MOODS) expect(() => audio.setMusic(mood)).not.toThrow();
    expect(audio.getMusic()).toBe('defeat');
    expect(() => audio.setMusic(null)).not.toThrow();
    expect(audio.getMusic()).toBeNull();
    expect(() => audio.unlock()).not.toThrow();
  });

  it('exposes sane default settings and clamps updates', async () => {
    const { audio, DEFAULT_SETTINGS } = await freshAudio();
    expect(audio.getSettings()).toEqual(DEFAULT_SETTINGS);
    audio.setSettings({ master: 2, sfx: -1, music: NaN, muted: true });
    expect(audio.getSettings()).toEqual({ master: 1, sfx: 0, music: DEFAULT_SETTINGS.music, muted: true });
  });

  it('notifies subscribers only on real changes and returns stable snapshots', async () => {
    const { audio } = await freshAudio();
    const listener = vi.fn();
    const off = audio.subscribe(listener);
    const before = audio.getSettings();
    expect(audio.getSettings()).toBe(before);
    audio.setSettings({ master: before.master });
    expect(listener).not.toHaveBeenCalled();
    audio.setSettings({ master: 0.3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(audio.getSettings()).not.toBe(before);
    off();
    audio.setSettings({ master: 0.4 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists to localStorage under chesscard.audio and reloads', async () => {
    const store = new MemoryStorage();
    g.localStorage = store;
    const first = await freshAudio();
    first.audio.setSettings({ music: 0.25, muted: true });
    expect(JSON.parse(store.getItem('chesscard.audio') as string)).toMatchObject({ music: 0.25, muted: true });
    const second = await freshAudio();
    expect(second.audio.getSettings()).toMatchObject({ music: 0.25, muted: true });
  });

  it('survives corrupt or throwing storage', async () => {
    g.localStorage = { getItem: () => '{not json', setItem: () => undefined };
    let mod = await freshAudio();
    expect(mod.audio.getSettings()).toEqual(mod.DEFAULT_SETTINGS);
    g.localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    mod = await freshAudio();
    expect(() => mod.audio.setSettings({ sfx: 0.1 })).not.toThrow();
    expect(mod.audio.getSettings().sfx).toBe(0.1);
  });

  it('survives an AudioContext constructor that throws', async () => {
    g.AudioContext = class {
      constructor() {
        throw new Error('no audio device');
      }
    };
    const { audio } = await freshAudio();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.play('uiClick')).not.toThrow();
    expect(() => audio.setMusic('battle')).not.toThrow();
  });
});

describe('sfx catalog', () => {
  const EXPECTED: SfxName[] = [
    'uiClick', 'uiHover', 'uiConfirm', 'uiBack', 'uiError',
    'cardDraw', 'cardHover', 'cardPlay', 'cardShuffle', 'cardDiscard',
    'pieceSelect', 'pieceMove', 'pieceLeap', 'pieceSlide',
    'attackMelee', 'attackRanged', 'attackMagic', 'hit', 'crit', 'block', 'death',
    'spellFire', 'spellFrost', 'spellHoly', 'spellShadow', 'spellNature', 'heal', 'shield', 'buff', 'debuff', 'summon', 'teleport',
    'diceRoll', 'diceLand', 'eventReveal', 'doomTick', 'doomSurge', 'coin', 'reward',
    'turnStart', 'enemyTurn', 'roundStart', 'zoneClose', 'portalOpen', 'telegraph',
    'bossAppear', 'bossRoar', 'bossPhase', 'bossSlam', 'bossDefeated',
    'victory', 'defeat', 'playerEliminated',
  ];

  it('has a recipe for every SfxName with sane metadata', async () => {
    const { sfxCatalog, SFX_NAMES } = await freshAudio();
    expect([...SFX_NAMES].sort()).toEqual([...EXPECTED].sort());
    for (const name of EXPECTED) {
      const def = sfxCatalog[name];
      expect(typeof def.recipe).toBe('function');
      expect(def.duration).toBeGreaterThan(0);
      expect(def.duration).toBeLessThanOrEqual(8);
      expect(def.maxVoices).toBeGreaterThanOrEqual(1);
      expect(def.maxVoices).toBeLessThanOrEqual(4);
      expect(def.minIntervalMs).toBeGreaterThanOrEqual(30);
      expect(def.reverb).toBeGreaterThanOrEqual(0);
      expect(def.reverb).toBeLessThanOrEqual(1);
    }
    expect(sfxCatalog.uiHover.minIntervalMs).toBeGreaterThanOrEqual(40);
  });

  it('every recipe schedules valid automation and stops all of its sources', async () => {
    const { sfxCatalog, SFX_NAMES } = await freshAudio();
    for (const pitch of [0.5, 1, 2]) {
      for (const name of SFX_NAMES) {
        const ctx = new MockContext();
        const dest = ctx.createGain();
        const end = sfxCatalog[name].recipe(asCtx(ctx), dest as unknown as AudioNode, 0.1, { pitch, rng: Math.random });
        expect(ctx.sources.length, `${name} makes sound`).toBeGreaterThan(0);
        expect(typeof end, `${name} reports its end time`).toBe('number');
        for (const src of ctx.sources) {
          expect(src.stopAt, `${name} stops every source`).not.toBeNull();
          // The reported end covers every source, so voices are never cut early.
          expect(src.stopAt as number, `${name} end covers sources`).toBeLessThanOrEqual(end as number);
        }
        // Duration metadata stays honest (within 0.15 s of the real tail).
        if (pitch === 1) expect((end as number) - 0.1, `${name} duration metadata`).toBeLessThanOrEqual(sfxCatalog[name].duration + 0.15);
      }
    }
    expect(issues).toEqual([]);
  });
});

describe('generative music (mock context)', () => {
  it('every mood schedules notes for a long stretch without errors, then fades out cleanly', async () => {
    vi.resetModules();
    const { MoodPlayer } = await import('../../src/audio/music');
    for (const mood of ALL_MOODS) {
      const ctx = new MockContext();
      const bus = { dry: ctx.createGain() as unknown as AudioNode, wet: ctx.createGain() as unknown as AudioNode };
      const player = new MoodPlayer(asCtx(ctx), bus, mood, 0, 1234);
      // Simulate the lookahead loop for 3 minutes of music.
      for (let t = 0; t < 180; t += 0.1) player.scheduleUntil(t, t + 0.2);
      expect(player.errors, `${mood} step errors`).toBe(0);
      expect(ctx.sources.length, `${mood} makes notes`).toBeGreaterThan(40);
      player.fadeOut(180, 1.5);
      for (const src of ctx.sources) expect(src.stopAt, `${mood}: every source stops`).not.toBeNull();
      const before = ctx.sources.length;
      player.scheduleUntil(181, 200);
      // Nothing new starts after the fade has ended.
      const late = ctx.sources.slice(before).filter((s) => s.startAt >= 181.5);
      expect(late.length).toBe(0);
      expect(player.doneAt).toBeLessThan(183);
      expect(() => player.dispose()).not.toThrow();
    }
    expect(issues).toEqual([]);
  });

  it('is varied: different seeds give different note streams', async () => {
    vi.resetModules();
    const { MoodPlayer } = await import('../../src/audio/music');
    const count = (seed: number): number => {
      const ctx = new MockContext();
      const bus = { dry: ctx.createGain() as unknown as AudioNode, wet: ctx.createGain() as unknown as AudioNode };
      const p = new MoodPlayer(asCtx(ctx), bus, 'menu', 0, seed);
      p.scheduleUntil(0, 120);
      return ctx.sources.length;
    };
    const counts = new Set([1, 2, 3, 4, 5].map(count));
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('engine with a (mock) AudioContext', () => {
  it('unlocks, plays, rate-limits identical sfx and runs music without throwing', async () => {
    vi.useFakeTimers();
    let ctx: MockContext | null = null;
    g.AudioContext = class extends MockContext {
      constructor() {
        super();
        ctx = this;
      }
    };
    const { audio, sfxCatalog } = await freshAudio();
    const hover = vi.spyOn(sfxCatalog.uiHover, 'recipe');
    const hit = vi.spyOn(sfxCatalog.hit, 'recipe');

    audio.setMusic('battle');
    expect(ctx).toBeNull(); // music alone doesn't create a context

    // Before any gesture: the context is created suspended and SFX are dropped.
    audio.play('uiHover');
    expect(ctx).not.toBeNull();
    expect(hover).not.toHaveBeenCalled();

    audio.unlock();
    await Promise.resolve();
    expect(ctx!.state).toBe('running');

    let clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    audio.play('uiHover');
    audio.play('uiHover'); // same instant: rate-limited
    expect(hover).toHaveBeenCalledTimes(1);
    clock += 50;
    audio.play('uiHover');
    expect(hover).toHaveBeenCalledTimes(2);

    // Voice limiting steals old voices but keeps playing new ones.
    for (let i = 0; i < 8; i++) {
      clock += 35;
      audio.play('hit', { pitch: 1 + i * 0.05, pan: -0.5 });
    }
    expect(hit).toHaveBeenCalledTimes(8);

    // Music is scheduled by the lookahead timer.
    const before = ctx!.sources.length;
    for (let i = 0; i < 40; i++) {
      ctx!.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(ctx!.sources.length).toBeGreaterThan(before);
    expect(audio.getMusic()).toBe('battle');

    audio.setMusic('boss');
    audio.setSettings({ muted: true });
    audio.play('crit'); // muted: dropped
    audio.setSettings({ muted: false });
    audio.setMusic(null);
    ctx!.currentTime += 5;
    vi.advanceTimersByTime(5000);
    expect(issues).toEqual([]);
  });
});
