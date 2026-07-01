import type { SubscriptionTier } from '@finby/shared';

/** The web app's billing surface (where the web UpgradeModal lives). NOTE: the web
 *  APP is chat.finby.app; marketing is finby.app — do not consolidate.
 *  ⚠️ Linking out to purchase is an App Store 3.1.1 pre-submission stopgap. */
export const WEB_BILLING_URL = 'https://chat.finby.app/settings';

/** Open the web billing page for upgrade/change (best-effort).
 *  NOTE: `react-native` is imported dynamically (not at module top-level) because
 *  its source uses Flow syntax that the Vitest/Rollup parser cannot handle for pure
 *  logic tests — a static import would break `vitest run` for this module even
 *  though this function is never exercised by those tests. Metro (the RN bundler)
 *  supports dynamic `import()` natively, so this has no runtime cost on-device. */
export function openWebBilling(): void {
  void import('react-native')
    .then(({ Linking }) => Linking.openURL(WEB_BILLING_URL))
    .catch(() => {});
}

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
