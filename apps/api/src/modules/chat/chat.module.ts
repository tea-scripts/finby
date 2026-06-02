import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { FxModule } from '../fx/fx.module';
import { LlmModule } from '../llm/llm.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChatService } from './chat.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    LlmModule,
    TransactionsModule,
    FxModule,
    CategoriesModule,
    AccountsModule,
    BudgetsModule,
    AnalyticsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatService],
})
export class ChatModule {}
