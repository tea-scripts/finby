import { SetMetadata } from '@nestjs/common';
import type { SubscriptionTier } from '@budgy/shared';

export const REQUIRED_TIER_KEY = 'requiredTier';

/** Requires the workspace to be at least the given tier (enforced by TierGuard). */
export const RequireTier = (tier: SubscriptionTier) => SetMetadata(REQUIRED_TIER_KEY, tier);
