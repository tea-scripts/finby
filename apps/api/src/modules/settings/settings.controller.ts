import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { SettingsService } from './settings.service';
import { BaseCurrencyService } from './base-currency.service';
import {
  updateCurrenciesSchema,
  updateBaseCurrencySchema,
  type UpdateCurrenciesInput,
  type UpdateBaseCurrencyInput,
} from './dto/settings.schemas';

@Controller('workspaces/:workspaceId/currencies')
@UseGuards(WorkspaceMemberGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly baseCurrency: BaseCurrencyService,
  ) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  updateCurrencies(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(updateCurrenciesSchema)) body: UpdateCurrenciesInput,
  ): Promise<{ preferredCurrencies: string[] }> {
    return this.settings.updateCurrencies(workspace.id, workspace.tier, body.currencies);
  }

  @Patch('base')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  updateBaseCurrency(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(updateBaseCurrencySchema)) body: UpdateBaseCurrencyInput,
  ) {
    return this.baseCurrency.updateBaseCurrency(workspace.id, body.baseCurrency);
  }
}
