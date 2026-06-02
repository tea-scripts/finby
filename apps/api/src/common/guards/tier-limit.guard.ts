import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TIER_LIMITS } from '@budgy/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TIER_LIMIT_KEY, type TierLimitMeta } from '../decorators/tier-limit.decorator';
import type { AuthenticatedRequest } from '../context';

/**
 * Enforces numeric/value tier limits (currencies, custom categories) declaratively.
 * Runs after WorkspaceMemberGuard (needs the resolved workspace context).
 */
@Injectable()
export class TierLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<TierLimitMeta | undefined>(TIER_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const workspace = request.workspace;
    if (!workspace) {
      throw new ForbiddenException('Workspace context is missing.');
    }

    const limit = TIER_LIMITS[workspace.tier][meta.key];
    if (limit === null) {
      return true; // unlimited
    }

    if (meta.key === 'currencies') {
      this.checkCurrency(request, workspace.baseCurrency, workspace.tier, limit, meta);
      return true;
    }

    const used = await this.prisma.category.count({
      where: { workspaceId: workspace.id, isDefault: false, isArchived: false },
    });
    if (used >= limit) {
      throw new ForbiddenException({
        error: 'TIER_LIMIT',
        message: `The ${workspace.tier} plan supports up to ${limit} custom categories. Upgrade to Pro for unlimited.`,
      });
    }
    return true;
  }

  private checkCurrency(
    request: AuthenticatedRequest,
    baseCurrency: string,
    tier: string,
    limit: number,
    meta: TierLimitMeta,
  ): void {
    if (limit > 1) {
      return;
    }
    const field = meta.options?.currencyField ?? 'currency';
    const body = (request as { body?: Record<string, unknown> }).body;
    const requested = body?.[field];
    if (
      typeof requested === 'string' &&
      requested.toUpperCase() !== baseCurrency.toUpperCase()
    ) {
      throw new ForbiddenException({
        error: 'TIER_LIMIT',
        message: `The ${tier} plan supports a single currency (${baseCurrency}). Upgrade to Pro for multi-currency.`,
      });
    }
  }
}
