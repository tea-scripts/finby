import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { MemoryCompressionService } from './memory-compression.service';
import { MemoryPolicyService } from './memory-policy.service';
import type { WindowMessage } from './memory-policy.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { LlmService } from '../../llm/llm.service';
import type { LlmResponse } from '../../llm/llm.types';

const FREE_BUDGET = 4000;
const PRO_THRESHOLD = 8000;
const PREMIUM_THRESHOLD = 12000;

function makeConfig(): ConfigService<Env, true> {
  const values: Partial<Env> = {
    FREE_ACTIVE_WINDOW_TOKEN_BUDGET: FREE_BUDGET,
    PRO_COMPRESSION_THRESHOLD: PRO_THRESHOLD,
    PREMIUM_COMPRESSION_THRESHOLD: PREMIUM_THRESHOLD,
  };
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

function makeMsg(id: string, content: string, tokenCount: number, msOffset = 0): WindowMessage {
  return { id, content, tokenCount, createdAt: new Date(1000 + msOffset) };
}

const FULL_LLM_RESPONSE: LlmResponse = {
  stopReason: 'end_turn',
  content: [{ type: 'text', text: 'SUMMARY' }],
  textOutput: 'SUMMARY',
  toolCalls: [],
};

describe('MemoryCompressionService', () => {
  let service: MemoryCompressionService;
  let prisma: jest.Mocked<{
    conversationMessage: { findMany: jest.Mock; updateMany: jest.Mock };
    conversation: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  }>;
  let llm: { createMessage: jest.Mock };
  let policy: MemoryPolicyService;

  beforeEach(() => {
    prisma = {
      conversationMessage: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    llm = { createMessage: jest.fn() };
    policy = new MemoryPolicyService(makeConfig());
    service = new MemoryCompressionService(
      prisma as unknown as PrismaService,
      llm as unknown as LlmService,
      policy,
    );
  });

  describe('Case 1: under threshold — no DB writes, no LLM call', () => {
    it('FREE: window well under budget → no-op', async () => {
      // 5 messages × 100 tokens = 500 tokens; FREE budget is 4000
      const msgs = [
        makeMsg('m1', 'x'.repeat(100), 100, 0),
        makeMsg('m2', 'x'.repeat(100), 100, 1),
        makeMsg('m3', 'x'.repeat(100), 100, 2),
        makeMsg('m4', 'x'.repeat(100), 100, 3),
        makeMsg('m5', 'x'.repeat(100), 100, 4),
      ];
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);

      await service.maintain('conv-1', 'FREE');

      expect(llm.createMessage).not.toHaveBeenCalled();
      expect(prisma.conversationMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('PRO: window under threshold → no-op', async () => {
      // 5 messages × 1000 tokens = 5000 tokens; PRO threshold is 8000
      const msgs = [
        makeMsg('p1', 'x'.repeat(1000), 1000, 0),
        makeMsg('p2', 'x'.repeat(1000), 1000, 1),
        makeMsg('p3', 'x'.repeat(1000), 1000, 2),
        makeMsg('p4', 'x'.repeat(1000), 1000, 3),
        makeMsg('p5', 'x'.repeat(1000), 1000, 4),
      ];
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);

      await service.maintain('conv-pro', 'PRO');

      expect(llm.createMessage).not.toHaveBeenCalled();
      expect(prisma.conversationMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Case 2: FREE over budget → oldest evicted, no LLM', () => {
    it('marks oldest messages inactive until window fits budget', async () => {
      // 6 messages × 1000 tokens = 6000 > 4000 budget
      // need to evict 2 oldest to get to 4000
      const msgs = [
        makeMsg('e1', 'x'.repeat(100), 1000, 0), // oldest
        makeMsg('e2', 'x'.repeat(100), 1000, 1),
        makeMsg('e3', 'x'.repeat(100), 1000, 2),
        makeMsg('e4', 'x'.repeat(100), 1000, 3),
        makeMsg('e5', 'x'.repeat(100), 1000, 4),
        makeMsg('e6', 'x'.repeat(100), 1000, 5), // newest
      ];
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);

      await service.maintain('conv-free', 'FREE');

      expect(llm.createMessage).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();

      expect(prisma.conversationMessage.updateMany).toHaveBeenCalledTimes(1);
      const call = prisma.conversationMessage.updateMany.mock.calls[0][0] as {
        where: { id: { in: string[] } };
        data: { isInActiveWindow: boolean };
      };
      // Should evict e1, e2 (oldest 2) to bring 6000 → 4000
      expect(call.where.id.in).toEqual(expect.arrayContaining(['e1', 'e2']));
      expect(call.where.id.in).toHaveLength(2);
      expect(call.data.isInActiveWindow).toBe(false);
    });

    it('evicts minimum oldest messages needed (exact budget fit)', async () => {
      // 5 messages: first 3 at 1000 each, last 2 at 100 each = 3200 total < 4000; but if
      // we push first msg to 2000: total = 2000+1000+1000+100+100 = 4200 > 4000
      // evict just e1 (2000 tokens) → 2200 remaining ≤ 4000
      const msgs = [
        makeMsg('f1', 'x'.repeat(200), 2000, 0), // oldest — evicted
        makeMsg('f2', 'x'.repeat(100), 1000, 1),
        makeMsg('f3', 'x'.repeat(100), 1000, 2),
        makeMsg('f4', 'x'.repeat(100), 100, 3),
        makeMsg('f5', 'x'.repeat(100), 100, 4),
      ];
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);

      await service.maintain('conv-free-exact', 'FREE');

      const call = prisma.conversationMessage.updateMany.mock.calls[0][0] as {
        where: { id: { in: string[] } };
        data: { isInActiveWindow: boolean };
      };
      expect(call.where.id.in).toEqual(['f1']);
    });
  });

  describe('Case 3: PRO over threshold → LLM compression', () => {
    it('calls LLM, writes merged summary, marks cold messages inactive', async () => {
      // 10 messages × 1000 tokens = 10000 > 8000 PRO threshold
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`m${i + 1}`, `content ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: null });
      llm.createMessage.mockResolvedValue(FULL_LLM_RESPONSE);

      await service.maintain('conv-pro', 'PRO');

      expect(llm.createMessage).toHaveBeenCalledTimes(1);
      expect(llm.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [expect.objectContaining({ role: 'user' })],
        }),
      );

      // conversation.update called with correct fields
      expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.conversation.update.mock.calls[0][0] as {
        where: { id: string };
        data: { rollingContextSummary: string; summarizedTokenCount: number; lastSummarizedAt: Date };
      };
      expect(updateCall.where.id).toBe('conv-pro');
      expect(updateCall.data.rollingContextSummary).toBe('SUMMARY'); // no prior summary
      expect(typeof updateCall.data.summarizedTokenCount).toBe('number');
      expect(updateCall.data.lastSummarizedAt).toBeInstanceOf(Date);

      // cold = floor(10 * 0.4) = 4 oldest messages
      expect(prisma.conversationMessage.updateMany).toHaveBeenCalledTimes(1);
      const updateManyCall = prisma.conversationMessage.updateMany.mock.calls[0][0] as {
        where: { id: { in: string[] } };
        data: { isInActiveWindow: boolean };
      };
      expect(updateManyCall.where.id.in).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(updateManyCall.data.isInActiveWindow).toBe(false);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('merges with existing rollingContextSummary when present', async () => {
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`n${i + 1}`, `msg ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: 'OLD' });
      llm.createMessage.mockResolvedValue(FULL_LLM_RESPONSE);

      await service.maintain('conv-pro2', 'PRO');

      const updateCall = prisma.conversation.update.mock.calls[0][0] as {
        data: { rollingContextSummary: string };
      };
      expect(updateCall.data.rollingContextSummary).toBe('SUMMARY\n\n---\n\nOLD');
    });
  });

  describe('Case 4: LLM throws → maintain() swallows, no DB writes', () => {
    it('does not write to DB or throw when LLM rejects', async () => {
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`x${i + 1}`, `content ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: null });
      llm.createMessage.mockRejectedValue(new Error('LLM unavailable'));

      await expect(service.maintain('conv-err', 'PRO')).resolves.toBeUndefined();

      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.conversationMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Case 5: empty summary → no eviction', () => {
    it('whitespace-only textOutput → does not evict or write summary', async () => {
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`w${i + 1}`, `content ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: null });
      llm.createMessage.mockResolvedValue({
        ...FULL_LLM_RESPONSE,
        textOutput: '   ',
        content: [{ type: 'text', text: '   ' }],
      });

      await service.maintain('conv-empty', 'PRO');

      // findUnique is not reached because we return early on empty summary
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.conversationMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Case 6: inFlight guard — concurrent second call is skipped', () => {
    it('PRO over threshold: second concurrent maintain() does not trigger a second LLM call', async () => {
      const convId = 'conv-inflight';
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`g${i + 1}`, `content ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: null });

      // Gate: createMessage will not resolve until release() is called
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      llm.createMessage.mockReturnValue(gate.then(() => FULL_LLM_RESPONSE));
      prisma.$transaction.mockResolvedValue([]);

      // Kick off call #1 (do NOT await yet)
      const p1 = service.maintain(convId, 'PRO');
      // Flush microtasks so call #1 reaches the inFlight.add() line
      await new Promise<void>((r) => setImmediate(r));

      // Kick off call #2 — should be skipped by the inFlight guard
      const p2 = service.maintain(convId, 'PRO');
      await new Promise<void>((r) => setImmediate(r));

      // Only one LLM call should have been made
      expect(llm.createMessage).toHaveBeenCalledTimes(1);

      // Unblock call #1 and wait for both to settle cleanly
      release();
      await p1;
      await p2;
    });
  });

  describe('Case 7: $transaction failure — maintain() swallows error, no messages deactivated', () => {
    it('PRO over threshold: DB transaction rejects → maintain() resolves; $transaction attempted once; inFlight cleared', async () => {
      const convId = 'conv-txn-fail';
      const msgs: WindowMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(`t${i + 1}`, `content ${i + 1}`, 1000, i),
      );
      prisma.conversationMessage.findMany.mockResolvedValue(msgs);
      prisma.conversation.findUnique.mockResolvedValue({ rollingContextSummary: null });
      llm.createMessage.mockResolvedValue(FULL_LLM_RESPONSE);
      prisma.$transaction.mockRejectedValue(new Error('db down'));

      // maintain() must resolve (error is swallowed by the try/catch), not throw
      await expect(service.maintain(convId, 'PRO')).resolves.toBeUndefined();

      // The atomic write was attempted exactly once
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // inFlight guard was cleared — a subsequent call can proceed (LLM called again)
      llm.createMessage.mockResolvedValue(FULL_LLM_RESPONSE);
      prisma.$transaction.mockResolvedValue([]);
      await service.maintain(convId, 'PRO');
      expect(llm.createMessage).toHaveBeenCalledTimes(2);
    });
  });
});
