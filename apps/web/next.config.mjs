import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@finby/shared'],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? 'finby-web',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN, // source-map upload; absent locally → skipped
  telemetry: false,
});
