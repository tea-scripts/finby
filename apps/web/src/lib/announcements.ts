/** In-app announcements. Defined in code, shown one-at-a-time, dismissed
 *  per-user (ids stored in user.preferences.dismissedAnnouncements). */

export type AnnouncementMode = 'simple' | 'steps';
export type AnnouncementPrimaryKind = 'dismiss' | 'enable-push';

export interface AnnouncementStep {
  label: string;
  caption: string;
}

export interface Announcement {
  id: string;
  mode: AnnouncementMode;
  title: string;
  body: string;
  /** Illustration, in priority order: lottie > image > emoji. */
  emoji?: string;
  image?: string;
  lottie?: string;
  /** Small eyebrow label above the title. */
  hashtag?: string;
  /** Celebratory confetti burst on open. */
  confetti?: boolean;
  /** Numbered how-to (steps mode only). */
  steps?: AnnouncementStep[];
  primary: { label: string; kind: AnnouncementPrimaryKind };
  /** Optional ISO date after which the announcement stops showing. */
  expiresAt?: string;
}

/** The first active (non-expired), undismissed announcement, or null. */
export function pickAnnouncement(
  list: Announcement[],
  dismissedIds: string[],
  now: Date,
): Announcement | null {
  return (
    list.find(
      (item) =>
        !dismissedIds.includes(item.id) &&
        (!item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime()),
    ) ?? null
  );
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'streaks-2026-06',
    mode: 'simple',
    lottie: '/lottie/streak-flame.json',
    emoji: '🔥',
    confetti: true,
    hashtag: 'New',
    title: 'Streaks are here',
    body: 'Log something every day to build a spending streak. Keep the flame alive — miss a day and it resets to zero.',
    primary: { label: 'Got it', kind: 'dismiss' },
  },
  {
    id: 'in-app-notifs-2026-06',
    mode: 'steps',
    lottie: '/lottie/notif-bell.json',
    emoji: '🔔',
    hashtag: 'Stay on track',
    title: 'Turn on notifications',
    body: 'Get your daily summary and a gentle nudge if you forget to log — right on this device.',
    steps: [
      { label: 'Tap “Turn on notifications”', caption: 'We’ll ask your browser for permission.' },
      { label: 'Allow when prompted', caption: 'One tap — no app store, no settings hunting.' },
      { label: 'You’re set', caption: 'Daily summary + reminders land on this device.' },
    ],
    primary: { label: 'Turn on notifications', kind: 'enable-push' },
  },
  {
    id: 'receipt-scanning-2026-06',
    mode: 'steps',
    lottie: '/lottie/receipt-scan.json',
    emoji: '🧾',
    confetti: true,
    hashtag: 'New',
    title: 'Scan receipts, skip the typing',
    body: 'Snap a photo of any receipt and Finby fills in the merchant, amount, date, and category for you. Available on Pro and up.',
    steps: [
      { label: 'Tap the camera in chat', caption: 'Or “Scan Receipt” on the Transactions screen.' },
      { label: 'Snap your receipt', caption: 'We read the details — photos are never stored.' },
      { label: 'Review and save', caption: 'Fix anything we misread, then one tap to log it.' },
    ],
    primary: { label: 'Got it', kind: 'dismiss' },
  },
  {
    id: 'accounts-2026-06',
    mode: 'steps',
    lottie: '/lottie/account-cards.json',
    emoji: '🏦',
    confetti: true,
    hashtag: 'New',
    title: 'Set up your accounts',
    body: 'Add your bank, cash, e-wallet, brokerage, or crypto accounts so every transaction lands in the right place and your balances stay accurate.',
    steps: [
      { label: 'Just ask in chat', caption: '“Add my bank account” or “create a savings account with $5,000”.' },
      { label: 'Or open Settings → Accounts', caption: 'Add, rename, and archive accounts any time.' },
      { label: 'Balances track themselves', caption: 'Every transaction you log updates the right account.' },
    ],
    primary: { label: 'Got it', kind: 'dismiss' },
  },
];
