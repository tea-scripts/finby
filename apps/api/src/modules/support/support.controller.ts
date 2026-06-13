import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { SupportService } from './support.service';
import { createSupportTicketSchema, type CreateSupportTicketInput } from './dto/support.schemas';
import type { SupportTicketView } from './support.types';

@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupportTicketSchema)) body: CreateSupportTicketInput,
  ): Promise<SupportTicketView> {
    return this.support.create(user.userId, user.email, body);
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ tickets: SupportTicketView[] }> {
    return { tickets: await this.support.listForUser(user.userId) };
  }
}
