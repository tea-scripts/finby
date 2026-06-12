import { z } from 'zod';

/**
 * Single source of truth for environment configuration.
 * Phase 1 essentials are required; later-phase integrations (LLM, market
 * data, billing) are optional so the app boots before those phases land.
 * Validation runs once at startup — missing/invalid vars fail fast.
 */
export const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:3000'),

  // Rate limiting (global fallback — sensitive auth routes set stricter per-route limits).
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // Datastores (required)
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Auth / JWT (required)
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Admin dashboard (super-admin analytics). Optional so the API boots without it;
  // admin routes return 401 until ADMIN_EMAILS + ADMIN_JWT_SECRET are set.
  ADMIN_EMAILS: z.string().default(''), // comma-separated allowlist, lowercased at use
  ADMIN_JWT_SECRET: z.string().min(16).optional(),
  ADMIN_JWT_TTL: z.string().default('8h'), // one workday session; re-login (with TOTP) after.
  ADMIN_TOTP_ISSUER: z.string().default('Finby Admin'),
  ADMIN_SENTRY_URL: z.string().url().optional(), // dashboard link shown in the ops panel

  // LLM / Anthropic (Phase 2)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // FX / Frankfurter (Phase 2)
  FRANKFURTER_API_URL: z.string().url().default('https://api.frankfurter.app'),

  // Market data / Alpha Vantage (Phase 4)
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_API_URL: z.string().url().default('https://www.alphavantage.co'),

  // Billing (Phase 5)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  // Lemon Squeezy (Merchant of Record). Optional — checkout/webhook no-op until set.
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PRO: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PREMIUM: z.string().optional(),
  LEMONSQUEEZY_VARIANT_FAMILY: z.string().optional(),

  // Web Push / VAPID (Phase 5). Optional — push no-ops until configured.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@finby.app'),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Finby <noreply@finby.app>'),
  // Inbox that receives user review/feedback notifications.
  FEEDBACK_NOTIFY_TO: z.string().email().default('support@finby.app'),

  // Chat memory token budgets
  FREE_ACTIVE_WINDOW_TOKEN_BUDGET: z.coerce.number().int().positive().default(4000),
  PRO_COMPRESSION_THRESHOLD: z.coerce.number().int().positive().default(8000),
  PREMIUM_COMPRESSION_THRESHOLD: z.coerce.number().int().positive().default(12000),

  // Observability (Phase 1) — optional; Sentry no-ops when SENTRY_DSN is unset.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).superRefine((env, ctx) => {
  // Hard gate for production deploys only. Dev/test still boot with a partial env
  // so local development and the test suite are unaffected.
  // (DATABASE_URL, REDIS_URL and the JWT secrets are already required in the base
  // schema above, so they fail fast regardless of NODE_ENV and aren't repeated here.)
  if (env.NODE_ENV !== 'production') return;

  // Optional-in-dev vars that become mandatory in production. Without these a deploy
  // boots "healthy" and then fails silently at runtime (no billing, no email, no AI).
  const productionRequired = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'ANTHROPIC_API_KEY',
  ] as const;

  for (const key of productionRequired) {
    const value = env[key];
    if (!value || value.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `[PRODUCTION] Required environment variable "${key}" is missing or empty. Refusing to start.`,
        path: [key],
      });
    }
  }

  // WEB_URL drives the CORS origin and Stripe checkout redirects. It has a localhost
  // default, so a missing prod value won't surface as "empty" — assert it was set to a
  // real public origin instead, or checkout/CORS break in production.
  if (/localhost|127\.0\.0\.1/.test(env.WEB_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `[PRODUCTION] WEB_URL must be a public origin, not the localhost default (got "${env.WEB_URL}"). Refusing to start.`,
      path: ['WEB_URL'],
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Used as the `validate` callback for NestJS ConfigModule.
 * Throws a single, readable error listing every failed var.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
