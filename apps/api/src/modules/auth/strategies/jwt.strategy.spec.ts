import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { JwtStrategy } from './jwt.strategy';
import type { AccessTokenPayload } from '../auth.types';

const ACCESS_SECRET = 'access-secret-access-secret-0001';

function createConfigMock(): ConfigService<Env, true> {
  return {
    get: jest.fn().mockReturnValue(ACCESS_SECRET),
  } as unknown as ConfigService<Env, true>;
}

describe('JwtStrategy', () => {
  it('builds the auth user from the verified token payload', () => {
    const strategy = new JwtStrategy(createConfigMock());
    const payload: AccessTokenPayload = { sub: 'user-1', email: 'tea@example.com' };

    expect(strategy.validate(payload)).toEqual({
      userId: 'user-1',
      email: 'tea@example.com',
    });
  });
});
