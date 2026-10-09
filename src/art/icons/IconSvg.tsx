/** Shared `<svg>` wrapper for icons: role, accessible label, size and view box. */
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../util/svg';
import '../art.css';

export interface IconProps {
  size?: number;
  title?: string;
  className?: string;
}

export function IconSvg({
  size = 32,
  viewBox = '0 0 32 32',
  title,
  className,
  children,
  height,
  still = false,
}: IconProps & { viewBox?: string; children: ReactNode; height?: number; still?: boolean }): ReactElement {
  return (
    <svg
      className={cx('ww-art ww-icon', still && 'ww-still', className)}
      width={size}
      height={height ?? size}
      viewBox={viewBox}
      role="img"
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}
