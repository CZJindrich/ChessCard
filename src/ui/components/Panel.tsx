/**
 * Panels: night-vellum surfaces with a brass filigree border and wax drips along the top
 * edge (GDD §16.1, §16.4). The `vellum` tone is the light parchment used for slips.
 */
import { useId, type ReactElement, type ReactNode } from 'react';
import { WaxDrips, type DripTone } from './WaxDrips';

export interface PanelProps {
  children: ReactNode;
  title?: ReactNode;
  /** Right side of the title row. */
  actions?: ReactNode;
  tone?: 'night' | 'vellum';
  /** Drip colour, or false for a clean top edge. */
  drips?: DripTone | false;
  dripOffset?: number;
  filigree?: boolean;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}

export function Panel({
  children,
  title,
  actions,
  tone = 'night',
  drips = 'plum',
  dripOffset = 0,
  filigree = true,
  className,
  as: Tag = 'section',
}: PanelProps): ReactElement {
  const titleId = useId();
  const classes = ['ww-panel', `ww-panel--${tone}`, filigree && 'ww-filigree', drips && 'ww-panel--dripping', className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} aria-labelledby={title ? titleId : undefined}>
      {drips && <WaxDrips tone={drips} offset={dripOffset} className="ww-panel__drips" />}
      {(title || actions) && (
        <header className="ww-panel__head">
          {title && (
            <h2 id={titleId} className="ww-panel__title">
              {title}
            </h2>
          )}
          {actions && <div className="ww-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
