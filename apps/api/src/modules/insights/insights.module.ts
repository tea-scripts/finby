import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PushModule } from '../push/push.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { InsightComputationService } from './insights-computation.service';

@Module({
  imports: [AnalyticsModule, AlertsModule, PushModule, PrismaModule],
  providers: [InsightComputationService],
})
export class InsightsModule {}
