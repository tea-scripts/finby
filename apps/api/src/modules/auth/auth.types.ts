import type { SubscriptionTier, UserPreferences } from '@finby/shared';

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
  accountNumber: string | null;
  preferences: UserPreferences;
}

export interface AuthWorkspaceView {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  baseCurrency: string;
  preferredCurrencies: string[];
}

export interface AuthResult extends TokenPair {
  user: AuthUserView;
  workspace: AuthWorkspaceView;
}

export interface WorkspaceMembershipView {
  workspaceId: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  role: 'OWNER' | 'CO_MANAGER' | 'VIEWER';
  baseCurrency: string;
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
