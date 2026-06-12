export interface ReengagementCopy {
  title: string;
  body: string;
}

const VARIANTS: ReadonlyArray<(name: string) => string> = [
  (n) => `${n}, your money's been quiet 👀 — got a minute to catch up?`,
  (n) => `It's been a while, ${n}. One message and you're back on track 💬`,
  (n) => `${n}, your budget misses you. What have you been spending on?`,
];

/** Pick a deterministic, name-personalized variant for a given day index. */
export function reengagementCopy(name: string, dayIndex: number): ReengagementCopy {
  const safe = name?.trim() || 'there';
  const i = ((dayIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  return { title: 'Finby', body: VARIANTS[i]!(safe) };
}
