import type { SubscriptionTier } from '@finby/shared';

/** The web app's billing surface (where the web UpgradeModal lives). NOTE: the web
 *  APP is chat.finby.app; marketing is finby.app — do not consolidate.
 *  ⚠️ Linking out to purchase is an App Store 3.1.1 pre-submission stopgap. */
export const WEB_BILLING_URL = 'https://chat.finby.app/settings';

export const TIER_NAME: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

/** Rank used only to pick the Upgrade/Switch verb (never for pricing/enforcement). */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};
