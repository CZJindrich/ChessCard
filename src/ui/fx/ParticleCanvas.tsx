/**
 * The particle layer (GDD §15.5 render order: above pieces and marks, below the UI): one canvas
 * over the board, a margin wider than the tiles so bursts at the edge are not cut. It plays the
 * FX bus's bursts, trails, bolts and rings, and drifts Gloam fog over closed tiles. The frame
 * loop runs only while something is alive. Disabled (reduced motion) it draws nothing.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import type { BoardPoint, BurstKind, FxCommand, FxBus } from './bus';
import { context2d, pixelRatio, runFrames } from './canvas';
import { drawParticles } from './drawParticles';
import {
  AMBIENT_LIMIT,
  COLORS,
  dustPuff,
  flameTrail,
  gloamFog,
  healMotes,
  meltSmoke,
  ParticleSystem,
  plumeColumn,
  shockRing,
  silverDust,
  strikeSparks,
  summonSparkles,
  wardGlint,
  wardShards,
  waxChips,
  type ParticleDraft,
  type Random,
  type Rgb,
} from './particles';

/** Margin around the tiles, in tiles. */
const PAD = 1;
/** Ambient Gloam puffs per tile per second. */
const FOG_RATE = 0.35;

export interface ParticleCanvasProps {
  bus: FxBus;
  cols: number;
  rows: number;
  /** Tile size, CSS px. */
  tile: number;
  enabled: boolean;
  /** Tiles that drift fog (Gloam), as board points. */
  ambient?: readonly BoardPoint[];
  className?: string;
}

/** Screen-space tile units (y down) of a board point. */
function screen(p: BoardPoint, rows: number): { x: number; y: number } {
  return { x: p.x, y: rows - p.y };
}

function delayed(drafts: ParticleDraft[], delay: number): ParticleDraft[] {
  return delay > 0 ? drafts.map((d) => ({ ...d, age: (d.age ?? 0) - delay })) : drafts;
}

function burstDrafts(kind: BurstKind, x: number, y: number, color: Rgb | undefined, r: Random): ParticleDraft[] {
  switch (kind) {
    case 'sparks':
      return strikeSparks(x, y, r);
    case 'snuff_sparks':
      return strikeSparks(x, y, r, 10).map((d) => ({ ...d, color: r() < 0.5 ? COLORS.snuffRim : COLORS.moonsilver }));
    case 'dust':
      return silverDust(x, y, r).map((d) => (color ? { ...d, color } : d));
    case 'melt_smoke':
      return meltSmoke(x, y, r);
    case 'dust_puff':
      return dustPuff(x, y, r);
    case 'ward_shards':
      return wardShards(x, y, r);
    case 'ward_glint':
      return wardGlint(x, y, r).map((d) => (color ? { ...d, color } : d));
    case 'heal':
      return healMotes(x, y, r);
    case 'plume':
      return plumeColumn(x, y, r).map((d) => (color ? { ...d, color } : d));
    case 'plume_small':
      return plumeColumn(x, y, r, 0.55)
        .slice(0, 8)
        .map((d) => (color ? { ...d, color } : d));
    case 'gloam':
      return plumeColumn(x, y, r, 0.7)
        .slice(0, 6)
        .map((d) => ({ ...d, size: (d.size ?? 0.1) * 2.2, alpha: 0.55, color: r() < 0.5 ? COLORS.gloam : COLORS.plume }));
    case 'summon':
      return summonSparkles(x, y, color ?? COLORS.candleGold, r);
    case 'wax_chips':
      return waxChips(x, y, r);
    case 'embers':
      return strikeSparks(x, y, r, 6).map((d) => ({ ...d, vy: -Math.abs(d.vy ?? 0) * 0.5 - 0.6, ay: -0.5, color: r() < 0.5 ? COLORS.ember : COLORS.candleGold }));
  }
}

function play(system: ParticleSystem, command: FxCommand, rows: number): boolean {
  const r = system.random;
  switch (command.kind) {
    case 'burst': {
      const at = screen(command.at, rows);
      system.add(delayed(burstDrafts(command.burst, at.x, at.y, command.color, r), command.delay ?? 0));
      return true;
    }
    case 'trail':
      system.add(flameTrail(command.points.map((p) => screen(p, rows)), command.msPerTile, r));
      return true;
    case 'bolt': {
      const from = screen(command.from, rows);
      const to = screen(command.to, rows);
      system.addBolt({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, arc: command.arc, duration: command.duration, color: command.color, trailRate: 70 });
      return true;
    }
    case 'ring': {
      const at = screen(command.at, rows);
      system.add(shockRing(at.x, at.y, command.color, command.radius, command.ttl, command.delay ?? 0));
      return true;
    }
    default:
      return false;
  }
}

function spawnFog(system: ParticleSystem, ambient: readonly BoardPoint[], rows: number, dt: number): void {
  if (ambient.length === 0 || system.count >= AMBIENT_LIMIT) return;
  const r = system.random;
  const expected = (ambient.length * FOG_RATE * dt) / 1000;
  let n = Math.floor(expected) + (r() < expected % 1 ? 1 : 0);
  while (n-- > 0 && system.count < AMBIENT_LIMIT) {
    const tile = ambient[Math.floor(r() * ambient.length)];
    const at = screen(tile, rows);
    system.add(gloamFog(at.x, at.y, r));
  }
}

export function ParticleCanvas({ bus, cols, rows, tile, enabled, ambient = [], className }: ParticleCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const system = useRef(new ParticleSystem());
  const stopLoop = useRef<(() => void) | null>(null);
  const startLoop = useRef<(() => void) | null>(null);
  const live = useRef({ rows, tile, ambient, enabled });
  live.current = { rows, tile, ambient, enabled };
  const dpr = pixelRatio();
  const width = Math.round((cols + PAD * 2) * tile * dpr);
  const height = Math.round((rows + PAD * 2) * tile * dpr);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas ? context2d(canvas) : null;
    if (!canvas || !ctx) return undefined;

    const start = (): void => {
      if (stopLoop.current) return;
      stopLoop.current = runFrames((_now, dt) => {
        const { rows: r, tile: t, ambient: fog, enabled: on } = live.current;
        if (on) spawnFog(system.current, fog, r, dt);
        system.current.step(dt);
        const px = t * pixelRatio();
        drawParticles(ctx, system.current, { tile: px, originX: PAD * px, originY: PAD * px }, canvas.width, canvas.height);
        const keepGoing = !system.current.idle || (on && fog.length > 0);
        if (!keepGoing) stopLoop.current = null;
        return keepGoing;
      });
    };

    startLoop.current = start;
    const off = bus.on((command) => {
      if (!live.current.enabled) return;
      if (play(system.current, command, live.current.rows)) start();
    });
    if (live.current.enabled && live.current.ambient.length > 0) start();
    return () => {
      off();
      startLoop.current = null;
      stopLoop.current?.();
      stopLoop.current = null;
    };
  }, [bus]);

  // Fog appears (Gloam closed) or motion is turned off / on.
  const fogCount = ambient.length;
  useEffect(() => {
    if (!enabled) {
      system.current.clear();
      const canvas = ref.current;
      const ctx = canvas ? context2d(canvas) : null;
      ctx?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
      return;
    }
    if (fogCount > 0) startLoop.current?.();
  }, [enabled, fogCount]);

  return (
    <canvas
      ref={ref}
      className={className}
      width={width}
      height={height}
      style={{ left: -PAD * tile, top: -PAD * tile, width: (cols + PAD * 2) * tile, height: (rows + PAD * 2) * tile }}
      aria-hidden="true"
    />
  );
}
