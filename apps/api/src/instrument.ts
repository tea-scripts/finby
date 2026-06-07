import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from './observability/scrub';

/**
 * Initialise Sentry for the API. No-ops (returns false) when SENTRY_DSN is
 * unset, so local/dev/test stay silent and only production reports.
 *
 * NOTE: this runs at the very top of main.ts, BEFORE ConfigModule loads the
 * .env file — so it reads real process.env. That is intentional: Sentry is a
 * production-only concern (DSN is set on the host, never in local .env).
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number.isFinite(rate) ? rate : 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
  return true;
}

// Side-effect init for the import-first requirement in main.ts.
initSentry();
