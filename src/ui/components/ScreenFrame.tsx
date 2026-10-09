/**
 * Shared layout for menu screens: the night sky over Sconcewick behind a dimming veil, a
 * header (Back · title · settings) and a scrollable body with an optional action bar.
 */
import type { ReactElement, ReactNode } from 'react';
import { SkyBackdrop } from '../../art';
import { usePresentation, useServices } from '../app/services';
import { Button, IconButton } from './Button';

export interface ScreenFrameProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Defaults to navigating back. */
  onBack?: () => void;
  backLabel?: string;
  /** Extra controls on the right of the header, before the settings gear. */
  headerExtra?: ReactNode;
  /** The settings gear (hidden on the Settings screen itself). */
  showSettings?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function ScreenFrame({ title, subtitle, children, footer, onBack, backLabel = 'Back', headerExtra, showSettings = true, className, bodyClassName }: ScreenFrameProps): ReactElement {
  const { nav, overlays } = useServices();
  const presentation = usePresentation();
  const back = onBack ?? (() => nav.back());
  return (
    <div className={className ? `ww-screen ${className}` : 'ww-screen'}>
      <SkyBackdrop reducedMotion={presentation.reduced_motion} className="ww-screen__sky" />
      <div className="ww-screen__veil" aria-hidden="true" />
      <header className="ww-screen__header">
        <div className="ww-screen__header-start">
          <Button variant="ghost" size="sm" icon="back" sound="back" onClick={back}>
            {backLabel}
          </Button>
        </div>
        <div className="ww-screen__heading">
          <h1 className="ww-screen__title">{title}</h1>
          {subtitle && <p className="ww-screen__subtitle">{subtitle}</p>}
        </div>
        <div className="ww-screen__header-end">
          {headerExtra}
          {showSettings && <IconButton icon="gear" label="Settings" onClick={() => overlays.update((o) => ({ ...o, settingsOpen: true }))} />}
        </div>
      </header>
      <main className={bodyClassName ? `ww-screen__body ${bodyClassName}` : 'ww-screen__body'}>{children}</main>
      {footer && <footer className="ww-screen__footer">{footer}</footer>}
    </div>
  );
}
