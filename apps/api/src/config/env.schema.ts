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

  // Datastores (required)
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Auth / JWT (required)
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // LLM / Anthropic (Phase 2)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // FX / Frankfurter (Phase 2)
  FRANKFURTER_API_URL: z.string().url().default('https://api.frankfurter.app'),

  // Market data / Alpha Vantage (Phase 4)
  ALPHA_VANTAGE_API_KEY: z.string().optional(),

  // Billing (Phase 5)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
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
