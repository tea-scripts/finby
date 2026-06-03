import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { PortfolioService } from './portfolio.service';
import { logEventSchema, type LogEventInput } from './dto/portfolio.schemas';
import type { InvestmentEventView, LogEventResult, PortfolioResult } from './portfolio.types';

@Controller('workspaces/:workspaceId/portfolio')
@UseGuards(WorkspaceMemberGuard, TierGuard)
@RequireTier('PRO')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  get(@Workspace() workspace: WorkspaceContext): Promise<PortfolioResult> {
    return this.portfolio.getPortfolio(workspace.id);
  }

  @Post('events')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  logEvent(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(logEventSchema)) body: LogEventInput,
  ): Promise<LogEventResult> {
    return this.portfolio.logEvent({
      workspaceId: workspace.id,
      ownedByUserId: user.userId,
      baseCurrency: workspace.baseCurrency,
      tier: workspace.tier,
      ticker: body.ticker,
      action: body.action,
      quantity: body.quantity,
      pricePerUnit: body.pricePerUnit,
      currency: body.currency,
      eventDate: body.eventDate ?? new Date().toISOString().slice(0, 10),
      notes: body.notes,
    });
  }

  @Get(':holdingId/events')
  events(
    @Workspace() workspace: WorkspaceContext,
    @Param('holdingId') holdingId: string,
  ): Promise<{ events: InvestmentEventView[] }> {
    return this.portfolio
      .listEvents(workspace.id, holdingId)
      .then((events) => ({ events }));
  }
}
