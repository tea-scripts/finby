import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { AlertsService } from './alerts.service';
import {
  listAlertsQuerySchema,
  updateAlertSchema,
  type ListAlertsQuery,
  type UpdateAlertInput,
} from './dto/alerts.schemas';
import type { AlertListResult, AlertView } from './alerts.types';

@Controller('workspaces/:workspaceId/alerts')
@UseGuards(WorkspaceMemberGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listAlertsQuerySchema)) query: ListAlertsQuery,
  ): Promise<AlertListResult> {
    return this.alerts.list(workspace.id, user.userId, query);
  }

  // Declared before :alertId so the static path is matched first.
  @Patch('mark-all-read')
  markAllRead(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
  ): Promise<{ updated: number }> {
    return this.alerts.markAllRead(workspace.id, user.userId);
  }

  @Patch(':alertId')
  update(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('alertId') alertId: string,
    @Body(new ZodValidationPipe(updateAlertSchema)) body: UpdateAlertInput,
  ): Promise<AlertView> {
    return this.alerts.updateStatus(workspace.id, user.userId, alertId, body);
  }
}
