import { Injectable, Logger } from '@nestjs/common';
import type { SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { MemoryPolicyService, type WindowMessage } from './memory-policy.service';
import { estimateTokens } from './token-counter.util';

const SUMMARY_SYSTEM = `You are a financial memory assistant. Summarize the conversation segment into a concise but information-rich context summary. Preserve: all specific financial figures (amounts, currencies, dates); budget goals and thresholds; spending patterns or anomalies; user preferences/decisions about categories, currencies, accounts; and any explicit user instructions or corrections. Output a single factual paragraph (2-4 sentences) usable as context by a financial AI. Not conversational.`;

@Injectable()
export class MemoryCompressionService {
  private readonly logger = new Logger(MemoryCompressionService.name);
  private readonly inFlight = new Set<string>(); // per-conversation guard

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly policy: MemoryPolicyService,
  ) {}

  /** Called (FREE) or fire-and-forget (PRO+) after a chat reply. Re-analyses
   *  fresh DB state (idempotent) and brings the active window under budget. */
  async maintain(conversationId: string, tier: SubscriptionTier): Promise<void> {
    const pol = this.policy.getPolicyForTier(tier);
    const active = await this.loadActive(conversationId);
    const analysis = this.policy.analyseWindow(active);
    if (!this.policy.shouldTriggerMaintenance(analysis, pol)) return;

    if (pol.shouldEvict) {
      await this.evict(active, pol.activeWindowTokenBudget);
      return;
    }
    // compression (PRO/PREMIUM/FAMILY) — guard against concurrent runs
    if (this.inFlight.has(conversationId)) return;
    this.inFlight.add(conversationId);
    try {
      await this.compress(conversationId, active);
    } catch (err) {
      // never mark messages inactive on failure; self-heals next message.
      this.logger.warn(`Compression failed for ${conversationId}: ${String(err)}`);
    } finally {
      this.inFlight.delete(conversationId);
    }
  }

  private async loadActive(conversationId: string): Promise<WindowMessage[]> {
    return this.prisma.conversationMessage.findMany({
      where: { conversationId, isInActiveWindow: true, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, tokenCount: true, createdAt: true },
    });
  }

  /** FREE: mark oldest active messages inactive until the window fits the budget. No LLM, no summary. */
  private async evict(active: WindowMessage[], budget: number): Promise<void> {
    let total = active.reduce((s, m) => s + (m.tokenCount ?? estimateTokens(m.content)), 0);
    const toEvict: string[] = [];
    for (const m of active) {
      if (total <= budget) break;
      toEvict.push(m.id);
      total -= m.tokenCount ?? estimateTokens(m.content);
    }
    if (toEvict.length === 0) return;
    await this.prisma.conversationMessage.updateMany({
      where: { id: { in: toEvict } },
      data: { isInActiveWindow: false },
    });
  }

  /** PRO+: summarize the oldest ~40% of the window into rollingContextSummary. */
  private async compress(conversationId: string, active: WindowMessage[]): Promise<void> {
    const cutoff = Math.max(1, Math.floor(active.length * 0.4));
    const cold = active.slice(0, cutoff);
    if (cold.length === 0) return;

    const segment = cold.map((m) => m.content).join('\n');
    const res = await this.llm.createMessage({ system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: segment }] });
    const summary = res.textOutput.trim();
    if (!summary) return; // empty summary → do not evict (don't lose context silently)

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { rollingContextSummary: true },
    });
    const merged = conv?.rollingContextSummary ? `${summary}\n\n---\n\n${conv.rollingContextSummary}` : summary;

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          rollingContextSummary: merged,
          summarizedTokenCount: estimateTokens(merged),
          lastSummarizedAt: new Date(),
        },
      }),
      this.prisma.conversationMessage.updateMany({
        where: { id: { in: cold.map((m) => m.id) } },
        data: { isInActiveWindow: false },
      }),
    ]);
  }
}
