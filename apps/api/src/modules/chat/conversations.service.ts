import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListMessagesQuery } from './dto/chat.schemas';
import type { ChatMessageView } from './chat.types';

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
