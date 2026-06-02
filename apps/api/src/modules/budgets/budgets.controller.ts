import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { BudgetsService } from './budgets.service';
import {
  createBudgetSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
  type CreateBudgetInput,
  type ListBudgetsQuery,
  type UpdateBudgetInput,
} from './dto/budgets.schemas';
import type { BudgetView } from './budgets.types';

@Controller('workspaces/:workspaceId/budgets')
@UseGuards(WorkspaceMemberGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  async list(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(listBudgetsQuerySchema)) query: ListBudgetsQuery,
  ): Promise<{ budgets: BudgetView[] }> {
    return { budgets: await this.budgets.list(workspace.id, query) };
  }

  @Post()
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  create(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(createBudgetSchema)) body: CreateBudgetInput,
  ): Promise<BudgetView> {
    return this.budgets.createOrUpdate(workspace.id, workspace.baseCurrency, body);
  }

  @Patch(':budgetId')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  update(
    @Workspace() workspace: WorkspaceContext,
    @Param('budgetId') budgetId: string,
    @Body(new ZodValidationPipe(updateBudgetSchema)) body: UpdateBudgetInput,
  ): Promise<BudgetView> {
    return this.budgets.update(workspace.id, budgetId, body);
  }
}
