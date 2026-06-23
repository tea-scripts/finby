import PostHog from 'posthog-react-native';
import type { PostHogLike } from './analytics';

/** posthog-react-native binding. Returns null when no key is configured, so
 *  createAnalytics no-ops. Verified on device. */
export function makePostHog(): PostHogLike | null {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const client = new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
  return {
    capture: (event: string, props?: Record<string, unknown>) => {
      // Bridge: PostHogLike contract accepts Record<string, unknown>, but posthog-react-native
      // requires PostHogEventProperties (uses JsonType). Cast safely here to delegate type
      // compatibility to PostHog's internal handling.
      client.capture(event, (props || {}) as Record<string, string | number | boolean | null>);
    },
    identify: (id: string, props?: Record<string, unknown>) => {
      // Bridge: same as above for identify
      client.identify(id, (props || {}) as Record<string, string | number | boolean | null>);
    },
    reset: () => client.reset(),
  };
}
