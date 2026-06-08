export type PasswordScore = 0 | 1 | 2 | 3;

export interface PasswordStrengthResult {
  score: PasswordScore; // 0 = empty, 1 = weak, 2 = so-so, 3 = strong
  label: string;
}

const LABELS: Record<Exclude<PasswordScore, 0>, string> = {
  1: 'Weak',
  2: 'So-so',
  3: 'Strong',
};

/**
 * Lightweight password-strength heuristic (no external dependency). Scores on
 * length + character-class variety (lower, upper, digit, symbol). Returns 0 for
 * empty so the meter can hide.
 */
export function passwordStrength(password: string): PasswordStrengthResult {
  if (!password) return { score: 0, label: '' };

  const len = password.length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;

  let score: Exclude<PasswordScore, 0>;
  if (len < 8 || classes <= 1) {
    score = 1; // too short, or no variety
  } else if ((len >= 12 && classes >= 3) || (len >= 14 && classes >= 2)) {
    score = 3; // long and varied
  } else {
    score = 2; // meets the minimum with some variety
  }

  return { score, label: LABELS[score] };
}
