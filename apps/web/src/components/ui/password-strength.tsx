'use client';

import { passwordStrength, type PasswordScore } from '@/lib/password-strength';

const BAR: Record<Exclude<PasswordScore, 0>, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-success',
};
const TEXT: Record<Exclude<PasswordScore, 0>, string> = {
  1: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-success',
};

/** Three-segment password strength meter (Weak / So-so / Strong). Hidden while
 *  the field is empty. */
export function PasswordStrength({ value }: { value: string }) {
  const { score, label } = passwordStrength(value);
  if (score === 0) return null;

  return (
    <div className="mt-2" role="status" aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((seg) => (
          <span
            key={seg}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              seg <= score ? BAR[score] : 'bg-line'
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-right text-xs font-medium ${TEXT[score]}`}>
        <span className="sr-only">Password strength: </span>
        {label}
      </p>
    </div>
  );
}
