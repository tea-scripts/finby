import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  EngagementMetrics,
  FunnelMetrics,
  GrowthMetrics,
  OpsMetrics,
  RevenueMetrics,
  StreakLeaderboards,
} from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PosthogService } from './posthog.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import {
  funnelQuerySchema,
  metricRangeSchema,
  type FunnelQuery,
  type MetricRangeQuery,
} from './dto/admin.schemas';

// @Public() bypasses the global *user* JwtAuthGuard; AdminJwtGuard re-secures
// every route with an admin-scoped token. These routes are NOT unauthenticated.
// Per-route throttle (60/min/IP) caps abuse: each call fans out to several Prisma
// aggregations, and varying ?from/?to bypasses the range-keyed Redis cache — a
// generous ceiling for a dashboard that loads 4 endpoints per page view.
@Throttle({ global: { limit: 60, ttl: 60_000 } })
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/metrics')
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AdminAnalyticsService,
    private readonly posthog: PosthogService,
  ) {}

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

  @Get('streaks')
  streaks(): Promise<StreakLeaderboards> {
    return this.analytics.streaks();
  }

  @Get('ops')
  ops(): Promise<OpsMetrics> {
    return this.analytics.ops();
  }

  // Behavioural funnel from PostHog (HogQL). Returns { configured:false } when
  // PostHog env vars are unset, so the dashboard degrades gracefully.
  @Get('funnel')
  funnel(@Query(new ZodValidationPipe(funnelQuerySchema)) q: FunnelQuery): Promise<FunnelMetrics> {
    return this.posthog.funnel(q.funnel, q.windowDays);
  }
}
