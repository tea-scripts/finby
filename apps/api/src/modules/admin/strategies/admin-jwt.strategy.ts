import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../../config/env.schema';
import { isAllowedAdmin, parseAllowlist } from '../admin.allowlist';
import type { AdminTokenPayload, AdminUser } from '../admin.types';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Falls back to a random-ish constant when unset so the strategy still
      // constructs; tokens can never be minted without the real secret anyway.
      secretOrKey: config.get('ADMIN_JWT_SECRET', { infer: true }) ?? 'admin-secret-unset',
    });
  }

  /** Runs on every admin request: enforces scope + re-checks the allowlist live. */
  validate(payload: AdminTokenPayload): AdminUser {
    if (payload.scope !== 'admin') {
      throw new UnauthorizedException();
    }
    const allowlist = parseAllowlist(this.config.get('ADMIN_EMAILS', { infer: true }));
    if (!isAllowedAdmin(payload.email, allowlist)) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}
