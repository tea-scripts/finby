import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { PushService } from './push.service';
import {
  subscribeSchema,
  unsubscribeSchema,
  expoRegisterSchema,
  expoUnregisterSchema,
  type SubscribeInput,
  type UnsubscribeInput,
  type ExpoRegisterInput,
  type ExpoUnregisterInput,
} from './dto/push.schemas';

@Controller('workspaces/:workspaceId/push')
@UseGuards(WorkspaceMemberGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  publicKey(): { publicKey: string | null } {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeInput,
  ): Promise<void> {
    await this.push.subscribe(workspace.id, user.userId, body);
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: UnsubscribeInput,
  ): Promise<void> {
    await this.push.unsubscribe(workspace.id, user.userId, body.endpoint);
  }

  @Post('expo/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async expoRegister(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(expoRegisterSchema)) body: ExpoRegisterInput,
  ): Promise<void> {
    await this.push.registerExpoDevice(workspace.id, user.userId, body.token, body.platform);
  }

  @Post('expo/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async expoUnregister(
    @Body(new ZodValidationPipe(expoUnregisterSchema)) body: ExpoUnregisterInput,
  ): Promise<void> {
    await this.push.unregisterExpoDevice(body.token);
  }
}
