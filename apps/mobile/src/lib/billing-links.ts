import type { SubscriptionTier } from '@finby/shared';

/** The web app's billing surface (where the web UpgradeModal lives). NOTE: the web
 *  APP is chat.finby.app; marketing is finby.app — do not consolidate.
 *  ⚠️ Linking out to purchase is an App Store 3.1.1 pre-submission stopgap. */
export const WEB_BILLING_URL = 'https://chat.finby.app/settings';

/** Open the web billing page for upgrade/change (best-effort).
 *  NOTE: `react-native` is required lazily (not at module top-level, and via
 *  `require` rather than dynamic `import()`) because its source uses Flow syntax
 *  that the Vitest/Rollup parser cannot handle for pure logic tests — a static
 *  import would break `vitest run` for this module even though this function is
 *  never exercised by those tests. `require()` (unlike a top-level `import`) isn't
 *  eagerly resolved by Vitest's module graph, so it's never actually reached there.
 *  A literal dynamic `import()` was tried first, but Metro's babel preset doesn't
 *  transform it to CommonJS for Jest (only for Metro's own bundler runtime), so
 *  under RNTL/Jest it throws "dynamic import callback was invoked without
 *  --experimental-vm-modules" — silently swallowed by the catch below, so
 *  `Linking.openURL` was never actually called under test. `require()` has no such
 *  gap: Jest and Metro both handle it as plain CommonJS. */
export function openWebBilling(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see note above
    const { Linking } = require('react-native') as typeof import('react-native');
    void Linking.openURL(WEB_BILLING_URL);
  } catch {
    // best-effort — mirrors the previous swallow-on-failure behavior.
  }
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
