import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { AnnouncementView } from '@finby/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AnnouncementsService } from './announcements.service';

/** Authed user endpoints. The global JwtAuthGuard secures these (no @Public()). */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('active')
  async active(@CurrentUser() user: AuthUser): Promise<{ announcement: AnnouncementView | null }> {
    return { announcement: await this.announcements.getActive(user.userId) };
  }

  @Post(':id/seen')
  @HttpCode(204)
  async seen(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.announcements.markSeen(id, user.userId);
  }

  @Post(':id/dismiss')
  @HttpCode(204)
  async dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.announcements.markDismissed(id, user.userId);
  }
}
