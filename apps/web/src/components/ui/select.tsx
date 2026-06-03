import { forwardRef, type SelectHTMLAttributes } from 'react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`w-full appearance-none rounded-xl border border-line bg-canvas/60 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
