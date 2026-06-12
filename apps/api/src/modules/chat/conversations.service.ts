import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListMessagesQuery } from './dto/chat.schemas';
import type { ChatMessageView } from './chat.types';
import { estimateTokens } from './memory/token-counter.util';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; title: string | null; createdAt: string }> {
    const conversation = await this.prisma.conversation.create({
      data: { workspaceId, userId },
    });
    return { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt.toISOString() };
  }

  async list(
    workspaceId: string,
    userId: string,
  ): Promise<{
    conversations: Array<{ id: string; title: string | null; messageCount: number; updatedAt: string }>;
  }> {
    const rows = await this.prisma.conversation.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      conversations: rows.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messageCount,
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  }

  async requireConversation(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    return conversation;
  }

  /**
   * Persist a pre-composed ASSISTANT message (e.g. the receipt-scan
   * confirmation bubble) without invoking the LLM pipeline. Keeps the
   * conversational record intact for flows that log outside of chat.
   */
  async appendAssistantNote(
    workspaceId: string,
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<ChatMessageView> {
    await this.requireConversation(workspaceId, userId, conversationId);

    const message = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'ASSISTANT', content, tokenCount: estimateTokens(content) },
    });
    const messageCount = await this.prisma.conversationMessage.count({
      where: { conversationId },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { messageCount, updatedAt: new Date() },
    });

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async listMessages(
    workspaceId: string,
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<{ messages: ChatMessageView[]; nextCursor: string | null; hasMore: boolean }> {
    await this.requireConversation(workspaceId, userId, conversationId);

    const rows = await this.prisma.conversationMessage.findMany({
      where: {
        conversationId,
        ...(query.includeToolMessages ? {} : { role: { in: ['USER', 'ASSISTANT'] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      messages: page.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }
}
