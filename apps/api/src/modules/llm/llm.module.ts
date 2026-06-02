import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants';
import { LlmService } from './llm.service';
import { ClaudeProvider } from './providers/claude.provider';

@Module({
  providers: [{ provide: LLM_PROVIDER, useClass: ClaudeProvider }, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
