import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireWithinLimit } from '../../common/decorators/tier-limit.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TierLimitGuard } from '../../common/guards/tier-limit.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { AccountsService } from './accounts.service';
import {
  createAccountSchema,
  updateAccountSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './dto/accounts.schemas';
import type { AccountView } from './accounts.types';

@Controller('workspaces/:workspaceId/accounts')
@UseGuards(WorkspaceMemberGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async list(@Workspace() workspace: WorkspaceContext): Promise<{ accounts: AccountView[] }> {
    return { accounts: await this.accounts.list(workspace.id) };
  }

  @Post()
  @Roles('OWNER', 'CO_MANAGER')
  @RequireWithinLimit('currencies', { currencyField: 'currency' })
  @UseGuards(RolesGuard, TierLimitGuard)
  create(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountInput,
  ): Promise<AccountView> {
    return this.accounts.create(workspace.id, body);
  }

  @Patch(':accountId')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  update(
    @Workspace() workspace: WorkspaceContext,
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput,
  ): Promise<AccountView> {
    return this.accounts.update(workspace.id, accountId, body);
  }
}
