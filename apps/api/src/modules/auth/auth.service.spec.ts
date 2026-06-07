import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EmailService } from '../email/email.service';
import { parsePreferences } from './preferences.util';

const ACCESS_SECRET = 'access-secret-access-secret-0001';
const REFRESH_SECRET = 'refresh-secret-refresh-secret-01';

const emailMock = {
  sendVerification: jest.fn().mockResolvedValue(undefined),
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};

function createPrismaMock() {
  const model = () => ({
    create: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  });
  const client = {
    user: model(),
    workspace: model(),
    workspaceMember: model(),
    category: model(),
    refreshToken: model(),
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (c: typeof client) => unknown)(client);
    }
    return Promise.all(arg as unknown[]);
  });
  return client;
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

const configMock = {
  get: jest.fn((key: keyof Env) => {
    const values: Partial<Record<keyof Env, unknown>> = {
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      BCRYPT_ROUNDS: 4,
      WEB_URL: 'https://app.finby.test',
    };
    return values[key];
  }),
} as unknown as ConfigService<Env, true>;

function buildService(prisma: PrismaMock): AuthService {
  return new AuthService(
    prisma as unknown as PrismaService,
    new JwtService({}),
    configMock,
    emailMock as unknown as EmailService,
  );
}

const registerInput = {
  displayName: 'Aisha Bello',
  email: 'aisha@example.com',
  password: 'SuperSecret123!',
  baseCurrency: 'USD',
  timezone: 'Asia/Manila',
};

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password, creates user+workspace+categories in one transaction, returns tokens', async () => {
      const prisma = createPrismaMock();
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        displayName: 'Aisha Bello',
        email: 'aisha@example.com',
        emailVerified: false,
        timezone: 'Asia/Manila',
        accountNumber: '1234567890',
        preferences: null,
      });
      prisma.workspace.create.mockResolvedValue({
        id: 'w1',
        name: "Aisha's Finances",
        slug: 'aisha-finances-ab12',
        tier: 'FREE',
        baseCurrency: 'USD',
        preferredCurrencies: ['USD'],
      });
      prisma.workspaceMember.create.mockResolvedValue({ id: 'm1' });
      prisma.category.createMany.mockResolvedValue({ count: 10 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

      const service = buildService(prisma);
      const result = await service.register(registerInput);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(prisma.workspace.create).toHaveBeenCalledTimes(1);
      expect(prisma.workspaceMember.create).toHaveBeenCalledTimes(1);
      expect(prisma.category.createMany).toHaveBeenCalledTimes(1);

      const userCreateArg = prisma.user.create.mock.calls[0]?.[0] as {
        data: { passwordHash: string };
      };
      expect(userCreateArg.data.passwordHash).not.toBe(registerInput.password);
      expect(await bcrypt.compare(registerInput.password, userCreateArg.data.passwordHash)).toBe(
        true,
      );

      const categoryArg = prisma.category.createMany.mock.calls[0]?.[0] as {
        data: unknown[];
      };
      expect(categoryArg.data).toHaveLength(10);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user.email).toBe('aisha@example.com');
      expect(result.user.accountNumber).toBe('1234567890');
      expect(result.user.preferences).toEqual({
        dateFormat: 'MEDIUM',
        numberFormat: 'GROUPED',
        currencyDisplay: 'SYMBOL',
      });
      expect(result.workspace.tier).toBe('FREE');
      expect(result.workspace.preferredCurrencies).toEqual(['USD']);
      expect(emailMock.sendVerification).toHaveBeenCalledTimes(1);
    });

    it('register still succeeds if the verification email throws', async () => {
      emailMock.sendVerification.mockRejectedValueOnce(new Error('smtp down'));
      const prisma = createPrismaMock();
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        displayName: 'Aisha Bello',
        email: 'aisha@example.com',
        emailVerified: false,
        timezone: 'Asia/Manila',
        accountNumber: '1234567890',
        preferences: null,
      });
      prisma.workspace.create.mockResolvedValue({
        id: 'w1',
        name: "Aisha's Finances",
        slug: 'aisha-finances-ab12',
        tier: 'FREE',
        baseCurrency: 'USD',
        preferredCurrencies: ['USD'],
      });
      prisma.workspaceMember.create.mockResolvedValue({ id: 'm1' });
      prisma.category.createMany.mockResolvedValue({ count: 10 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

      const service = buildService(prisma);
      await expect(service.register(registerInput)).resolves.toHaveProperty('accessToken');
    });

    it('throws ConflictException when the email is already taken', async () => {
      const prisma = createPrismaMock();
      prisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      const service = buildService(prisma);
      await expect(service.register(registerInput)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    async function userWithPassword(password: string) {
      return {
        id: 'u1',
        email: 'aisha@example.com',
        displayName: 'Aisha Bello',
        emailVerified: true,
        timezone: 'Asia/Manila',
        accountNumber: '1234567890',
        preferences: { dateFormat: 'ISO', numberFormat: 'PLAIN', currencyDisplay: 'CODE' },
        passwordHash: await bcrypt.hash(password, 4),
        workspaceMemberships: [
          {
            workspace: {
              id: 'w1',
              name: "Aisha's Finances",
              slug: 'aisha-finances-ab12',
              tier: 'FREE',
              baseCurrency: 'USD',
              preferredCurrencies: ['USD', 'EUR'],
            },
          },
        ],
      };
    }

    it('returns tokens for valid credentials and records last login', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(await userWithPassword('SuperSecret123!'));
      prisma.user.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

      const service = buildService(prisma);
      const result = await service.login({ email: 'aisha@example.com', password: 'SuperSecret123!' });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.workspace.id).toBe('w1');
      expect(result.workspace.preferredCurrencies).toEqual(['USD', 'EUR']);
      expect(result.user.accountNumber).toBe('1234567890');
      expect(result.user.preferences).toEqual({
        dateFormat: 'ISO',
        numberFormat: 'PLAIN',
        currencyDisplay: 'CODE',
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = buildService(prisma);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(await userWithPassword('TheRealPassword1!'));
      const service = buildService(prisma);
      await expect(
        service.login({ email: 'aisha@example.com', password: 'WrongPassword1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('rotateRefreshToken (refresh)', () => {
    it('revokes the old token and issues a new pair', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ email: 'aisha@example.com' });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt2' });

      const service = buildService(prisma);
      const pair = await service.rotateRefreshToken('u1', 'rt1');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(pair.accessToken).toEqual(expect.any(String));
      expect(pair.refreshToken).toEqual(expect.any(String));
    });
  });

  describe('logout', () => {
    it('revokes the supplied refresh token by its jti', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const jwt = new JwtService({});
      const rawToken = await jwt.signAsync(
        { sub: 'u1', jti: 'rt1' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      const service = new AuthService(
        prisma as unknown as PrismaService,
        jwt,
        configMock,
        emailMock as unknown as EmailService,
      );
      await service.logout(rawToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt1', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('does not throw for an invalid token (idempotent)', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      await expect(service.logout('not-a-jwt')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('marks verified, clears token, sends welcome on a valid token', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      const hash = createHash('sha256').update('raw1').digest('hex');
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', email: 'a@b.com', displayName: 'Tea', emailVerifyExpiry: new Date(Date.now() + 1000),
      });
      prisma.user.update.mockResolvedValueOnce({});
      await service.verifyEmail('raw1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { emailVerifyToken: hash } });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null }),
      }));
      expect(emailMock.sendWelcome).toHaveBeenCalledWith('a@b.com', 'Tea');
    });

    it('throws on expired token', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', email: 'a@b.com', displayName: 'Tea', emailVerifyExpiry: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('raw1')).rejects.toThrow(UnauthorizedException);
    });

    it('throws on unknown token', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.verifyEmail('nope')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resendVerification', () => {
    it('does nothing for an unknown user id', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const service = buildService(prisma);
      await service.resendVerification('missing');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailMock.sendVerification).not.toHaveBeenCalled();
    });

    it('does nothing when the user is already verified', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Tea',
        emailVerified: true,
      });
      const service = buildService(prisma);
      await service.resendVerification('u1');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailMock.sendVerification).not.toHaveBeenCalled();
    });

    it('issues a new token and sends a verification email for an unverified user', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Tea',
        emailVerified: false,
      });
      prisma.user.update.mockResolvedValueOnce({});
      const service = buildService(prisma);
      await service.resendVerification('u1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(emailMock.sendVerification).toHaveBeenCalledWith(
        'a@b.com',
        'Tea',
        expect.stringContaining('/verify-email?token='),
      );
    });
  });

  describe('forgotPassword email', () => {
    it('sends a reset email for an existing user', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com' });
      prisma.user.update.mockResolvedValueOnce({});
      await service.forgotPassword('a@b.com');
      expect(emailMock.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.stringContaining('/reset-password?token='));
    });
    it('does not send for an unknown email', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.forgotPassword('nope@b.com');
      expect(emailMock.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('returns the current user view with defaults when preferences is null', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', displayName: 'Tea', email: 'a@b.com', emailVerified: true, timezone: 'UTC',
        accountNumber: '1234567890', preferences: null,
      });
      await expect(service.getMe('u1')).resolves.toEqual({
        id: 'u1', displayName: 'Tea', email: 'a@b.com', emailVerified: true, timezone: 'UTC',
        accountNumber: '1234567890',
        preferences: { dateFormat: 'MEDIUM', numberFormat: 'GROUPED', currencyDisplay: 'SYMBOL' },
      });
    });
    it('returns the stored preferences when present', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', displayName: 'Tea', email: 'a@b.com', emailVerified: true, timezone: 'UTC',
        accountNumber: '1234567890',
        preferences: { dateFormat: 'ISO', numberFormat: 'PLAIN', currencyDisplay: 'CODE' },
      });
      await expect(service.getMe('u1')).resolves.toEqual({
        id: 'u1', displayName: 'Tea', email: 'a@b.com', emailVerified: true, timezone: 'UTC',
        accountNumber: '1234567890',
        preferences: { dateFormat: 'ISO', numberFormat: 'PLAIN', currencyDisplay: 'CODE' },
      });
    });
    it('throws UnauthorizedException when the user is missing', async () => {
      const prisma = createPrismaMock();
      const service = buildService(prisma);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.getMe('missing')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('parsePreferences', () => {
    const defaults = { dateFormat: 'MEDIUM', numberFormat: 'GROUPED', currencyDisplay: 'SYMBOL' };

    it('returns defaults for null', () => {
      expect(parsePreferences(null)).toEqual(defaults);
    });

    it('returns defaults for garbage', () => {
      expect(parsePreferences('nonsense')).toEqual(defaults);
      expect(parsePreferences({ dateFormat: 'BOGUS' })).toEqual(defaults);
      expect(parsePreferences(42)).toEqual(defaults);
    });

    it('returns the provided values for a full valid object', () => {
      expect(
        parsePreferences({ dateFormat: 'ISO', numberFormat: 'PLAIN', currencyDisplay: 'CODE' }),
      ).toEqual({ dateFormat: 'ISO', numberFormat: 'PLAIN', currencyDisplay: 'CODE' });
    });

    it('fills missing keys with defaults for a partial object', () => {
      expect(parsePreferences({ dateFormat: 'SHORT' })).toEqual({
        dateFormat: 'SHORT',
        numberFormat: 'GROUPED',
        currencyDisplay: 'SYMBOL',
      });
    });
  });
});
