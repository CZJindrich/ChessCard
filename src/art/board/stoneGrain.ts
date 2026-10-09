/**
 * Stone-grain texture (§16.5): feTurbulence (baseFrequency 0.9, 2 octaves) rendered ONCE
 * to an offscreen canvas and reused everywhere as a PNG image pattern. Nothing animates it
 * and no live SVG filter is ever attached to the board.
 */
import { useEffect, useState } from 'react';

export const GRAIN_TILE = 128;
/** Overlay opacity for the grain pattern (§16.5: 8 %). */
export const GRAIN_OPACITY = 0.08;

let cached: Promise<string | null> | null = null;
let resolved: string | null = null;

function grainSvg(size: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    '<filter id="g" x="0" y="0" width="100%" height="100%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" seed="7"/>' +
    '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -0.55"/>' +
    '</filter>' +
    `<rect width="${size}" height="${size}" filter="url(#g)"/>` +
    '</svg>'
  );
}

async function renderGrain(): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(grainSvg(GRAIN_TILE))}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = GRAIN_TILE;
    canvas.height = GRAIN_TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // jsdom, old browsers or a blocked canvas: the board simply renders without grain.
    return null;
  }
}

/** The grain PNG data URL, rendered on first request and shared afterwards. */
export function stoneGrainUrl(): Promise<string | null> {
  if (!cached) {
    cached = renderGrain().then((url) => {
      resolved = url;
      return url;
    });
  }
  return cached;
}

/** React hook: `null` until the texture is ready (or when it cannot be rendered). */
export function useStoneGrain(): string | null {
  const [url, setUrl] = useState<string | null>(resolved);
  useEffect(() => {
    if (resolved) return;
    let alive = true;
    void stoneGrainUrl().then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return url;
}
