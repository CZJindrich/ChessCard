/**
 * The reason line (GDD §15.6): when an action can't be done, its reason shows on a vellum slip
 * above the hand (the control itself shakes). Info notices (no hint found) use the same slip.
 */
import type { ReactElement } from 'react';
import { useGameSnapshot } from './context';

export function NoticeLine(): ReactElement | null {
  const { notice } = useGameSnapshot();
  if (!notice) return null;
  return (
    <div key={notice.id} className={`ww-notice ww-notice--${notice.tone}`} role="alert" data-testid="notice">
      {notice.text}
    </div>
  );
}
