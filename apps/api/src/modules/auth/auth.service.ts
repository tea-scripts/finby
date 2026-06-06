import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { DEFAULT_CATEGORIES } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import type { LoginInput, RegisterInput } from './dto/auth.schemas';
import type {
  AccessTokenPayload,
  AuthResult,
  AuthUserView,
  RefreshTokenPayload,
  TokenPair,
} from './auth.types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly email: EmailService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, this.rounds());
    const firstName = input.displayName.split(/\s+/)[0] ?? input.displayName;
    const workspaceName = `${firstName}'s Finances`;
    const slug = `${slugify(`${firstName} finances`)}-${randomBytes(2).toString('hex')}`;

    try {
      const { user, workspace } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            timezone: input.timezone,
          },
          select: { id: true, displayName: true, email: true, emailVerified: true, timezone: true },
        });

        const createdWorkspace = await tx.workspace.create({
          data: { name: workspaceName, slug, baseCurrency: input.baseCurrency },
          select: { id: true, name: true, slug: true, tier: true, baseCurrency: true },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: createdWorkspace.id,
            userId: createdUser.id,
            role: 'OWNER',
            acceptedAt: new Date(),
          },
        });

        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({
            workspaceId: createdWorkspace.id,
            name: category.name,
            color: category.color,
            icon: category.icon,
            isDefault: true,
          })),
        });

        return { user: createdUser, workspace: createdWorkspace };
      });

      const tokens = await this.issueTokenPair(user.id, user.email);

      try {
        const verifyUrl = await this.issueVerification(user.id);
        await this.email.sendVerification(user.email, user.displayName, verifyUrl);
      } catch (err) {
        this.logger.warn(`Verification email failed for ${user.email}: ${String(err)}`);
      }

      return { user, workspace, ...tokens };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('An account with that email already exists.');
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        workspaceMemberships: {
          include: { workspace: true },
          orderBy: { joinedAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const membership = user.workspaceMemberships[0];
    if (!membership) {
      throw new UnauthorizedException('No workspace is associated with this account.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokenPair(user.id, user.email);
    return {
      user: this.toUserView(user),
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        tier: membership.workspace.tier,
        baseCurrency: membership.workspace.baseCurrency,
      },
      ...tokens,
    };
  }

  /** Revoke the presented refresh token and issue a fresh pair. */
  async rotateRefreshToken(userId: string, oldTokenId: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    await this.prisma.refreshToken.update({
      where: { id: oldTokenId },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(userId, user.email);
  }

  /** Revoke the supplied refresh token. Idempotent — never throws on a bad token. */
  async logout(rawRefreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Always resolves — never reveals whether the email exists (anti-enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const resetToken = createHash('sha256').update(rawToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    // TODO(Phase 2): email `rawToken` to the user via the mail service.
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { resetToken } });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token.');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.rounds());

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetToken: null, resetTokenExpiry: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async verifyEmail(token: string): Promise<void> {
    const emailVerifyToken = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { emailVerifyToken } });
    if (!user || !user.emailVerifyExpiry || user.emailVerifyExpiry.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired verification link.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    });
    try {
      await this.email.sendWelcome(user.email, user.displayName);
    } catch (err) {
      this.logger.warn(`Welcome email failed for ${user.email}: ${String(err)}`);
    }
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return;
    const verifyUrl = await this.issueVerification(user.id);
    try {
      await this.email.sendVerification(user.email, user.displayName, verifyUrl);
    } catch (err) {
      this.logger.warn(`Resend verification email failed for ${user.email}: ${String(err)}`);
    }
  }

  private rounds(): number {
    return this.config.get('BCRYPT_ROUNDS', { infer: true });
  }

  /** Generates a verification token, persists its hash (24h expiry), and returns
   *  the verify URL (with the raw token) to email. */
  private async issueVerification(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const emailVerifyToken = createHash('sha256').update(raw).digest('hex');
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifyToken, emailVerifyExpiry } });
    return `${this.config.get('WEB_URL', { infer: true })}/verify-email?token=${raw}`;
  }

  private async issueTokenPair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId, email } satisfies AccessTokenPayload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti } satisfies RefreshTokenPayload,
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, this.rounds());
    const decoded = this.jwt.decode(refreshToken) as { exp: number } | null;
    const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 86400000);

    await this.prisma.refreshToken.create({
      data: { id: jti, userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private toUserView(user: {
    id: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    timezone: string;
  }): AuthUserView {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
    };
  }
}
