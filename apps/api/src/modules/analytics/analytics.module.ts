import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [FxModule, PortfolioModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
