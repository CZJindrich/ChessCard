/**
 * Self-hosted typefaces (GDD §16.3). Import this module once from the app entry:
 *
 *   import './art/fonts';
 *
 * Families are referenced through the `--ww-font-*` custom properties in `art.css`
 * so the `readable_font` setting can swap them for `system-ui`.
 */
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/im-fell-english/400-italic.css';

export const FONT_FAMILIES = {
  display: "'Cinzel Decorative', 'Cinzel', serif",
  label: "'Cinzel', serif",
  body: "'EB Garamond', Georgia, serif",
  flavor: "'IM Fell English', 'EB Garamond', Georgia, serif",
} as const;
