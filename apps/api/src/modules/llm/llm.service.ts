import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants';
import { PHASE2_TOOLS } from './llm.tools';
import { buildSystemPrompt } from './llm.system-prompt';
import type {
  LlmCreateParams,
  LlmProvider,
  LlmResponse,
  LlmStreamEvent,
  LlmToolDef,
  SystemPromptContext,
} from './llm.types';

/**
 * The single LLM entry point for the app. Never import the Anthropic SDK
 * elsewhere — route everything through here (and the LlmProvider port).
 */
@Injectable()
export class LlmService {
  constructor(@Inject(LLM_PROVIDER) private readonly provider: LlmProvider) {}

  getTools(): LlmToolDef[] {
    return PHASE2_TOOLS;
  }

  buildSystemPrompt(context: SystemPromptContext): string {
    return buildSystemPrompt(context);
  }

  createMessage(params: LlmCreateParams): Promise<LlmResponse> {
    return this.provider.createMessage(params);
  }

  streamMessage(params: LlmCreateParams): AsyncIterable<LlmStreamEvent> {
    return this.provider.streamMessage(params);
  }
}
