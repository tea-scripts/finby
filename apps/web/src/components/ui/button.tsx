import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_8px_24px_rgba(29,110,245,0.32)]',
  ghost: 'border border-line bg-surface text-ink hover:border-accent/50 hover:bg-surface-2',
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      {/* Keep the label in flow (just transparent) while loading so the button's
          width never changes — appending the spinner inline would widen the
          button and shift/squeeze adjacent layout (e.g. the chat composer's
          input). opacity-0 (not invisible) keeps the label in the a11y tree. */}
      <span className={`inline-flex items-center gap-2 ${loading ? 'opacity-0' : ''}`}>
        {children}
      </span>
    </button>
  );
}
