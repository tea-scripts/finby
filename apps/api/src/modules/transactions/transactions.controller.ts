import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireWithinLimit } from '../../common/decorators/tier-limit.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TierLimitGuard } from '../../common/guards/tier-limit.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { TransactionsService } from './transactions.service';
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
  type CreateTransactionInput,
  type ListTransactionsQuery,
  type UpdateTransactionInput,
} from './dto/transactions.schemas';
import type { TransactionListResult, TransactionView } from './transactions.types';

@Controller('workspaces/:workspaceId/transactions')
@UseGuards(WorkspaceMemberGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(listTransactionsQuerySchema)) query: ListTransactionsQuery,
  ): Promise<TransactionListResult> {
    return this.transactions.list(workspace.id, workspace.tier, query);
  }

  @Post()
  @Roles('OWNER', 'CO_MANAGER')
  @RequireWithinLimit('currencies', { currencyField: 'currencyOriginal' })
  @UseGuards(RolesGuard, TierLimitGuard)
  async create(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionInput,
  ): Promise<TransactionView> {
    const result = await this.transactions.create({
      workspaceId: workspace.id,
      loggedByUserId: user.userId,
      baseCurrency: workspace.baseCurrency,
      tier: workspace.tier,
      type: body.type,
      amountOriginal: body.amountOriginal,
      currencyOriginal: body.currencyOriginal,
      transactionDate: body.transactionDate ?? new Date().toISOString().slice(0, 10),
      categoryId: body.categoryId,
      accountId: body.accountId,
      toAccountId: body.toAccountId,
      merchant: body.merchant,
      description: body.description,
      tags: body.tags,
    });
    return result.transaction;
  }

  @Patch(':transactionId')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  update(
    @Workspace() workspace: WorkspaceContext,
    @Param('transactionId') transactionId: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: UpdateTransactionInput,
  ): Promise<TransactionView> {
    return this.transactions.update(workspace.id, transactionId, body);
  }

  @Delete(':transactionId')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  void(
    @Workspace() workspace: WorkspaceContext,
    @Param('transactionId') transactionId: string,
  ): Promise<{ message: string }> {
    return this.transactions.void(workspace.id, transactionId);
  }
}
