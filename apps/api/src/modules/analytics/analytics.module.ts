import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';

@Module({
  imports: [FxModule, PortfolioModule, BudgetsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, FinancialIntelligenceService],
  exports: [AnalyticsService, FinancialIntelligenceService],
})
export class AnalyticsModule {}
