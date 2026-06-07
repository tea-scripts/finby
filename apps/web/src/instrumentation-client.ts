import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

// Session replay deliberately omitted — it can capture on-screen amounts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enableLogs: false,
  beforeSend: scrubEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
