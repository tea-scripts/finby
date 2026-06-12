import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className = '', ...rest },
  ref,
) {
  const dateClass = rest.type === 'date' ? 'appearance-none' : '';
  return (
    <input
      ref={ref}
      className={`w-full rounded-xl border bg-canvas/60 px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-accent/30 md:text-sm ${
        invalid ? 'border-danger/70 focus:border-danger' : 'border-line focus:border-accent'
      } ${dateClass} ${className}`.trimEnd()}
      {...rest}
    />
  );
});
