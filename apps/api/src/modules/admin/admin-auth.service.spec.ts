import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AdminAuthService } from './admin-auth.service';

function makeService(opts: {
  allowlist?: string;
  user?: { id: string; email: string; passwordHash: string } | null;
  totpRow?: { email: string; secret: string } | null;
}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
    adminTotpSecret: {
      findUnique: jest.fn().mockResolvedValue(opts.totpRow ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
  } as never;
  const config = {
    get: (k: string) => {
      if (k === 'ADMIN_EMAILS') return opts.allowlist ?? 'admin@x.com';
      if (k === 'ADMIN_JWT_SECRET') return 'test-admin-secret-0123456789';
      if (k === 'ADMIN_JWT_TTL') return '8h';
      if (k === 'ADMIN_TOTP_ISSUER') return 'Finby Admin';
      return undefined;
    },
  } as never;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.admin.token') } as never;
  return new AdminAuthService(prisma, config, jwt);
}

describe('AdminAuthService.login', () => {
  const hash = bcrypt.hashSync('correct-horse', 10);
  const user = { id: 'u1', email: 'admin@x.com', passwordHash: hash };

  it('rejects a non-allowlisted email with 401', async () => {
    const svc = makeService({ allowlist: 'someone@else.com', user });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password with 401', async () => {
    const svc = makeService({ user });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'wrong', totp: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a bad TOTP code with 401', async () => {
    const secret = authenticator.generateSecret();
    const svc = makeService({ user, totpRow: { email: 'admin@x.com', secret } });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: '123456' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an admin token on password + allowlist + valid TOTP', async () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    const svc = makeService({ user, totpRow: { email: 'admin@x.com', secret } });
    const res = await svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: code });
    expect(res.accessToken).toBe('signed.admin.token');
  });
});

describe('AdminAuthService.enroll', () => {
  const hash = bcrypt.hashSync('correct-horse', 10);
  const user = { id: 'u1', email: 'admin@x.com', passwordHash: hash };

  it('returns an otpauth URI for an allowlisted admin with no existing secret', async () => {
    const svc = makeService({ user, totpRow: null });
    const res = await svc.enroll({ email: 'admin@x.com', password: 'correct-horse' });
    expect(res.otpauthUrl).toContain('otpauth://totp/');
  });

  it('refuses enrollment for a non-allowlisted email', async () => {
    const svc = makeService({ allowlist: 'other@x.com', user, totpRow: null });
    await expect(
      svc.enroll({ email: 'admin@x.com', password: 'correct-horse' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
