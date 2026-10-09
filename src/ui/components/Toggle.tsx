/**
 * On/Off switch drawn as a candle: lit (gold flame, knob right, "On") or snuffed
 * (grey wick, knob left, "Off"). The written state keeps it readable without colour.
 */
import type { ReactElement } from 'react';
import { useUiSound } from '../app/services';
import { Tooltip } from './Tooltip';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabledReason?: string | null;
  className?: string;
}

export function Toggle({ checked, onChange, label, disabledReason = null, className }: ToggleProps): ReactElement {
  const play = useUiSound();
  const blocked = Boolean(disabledReason);
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={blocked || undefined}
      className={['ww-toggle', checked && 'ww-toggle--on', blocked && 'ww-toggle--blocked', className].filter(Boolean).join(' ')}
      onPointerEnter={() => {
        if (!blocked) play('hover');
      }}
      onClick={() => {
        if (blocked) {
          play('error');
          return;
        }
        play('click');
        onChange(!checked);
      }}
    >
      <span className="ww-toggle__track" aria-hidden="true">
        <span className="ww-toggle__knob">
          <svg viewBox="0 0 16 16" className="ww-toggle__flame">
            <path d="M8 1.5C9.6 4.3 12 6 12 9.2C12 11.8 10.2 14 8 14S4 11.8 4 9.2C4 6 6.4 4.3 8 1.5Z" />
          </svg>
        </span>
      </span>
      <span className="ww-toggle__text">{checked ? 'On' : 'Off'}</span>
    </button>
  );
  return disabledReason ? <Tooltip content={disabledReason}>{toggle}</Tooltip> : toggle;
}
