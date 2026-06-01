import type { SubscriptionTier, WorkspaceMemberRole } from '@budgy/shared';
import type { AuthUser } from '../modules/auth/auth.types';

/** Workspace context attached to the request by WorkspaceMemberGuard. */
export interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  baseCurrency: string;
}

/** The requesting user's membership in the resolved workspace. */
export interface MembershipContext {
  id: string;
  role: WorkspaceMemberRole;
}

/** Express request augmented with auth + workspace context. */
export interface AuthenticatedRequest {
  user?: AuthUser;
  params: Record<string, string>;
  workspace?: WorkspaceContext;
  membership?: MembershipContext;
}

/** Ordinal ranking of tiers. The locked tier matrix is monotonic by this rank. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};
