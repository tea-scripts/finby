import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, AuthResult } from '../auth/auth.types';
import { InvitesService, type InvitePreview } from './invites.service';
import { acceptSignupSchema, type AcceptSignupInput } from './dto/members.schemas';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitePreview> {
    return this.invites.preview(token);
  }

  // Authenticated existing-user accept. JwtAuthGuard is global, but this controller
  // is not marked @Public, so the token is required here.
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser): Promise<{ workspaceId: string }> {
    return this.invites.accept(token, user.userId);
  }

  @Public()
  @Post(':token/accept-signup')
  @HttpCode(HttpStatus.OK)
  acceptSignup(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptSignupSchema)) body: AcceptSignupInput,
  ): Promise<AuthResult> {
    return this.invites.acceptSignup(token, body);
  }
}
