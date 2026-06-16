import { Prisma } from '@prisma/client';

/** Canonical launch announcements. Upserted by `key` on boot so every
 *  environment has them; `key` matches the legacy id stored in
 *  user.preferences.dismissedAnnouncements for backfill continuity. */
export const ANNOUNCEMENT_DEFS: Prisma.AnnouncementCreateInput[] = [
  {
    key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE', order: 0,
    title: 'Streaks are here',
    body: 'Log something every day to build a spending streak. Keep the flame alive — miss a day and it resets to zero.',
    emoji: '🔥', lottieKey: 'streak-flame', hashtag: 'New', confetti: true,
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'in-app-notifs-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 1,
    title: 'Turn on notifications',
    body: 'Get your daily summary and a gentle nudge if you forget to log — right on this device.',
    emoji: '🔔', lottieKey: 'notif-bell', hashtag: 'Stay on track', confetti: false,
    steps: [
      { label: 'Tap “Turn on notifications”', caption: 'We’ll ask your browser for permission.' },
      { label: 'Allow when prompted', caption: 'One tap — no app store, no settings hunting.' },
      { label: 'You’re set', caption: 'Daily summary + reminders land on this device.' },
    ],
    primaryLabel: 'Turn on notifications', primaryKind: 'ENABLE_PUSH',
  },
  {
    key: 'receipt-scanning-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 2,
    title: 'Scan receipts, skip the typing',
    body: 'Snap a photo of any receipt and Finby fills in the merchant, amount, date, and category for you. Available on Pro and up.',
    emoji: '🧾', lottieKey: 'receipt-scan', hashtag: 'New', confetti: true,
    steps: [
      { label: 'Tap the camera in chat', caption: 'Or “Scan Receipt” on the Transactions screen.' },
      { label: 'Snap your receipt', caption: 'We read the details — photos are never stored.' },
      { label: 'Review and save', caption: 'Fix anything we misread, then one tap to log it.' },
    ],
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'accounts-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 3,
    title: 'Set up your accounts',
    body: 'Add your bank, cash, e-wallet, brokerage, or crypto accounts so every transaction lands in the right place and your balances stay accurate.',
    emoji: '🏦', lottieKey: 'account-cards', hashtag: 'New', confetti: true,
    steps: [
      { label: 'Just ask in chat', caption: '“Add my bank account” or “create a savings account with $5,000”.' },
      { label: 'Or open Settings → Accounts', caption: 'Add, rename, and archive accounts any time.' },
      { label: 'Balances track themselves', caption: 'Every transaction you log updates the right account.' },
    ],
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'gamification-xp-launch', status: 'PUBLISHED', mode: 'SIMPLE', order: 4,
    title: 'Earn XP for every habit',
    body: 'Log transactions, maintain streaks, and hit goals to earn XP. Use it to recover missed streak days — no more monthly limits.',
    emoji: '⚡', lottieKey: 'xp-bolt', hashtag: 'New', confetti: true,
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'gamification-achievements-launch', status: 'PUBLISHED', mode: 'SIMPLE', order: 5,
    title: 'Achievements are here',
    body: 'Unlock badges for streaks, transactions logged, and goals hit. Flex your progress and share your milestones.',
    emoji: '🏆', lottieKey: 'achievement-trophy', hashtag: 'New', confetti: true,
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
];
