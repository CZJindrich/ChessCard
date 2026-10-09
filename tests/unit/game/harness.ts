/**
 * Test harness for the game controller: a manual scheduler (virtual time), a recording audio
 * fake and quick game configs built through the real presets.
 */
import { concreteSeed, defaultProfile, quickPlaySelection, resolveConfig } from '../../../src/config';
import { createGame, getContent } from '../../../src/engine';
import type { GameConfig, GameState, SeatConfig } from '../../../src/engine/types';
import type { GameAudio, Scheduler } from '../../../src/game';
import type { MusicMood, PlayOptions, SfxName } from '../../../src/audio';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/** Virtual time: timers run only when the test advances the clock. */
export class ManualScheduler implements Scheduler {
  now = 0;
  private timers: Timer[] = [];
  private nextId = 1;

  setTimeout(fn: () => void, ms: number): unknown {
    const timer = { id: this.nextId++, at: this.now + Math.max(0, ms), fn };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  get pending(): number {
    return this.timers.length;
  }

  /** Run every timer due within `ms` of virtual time, in order. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.now = due.at;
      due.fn();
    }
    this.now = end;
  }

  /** Run the next timer, whenever it is due. Returns false when none is left. */
  runNext(): boolean {
    const next = this.timers.slice().sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!next) return false;
    this.timers = this.timers.filter((t) => t !== next);
    this.now = Math.max(this.now, next.at);
    next.fn();
    return true;
  }
}

export class RecordingAudio implements GameAudio {
  sounds: Array<{ name: SfxName; opts?: PlayOptions }> = [];
  moods: Array<MusicMood | null> = [];

  play(name: SfxName, opts?: PlayOptions): void {
    this.sounds.push({ name, opts });
  }

  setMusic(mood: MusicMood | null): void {
    this.moods.push(mood);
  }

  names(): SfxName[] {
    return this.sounds.map((s) => s.name);
  }
}

/** A later-game solo Quick Play config (generated sites, Moth Die on) with a fixed seed. */
export function quickConfig(seed = 'ctrl-test', heroId = 'sconce_paladin'): GameConfig {
  const reg = getContent();
  const profile = { ...defaultProfile(), gamesCompleted: 3 };
  const { config } = resolveConfig(quickPlaySelection(profile, heroId, 'Tester', reg), { content: reg });
  return { ...config, seed: concreteSeed(seed, { now: new Date('2026-10-09T00:00:00Z'), random: () => seed }) };
}

export function configWithSeats(seats: SeatConfig[], seed = 'ctrl-seats'): GameConfig {
  return { ...quickConfig(seed), seats };
}

export function newGame(config: GameConfig = quickConfig()): GameState {
  return createGame(config);
}

/** Let promise callbacks (the sync bot runner) settle. */
export async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
