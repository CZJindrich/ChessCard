/** The toast stack (top right). Each toast is a wax-sealed slip that can be dismissed. */
import type { ReactElement } from 'react';
import { useServices } from '../app/services';
import { useStore } from '../app/store';
import type { ToastTone } from '../app/toasts';
import { IconButton } from './Button';
import { UiIcon, type UiIconName } from './icons';
import { WaxSeal } from './WaxSeal';

const TONE_SEAL: Readonly<Record<ToastTone, { wax: string; icon: UiIconName }>> = {
  info: { wax: '#4A4161', icon: 'info' },
  success: { wax: '#2F7A66', icon: 'check' },
  warning: { wax: '#A8521E', icon: 'flame' },
};

export function ToastViewport(): ReactElement {
  const { toasts } = useServices();
  const list = useStore(toasts);
  return (
    <div className="ww-toasts" role="status" aria-live="polite">
      {list.map((toast) => (
        <div key={toast.id} className={`ww-toast ww-toast--${toast.tone}`}>
          <WaxSeal color={TONE_SEAL[toast.tone].wax} ink="#F3E6C8" seed={`toast${toast.tone}`} className="ww-toast__seal">
            <UiIcon name={TONE_SEAL[toast.tone].icon} />
          </WaxSeal>
          <div className="ww-toast__body">
            <p className="ww-toast__title">{toast.title}</p>
            {toast.lines.length > 0 && (
              <ul className="ww-toast__lines">
                {toast.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <IconButton icon="close" label="Dismiss" tooltip={false} sound={null} className="ww-toast__close" onClick={() => toasts.dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
