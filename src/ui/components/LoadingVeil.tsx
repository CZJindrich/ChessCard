/**
 * The veil shown while a code-split screen loads: a lone candle on night ink. It fades in only
 * after a short delay, so a fast load never flashes it; under reduced motion the flame is still.
 */
import type { ReactElement } from 'react';
import './loadingVeil.css';

/** The candle of the veils: a wax stub with a flame (a still flame under reduced motion). */
export function VeilCandle(): ReactElement {
  return (
    <svg className="ww-veil__candle" viewBox="0 0 40 64" aria-hidden="true">
      <defs>
        <radialGradient id="ww-veil-glow" cx="0.5" cy="0.38" r="0.5">
          <stop offset="0" stopColor="#F4B942" stopOpacity="0.45" />
          <stop offset="1" stopColor="#F4B942" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ww-veil-flame" cx="0.5" cy="0.72" r="0.62">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.35" stopColor="#FFF3C4" />
          <stop offset="0.75" stopColor="#F4B942" />
          <stop offset="1" stopColor="#E8742C" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="24" r="20" fill="url(#ww-veil-glow)" />
      <rect x="13" y="34" width="14" height="26" rx="3" fill="#EDE3CC" />
      <path d="M13 37q4 2 7 0q3 3 7 0" fill="none" stroke="#C9B48A" strokeWidth="1.6" />
      <path d="M20 34v-4" stroke="#2B1A10" strokeWidth="2" strokeLinecap="round" />
      <path className="ww-veil__flame" d="M20 7C23 14 29 18 29 25.5C29 30.5 25 34 20 34S11 30.5 11 25.5C11 18 17 14 20 7Z" fill="url(#ww-veil-flame)" />
    </svg>
  );
}

export function LoadingVeil({ label = 'Lighting the candles…' }: { label?: string }): ReactElement {
  return (
    <div className="ww-veil ww-veil--loading" role="status" aria-live="polite" data-testid="loading-veil">
      <VeilCandle />
      <p className="ww-veil__label">{label}</p>
    </div>
  );
}
