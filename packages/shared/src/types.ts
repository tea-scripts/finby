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
