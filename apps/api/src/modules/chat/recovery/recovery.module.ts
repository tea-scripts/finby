import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { TransactionsModule } from '../../transactions/transactions.module';
import { CategoriesModule } from '../../categories/categories.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { StreaksModule } from '../../streaks/streaks.module';
import { GamificationModule } from '../../gamification/gamification.module';
import { ChatRecoveryService } from './chat-recovery.service';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    TransactionsModule,
    CategoriesModule,
    AccountsModule,
    StreaksModule,
    GamificationModule,
  ],
  providers: [ChatRecoveryService],
  exports: [ChatRecoveryService],
})
export class RecoveryModule {}
