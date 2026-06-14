import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@finby/shared'],
  // Required so PostHog's trailing-slash-sensitive endpoints (e.g. /ingest/decide)
  // are not redirected before the rewrite runs.
  skipTrailingSlashRedirect: true,
  // First-party reverse proxy for PostHog: requests go to finby.app/ingest/* instead
  // of *.i.posthog.com, so ad blockers / tracking protection can't drop them by domain.
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? 'finby-web',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN, // source-map upload; absent locally → skipped
  telemetry: false,
});
