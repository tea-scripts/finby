import { PrismaService } from '../../../prisma/prisma.service';
import type { LlmMessage } from '../../llm/llm.types';
import { ContextAssemblerService } from './context-assembler.service';

function buildMock(
  rollingContextSummary: string | null,
  messages: Array<{ role: string; content: string }>,
) {
  const prisma = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue({ rollingContextSummary }),
    },
    conversationMessage: {
      findMany: jest.fn().mockResolvedValue(messages),
    },
  } as unknown as PrismaService;
  return new ContextAssemblerService(prisma);
}

const BASE_SYSTEM = 'You are a helpful financial assistant.';

describe('ContextAssemblerService.buildContext', () => {
  describe('no / empty summary', () => {
    it('returns system unchanged when rollingContextSummary is null', async () => {
      const svc = buildMock(null, [
        { role: 'USER', content: 'Hello' },
        { role: 'ASSISTANT', content: 'Hi there' },
      ]);
      const { system, messages } = await svc.buildContext('conv-1', BASE_SYSTEM);

      expect(system).toBe(BASE_SYSTEM);
      expect(messages).toHaveLength(2);
    });

    it('returns system unchanged when rollingContextSummary is whitespace-only', async () => {
      const svc = buildMock('   ', []);
      const { system } = await svc.buildContext('conv-1', BASE_SYSTEM);
      expect(system).toBe(BASE_SYSTEM);
    });

    it('maps messages in ascending order with correct role mapping', async () => {
      const svc = buildMock(null, [
        { role: 'USER', content: 'First message' },
        { role: 'ASSISTANT', content: 'Second message' },
      ]);
      const { messages } = await svc.buildContext('conv-1', BASE_SYSTEM);

      expect(messages).toEqual<LlmMessage[]>([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' },
      ]);
    });
  });

  describe('non-empty summary', () => {
    it('prepends summary block to system prompt', async () => {
      const svc = buildMock('PRIOR SUMMARY TEXT', []);
      const { system } = await svc.buildContext('conv-1', BASE_SYSTEM);

      expect(system).toMatch(new RegExp(`^${BASE_SYSTEM}`));
      expect(system).toContain('[Memory summary — compressed older conversation context]');
      expect(system).toContain('PRIOR SUMMARY TEXT');
    });

    it('still maps messages correctly when a summary is present', async () => {
      const svc = buildMock('Some summary', [
        { role: 'USER', content: 'What is my balance?' },
        { role: 'ASSISTANT', content: 'Your balance is $1,000.' },
      ]);
      const { messages } = await svc.buildContext('conv-2', BASE_SYSTEM);

      expect(messages).toEqual<LlmMessage[]>([
        { role: 'user', content: 'What is my balance?' },
        { role: 'assistant', content: 'Your balance is $1,000.' },
      ]);
    });
  });

  describe('role mapping', () => {
    it('maps USER role to "user"', async () => {
      const svc = buildMock(null, [{ role: 'USER', content: 'user msg' }]);
      const { messages } = await svc.buildContext('conv-1', BASE_SYSTEM);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('user msg');
    });

    it('maps ASSISTANT role to "assistant"', async () => {
      const svc = buildMock(null, [{ role: 'ASSISTANT', content: 'assistant msg' }]);
      const { messages } = await svc.buildContext('conv-1', BASE_SYSTEM);
      expect(messages[0]?.role).toBe('assistant');
      expect(messages[0]?.content).toBe('assistant msg');
    });
  });
});
