import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SubscriptionTier } from '@budgy/shared';
import { REQUIRED_TIER_KEY } from '../decorators/require-tier.decorator';
import { AuthenticatedRequest, TIER_RANK } from '../context';

/** Enforces @RequireTier() against the workspace's subscription tier. */
@Injectable()
export class TierGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<SubscriptionTier | undefined>(
      REQUIRED_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tier = request.workspace?.tier;

    if (!tier || TIER_RANK[tier] < TIER_RANK[required]) {
      throw new ForbiddenException({
        error: 'TIER_LIMIT',
        message: `This feature requires the ${required} plan.`,
      });
    }

    return true;
  }
}
