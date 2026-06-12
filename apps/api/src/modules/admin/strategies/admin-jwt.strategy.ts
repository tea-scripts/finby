import { randomBytes } from 'node:crypto';
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
      // When ADMIN_JWT_SECRET is unset (admin auth disabled), fall back to a
      // per-boot random secret rather than a hardcoded constant. The strategy
      // still constructs (so the API boots), but no token can ever validate —
      // the fallback is never known to anyone and changes each boot. This keeps
      // the signature layer fail-closed even if ADMIN_EMAILS is misconfigured.
      secretOrKey:
        config.get('ADMIN_JWT_SECRET', { infer: true }) ?? randomBytes(32).toString('hex'),
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
