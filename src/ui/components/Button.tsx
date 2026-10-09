/**
 * Menu buttons: candlelit pills with an optional wax-seal medallion. Every press plays a UI
 * cue (§16.11). A button that cannot be used keeps focus and hover so its reason can show:
 * it greys out, shakes and plays `uiError` when clicked (§15.6).
 */
import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { useUiSound, type UiSound } from '../app/services';
import { UiIcon, type UiIconName } from './icons';
import { Tooltip } from './Tooltip';
import { WaxDrips } from './WaxDrips';
import { WaxSeal } from './WaxSeal';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'xl' | 'lg' | 'md' | 'sm';

const SEALS: Readonly<Record<ButtonVariant, { wax: string; ink: string }>> = {
  primary: { wax: '#7A1C22', ink: '#FFE3A1' },
  secondary: { wax: '#8E2228', ink: '#F3D9A4' },
  ghost: { wax: '#4A4161', ink: '#E6D9B8' },
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon pressed into a wax-seal medallion at the start of the button. */
  seal?: UiIconName;
  /** Plain icon before the label (no medallion). */
  icon?: UiIconName;
  /** Second line under the label (mode subtitles). */
  subtitle?: ReactNode;
  /** Slow golden pulse (QUICK PLAY). */
  pulse?: boolean;
  /** Gold wax dripping from the lower edge (primary buttons). */
  drips?: boolean;
  /** Cue played on click; null for silence. */
  sound?: UiSound | null;
  /** When set, the button is unusable and shows this reason. */
  disabledReason?: string | null;
}

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  seal,
  icon,
  subtitle,
  pulse = false,
  drips = false,
  sound = 'click',
  disabledReason = null,
  disabled = false,
  className,
  onClick,
  onPointerEnter,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  const play = useUiSound();
  const [shaking, setShaking] = useState(false);
  const blocked = disabled || Boolean(disabledReason);

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (blocked) {
      event.preventDefault();
      play('error');
      setShaking(true);
      return;
    }
    if (sound) play(sound);
    onClick?.(event);
  };

  const button = (
    <button
      {...rest}
      type={type}
      aria-disabled={blocked || undefined}
      className={classes(
        'ww-btn',
        `ww-btn--${variant}`,
        `ww-btn--${size}`,
        seal && 'ww-btn--sealed',
        pulse && 'ww-btn--pulse',
        blocked && 'ww-btn--blocked',
        shaking && 'ww-shake',
        className,
      )}
      onClick={handleClick}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setShaking(false);
      }}
      onPointerEnter={(event) => {
        if (!blocked) play('hover');
        onPointerEnter?.(event);
      }}
    >
      {seal && (
        <WaxSeal color={SEALS[variant].wax} ink={SEALS[variant].ink} seed={seal} className="ww-btn__seal">
          <UiIcon name={seal} />
        </WaxSeal>
      )}
      {icon && <UiIcon name={icon} className="ww-btn__icon" />}
      <span className="ww-btn__text">
        <span className="ww-btn__label">{children}</span>
        {subtitle && <span className="ww-btn__subtitle">{subtitle}</span>}
      </span>
      {drips && variant === 'primary' && <WaxDrips tone="gold" className="ww-btn__drips" offset={37} />}
    </button>
  );

  return disabledReason ? <Tooltip content={disabledReason}>{button}</Tooltip> : button;
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: UiIconName;
  label: string;
  sound?: UiSound | null;
  /** Show the label as a tooltip (default true). */
  tooltip?: boolean;
}

export function IconButton({ icon, label, sound = 'click', tooltip = true, className, onClick, type = 'button', ...rest }: IconButtonProps): ReactElement {
  const play = useUiSound();
  const button = (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={classes('ww-icon-btn', className)}
      onPointerEnter={() => play('hover')}
      onClick={(event) => {
        if (sound) play(sound);
        onClick?.(event);
      }}
    >
      <UiIcon name={icon} />
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
