/**
 * Presentation settings (GDD §14.4) applied to the document root: the art library's
 * accessibility switches as classes, and `ui_scale` as the `--ww-ui-scale` multiplier that
 * theme.css applies to the root font size (every UI length is in rem).
 *
 * `ui_scale` is "clamped so board tiles stay at least 36 px": the game screen publishes the
 * largest scale that keeps its tiles at 36 px or more (`uiScaleCap`), and the root uses the
 * smaller of the two while a game is on screen.
 */
import type { PresentationSettings } from '../../config';
import { createStore, type WritableStore } from './store';

export const ROOT_CLASSES = {
  reducedMotion: 'ww-reduced-motion',
  readableFont: 'ww-readable-font',
  boldOutlines: 'ww-bold-outlines',
} as const;

/** The largest UI scale (1 = 100%) the screen on show allows, or null for no limit. */
export const uiScaleCap: WritableStore<number | null> = createStore<number | null>(null);

/** The scale actually applied: the setting, capped by the screen. */
export function effectiveUiScale(settings: PresentationSettings, cap: number | null): number {
  const chosen = settings.ui_scale / 100;
  return cap === null ? chosen : Math.min(chosen, cap);
}

export function applyPresentation(root: HTMLElement, settings: PresentationSettings, cap: number | null = null): void {
  root.classList.toggle(ROOT_CLASSES.reducedMotion, settings.reduced_motion);
  root.classList.toggle(ROOT_CLASSES.readableFont, settings.readable_font);
  root.classList.toggle(ROOT_CLASSES.boldOutlines, settings.bold_outlines);
  root.style.setProperty('--ww-ui-scale', String(effectiveUiScale(settings, cap)));
}
