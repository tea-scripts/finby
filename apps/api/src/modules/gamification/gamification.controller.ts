import { Controller, Get, Header, NotFoundException, Param, UseGuards } from '@nestjs/common';
import type { AchievementDef, UserAchievement, XpTransaction } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { AchievementService } from './achievement.service';
import { XpService } from './xp.service';

type UnlockedAchievement = UserAchievement & { achievementDef: AchievementDef };

@Controller('workspaces/:workspaceId/gamification')
@UseGuards(WorkspaceMemberGuard)
export class GamificationController {
  constructor(
    private readonly xp: XpService,
    private readonly achievements: AchievementService,
    private readonly prisma: PrismaService,
  ) {}

  /** XP balance, lifetime total, and today's earnings for the requesting member. */
  @Get('xp')
  getXp(
    @CurrentUser() user: AuthUser,
  ): Promise<{ balance: number; totalEarned: number; todayEarned: number }> {
    return this.xp.getXpSummary(user.userId);
  }

  /** Recent XP ledger entries (newest first). */
  @Get('xp/history')
  getXpHistory(@CurrentUser() user: AuthUser): Promise<XpTransaction[]> {
    return this.xp.getXpHistory(user.userId);
  }

  /** Unlocked + locked achievements for the requesting member. */
  @Get('achievements')
  getAchievements(
    @CurrentUser() user: AuthUser,
  ): Promise<{ unlocked: UnlockedAchievement[]; locked: AchievementDef[] }> {
    return this.achievements.getUserAchievements(user.userId);
  }

  /** Generated badge art for a definition slug. Served as raw SVG. */
  @Get('achievements/:slug/badge.svg')
  @Header('Content-Type', 'image/svg+xml')
  async getBadge(@Param('slug') slug: string): Promise<string> {
    const def = await this.prisma.achievementDef.findUnique({ where: { slug } });
    if (!def) throw new NotFoundException('Unknown achievement.');
    return this.achievements.renderBadgeSvg(def.slug, def.tier, def.category);
  }
}
