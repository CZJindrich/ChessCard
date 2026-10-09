/**
 * Presentation settings (GDD §14.4) applied to the document root: the art library's
 * accessibility switches as classes, and `ui_scale` as the `--ww-ui-scale` multiplier that
 * theme.css applies to the root font size (every UI length is in rem).
 */
import type { PresentationSettings } from '../../config';

export const ROOT_CLASSES = {
  reducedMotion: 'ww-reduced-motion',
  readableFont: 'ww-readable-font',
  boldOutlines: 'ww-bold-outlines',
} as const;

export function applyPresentation(root: HTMLElement, settings: PresentationSettings): void {
  root.classList.toggle(ROOT_CLASSES.reducedMotion, settings.reduced_motion);
  root.classList.toggle(ROOT_CLASSES.readableFont, settings.readable_font);
  root.classList.toggle(ROOT_CLASSES.boldOutlines, settings.bold_outlines);
  root.style.setProperty('--ww-ui-scale', String(settings.ui_scale / 100));
}
