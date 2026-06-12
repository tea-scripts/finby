import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { isAllowedAdmin, parseAllowlist } from './admin.allowlist';
import type { AdminTokenPayload } from './admin.types';
import type { AdminEnrollInput, AdminLoginInput } from './dto/admin.schemas';

export interface AdminLoginResult {
  accessToken: string;
  email: string;
}

export interface AdminEnrollResult {
  otpauthUrl: string;
  secret: string; // shown once so the admin can also enter it manually
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  /** Generic 401 — never reveal which factor failed. */
  private deny(): never {
    throw new UnauthorizedException('Invalid admin credentials');
  }

  private allowlist(): string[] {
    return parseAllowlist(this.config.get('ADMIN_EMAILS', { infer: true }));
  }

  /** Verify email∈allowlist + password. Returns the user or denies. */
  private async verifyPasswordAndAllowlist(email: string, password: string) {
    if (!isAllowedAdmin(email, this.allowlist())) this.deny();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) this.deny();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) this.deny();
    return user;
  }

  async login(input: AdminLoginInput): Promise<AdminLoginResult> {
    const user = await this.verifyPasswordAndAllowlist(input.email, input.password);
    const totpRow = await this.prisma.adminTotpSecret.findUnique({ where: { email: input.email } });
    if (!totpRow) {
      // Not enrolled yet — force enrollment first.
      throw new UnauthorizedException('TOTP enrollment required');
    }
    if (!input.totp || !authenticator.check(input.totp, totpRow.secret)) this.deny();

    const payload: AdminTokenPayload = { sub: user.id, email: user.email, scope: 'admin' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('ADMIN_JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('ADMIN_JWT_TTL', { infer: true }),
    });
    return { accessToken, email: user.email };
  }

  async enroll(input: AdminEnrollInput): Promise<AdminEnrollResult> {
    const user = await this.verifyPasswordAndAllowlist(input.email, input.password);
    const existing = await this.prisma.adminTotpSecret.findUnique({ where: { email: input.email } });
    if (existing) {
      // Already enrolled — don't allow silent re-enrollment (would lock out the real admin).
      throw new UnauthorizedException('TOTP already enrolled');
    }
    const secret = authenticator.generateSecret();
    await this.prisma.adminTotpSecret.create({ data: { email: input.email, secret } });
    const issuer = this.config.get('ADMIN_TOTP_ISSUER', { infer: true });
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    return { otpauthUrl, secret };
  }
}
