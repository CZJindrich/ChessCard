/** HP (wax drop) and ATK (blade) pills in Cinzel, as on piece bases (§16.6). */
import type { ReactElement } from 'react';

export function StatPills({ hp, atk, className }: { hp: number; atk: number; className?: string }): ReactElement {
  return (
    <span className={className ? `ww-stat-pills ${className}` : 'ww-stat-pills'}>
      <span className="ww-pill ww-pill--hp" aria-label={`${hp} HP`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5C10 5 13 7.4 13 10.4a5 5 0 0 1-10 0C3 7.4 6 5 8 1.5Z" />
        </svg>
        {hp}
      </span>
      <span className="ww-pill ww-pill--atk" aria-label={`${atk} ATK`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M12.8 1.6L14.4 3.2L7 10.6L5.4 9Z M4.6 9.8L6.2 11.4L4.4 13.2L2.8 11.6Z" />
        </svg>
        {atk}
      </span>
    </span>
  );
}
