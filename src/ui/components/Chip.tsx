/**
 * Chips and segmented choices. A selected chip shows a gold diamond as well as a gold rim,
 * so the state never depends on colour alone (GDD §15.5). Unavailable options stay focusable
 * and explain themselves in a tooltip.
 */
import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { useUiSound } from '../app/services';
import { Tooltip } from './Tooltip';

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  /** Unavailable, with the reason shown on hover/focus. */
  disabledReason?: string | null;
  /** Extra explanation on hover (ignored when `disabledReason` is set). */
  hint?: ReactNode;
  className?: string;
  /** Accessible name when the visible content is graphical. */
  label?: string;
}

export function Chip({ children, selected = false, onSelect, disabledReason = null, hint, className, label }: ChipProps): ReactElement {
  const play = useUiSound();
  const blocked = Boolean(disabledReason);
  const chip = (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={blocked || undefined}
      aria-label={label}
      className={classes('ww-chip', selected && 'ww-chip--on', blocked && 'ww-chip--blocked', className)}
      onPointerEnter={() => {
        if (!blocked) play('hover');
      }}
      onClick={() => {
        if (blocked) {
          play('error');
          return;
        }
        play('click');
        onSelect?.();
      }}
    >
      {children}
    </button>
  );
  const tip = disabledReason ?? hint;
  return tip ? <Tooltip content={tip}>{chip}</Tooltip> : chip;
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is graphical. */
  ariaLabel?: string;
  hint?: ReactNode;
  disabledReason?: string | null;
}

export interface SegmentedProps<T extends string | number> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  /** Lock the whole control, with a reason. */
  disabledReason?: string | null;
}

/** A radio group drawn as joined chips. Arrow keys move between the usable options. */
export function Segmented<T extends string | number>({ options, value, onChange, label, className, disabledReason = null }: SegmentedProps<T>): ReactElement {
  const play = useUiSound();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const usable = (o: SegmentOption<T>): boolean => !disabledReason && !o.disabledReason;

  const choose = (option: SegmentOption<T>): void => {
    if (!usable(option)) {
      play('error');
      return;
    }
    if (option.value !== value) play('click');
    onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const start = Math.max(0, options.findIndex((o) => o.value === value));
    for (let i = 1; i <= options.length; i++) {
      const index = (start + step * i + options.length * i) % options.length;
      const option = options[index];
      if (usable(option)) {
        choose(option);
        refs.current[index]?.focus();
        return;
      }
    }
  };

  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;
  const group = (
    <div role="radiogroup" aria-label={label} className={classes('ww-segmented', disabledReason && 'ww-segmented--blocked', className)} onKeyDown={onKeyDown}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const reason = disabledReason ? null : option.disabledReason;
        const button = (
          <button
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!usable(option) || undefined}
            aria-label={option.ariaLabel}
            tabIndex={index === tabStop ? 0 : -1}
            className={classes('ww-chip', 'ww-segment', selected && 'ww-chip--on', !usable(option) && 'ww-chip--blocked')}
            onPointerEnter={() => {
              if (usable(option)) play('hover');
            }}
            onClick={() => choose(option)}
          >
            {option.label}
          </button>
        );
        // A locked group explains itself once; per-option hints would stack on top of it.
        const tip = disabledReason ? null : (reason ?? option.hint);
        return tip ? (
          <Tooltip key={String(option.value)} content={tip}>
            {button}
          </Tooltip>
        ) : (
          <span key={String(option.value)} className="ww-segment-slot">
            {button}
          </span>
        );
      })}
    </div>
  );
  return disabledReason ? <Tooltip content={disabledReason}>{group}</Tooltip> : group;
}
