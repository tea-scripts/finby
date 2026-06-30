/** Congratulatory streak copy, bucketed by streak length. Each band carries a
 *  few variants so the message feels fresh when the user opens the streak UI.
 *  Shared by web (StreakRepair tooltip) and mobile (streak sheet). */
interface StreakBand {
  min: number;
  messages: string[];
}

const BANDS: StreakBand[] = [
  { min: 365, messages: ['A full year of showing up. Legendary. 🏆', '365+ days — this is mastery. Incredible.', 'One year strong. Absolutely unstoppable.'] },
  { min: 100, messages: ['100+ days! You are in rare company. 🔥', 'Triple digits — you are a machine.', 'Over 100 days strong. Phenomenal discipline.', 'Century club. Your future self thanks you.'] },
  { min: 60, messages: ['Two months straight — elite consistency.', '60+ days! This is a real habit now.', 'Two months of showing up. Outstanding work.'] },
  { min: 30, messages: ['A whole month! You built something real. 🎉', '30+ days — this is just who you are now.', 'One month strong. Seriously impressive.', 'A month of discipline. Keep it rolling!'] },
  { min: 14, messages: ['Two weeks in — momentum is on your side.', '14+ days! The habit is taking hold.', 'Two solid weeks. You are crushing it.'] },
  { min: 7, messages: ['A full week! Brilliant start. 🔥', 'Seven days strong — keep the fire going.', 'One week down. You are on a roll!', 'A week of consistency. Well done.'] },
  { min: 2, messages: ['Nice — your streak is building!', 'Back-to-back days. Keep it up!', 'You are stacking days. Love to see it.', 'Momentum is starting — don’t stop now!'] },
  { min: 1, messages: ['Day one — every streak starts here. 🔥', 'You are on the board! See you tomorrow.', 'First day logged. The journey begins.'] },
  { min: 0, messages: ['Log a transaction to start your streak! 🔥', 'No streak yet — log something today to begin.', 'Your streak starts the moment you log a transaction.'] },
];

/** The message variants for a streak length. Always non-empty (final band min:0). */
export function streakBand(streak: number): string[] {
  const band = BANDS.find((b) => streak >= b.min);
  return (band ?? BANDS[BANDS.length - 1]!).messages;
}

/** A single congratulatory message. `rand` is injectable for deterministic tests. */
export function streakCelebration(streak: number, rand: () => number = Math.random): string {
  const messages = streakBand(streak);
  return messages[Math.floor(rand() * messages.length)] ?? messages[0]!;
}
