import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  EngagementMetrics,
  GrowthMetrics,
  OpsMetrics,
  RevenueMetrics,
} from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { metricRangeSchema, type MetricRangeQuery } from './dto/admin.schemas';

// @Public() bypasses the global *user* JwtAuthGuard; AdminJwtGuard re-secures
// every route with an admin-scoped token. These routes are NOT unauthenticated.
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/metrics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('growth')
  growth(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<GrowthMetrics> {
    return this.analytics.growth(q);
  }

  @Get('engagement')
  engagement(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<EngagementMetrics> {
    return this.analytics.engagement(q);
  }

  @Get('revenue')
  revenue(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<RevenueMetrics> {
    return this.analytics.revenue(q);
  }

  @Get('ops')
  ops(): Promise<OpsMetrics> {
    return this.analytics.ops();
  }
}
