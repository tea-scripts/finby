import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { DEFAULT_CATEGORIES, DEFAULT_PREFERENCES, type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import { DailyLoginService } from '../gamification/daily-login.service';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './dto/auth.schemas';
import type {
  AccessTokenPayload,
  AuthResult,
  AuthUserView,
  AuthWorkspaceView,
  RefreshTokenPayload,
  TokenPair,
  WorkspaceMembershipView,
} from './auth.types';
import { uniqueAccountNumber } from './account-number.util';
import { parsePreferences } from './preferences.util';

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
    private readonly dailyLogin: DailyLoginService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, this.rounds());
    const firstName = input.displayName.split(/\s+/)[0] ?? input.displayName;
    const workspaceName = `${firstName}'s Finances`;
    const slug = `${slugify(`${firstName} finances`)}-${randomBytes(2).toString('hex')}`;

    const accountNumber = await uniqueAccountNumber(this.prisma);

    try {
      const { user, workspace } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            timezone: input.timezone,
            accountNumber,
            preferences: DEFAULT_PREFERENCES as unknown as Prisma.InputJsonValue,
            acceptedTermsAt: new Date(),
            acceptedTermsVersion: input.acceptedTermsVersion,
          },
          select: {
            id: true,
            displayName: true,
            email: true,
            emailVerified: true,
            timezone: true,
            accountNumber: true,
            preferences: true,
            currentStreak: true,
            longestStreak: true,
          },
        });

        const createdWorkspace = await tx.workspace.create({
          data: { name: workspaceName, slug, baseCurrency: input.baseCurrency, preferredCurrencies: [input.baseCurrency] },
          select: { id: true, name: true, slug: true, tier: true, baseCurrency: true, preferredCurrencies: true },
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
        this.logger.warn(`Verification email failed for userId=${user.id}: ${String(err)}`);
      }

      return { user: this.toUserView(user), workspace: this.toWorkspaceView(workspace), ...tokens };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('An account with that email already exists.');
      }
      throw error;
    }
  }

  /**
   * Create a brand-new user + their personal workspace (no email verification send).
   * Used by the invite-accept-signup flow; the caller links the family membership.
   * Returns the created user view and a fresh token pair.
   */
  async provisionInvitedUser(input: {
    email: string;
    displayName: string;
    password: string;
    baseCurrency: string;
    timezone: string;
    acceptedTermsVersion: string;
  }): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, this.rounds());
    const firstName = input.displayName.split(/\s+/)[0] ?? input.displayName;
    const workspaceName = `${firstName}'s Finances`;
    const slug = `${slugify(`${firstName} finances`)}-${randomBytes(2).toString('hex')}`;
    const accountNumber = await uniqueAccountNumber(this.prisma);

    try {
      const { user, workspace } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            timezone: input.timezone,
            accountNumber,
            preferences: DEFAULT_PREFERENCES as unknown as Prisma.InputJsonValue,
            acceptedTermsAt: new Date(),
            acceptedTermsVersion: input.acceptedTermsVersion,
          },
          select: {
            id: true,
            displayName: true,
            email: true,
            emailVerified: true,
            timezone: true,
            accountNumber: true,
            preferences: true,
            currentStreak: true,
            longestStreak: true,
          },
        });

        const createdWorkspace = await tx.workspace.create({
          data: { name: workspaceName, slug, baseCurrency: input.baseCurrency, preferredCurrencies: [input.baseCurrency] },
          select: { id: true, name: true, slug: true, tier: true, baseCurrency: true, preferredCurrencies: true },
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
      return { user: this.toUserView(user), workspace: this.toWorkspaceView(workspace), ...tokens };
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

    // Daily-login XP: first sign-in of the user's local day. Best-effort — a
    // gamification failure must never break login. Reuses the row already loaded
    // (timezone, tier, lastDailyXpDate) so no extra query is needed.
    try {
      await this.dailyLogin.awardForContext(user.id, {
        timezone: user.timezone,
        tier: membership.workspace.tier,
        lastDailyXpDate: user.lastDailyXpDate,
      });
    } catch (err) {
      this.logger.warn(`Daily login XP failed for userId=${user.id}: ${String(err)}`);
    }

    const tokens = await this.issueTokenPair(user.id, user.email);
    return {
      user: this.toUserView(user),
      workspace: this.toWorkspaceView(membership.workspace),
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

    // Daily-login XP: the client refreshes its short-lived access token on app
    // open, so this is the reliable once-per-local-day signal for a resumed
    // session. Best-effort and self-fetching; never block a token refresh.
    try {
      await this.dailyLogin.awardIfFirstToday(userId);
    } catch (err) {
      this.logger.warn(`Daily login XP failed for userId=${userId}: ${String(err)}`);
    }

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

    const resetUrl = `${this.config.get('WEB_URL', { infer: true })}/reset-password?token=${rawToken}`;
    try {
      await this.email.sendPasswordReset(user.email, resetUrl);
    } catch (err) {
      this.logger.warn(`Reset email failed for userId=${user.id}: ${String(err)}`);
    }
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
      this.logger.warn(`Welcome email failed for userId=${user.id}: ${String(err)}`);
    }
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return;
    const verifyUrl = await this.issueVerification(user.id);
    try {
      await this.email.sendVerification(user.email, user.displayName, verifyUrl);
    } catch (err) {
      this.logger.warn(`Resend verification email failed for userId=${user.id}: ${String(err)}`);
    }
  }

  /** The current authenticated user's profile, with a live emailVerified flag
   *  (used by the client to correct a stale, cross-context persisted value). */
  async getMe(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        timezone: true,
        accountNumber: true,
        preferences: true,
        currentStreak: true,
        longestStreak: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return this.toUserView(user);
  }

  /** Updates display name, timezone, and/or preferences for the authenticated user. */
  async updateProfile(userId: string, dto: UpdateProfileInput): Promise<AuthUserView> {
    const data: Prisma.UserUpdateInput = {};

    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName;
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone;
    }
    if (dto.preferences !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });
      if (!current) {
        throw new UnauthorizedException('User not found.');
      }
      const merged = { ...parsePreferences(current.preferences), ...dto.preferences };
      data.preferences = merged as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        timezone: true,
        accountNumber: true,
        preferences: true,
        currentStreak: true,
        longestStreak: true,
      },
    });

    return this.toUserView(updated);
  }

  async listWorkspaces(userId: string): Promise<WorkspaceMembershipView[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, tier: true, baseCurrency: true } },
      },
    });
    return memberships.map((m) => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      tier: m.workspace.tier,
      role: m.role,
      baseCurrency: m.workspace.baseCurrency,
    }));
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
    accountNumber: string | null;
    preferences: Prisma.JsonValue;
    currentStreak: number;
    longestStreak: number;
  }): AuthUserView {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      accountNumber: user.accountNumber,
      preferences: parsePreferences(user.preferences),
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
    };
  }

  private toWorkspaceView(workspace: {
    id: string;
    name: string;
    slug: string;
    tier: SubscriptionTier;
    baseCurrency: string;
    preferredCurrencies: string[];
  }): AuthWorkspaceView {
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      tier: workspace.tier,
      baseCurrency: workspace.baseCurrency,
      preferredCurrencies: workspace.preferredCurrencies,
    };
  }
}
