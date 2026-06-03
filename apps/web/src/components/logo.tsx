/** Finby brand mark (fin / upward-trend) + wordmark. Colors are locked. */
export function Logo({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1d6ef5" />
        <path
          d="M9 21 L16 9 L19 15 L23 11"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23" cy="11" r="1.8" fill="white" />
      </svg>
      {showWordmark && (
        <span
          style={{ color: '#1d6ef5', fontWeight: 800, letterSpacing: '-1px' }}
          className="text-2xl"
        >
          Finby
        </span>
      )}
    </span>
  );
}
