/**
 * The WICKWATCH logo in Cinzel Decorative (never swapped by `readable_font`, §14.4). The
 * first I is the wick: a candle flame burns above it.
 */
import type { ReactElement } from 'react';

export function Logo({ className }: { className?: string }): ReactElement {
  return (
    <h1 className={className ? `ww-logo ${className}` : 'ww-logo'} aria-label="Wickwatch">
      <span aria-hidden="true" className="ww-logo__word">
        W
        <span className="ww-logo__wick">
          I
          <svg className="ww-logo__flame" viewBox="0 0 20 32">
            <defs>
              <radialGradient id="ww-logo-flame" cx="0.5" cy="0.72" r="0.62">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="0.35" stopColor="#FFF3C4" />
                <stop offset="0.75" stopColor="#F4B942" />
                <stop offset="1" stopColor="#E8742C" />
              </radialGradient>
            </defs>
            <path d="M10 1C12.6 7.6 18 11.6 18 19.4C18 25 14.4 30 10 30S2 25 2 19.4C2 11.6 7.4 7.6 10 1Z" fill="url(#ww-logo-flame)" />
            <path d="M10 13C11.2 16.6 13.6 18.4 13.6 22C13.6 24.6 12 26.6 10 26.6S6.4 24.6 6.4 22C6.4 18.4 8.8 16.6 10 13Z" fill="#FFFDF2" opacity="0.85" />
          </svg>
        </span>
        CKWATCH
      </span>
    </h1>
  );
}
