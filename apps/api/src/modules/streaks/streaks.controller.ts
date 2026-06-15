import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { StreaksService } from './streaks.service';
import type { StreakStatusView, StreakCalendarView } from './streaks.types';

@Controller('workspaces/:workspaceId/streaks')
@UseGuards(WorkspaceMemberGuard)
export class StreaksController {
  constructor(private readonly streaks: StreaksService) {}

  /** Live streak status for the requesting member. Not tier-gated — Free users
   *  read their own streak (and can be shown a repair upsell). */
  @Get()
  getStatus(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
  ): Promise<StreakStatusView> {
    return this.streaks.getStatus(user.userId, workspace.tier);
  }

  /** Activity calendar (last ~6 months) for the requesting member. Not tier-gated. */
  @Get('calendar')
  getCalendar(@CurrentUser() user: AuthUser): Promise<StreakCalendarView> {
    return this.streaks.getCalendar(user.userId);
  }

  /** Recover one missed day. PRO+ only. */
  @Post('repair')
  @UseGuards(TierGuard)
  @RequireTier('PRO')
  repair(@CurrentUser() user: AuthUser): Promise<StreakStatusView> {
    return this.streaks.repair(user.userId);
  }
}
