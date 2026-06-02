import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { AnalyticsService } from './analytics.service';
import {
  byCategoryQuerySchema,
  summaryQuerySchema,
  trendQuerySchema,
  type ByCategoryQuery,
  type SummaryQuery,
  type TrendQuery,
} from './dto/analytics.schemas';
import type {
  CategoryBreakdownResult,
  NetWorthResult,
  SummaryResult,
  TrendResult,
} from './analytics.types';

@Controller('workspaces/:workspaceId/analytics')
@UseGuards(WorkspaceMemberGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery,
  ): Promise<SummaryResult> {
    return this.analytics.summary(workspace.id, workspace.baseCurrency, query.from, query.to);
  }

  @Get('by-category')
  byCategory(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(byCategoryQuerySchema)) query: ByCategoryQuery,
  ): Promise<CategoryBreakdownResult> {
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
}
