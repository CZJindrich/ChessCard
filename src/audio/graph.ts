/**
 * The mixer graph, buildable on any BaseAudioContext (realtime or offline):
 *
 *   sfxDry ──────────────┐
 *   sfxWet ──┐           │
 *   musicWet ┴─ hall ─ reverbReturn
 *   musicDry ────────────┤
 *                        └─ master ─ highpass ─ compressor ─ makeup ─ (x0.5 ─ soft clip) ─ destination
 *
 * One shared convolution reverb (generated stone-hall impulse) keeps CPU low.
 * Bus volumes are applied on both the dry and the reverb-send side so that a
 * muted bus also silences its reverb.
 */
import { hallImpulse, softClipCurve } from './dsp';
import type { AudioSettings } from './types';

export interface AudioGraph {
  readonly ctx: BaseAudioContext;
  readonly sfxDry: GainNode;
  readonly sfxWet: GainNode;
  readonly musicDry: GainNode;
  readonly musicWet: GainNode;
  readonly master: GainNode;
  readonly compressor: DynamicsCompressorNode;
  /** Final node before ctx.destination. */
  readonly output: AudioNode;
  apply(settings: AudioSettings, rampTime?: number): void;
  dispose(): void;
}

/** Overall music level relative to SFX (music sits underneath gameplay). */
export const MUSIC_LEVEL = 0.62;
const REVERB_RETURN = 0.5;

/** Perceptual slider curve (roughly equal loudness steps). */
export const sliderToGain = (v: number): number => v * v;

export interface GraphOptions {
  /** Include the final safety soft-clipper (default true). */
  safetyClip?: boolean;
}

export function createAudioGraph(
  ctx: BaseAudioContext,
  settings: AudioSettings,
  options: GraphOptions = {},
): AudioGraph {
  const gain = (v: number): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const sfxDry = gain(1);
  const sfxWet = gain(1);
  const musicDry = gain(1);
  const musicWet = gain(1);
  const master = gain(1);

  const hall = ctx.createConvolver();
  hall.buffer = hallImpulse(ctx);
  const reverbReturn = gain(REVERB_RETURN);
  sfxWet.connect(hall);
  musicWet.connect(hall);
  hall.connect(reverbReturn);
  reverbReturn.connect(master);
  sfxDry.connect(master);
  musicDry.connect(master);

  // Remove sub-sonic rumble / DC that only eats headroom.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 28;
  hp.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const makeup = gain(1.15);

  master.connect(hp);
  hp.connect(comp);
  comp.connect(makeup);

  const nodes: AudioNode[] = [sfxDry, sfxWet, musicDry, musicWet, master, hall, reverbReturn, hp, comp, makeup];
  let output: AudioNode = makeup;
  if (options.safetyClip !== false) {
    const pre = gain(0.5);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(ctx);
    clip.oversample = '2x';
    makeup.connect(pre);
    pre.connect(clip);
    output = clip;
    nodes.push(pre, clip);
  }
  output.connect(ctx.destination);

  const set = (p: AudioParam, v: number, ramp: number): void => {
    if (ramp <= 0) {
      p.value = v;
      return;
    }
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(v, now, ramp / 3);
  };

  const graph: AudioGraph = {
    ctx,
    sfxDry,
    sfxWet,
    musicDry,
    musicWet,
    master,
    compressor: comp,
    output,
    apply(s: AudioSettings, rampTime = 0.05) {
      const m = s.muted ? 0 : sliderToGain(s.master);
      const fx = sliderToGain(s.sfx);
      const mu = sliderToGain(s.music) * MUSIC_LEVEL;
      set(master.gain, m, rampTime);
      set(sfxDry.gain, fx, rampTime);
      set(sfxWet.gain, fx, rampTime);
      set(musicDry.gain, mu, rampTime);
      set(musicWet.gain, mu, rampTime);
    },
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
  graph.apply(settings, 0);
  return graph;
}
