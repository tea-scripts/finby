import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  assistantNoteSchema,
  listMessagesQuerySchema,
  sendMessageSchema,
  type AssistantNoteInput,
  type ListMessagesQuery,
  type SendMessageInput,
} from './dto/chat.schemas';
import type { ChatMessageView, ChatResult, ChatStreamEvent } from './chat.types';

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

  /** Persists a pre-composed assistant note (e.g. after a receipt-scan log)
   *  WITHOUT running the chat AI pipeline — no LLM call, no tools. */
  @Post(':conversationId/notes')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  appendNote(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(assistantNoteSchema)) body: AssistantNoteInput,
  ): Promise<ChatMessageView> {
    return this.conversations.appendAssistantNote(
      workspace.id,
      user.userId,
      conversationId,
      body.content,
    );
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

  @Post(':conversationId/messages/stream')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  async stream(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @Res() res: Response,
  ): Promise<void> {
    const gen = this.chat.streamMessage(workspace, user.userId, conversationId, body.content);

    // Peek the first event BEFORE touching the response. Pre-stream failures
    // (rate-limit 429, LLM-unreachable 503) throw here with the response
    // untouched, so the global HttpExceptionFilter emits a proper JSON status.
    const first = await gen.next();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const safeWrite = (chunk: string): void => {
      if (res.writableEnded) return;
      try {
        res.write(chunk);
      } catch {
        /* client disconnected mid-stream — stop writing; the server still
           finishes the generator so any committed work is persisted. */
      }
    };

    const heartbeat = setInterval(() => safeWrite(':ping\n\n'), 15000);
    const frame = (event: ChatStreamEvent): string =>
      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    try {
      if (!first.done) safeWrite(frame(first.value));
      for await (const event of gen) safeWrite(frame(event));
    } catch {
      // Headers are already sent — deliver failures as an in-stream error event.
      safeWrite(
        frame({
          type: 'error',
          code: 'STREAM_FAILED',
          message: 'The response was interrupted. Please try again.',
        }),
      );
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
}
