/**
 * Wire-level primitive aliases.
 * Monetary amounts always travel as decimal strings (never JS number)
 * to prevent floating-point precision loss. See API Contract conventions.
 */
export type Money = string;
/** ISO 4217 uppercase currency code, e.g. "USD", "PHP", "NGN". */
export type CurrencyCode = string;
/** ISO 8601 UTC timestamp string, e.g. "2026-06-02T10:30:00.000Z". */
export type IsoDateTime = string;

export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';
export type WorkspaceMemberRole = 'OWNER' | 'CO_MANAGER' | 'VIEWER';

export type DateFormat = 'MEDIUM' | 'SHORT' | 'ISO';
export type NumberFormat = 'GROUPED' | 'PLAIN';
export type CurrencyDisplay = 'SYMBOL' | 'CODE';
export interface UserPreferences {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  currencyDisplay: CurrencyDisplay;
  /** Daily "did you log anything?" push nudge. Default on. */
  dailyReminders: boolean;
  /** Internal: local date (YYYY-MM-DD) the last daily reminder was sent, for
   *  idempotency. Set server-side; null until first send. */
  lastDailyReminderAt: string | null;
  /** Ids of in-app announcements the user has permanently dismissed ("Got it").
   *  An announcement re-appears until its id lands here. */
  dismissedAnnouncements: string[];
  /** Internal: ISO timestamp of the last "we miss you" re-engagement nudge
   *  (push or email). Set server-side; null until first send. */
  lastReengagedAt: string | null;
}
