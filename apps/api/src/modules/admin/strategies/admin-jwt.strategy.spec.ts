import { UnauthorizedException } from '@nestjs/common';
import { AdminJwtStrategy } from './admin-jwt.strategy';

function makeStrategy(allowlist: string): AdminJwtStrategy {
  const config = {
    get: (k: string) =>
      k === 'ADMIN_JWT_SECRET' ? 'test-admin-secret-0123456789' : allowlist,
  } as never;
  return new AdminJwtStrategy(config);
}

describe('AdminJwtStrategy.validate', () => {
  it('accepts an admin-scoped, allowlisted token', () => {
    const s = makeStrategy('a@x.com');
    expect(s.validate({ sub: 'u1', email: 'a@x.com', scope: 'admin' })).toEqual({
      userId: 'u1',
      email: 'a@x.com',
    });
  });

  it('rejects when scope is not admin', () => {
    const s = makeStrategy('a@x.com');
    expect(() => s.validate({ sub: 'u1', email: 'a@x.com', scope: 'user' as never })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when email left the allowlist', () => {
    const s = makeStrategy('other@x.com');
    expect(() => s.validate({ sub: 'u1', email: 'a@x.com', scope: 'admin' })).toThrow(
      UnauthorizedException,
    );
  });
});
