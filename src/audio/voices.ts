/**
 * Spawns one SFX voice: a per-voice gain (volume) -> optional panner -> dry bus,
 * plus a reverb send, then runs the sound's recipe into it. Works with any
 * BaseAudioContext so the same code path is used by tests and offline renders.
 */
import { clamp } from './dsp';
import { sfxCatalog, type SfxDef } from './sfxCatalog';
import type { SfxName } from './types';

export interface SfxBus {
  dry: AudioNode;
  wet: AudioNode;
}

export interface SfxVoice {
  name: SfxName;
  start: number;
  /** Time after which the voice (including its reverb send) is silent. */
  end: number;
  gain: GainNode;
  nodes: AudioNode[];
}

export interface SpawnOptions {
  volume?: number;
  pitch?: number;
  pan?: number;
  rng?: () => number;
}

export function spawnSfx(
  ctx: BaseAudioContext,
  bus: SfxBus,
  name: SfxName,
  t: number,
  opts: SpawnOptions = {},
  def: SfxDef = sfxCatalog[name],
): SfxVoice {
  const pitch = clamp(Number.isFinite(opts.pitch) ? (opts.pitch as number) : 1, 0.25, 4);
  const volume = clamp(Number.isFinite(opts.volume) ? (opts.volume as number) : 1, 0, 2) * def.gain;
  const pan = clamp(Number.isFinite(opts.pan) ? (opts.pan as number) : 0, -1, 1);

  const gain = ctx.createGain();
  gain.gain.value = volume;
  const nodes: AudioNode[] = [gain];

  const withPanner = ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (Math.abs(pan) > 0.01 && typeof withPanner.createStereoPanner === 'function') {
    const p = withPanner.createStereoPanner();
    p.pan.value = pan;
    gain.connect(p);
    p.connect(bus.dry);
    nodes.push(p);
  } else {
    gain.connect(bus.dry);
  }
  if (def.reverb > 0) {
    const send = ctx.createGain();
    send.gain.value = def.reverb;
    gain.connect(send);
    send.connect(bus.wet);
    nodes.push(send);
  }

  const ended = def.recipe(ctx, gain, t, { pitch, rng: opts.rng ?? Math.random });
  const end = typeof ended === 'number' && Number.isFinite(ended) && ended > t ? ended : t + def.duration / pitch;
  return { name, start: t, end: end + 0.05, gain, nodes };
}
