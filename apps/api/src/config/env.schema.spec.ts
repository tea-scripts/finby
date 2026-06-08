import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5434/app',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid config and applies defaults', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.BCRYPT_ROUNDS).toBe(12);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
  });

  it('throws and names a missing required var', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({ ...base, API_PORT: '4000', BCRYPT_ROUNDS: '10' });
    expect(env.API_PORT).toBe(4000);
    expect(env.BCRYPT_ROUNDS).toBe(10);
  });

  it('rejects a too-short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  describe('production guard (superRefine)', () => {
    // A fully-configured production env: the base required vars plus the
    // optional-in-dev vars that the guard promotes to mandatory in production.
    const prodBase = {
      ...base,
      NODE_ENV: 'production',
      WEB_URL: 'https://chat.finby.app',
      STRIPE_SECRET_KEY: 'sk_live_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      RESEND_API_KEY: 're_x',
      ANTHROPIC_API_KEY: 'sk-ant-x',
    };

    it('accepts a fully-configured production env', () => {
      expect(() => validateEnv(prodBase)).not.toThrow();
    });

    it('refuses to start when a production-required var is missing', () => {
      const { STRIPE_SECRET_KEY: _omit, ...rest } = prodBase;
      expect(() => validateEnv(rest)).toThrow(/PRODUCTION/);
      expect(() => validateEnv(rest)).toThrow(/STRIPE_SECRET_KEY/);
    });

    it('refuses to start when WEB_URL is left as the localhost default', () => {
      // WEB_URL has a localhost default, so an unset value parses as localhost.
      const { WEB_URL: _omit, ...rest } = prodBase;
      expect(() => validateEnv(rest)).toThrow(/WEB_URL/);
    });

    it('does NOT enforce production-required vars in development', () => {
      // Same missing STRIPE_SECRET_KEY, but dev must still boot.
      const { STRIPE_SECRET_KEY: _omit, ...rest } = prodBase;
      expect(() => validateEnv({ ...rest, NODE_ENV: 'development' })).not.toThrow();
    });
  });
});
