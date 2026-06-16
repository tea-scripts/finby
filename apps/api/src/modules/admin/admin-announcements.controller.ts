import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LOTTIE_REGISTRY, type AdminAnnouncement, type LottieAsset } from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from './dto/admin.schemas';
import { AdminAnnouncementsService } from './admin-announcements.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

@Throttle({ global: { limit: 60, ttl: 60_000 } })
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly service: AdminAnnouncementsService) {}

  @Get()
  list(): Promise<AdminAnnouncement[]> {
    return this.service.list();
  }

  @Get('assets')
  assets(): { lottie: LottieAsset[] } {
    return { lottie: [...LOTTIE_REGISTRY] };
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createAnnouncementSchema)) body: CreateAnnouncementInput,
  ): Promise<AdminAnnouncement> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema)) body: UpdateAnnouncementInput,
  ): Promise<AdminAnnouncement> {
    return this.service.update(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string): Promise<AdminAnnouncement> {
    return this.service.archive(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string): Promise<AdminAnnouncement> {
    return this.service.restore(id);
  }
}
