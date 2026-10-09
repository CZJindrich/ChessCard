/**
 * Small line icons for UI chrome (buttons, headers, inputs). Drawn on a 24×24 grid in
 * `currentColor`; decorative unless a `title` is given.
 */
import type { ReactElement } from 'react';

export const UI_ICON_NAMES = [
  'back',
  'close',
  'gear',
  'info',
  'copy',
  'paste',
  'search',
  'sound',
  'mute',
  'flame',
  'swords',
  'quill',
  'door',
  'book',
  'scroll',
  'chevron',
  'check',
  'reset',
  'upload',
  'plus',
  'minus',
  'save',
  'play',
] as const;
export type UiIconName = (typeof UI_ICON_NAMES)[number];

const PATHS: Readonly<Record<UiIconName, readonly string[]>> = {
  back: ['M15 5l-7 7 7 7', 'M8 12h12'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  gear: [
    'M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z',
    'M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8',
  ],
  info: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6', 'M12 16.6v.2'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  paste: ['M8 4h8v3H8z', 'M6 5.5H5v15h14v-15h-1', 'M9 12h6M9 15.5h4'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z', 'M15.3 15.3L20 20'],
  sound: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  mute: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M16 9.5l5 5M21 9.5l-5 5'],
  flame: ['M12 21c-3.6 0-6-2.5-6-5.8c0-3.6 3.2-5.6 4.1-9.7C12.8 7.3 18 10.6 18 15.2C18 18.5 15.6 21 12 21z', 'M12 21c-1.6 0-2.6-1.1-2.6-2.6c0-1.7 1.6-2.6 2.1-4.4c1.4 1 3.1 2.6 3.1 4.4c0 1.5-1 2.6-2.6 2.6z'],
  swords: ['M4 4l9.5 9.5M4 4v4M4 4h4', 'M20 4l-9.5 9.5M20 4v4M20 4h-4', 'M11 16l-3 3M13 16l3 3M7.5 15.5l2 2M16.5 15.5l-2 2', 'M6 18l-2 2M18 18l2 2'],
  quill: ['M20 4C12 5 7 10 5.5 18.5', 'M20 4c-1 6-5 10.5-11 11.5', 'M8.6 15.6L4 20'],
  door: ['M6 21V5.5L13.5 3v18', 'M13.5 5H18v16', 'M3.5 21h17', 'M10.5 12.5v.2'],
  book: ['M12 6.5C10 5 7 4.6 4 5v13c3-.4 6 0 8 1.5c2-1.5 5-1.9 8-1.5V5c-3-.4-6 0-8 1.5z', 'M12 6.5v13'],
  scroll: ['M7 4h11a2 2 0 0 1 0 4h-1', 'M7 4a2 2 0 0 0-2 2v11', 'M17 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h9', 'M9 9h5M9 12h5'],
  chevron: ['M6 9l6 6 6-6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  reset: ['M5 12a7 7 0 1 0 2.1-5', 'M5 4v4h4'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v4h16v-4'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  play: ['M8 5l11 7-11 7z'],
};

export interface UiIconProps {
  name: UiIconName;
  /** CSS size (defaults to 1em so the icon follows the surrounding text). */
  size?: string;
  title?: string;
  className?: string;
}

export function UiIcon({ name, size = '1em', title, className }: UiIconProps): ReactElement {
  return (
    <svg
      className={className ? `ww-ui-icon ${className}` : 'ww-ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
