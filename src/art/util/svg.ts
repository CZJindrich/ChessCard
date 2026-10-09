/** React/SVG plumbing shared by every art component. */
import { useId, useMemo, type CSSProperties } from 'react';
import { hashString, mulberry32, type Rand } from './random';

export interface SvgIds {
  /** Unique element id for a local def name. */
  id: (name: string) => string;
  /** `url(#…)` reference to a local def. */
  url: (name: string) => string;
  /** Stable seed string for this component instance. */
  seed: string;
}

/**
 * Per-instance unique ids for gradients, clips and masks, so many copies of the
 * same art can live in one document without their `<defs>` colliding.
 */
export function useSvgIds(prefix: string): SvgIds {
  const raw = useId();
  return useMemo(() => {
    const base = `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return {
      id: (name: string) => `${base}-${name}`,
      url: (name: string) => `url(#${base}-${name})`,
      seed: base,
    };
  }, [prefix, raw]);
}

export type CssVarName = `--${string}`;

/** Typed CSS custom properties for dynamic per-instance values (phase, duration). */
export function cssVars(vars: Partial<Record<CssVarName, string | number>>): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) style[key] = String(value);
  }
  return style as CSSProperties;
}

/** Random-looking but stable animation timing (`duration` within [min, max] s, negative delay). */
export function animTiming(seed: string, minSeconds: number, maxSeconds: number): { duration: string; delay: string } {
  const rand: Rand = mulberry32(hashString(seed));
  const duration = minSeconds + rand() * (maxSeconds - minSeconds);
  const delay = -rand() * duration;
  return { duration: `${duration.toFixed(2)}s`, delay: `${delay.toFixed(2)}s` };
}

/** Join class names, skipping falsy entries. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
