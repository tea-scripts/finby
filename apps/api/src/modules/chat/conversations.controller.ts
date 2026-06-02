import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';
import { ChatService } from './chat.service';
import {
  listMessagesQuerySchema,
  sendMessageSchema,
  type ListMessagesQuery,
  type SendMessageInput,
} from './dto/chat.schemas';
import type { ChatResult } from './chat.types';

@Controller('workspaces/:workspaceId/conversations')
@UseGuards(WorkspaceMemberGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  @Get()
  list(@Workspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.conversations.list(workspace.id, user.userId);
  }

  @Post()
  create(@Workspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.conversations.create(workspace.id, user.userId);
  }

  @Get(':conversationId/messages')
  messages(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    return this.conversations.listMessages(workspace.id, user.userId, conversationId, query);
  }

  @Post(':conversationId/messages')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  send(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<ChatResult> {
    return this.chat.handleMessage(workspace, user.userId, conversationId, body.content);
  }
}
