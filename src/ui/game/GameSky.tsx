/**
 * The sky behind the board (GDD §16.8: "In play, the sky is a static layer with drifting
 * motes"). The SVG sky is drawn still, so it is painted once; the drifting motes are small HTML
 * elements animated with transform and opacity only, which the compositor runs without
 * repainting the full-screen sky every frame (§16.10). Reduced motion leaves the motes out.
 */
import { memo, useMemo, type CSSProperties, type ReactElement } from 'react';
import { SkyBackdrop } from '../../art';

const MOTE_COUNT = 18;

interface Mote {
  left: number;
  top: number;
  size: number;
  drift: number;
  duration: number;
  delay: number;
}

/** Deterministic scatter (no Math.random in render): a small LCG per index. */
function motes(): Mote[] {
  let seed = 0x5eed;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 8) / 0x1000000;
  };
  return Array.from({ length: MOTE_COUNT }, () => ({
    left: next() * 100,
    top: 30 + next() * 68,
    size: 2 + next() * 3,
    drift: -40 + next() * 80,
    duration: 9 + next() * 7,
    delay: -next() * 16,
  }));
}

function GameSkyView({ dread, reducedMotion }: { dread: number; reducedMotion: boolean }): ReactElement {
  const field = useMemo(motes, []);
  return (
    <div className="ww-game__sky" aria-hidden="true">
      <SkyBackdrop dread={dread} reducedMotion className="ww-game__sky-art" />
      {!reducedMotion && (
        <div className="ww-motes">
          {field.map((m, i) => (
            <span
              key={i}
              className="ww-mote"
              style={
                {
                  left: `${m.left}%`,
                  top: `${m.top}%`,
                  width: m.size,
                  height: m.size,
                  '--ww-mote-x': `${m.drift}px`,
                  animationDuration: `${m.duration}s`,
                  animationDelay: `${m.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const GameSky = memo(GameSkyView);
