import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://budgy:budgy@localhost:5434/budgy',
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
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-20250514');
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
});
