/** Spending-streak badge. By default it hides at 0 so an empty streak never
 *  shows; pass `showZero` to render "🔥 0" as an always-visible indicator.
 *  `sm` is a compact "🔥 7" for tight spots (chat header / cards); `md` is the
 *  full label. From 7 days on it picks up a warm highlight. */
export function StreakBadge({
  streak,
  size = 'md',
  showZero = false,
}: {
  streak: number;
  size?: 'sm' | 'md';
  showZero?: boolean;
}) {
  if (streak <= 0 && !showZero) return null;

  const highlight = streak >= 7;
  const label =
    size === 'sm'
      ? `🔥 ${streak}`
      : streak <= 0
        ? '🔥 0-day streak'
        : streak === 1
          ? '🔥 1-day streak — just getting started!'
          : streak >= 30
            ? `🔥 ${streak}-day streak — incredible!`
            : `🔥 ${streak}-day streak`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        highlight ? 'bg-amber-500/15 text-amber-300' : 'bg-accent-soft text-accent'
      }`}
    >
      {label}
    </span>
  );
}
