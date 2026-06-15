import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { FxModule } from '../fx/fx.module';
import { LlmModule } from '../llm/llm.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { ChatService } from './chat.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MemoryPolicyService } from './memory/memory-policy.service';
import { MemoryCompressionService } from './memory/memory-compression.service';
import { ContextAssemblerService } from './context/context-assembler.service';
import { FinancialIntelligenceService } from './context/financial-intelligence.service';

@Module({
  imports: [
    LlmModule,
    TransactionsModule,
    FxModule,
    CategoriesModule,
    AccountsModule,
    BudgetsModule,
    AnalyticsModule,
    MarketModule,
    PortfolioModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatService, MemoryPolicyService, MemoryCompressionService, ContextAssemblerService, FinancialIntelligenceService],
})
export class ChatModule {}
