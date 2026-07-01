import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { AnalyticsService } from './analytics.service';
import { InsightService } from './insight.service';
import {
  byCategoryQuerySchema,
  insightQuerySchema,
  summaryQuerySchema,
  trendQuerySchema,
  type ByCategoryQuery,
  type InsightQuery,
  type SummaryQuery,
  type TrendQuery,
} from './dto/analytics.schemas';
import type {
  CategoryBreakdownResult,
  NetWorthResult,
  SummaryResult,
  TrendResult,
} from './analytics.types';
import { earliestAllowedMonthStart, type InsightResult } from '@finby/shared';

@Controller('workspaces/:workspaceId/analytics')
@UseGuards(WorkspaceMemberGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly insights: InsightService,
  ) {}

  /** User-facing month endpoints only: capped tiers cannot view months older
   *  than their history window. Internal AnalyticsService callers bypass this. */
  private assertWithinHistory(tier: WorkspaceContext['tier'], from: string): void {
    const floor = earliestAllowedMonthStart(tier);
    if (floor && from.slice(0, 10) < floor) {
      throw new ForbiddenException({
        error: 'tier_limit',
        message: 'Viewing older months requires Pro.',
      });
    }
  }

  @Get('summary')
  async summary(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery,
  ): Promise<SummaryResult> {
    this.assertWithinHistory(workspace.tier, query.from);
    return this.analytics.summary(workspace.id, workspace.baseCurrency, query.from, query.to);
  }

  @Get('by-category')
  async byCategory(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(byCategoryQuerySchema)) query: ByCategoryQuery,
  ): Promise<CategoryBreakdownResult> {
    this.assertWithinHistory(workspace.tier, query.from);
    return this.analytics.byCategory(
      workspace.id,
      workspace.baseCurrency,
      query.from,
      query.to,
      query.type,
    );
  }

  @Get('trend')
  trend(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ): Promise<TrendResult> {
    return this.analytics.trend(workspace.id, workspace.baseCurrency, query.months, workspace.tier);
  }

  @Get('net-worth')
  @RequireTier('PRO')
  @UseGuards(TierGuard)
  netWorth(@Workspace() workspace: WorkspaceContext): Promise<NetWorthResult> {
    return this.analytics.netWorth(workspace.id, workspace.baseCurrency);
  }

  @Get('insight')
  async insight(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(insightQuerySchema)) query: InsightQuery,
  ): Promise<InsightResult> {
    this.assertWithinHistory(workspace.tier, query.from);
    return this.insights.insight(workspace.id, workspace.baseCurrency, query.from, query.to);
  }
}
