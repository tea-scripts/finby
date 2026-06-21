import { Module } from '@nestjs/common';
import { ConfigModule } from '../../../config/config.module';
import { RedisModule } from '../../../redis/redis.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { TransactionsModule } from '../../transactions/transactions.module';
import { CategoriesModule } from '../../categories/categories.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { StreaksModule } from '../../streaks/streaks.module';
import { GamificationModule } from '../../gamification/gamification.module';
import { ChatRecoveryService } from './chat-recovery.service';

@Module({
  // ConfigModule is global app-wide, so LlmModule (ClaudeProvider → ConfigService)
  // and FxService rely on it being present. AppModule loads it for the running
  // service; this CLI bootstraps RecoveryModule standalone, so it must import it
  // here too or ConfigService can't be resolved.
  imports: [
    ConfigModule,
    RedisModule,
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
