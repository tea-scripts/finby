import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [FxModule, BudgetsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
