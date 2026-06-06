import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SubscriptionTier } from '@finby/shared';
import type { Env } from '../../../config/env.schema';
import { estimateTokens } from './token-counter.util';

export interface MemoryPolicy {
  tier: SubscriptionTier;
  activeWindowTokenBudget: number;
  compressionThreshold: number;
  shouldCompress: boolean; // PRO/PREMIUM/FAMILY
  shouldEvict: boolean;    // FREE
}

export interface WindowMessage { id: string; content: string; tokenCount: number | null; createdAt: Date; }
export interface WindowAnalysis { totalTokens: number; messages: WindowMessage[]; }

@Injectable()
export class MemoryPolicyService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  getPolicyForTier(tier: SubscriptionTier): MemoryPolicy {
    const free = this.config.get('FREE_ACTIVE_WINDOW_TOKEN_BUDGET', { infer: true });
    const pro = this.config.get('PRO_COMPRESSION_THRESHOLD', { infer: true });
    const premium = this.config.get('PREMIUM_COMPRESSION_THRESHOLD', { infer: true });
    if (tier === 'FREE') {
      return { tier, activeWindowTokenBudget: free, compressionThreshold: free, shouldCompress: false, shouldEvict: true };
    }
    const threshold = tier === 'PRO' ? pro : premium; // PREMIUM + FAMILY use premium threshold
    return { tier, activeWindowTokenBudget: threshold, compressionThreshold: threshold, shouldCompress: true, shouldEvict: false };
  }

  analyseWindow(messages: WindowMessage[]): WindowAnalysis {
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokenCount ?? estimateTokens(m.content)), 0);
    return { totalTokens, messages };
  }

  shouldTriggerMaintenance(analysis: WindowAnalysis, policy: MemoryPolicy): boolean {
    return analysis.totalTokens > policy.compressionThreshold;
  }
}
