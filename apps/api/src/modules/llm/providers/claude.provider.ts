import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../../../config/env.schema';
import type {
  LlmContentBlock,
  LlmCreateParams,
  LlmMessage,
  LlmProvider,
  LlmResponse,
  LlmToolCall,
} from '../llm.types';

/**
 * The ONLY place the Anthropic SDK is imported. Everything else talks to the
 * provider-agnostic LlmProvider port, so swapping models/providers is local.
 */
@Injectable()
export class ClaudeProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }) ?? '' });
    this.model = config.get('ANTHROPIC_MODEL', { infer: true });
  }

  async createMessage(params: LlmCreateParams): Promise<LlmResponse> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages: params.messages.map((m) => toMessageParam(m)),
      ...(params.tools
        ? {
            tools: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });

    return mapResponse(message);
  }
}

function toMessageParam(message: LlmMessage): Anthropic.MessageParam {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content };
  }
  const blocks: Anthropic.ContentBlockParam[] = message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    }
    return {
      type: 'tool_result',
      tool_use_id: block.toolUseId,
      content: block.content,
      ...(block.isError ? { is_error: true } : {}),
    };
  });
  return { role: message.role, content: blocks };
}

function mapResponse(message: Anthropic.Message): LlmResponse {
  const content: LlmContentBlock[] = [];
  const toolCalls: LlmToolCall[] = [];
  let textOutput = '';

  for (const block of message.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
      textOutput += block.text;
    } else if (block.type === 'tool_use') {
      const input = (block.input ?? {}) as Record<string, unknown>;
      content.push({ type: 'tool_use', id: block.id, name: block.name, input });
      toolCalls.push({ id: block.id, name: block.name, input });
    }
  }

  return { stopReason: message.stop_reason, content, textOutput, toolCalls };
}
