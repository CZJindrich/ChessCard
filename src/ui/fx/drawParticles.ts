/**
 * Canvas 2D drawing of the particle system. One pass per frame; light particles use additive
 * blending ('lighter'), smoke and debris normal blending. Sizes are tile units scaled to px.
 */
import { boltPoint, type Bolt, type Particle, type ParticleSystem, type Rgb } from './particles';

export interface DrawSpace {
  /** Tile size in canvas px (CSS px × device pixel ratio). */
  tile: number;
  /** Canvas px of tile-space origin (the canvas extends past the tiles by a margin). */
  originX: number;
  originY: number;
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

function opacity(p: Particle): number {
  const t = Math.max(0, Math.min(1, p.age / p.ttl));
  const k = p.fade === 'swell' ? Math.sin(Math.PI * t) : (1 - t) * (1 - t * 0.35);
  return Math.max(0, p.alpha * k);
}

function drawOne(ctx: CanvasRenderingContext2D, p: Particle, space: DrawSpace): void {
  const a = opacity(p);
  if (a <= 0.004) return;
  const x = space.originX + p.x * space.tile;
  const y = space.originY + p.y * space.tile;
  const r = Math.max(0.5, p.size * space.tile);
  switch (p.shape) {
    case 'dot': {
      ctx.fillStyle = rgba(p.color, a);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'puff': {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(p.color, a));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'streak': {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const len = Math.min(r * 2.6, r + speed * space.tile * 0.035);
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = Math.max(1, r * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (p.vx / speed) * len, y - (p.vy / speed) * len);
      ctx.stroke();
      return;
    }
    case 'shard':
    case 'chip': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillStyle = rgba(p.color, a);
      ctx.beginPath();
      if (p.shape === 'shard') {
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.7, r * 0.6);
        ctx.lineTo(-r * 0.55, r * 0.45);
      } else {
        ctx.rect(-r, -r * 0.55, r * 2, r * 1.1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'ring': {
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = Math.max(1.5, space.tile * 0.09 * (1 - p.age / p.ttl) + 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
  }
}

function drawBolt(ctx: CanvasRenderingContext2D, bolt: Bolt, space: DrawSpace): void {
  const t = Math.min(1, bolt.age / bolt.duration);
  const head = boltPoint(bolt, t);
  const x = space.originX + head.x * space.tile;
  const y = space.originY + head.y * space.tile;
  const r = space.tile * 0.16;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, 'rgba(255,243,196,1)');
  g.addColorStop(0.35, rgba(bolt.color, 0.9));
  g.addColorStop(1, rgba(bolt.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Clear the canvas and draw every live particle and bolt. */
export function drawParticles(ctx: CanvasRenderingContext2D, system: ParticleSystem, space: DrawSpace, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  for (const p of system.particles) if (!p.glow && p.age > 0) drawOne(ctx, p, space);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of system.particles) if (p.glow && p.age > 0) drawOne(ctx, p, space);
  for (const bolt of system.bolts) drawBolt(ctx, bolt, space);
  ctx.globalCompositeOperation = 'source-over';
}
