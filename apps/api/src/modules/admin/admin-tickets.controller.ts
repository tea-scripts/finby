import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SupportService } from '../support/support.service';
import {
  adminTicketListQuerySchema,
  updateSupportTicketSchema,
  type AdminTicketListQuery,
  type UpdateSupportTicketInput,
} from '../support/dto/support.schemas';
import type { AdminSupportTicketView } from '../support/support.types';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

// @Public() bypasses the global user JwtAuthGuard; AdminJwtGuard re-secures with
// an admin-scoped token (same pattern as the other admin/* controllers).
@Throttle({ global: { limit: 60, ttl: 60_000 } })
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/tickets')
export class AdminTicketsController {
  constructor(private readonly support: SupportService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminTicketListQuerySchema)) q: AdminTicketListQuery,
  ): Promise<{ tickets: AdminSupportTicketView[] }> {
    return { tickets: await this.support.listAll(q.status) };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupportTicketSchema)) body: UpdateSupportTicketInput,
  ): Promise<AdminSupportTicketView> {
    return this.support.updateStatus(id, body.status);
  }
}
