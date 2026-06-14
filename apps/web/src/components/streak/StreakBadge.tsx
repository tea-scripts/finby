/** Spending-streak badge. By default it hides at 0 so an empty streak never
 *  shows; pass `showZero` to render "🔥 0" as an always-visible indicator.
 *  `sm` is a compact "🔥 7" for tight spots (chat header / cards); `md` is the
 *  full label. From 7 days on it picks up a warm highlight. When `atRisk` is
 *  set the badge takes a warning ring; with `onClick` it renders as a button
 *  (the streak-repair entry point). */
export function StreakBadge({
  streak,
  size = 'md',
  showZero = false,
  atRisk = false,
  onClick,
}: {
  streak: number;
  size?: 'sm' | 'md';
  showZero?: boolean;
  atRisk?: boolean;
  onClick?: () => void;
}) {
  if (streak <= 0 && !showZero && !atRisk) return null;

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

  const tone =
    atRisk
      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40'
      : highlight
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-accent-soft text-accent';
  const className = `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={atRisk ? 'Streak at risk — repair it' : `Streak: ${streak} days`}
      >
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}
