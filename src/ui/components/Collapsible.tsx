/** A disclosure section: a header button that shows or hides its region. */
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { useUiSound } from '../app/services';
import { UiIcon } from './icons';

export interface CollapsibleProps {
  title: ReactNode;
  /** Short note on the right of the header (e.g. "4 changed"). */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Collapsible({ title, summary, children, defaultOpen = false, className }: CollapsibleProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const titleId = useId();
  const summaryId = useId();
  const play = useUiSound();
  return (
    <div className={['ww-collapsible', open && 'ww-collapsible--open', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="ww-collapsible__head"
        aria-expanded={open}
        aria-controls={regionId}
        aria-labelledby={titleId}
        aria-describedby={summary ? summaryId : undefined}
        onPointerEnter={() => play('hover')}
        onClick={() => {
          play('click');
          setOpen((o) => !o);
        }}
      >
        <UiIcon name="chevron" className="ww-collapsible__chevron" />
        <span id={titleId} className="ww-collapsible__title">
          {title}
        </span>
        {summary && (
          <span id={summaryId} className="ww-collapsible__summary">
            {summary}
          </span>
        )}
      </button>
      <div id={regionId} className="ww-collapsible__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
