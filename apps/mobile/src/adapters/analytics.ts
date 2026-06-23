import type { SubscriptionTier } from '@finby/shared';

/** Allow-listed event names — mirrors apps/web/src/lib/analytics.ts. */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'signed_up'
  | 'chat_message_sent'
  | 'chat_cleared'
  | 'transaction_logged'
  | 'budget_set'
  | 'upgrade_modal_viewed'
  | 'checkout_started'
  | 'subscription_activated'
  | 'feedback_submitted';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface PostHogLike {
  capture(event: string, props?: Record<string, unknown>): void;
  identify(id: string, props?: Record<string, unknown>): void;
  reset(): void;
}

/** Drop any property whose key matches the financial/PII deny-list. Total. */
export function sanitizeProps(props: AnalyticsProps | undefined, denyKeys: string[]): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (denyKeys.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export interface Analytics {
  identifyUser(userId: string, tier: SubscriptionTier): void;
  resetAnalytics(): void;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
}

/** Build the analytics surface from an injected PostHog client. When `client`
 *  is null (no key configured) every method is a safe no-op. All methods are
 *  total — analytics must never break the app. */
export function createAnalytics(client: PostHogLike | null, denyKeys: string[]): Analytics {
  return {
    identifyUser(userId, tier) {
      if (!client) return;
      try { client.identify(userId, { tier }); } catch { /* ignore */ }
    },
    resetAnalytics() {
      if (!client) return;
      try { client.reset(); } catch { /* ignore */ }
    },
    track(event, props) {
      if (!client) return;
      try { client.capture(event, sanitizeProps(props, denyKeys)); } catch { /* ignore */ }
    },
  };
}
