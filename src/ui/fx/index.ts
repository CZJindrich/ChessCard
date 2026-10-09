/**
 * Game FX (ARCHITECTURE §2 `ui/fx`): the darkness canvas, the particle canvas, screen flash,
 * Dread vignette, shake and the card flight, all driven through an `FxBus`, plus the pure
 * pieces they are built from (particle system, light sources, the event → effect director).
 */
import './fx.css';

export { FxBus, FxBusContext, useFxBus, centreOf, type BoardPoint, type BurstKind, type CardFlightSpec, type FxCommand, type FxCommandOf } from './bus';
export { fxForStep, type DirectedStep } from './director';
export { lightSources, darknessAlpha, flicker, LIGHT_RADIUS, type LightSource } from './darkness';
export { ParticleSystem, MAX_PARTICLES, AMBIENT_LIMIT, COLORS, type Particle, type ParticleDraft, type Rgb } from './particles';
export { DarknessCanvas, type DarknessCanvasProps } from './DarknessCanvas';
export { ParticleCanvas, type ParticleCanvasProps } from './ParticleCanvas';
export { ScreenFx, useShake, shakeFrames, flashAllowed, MIN_FLASH_GAP_MS, type ScreenFxProps } from './ScreenFx';
