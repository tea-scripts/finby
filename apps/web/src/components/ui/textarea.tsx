import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className = '', rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`w-full rounded-xl border bg-canvas/60 px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-accent/30 md:text-sm ${
        invalid ? 'border-danger/70 focus:border-danger' : 'border-line focus:border-accent'
      } ${className}`.trimEnd()}
      {...rest}
    />
  );
});
