import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { MemoryPolicyService } from './memory-policy.service';
import type { WindowMessage } from './memory-policy.service';

const FREE_BUDGET = 4000;
const PRO_THRESHOLD = 8000;
const PREMIUM_THRESHOLD = 12000;

function makeConfig(overrides?: Partial<Env>): ConfigService<Env, true> {
  const values: Partial<Env> = {
    FREE_ACTIVE_WINDOW_TOKEN_BUDGET: FREE_BUDGET,
    PRO_COMPRESSION_THRESHOLD: PRO_THRESHOLD,
    PREMIUM_COMPRESSION_THRESHOLD: PREMIUM_THRESHOLD,
    ...overrides,
  };
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

describe('MemoryPolicyService', () => {
  let service: MemoryPolicyService;

  beforeEach(() => {
    service = new MemoryPolicyService(makeConfig());
  });

  describe('getPolicyForTier', () => {
    it('returns FREE policy with evict=true, compress=false and correct budget', () => {
      const policy = service.getPolicyForTier('FREE');
      expect(policy.tier).toBe('FREE');
      expect(policy.activeWindowTokenBudget).toBe(FREE_BUDGET);
      expect(policy.compressionThreshold).toBe(FREE_BUDGET);
      expect(policy.shouldCompress).toBe(false);
      expect(policy.shouldEvict).toBe(true);
    });

    it('returns PRO policy with compress=true, evict=false and correct threshold', () => {
      const policy = service.getPolicyForTier('PRO');
      expect(policy.tier).toBe('PRO');
      expect(policy.activeWindowTokenBudget).toBe(PRO_THRESHOLD);
      expect(policy.compressionThreshold).toBe(PRO_THRESHOLD);
      expect(policy.shouldCompress).toBe(true);
      expect(policy.shouldEvict).toBe(false);
    });

    it('returns PREMIUM policy with compress=true, evict=false and correct threshold', () => {
      const policy = service.getPolicyForTier('PREMIUM');
      expect(policy.tier).toBe('PREMIUM');
      expect(policy.activeWindowTokenBudget).toBe(PREMIUM_THRESHOLD);
      expect(policy.compressionThreshold).toBe(PREMIUM_THRESHOLD);
      expect(policy.shouldCompress).toBe(true);
      expect(policy.shouldEvict).toBe(false);
    });

    it('FAMILY uses the premium threshold with compress=true, evict=false', () => {
      const policy = service.getPolicyForTier('FAMILY');
      expect(policy.tier).toBe('FAMILY');
      expect(policy.activeWindowTokenBudget).toBe(PREMIUM_THRESHOLD);
      expect(policy.compressionThreshold).toBe(PREMIUM_THRESHOLD);
      expect(policy.shouldCompress).toBe(true);
      expect(policy.shouldEvict).toBe(false);
    });
  });

  describe('analyseWindow', () => {
    it('sums tokenCount when present', () => {
      const messages: WindowMessage[] = [
        { id: 'm1', content: 'hello', tokenCount: 10, createdAt: new Date() },
        { id: 'm2', content: 'world', tokenCount: 20, createdAt: new Date() },
      ];
      const result = service.analyseWindow(messages);
      expect(result.totalTokens).toBe(30);
      expect(result.messages).toBe(messages);
    });

    it('falls back to estimateTokens when tokenCount is null', () => {
      // 'hello world' = 11 chars → ceil(11/4) = 3
      const messages: WindowMessage[] = [
        { id: 'm1', content: 'hello world', tokenCount: null, createdAt: new Date() },
      ];
      const result = service.analyseWindow(messages);
      expect(result.totalTokens).toBe(3);
    });

    it('mixes known and null tokenCount correctly', () => {
      // 'abcd' = 4 chars → ceil(4/4) = 1
      const messages: WindowMessage[] = [
        { id: 'm1', content: 'ignored', tokenCount: 50, createdAt: new Date() },
        { id: 'm2', content: 'abcd', tokenCount: null, createdAt: new Date() },
      ];
      const result = service.analyseWindow(messages);
      expect(result.totalTokens).toBe(51);
    });

    it('returns zero for empty message list', () => {
      const result = service.analyseWindow([]);
      expect(result.totalTokens).toBe(0);
    });
  });

  describe('shouldTriggerMaintenance', () => {
    it('returns false when totalTokens is below the threshold', () => {
      const policy = service.getPolicyForTier('PRO');
      const analysis = { totalTokens: PRO_THRESHOLD - 1, messages: [] };
      expect(service.shouldTriggerMaintenance(analysis, policy)).toBe(false);
    });

    it('returns false when totalTokens equals the threshold', () => {
      const policy = service.getPolicyForTier('PRO');
      const analysis = { totalTokens: PRO_THRESHOLD, messages: [] };
      expect(service.shouldTriggerMaintenance(analysis, policy)).toBe(false);
    });

    it('returns true when totalTokens exceeds the threshold', () => {
      const policy = service.getPolicyForTier('PRO');
      const analysis = { totalTokens: PRO_THRESHOLD + 1, messages: [] };
      expect(service.shouldTriggerMaintenance(analysis, policy)).toBe(true);
    });

    it('works correctly for FREE tier', () => {
      const policy = service.getPolicyForTier('FREE');
      expect(service.shouldTriggerMaintenance({ totalTokens: FREE_BUDGET + 1, messages: [] }, policy)).toBe(true);
      expect(service.shouldTriggerMaintenance({ totalTokens: FREE_BUDGET, messages: [] }, policy)).toBe(false);
    });
  });
});
