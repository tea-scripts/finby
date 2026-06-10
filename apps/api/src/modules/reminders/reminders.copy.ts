export interface ReminderCopy {
  title: string;
  body: string;
}

const VARIANTS: ReadonlyArray<(name: string) => string> = [
  (n) => `${n}, spent anything today? Log it in 5 seconds 💸`,
  (n) => `${n}, let's close out your day — what did you spend?`,
  (n) => `Quick check-in: anything to log before bed, ${n}?`,
  (n) => `${n}, keeping today honest? Tap to log your spending.`,
];

/** Pick a deterministic, name-personalized variant for a given day index. */
export function reminderCopy(name: string, dayIndex: number): ReminderCopy {
  const safe = name?.trim() || 'there';
  const i = ((dayIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  return { title: 'Finby', body: VARIANTS[i]!(safe) };
}

/** 1-based day-of-year in UTC; used to rotate copy variants deterministically. */
export function dayOfYearUtc(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - startOfYear) / 86_400_000);
}
