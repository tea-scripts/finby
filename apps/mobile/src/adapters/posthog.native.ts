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
    capture: (event, props) => client.capture(event, props as any),
    identify: (id, props) => client.identify(id, props as any),
    reset: () => client.reset(),
  };
}
