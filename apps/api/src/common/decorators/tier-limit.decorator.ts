import { SetMetadata } from '@nestjs/common';

/** Numeric/value tier limits from the locked matrix that need a count/value check. */
export type TierLimitKey = 'customCategories' | 'currencies';

export interface TierLimitOptions {
  /** For the 'currencies' limit: which request-body field holds the currency code. */
  currencyField?: string;
}

export interface TierLimitMeta {
  key: TierLimitKey;
  options?: TierLimitOptions;
}

export const TIER_LIMIT_KEY = 'tierLimit';

/** Enforces a numeric/value tier limit on a mutation route (via TierLimitGuard). */
export const RequireWithinLimit = (key: TierLimitKey, options?: TierLimitOptions) =>
  SetMetadata(TIER_LIMIT_KEY, { key, options } satisfies TierLimitMeta);
