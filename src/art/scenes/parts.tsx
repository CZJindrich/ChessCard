/** Shared scenery parts: sky, stars, the Moth-Moon, skyline layers, motes and smoke tendrils. */
import { useMemo, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { darken, mix } from '../util/color';
import { fmt, smoothClosedPath, type Pt } from '../util/path';
import { between, seededRandom } from '../util/random';
import { animTiming, cssVars, type SvgIds } from '../util/svg';
import { generateSkyline, lancetPath, type SkylineOptions } from './skyline';

export function SkyGradient({ ids, w, h, stops }: { ids: SvgIds; w: number; h: number; stops?: Array<[number, string]> }): ReactElement {
  const s = stops ?? [
    [0, PALETTE.nightInk],
    [0.55, '#1C1530'],
    [0.85, '#33264A'],
    [1, '#46325A'],
  ];
  return (
    <g>
      <defs>
        <linearGradient id={ids.id('sky')} x1="0" y1="0" x2="0" y2="1">
          {s.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill={ids.url('sky')} />
    </g>
  );
}

export function Stars({ w, h, count, seed, animated }: { w: number; h: number; count: number; seed: string; animated: boolean }): ReactElement {
  const stars = useMemo(() => {
    const rand = seededRandom(`${seed}stars`);
    return Array.from({ length: count }, () => ({ x: rand() * w, y: rand() * h, r: between(rand, 0.6, 1.8) }));
  }, [w, h, count, seed]);
  return (
    <g>
      {stars.map((s, i) => {
        const t = animTiming(`${seed}st${i}`, 2.4, 5.5);
        return (
          <circle
            key={i}
            className={animated && i % 3 === 0 ? 'ww-star-twinkle' : undefined}
            style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay })}
            cx={fmt(s.x)}
            cy={fmt(s.y)}
            r={fmt(s.r)}
            fill={PALETTE.moonsilver}
            opacity={0.75}
          />
        );
      })}
    </g>
  );
}

/** The pale Moth-Moon, its maria forming a moth (§1.3, §16.8). */
export function MothMoon({ ids, x, y, r, glow = true }: { ids: SvgIds; x: number; y: number; r: number; glow?: boolean }): ReactElement {
  const s = r / 100;
  return (
    <g>
      <defs>
        <radialGradient id={ids.id('moon')} cx="0.42" cy="0.38" r="0.65">
          <stop offset="0" stopColor="#F7F8FC" />
          <stop offset="0.7" stopColor={PALETTE.moonsilver} />
          <stop offset="1" stopColor={PALETTE.mothSilver} />
        </radialGradient>
        <radialGradient id={ids.id('moonHalo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.35" stopColor={PALETTE.moonsilver} stopOpacity="0.4" />
          <stop offset="1" stopColor={PALETTE.moonsilver} stopOpacity="0" />
        </radialGradient>
        <clipPath id={ids.id('moonClip')}>
          <circle cx={x} cy={y} r={r} />
        </clipPath>
      </defs>
      {glow && <circle cx={x} cy={y} r={r * 2.4} fill={ids.url('moonHalo')} />}
      <circle cx={x} cy={y} r={r} fill={ids.url('moon')} />
      <g clipPath={ids.url('moonClip')}>
        <g fill="#9C96C2" opacity={0.55} transform={`translate(${fmt(x)} ${fmt(y)}) scale(${fmt(s)})`}>
        <path d="M-4,-6C-20,-50 -70,-60 -80,-30C-86,-6 -50,10 -6,6Z" />
        <path d="M4,-6C20,-50 70,-60 80,-30C86,-6 50,10 6,6Z" />
        <path d="M-6,8C-30,14 -50,40 -38,54C-26,64 -12,40 -2,16Z" />
        <path d="M6,8C30,14 50,40 38,54C26,64 12,40 2,16Z" />
        <ellipse cx={0} cy={6} rx={5} ry={34} />
        <circle cx={-48} cy={-28} r={11} fill="#7E78A6" />
        <circle cx={48} cy={-28} r={11} fill="#7E78A6" />
        <circle cx={-48} cy={-28} r={4.5} fill="#E9EAF6" />
        <circle cx={48} cy={-28} r={4.5} fill="#E9EAF6" />
        </g>
      </g>
      <circle cx={x} cy={y} r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={2} />
    </g>
  );
}

/** A skyline layer with optionally flickering windows. */
export function SkylineSvgLayer({
  options,
  fill,
  windowColor = PALETTE.candleGold,
  animated,
  flicker = true,
  windowAlpha = 0.9,
}: {
  options: SkylineOptions;
  fill: string;
  windowColor?: string;
  animated: boolean;
  flicker?: boolean;
  windowAlpha?: number;
}): ReactElement {
  const layer = useMemo(() => generateSkyline(options), [options]);
  return (
    <g>
      <path d={layer.d} fill={fill} />
      {layer.rose && (
        <g>
          <circle cx={layer.rose.x} cy={layer.rose.y} r={layer.rose.r} fill={mix(windowColor, fill, 0.35)} opacity={0.75} />
          <circle cx={layer.rose.x} cy={layer.rose.y} r={layer.rose.r * 0.45} fill="none" stroke={fill} strokeWidth={layer.rose.r * 0.12} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <path
                key={i}
                d={`M${fmt(layer.rose!.x)},${fmt(layer.rose!.y)}L${fmt(layer.rose!.x + Math.cos(a) * layer.rose!.r)},${fmt(layer.rose!.y + Math.sin(a) * layer.rose!.r)}`}
                stroke={fill}
                strokeWidth={layer.rose!.r * 0.1}
              />
            );
          })}
        </g>
      )}
      {layer.windows.map((w, i) => {
        const t = animTiming(`${options.seed}win${i}`, 2.5, 7);
        return (
          <path
            key={i}
            d={lancetPath(w.x, w.y, w.w, w.h)}
            fill={w.lit ? windowColor : darken(fill, 0.4)}
            opacity={w.lit ? windowAlpha : 0.8}
            className={animated && flicker && w.lit ? 'ww-window-flicker' : undefined}
            style={w.lit ? cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay }) : undefined}
          />
        );
      })}
    </g>
  );
}

/** Drifting motes (dust / embers): transform + opacity only. */
export function Motes({ w, h, count, seed, color, animated, rise = 160 }: { w: number; h: number; count: number; seed: string; color: string; animated: boolean; rise?: number }): ReactElement {
  const motes = useMemo(() => {
    const rand = seededRandom(`${seed}motes`);
    return Array.from({ length: count }, () => ({ x: rand() * w, y: h * 0.3 + rand() * h * 0.7, r: between(rand, 1, 2.6), dx: between(rand, -40, 40) }));
  }, [w, h, count, seed]);
  if (!animated) {
    return (
      <g>
        {motes.map((m, i) => (
          <circle key={i} cx={fmt(m.x)} cy={fmt(m.y)} r={fmt(m.r)} fill={color} opacity={0.35} />
        ))}
      </g>
    );
  }
  return (
    <g>
      {motes.map((m, i) => {
        const t = animTiming(`${seed}mote${i}`, 9, 16);
        return (
          <circle
            key={i}
            className="ww-drift-up"
            style={cssVars({ '--ww-dur': t.duration, '--ww-delay': t.delay, '--ww-drift-x': `${fmt(m.dx)}px`, '--ww-drift-y': `${-rise}px`, '--ww-mote-alpha': 0.7 })}
            cx={fmt(m.x)}
            cy={fmt(m.y)}
            r={fmt(m.r)}
            fill={color}
          />
        );
      })}
    </g>
  );
}

/** A tapering smoke ribbon from `from` toward `to`, wobbled once by seeded noise. */
export function tendrilPath(from: Pt, to: Pt, width: number, seed: string): string {
  const rand = seededRandom(seed);
  const n = 14;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const phase = rand() * Math.PI * 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sway = Math.sin(phase + t * 5) * 26 * (1 - t * 0.4) + (rand() - 0.5) * 8;
    const cx = from.x + dx * t + nx * sway;
    const cy = from.y + dy * t + ny * sway;
    const half = (width / 2) * (1 - t * 0.92) * (0.85 + rand() * 0.3);
    left.push({ x: cx + nx * half, y: cy + ny * half });
    right.push({ x: cx - nx * half, y: cy - ny * half });
  }
  return smoothClosedPath([...left, ...right.reverse()], 0.9);
}
