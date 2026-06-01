import type { SubscriptionTier } from '@budgy/shared';

/** Shape attached to req.user by JwtStrategy. */
export interface AuthUser {
  userId: string;
  email: string;
}

/** Shape attached to req.user by JwtRefreshStrategy. */
export interface RefreshUser {
  userId: string;
  refreshTokenId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserView {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
}

export interface AuthWorkspaceView {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  baseCurrency: string;
}

export interface AuthResult extends TokenPair {
  user: AuthUserView;
  workspace: AuthWorkspaceView;
}

/** JWT payloads. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
