/** A range slider with a wax-seal thumb and a filled tallow track; shows its value in Cinzel. */
import { useId, type CSSProperties, type ReactElement } from 'react';
import { useUiSound } from '../app/services';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format = String, disabled = false, className }: SliderProps): ReactElement {
  const id = useId();
  const play = useUiSound();
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={className ? `ww-slider ${className}` : 'ww-slider'}>
      <input
        id={id}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--ww-fill': `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={() => play('click')}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) play('click');
        }}
      />
      <output htmlFor={id} className="ww-slider__value">
        {format(value)}
      </output>
    </div>
  );
}
