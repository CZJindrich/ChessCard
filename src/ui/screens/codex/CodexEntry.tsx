/** Shared building blocks for Codex entries: the entry card, fact rows and stat pills. */
import type { ReactElement, ReactNode } from 'react';

export function CodexEntry({ art, title, subtitle, badges, children, flavor, className }: {
  art?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
  flavor?: string | null;
  className?: string;
}): ReactElement {
  return (
    <article className={className ? `ww-entry ${className}` : 'ww-entry'}>
      {art && <div className="ww-entry__art">{art}</div>}
      <div className="ww-entry__body">
        <header className="ww-entry__head">
          <h3 className="ww-entry__title">{title}</h3>
          {subtitle && <p className="ww-entry__subtitle">{subtitle}</p>}
          {badges && <div className="ww-entry__badges">{badges}</div>}
        </header>
        {children}
        {flavor && <p className="ww-entry__flavor ww-flavor">{flavor}</p>}
      </div>
    </article>
  );
}

export function Facts({ children }: { children: ReactNode }): ReactElement {
  return <dl className="ww-facts">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="ww-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function EmptyResult({ query }: { query: string }): ReactElement {
  return <p className="ww-codex__empty">Nothing in this section matches “{query}”.</p>;
}
