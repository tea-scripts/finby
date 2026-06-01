import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Env } from '../../../config/env.schema';
import type { RefreshTokenPayload, RefreshUser } from '../auth.types';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: RefreshTokenPayload): Promise<RefreshUser> {
    const raw = (req.body as { refreshToken?: unknown }).refreshToken;
    if (typeof raw !== 'string') {
      throw new UnauthorizedException();
    }

    const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!record || record.revokedAt !== null || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const matches = await bcrypt.compare(raw, record.tokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token mismatch.');
    }

    return { userId: payload.sub, refreshTokenId: record.id };
  }
}
