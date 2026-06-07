import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../../config/env.schema';
import type { AccessTokenPayload, AuthUser } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /**
   * Trust the verified access token directly — it already carries the user id
   * and email, so we skip a per-request `user.findUnique`. This keeps the hot
   * authenticated path off the DB connection pool. The token's 15-min TTL is
   * the freshness bound; refresh-token revocation (checked in JwtRefreshStrategy)
   * is the lever for cutting off access early (e.g. on account deletion).
   */
  validate(payload: AccessTokenPayload): AuthUser {
    return { userId: payload.sub, email: payload.email };
  }
}
