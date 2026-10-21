import clsx from 'clsx';
import { Link, type LinkProps } from 'react-router-dom';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-paper-line bg-white text-ink hover:bg-paper',
  ghost: 'text-ink-soft hover:bg-brand-50 hover:text-ink',
} as const;

/** A router link that looks like a <Button>. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: keyof typeof VARIANTS; size?: 'sm' | 'md' }) {
  return (
    <Link
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
        size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
