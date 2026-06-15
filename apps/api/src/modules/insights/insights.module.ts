import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PushModule } from '../push/push.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { InsightComputationService } from './insights-computation.service';

@Module({
  imports: [AnalyticsModule, AlertsModule, PushModule, LlmModule, PrismaModule],
  providers: [InsightComputationService],
})
export class InsightsModule {}
