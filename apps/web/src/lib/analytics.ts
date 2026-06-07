import posthog from 'posthog-js';
import type { SubscriptionTier } from './types';
import { DENY_KEYS } from './observability/scrub';

/** Allow-listed event names — `track` accepts nothing else (compile-time + catalog). */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'signed_up'
  | 'chat_message_sent'
  | 'transaction_logged'
  | 'budget_set'
  | 'upgrade_modal_viewed'
  | 'checkout_started'
  | 'subscription_activated';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

let initialized = false;

/** Drop any property whose key matches the financial/PII deny-list. Total — never throws. */
export function sanitizeProps(props?: AnalyticsProps): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (DENY_KEYS.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/** Returns true when a PostHog key is configured. */
function hasKey(): boolean {
  return !!process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

export function initAnalytics(): void {
  if (initialized || !hasKey() || typeof window === 'undefined') return;
  try {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      autocapture: false, // never capture typed/on-screen values (finance app)
      capture_pageview: false, // we fire pageviews manually on route change
      disable_session_recording: true,
      person_profiles: 'identified_only',
    });
    initialized = true;
  } catch {
    /* analytics must never break the app */
  }
}

export function identifyUser(userId: string, tier: SubscriptionTier): void {
  if (!hasKey()) return;
  try {
    posthog.identify(userId, { tier });
  } catch {
    /* ignore */
  }
}

export function resetAnalytics(): void {
  if (!hasKey()) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!hasKey()) return;
  try {
    posthog.capture(event, sanitizeProps(props));
  } catch {
    /* ignore */
  }
}

export function capturePageview(path: string): void {
  if (!hasKey()) return;
  try {
    posthog.capture('$pageview', { $current_url: path });
  } catch {
    /* ignore */
  }
}
