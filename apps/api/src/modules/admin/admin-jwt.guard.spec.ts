import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

// Verifies the strategy's secret/scope/allowlist gate directly: a token signed
// with the USER secret (or lacking scope:'admin') must not validate.
describe('Admin auth rejects user tokens', () => {
  const ADMIN_SECRET = 'admin-secret-aaaaaaaaaaaaaaaa';
  const USER_SECRET = 'user-secret-bbbbbbbbbbbbbbbb';
  const config = {
    get: (k: string) =>
      k === 'ADMIN_JWT_SECRET' ? ADMIN_SECRET : k === 'ADMIN_EMAILS' ? 'admin@x.com' : undefined,
  } as unknown as ConfigService;
  const jwt = new JwtService({});

  it('a user-secret token is not verifiable with the admin secret', () => {
    const userToken = jwt.sign({ sub: 'u1', email: 'admin@x.com' }, { secret: USER_SECRET });
    expect(() => jwt.verify(userToken, { secret: ADMIN_SECRET })).toThrow();
  });

  it('validate() rejects a token without scope:admin even if signed correctly', () => {
    const strategy = new AdminJwtStrategy(config as never);
    expect(() => strategy.validate({ sub: 'u1', email: 'admin@x.com', scope: 'user' as never })).toThrow(
      UnauthorizedException,
    );
  });
});
