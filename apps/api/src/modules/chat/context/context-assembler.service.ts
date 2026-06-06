import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { LlmMessage } from '../../llm/llm.types';

@Injectable()
export class ContextAssemblerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds the LLM call inputs for a conversation: the base system prompt with
   *  the rolling summary appended (if any), plus the active-window messages. */
  async buildContext(conversationId: string, baseSystem: string): Promise<{ system: string; messages: LlmMessage[] }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { rollingContextSummary: true },
    });
    const summary = conv?.rollingContextSummary?.trim();
    const system = summary
      ? `${baseSystem}\n\n[Memory summary — compressed older conversation context]\n${summary}`
      : baseSystem;

    const active = await this.prisma.conversationMessage.findMany({
      where: { conversationId, isInActiveWindow: true, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const messages: LlmMessage[] = active.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));
    return { system, messages };
  }
}
