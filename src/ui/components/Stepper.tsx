/** − value + stepper for integer and stepped decimal parameters. */
import type { ReactElement } from 'react';
import { useUiSound } from '../app/services';
import { UiIcon } from './icons';
import { Tooltip } from './Tooltip';

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabledReason?: string | null;
}

/** Round to the step grid without float noise (0.1 + 0.05 → 0.15). */
export function stepValue(value: number, delta: number, min: number, max: number, step: number): number {
  const next = Math.round((value + delta * step) / step) * step;
  return Number(Math.min(max, Math.max(min, next)).toFixed(4));
}

export function Stepper({ label, value, min, max, step = 1, onChange, format = String, disabledReason = null }: StepperProps): ReactElement {
  const play = useUiSound();
  const blocked = Boolean(disabledReason);
  const nudge = (delta: number): void => {
    const next = stepValue(value, delta, min, max, step);
    if (blocked || next === value) {
      play('error');
      return;
    }
    play('click');
    onChange(next);
  };
  const control = (
    <div role="group" aria-label={label} className={blocked ? 'ww-stepper ww-stepper--blocked' : 'ww-stepper'}>
      <button type="button" className="ww-stepper__btn" aria-label={`Decrease ${label}`} aria-disabled={blocked || value <= min || undefined} onClick={() => nudge(-1)}>
        <UiIcon name="minus" />
      </button>
      <output className="ww-stepper__value" aria-live="polite">
        {format(value)}
      </output>
      <button type="button" className="ww-stepper__btn" aria-label={`Increase ${label}`} aria-disabled={blocked || value >= max || undefined} onClick={() => nudge(1)}>
        <UiIcon name="plus" />
      </button>
    </div>
  );
  return disabledReason ? <Tooltip content={disabledReason}>{control}</Tooltip> : control;
}
