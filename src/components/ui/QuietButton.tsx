// QuietButton.tsx - low-emphasis pill action for chat composer/session rows.
// One accent (violet) reserved for the single primary action per row; every
// other action stays quiet (bordered, ink-on-card) so it doesn't compete for
// attention. See the nextVillage chat aesthetics protocol.
import React, { ButtonHTMLAttributes } from 'react';
import classNames from 'classnames';

interface QuietButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'quiet' | 'solid';
  icon?: React.ReactNode;
  loading?: boolean;
}

const QuietButton: React.FC<QuietButtonProps> = ({
  children,
  variant = 'quiet',
  icon,
  loading = false,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent/40',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'solid'
          ? 'bg-accent text-white hover:bg-accent/90'
          : 'border border-hair bg-card text-ink hover:border-accent/40 hover:text-accent',
        className
      )}
      {...props}
    >
      {loading ? (
        <span className={classNames(
          'h-3.5 w-3.5 rounded-full border-2 border-t-transparent animate-spin',
          variant === 'solid' ? 'border-white/70' : 'border-ink/40'
        )} />
      ) : icon}
      {children}
    </button>
  );
};

export default QuietButton;
