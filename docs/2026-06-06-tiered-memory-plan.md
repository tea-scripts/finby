# Tiered Chat Memory — Implementation Plan (repo-accurate)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the chat module's primitive 20-message count window with a token-budgeted, tier-aware memory model: bounded active window + per-tier compression (PRO/PREMIUM/FAMILY) into `rollingContextSummary`, eviction-only for FREE.

**Architecture:** New pure token counter + memory-policy service, an **in-process** compression service (fire-and-forget — no BullMQ; the user chose this), and a context assembler that folds the rolling summary into the system prompt. Wired into the existing `ChatService.handleMessage`. No migration (schema columns already exist).

## Deviations from the original prompt (and why)
- **Paths:** `apps/api/src/modules/chat/memory/` + `.../context/` (repo uses `modules/`, no `src/chat` or `src/shared`).
- **No BullMQ** (not installed; user chose in-process). Compression is a service method called **without `await`** after the reply is sent, guarded against concurrent runs per conversation. Idempotent + self-healing (re-triggers next message if it ever fails).
- **Summary injected into the SYSTEM prompt**, not as a leading message — Anthropic requires alternating roles starting with `user`; a leading summary message would collide with the first active user message.
- **Tokenizer:** `@anthropic-ai/tokenizer` not installed → `Math.ceil(len/4)` approximation (the prompt's own fallback).
- **Package/commands:** `pnpm --filter finby-api`. Prisma 5.22. Model `claude-sonnet-4-6`. Redis `:6380`.
- **Replaces existing logic:** removes `FREE_ACTIVE_WINDOW = 20`, the `take`-based history load, and `pruneActiveWindow()` in `chat.service.ts`.

## Conventions
- API tests: `pnpm --filter finby-api exec jest`. Build/typecheck: `pnpm --filter finby-api exec tsc --noEmit`.
- Conventional commits, **NO AI-attribution trailer**. No `any`. Keep the 130 existing tests green (update `chat.service.spec.ts` only as needed for the window-logic change).

## Files
| File | Action |
|------|--------|
| `src/modules/chat/memory/token-counter.util.ts` (+ `.spec.ts`) | new — `estimateTokens` |
| `src/modules/chat/memory/memory-policy.service.ts` (+ `.spec.ts`) | new — pure tier policy + window analysis |
| `src/modules/chat/memory/memory-compression.service.ts` (+ `.spec.ts`) | new — in-process maintain/compress/evict |
| `src/modules/chat/context/context-assembler.service.ts` (+ `.spec.ts`) | new — system+messages assembly |
| `src/modules/chat/chat.service.ts` | modify — tokenCount on save, use assembler, call maintain, drop old window logic |
| `src/modules/chat/chat.module.ts` | modify — register the 3 new providers |
| `src/config/env.schema.ts` + root `.env.example` | modify — 3 token-budget vars |

---

### Task 1: Token counter (TDD)
**Create** `src/modules/chat/memory/token-counter.util.ts`:
```ts
/** Rough token estimate. Replace with @anthropic-ai/tokenizer if precision is
 *  ever needed; ~4 chars/token is close enough for budget thresholds. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
```
**Test** `token-counter.util.spec.ts`: `''`→0, `null`/`undefined`→0, a known string → `Math.ceil(len/4)`, a JSON string doesn't throw.
Commit: `feat(api): token estimate util for chat memory`.

---

### Task 2: Memory policy service (TDD, pure)
**Create** `src/modules/chat/memory/memory-policy.service.ts`. Pure — no DB.
```ts
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
```
**Tests** `memory-policy.service.spec.ts` (mock ConfigService.get to return budgets): per-tier budgets; FREE → evict not compress; PRO/PREMIUM → compress not evict; FAMILY uses premium threshold; `analyseWindow` sums tokens (falling back to estimate when tokenCount null); `shouldTriggerMaintenance` false under / true over threshold.
Commit: `feat(api): tier-aware chat memory policy service`.

---

### Task 3: In-process compression/eviction service (TDD)
**Create** `src/modules/chat/memory/memory-compression.service.ts`:
```ts
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
      await this.evict(conversationId, active, pol.activeWindowTokenBudget);
      return;
    }
    // compression (PRO/PREMIUM/FAMILY) — guard against concurrent runs
    if (this.inFlight.has(conversationId)) return;
    this.inFlight.add(conversationId);
    try {
      await this.compress(conversationId, active, pol.compressionThreshold);
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
  private async evict(conversationId: string, active: WindowMessage[], budget: number): Promise<void> {
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
  private async compress(conversationId: string, active: WindowMessage[], threshold: number): Promise<void> {
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
```
**Tests** `memory-compression.service.spec.ts` (mock prisma + llm + a real MemoryPolicyService with a mocked ConfigService): under threshold → no DB writes, no LLM call; FREE over budget → `updateMany` marks oldest inactive, **no** LLM call; PRO over threshold → LLM called, `conversation.update` writes merged summary, cold messages marked inactive; LLM throws → no `updateMany`, no summary write (messages stay active); empty summary → no eviction.
Commit: `feat(api): in-process chat memory compression + eviction`.

---

### Task 4: Context assembler (TDD)
**Create** `src/modules/chat/context/context-assembler.service.ts`:
```ts
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
```
**Tests** `context-assembler.service.spec.ts` (mock prisma): empty summary → system unchanged, messages mapped asc; non-empty summary → system contains the `[Memory summary` prefix + summary text; role mapping USER→user / ASSISTANT→assistant.
Commit: `feat(api): chat context assembler (summary + active window)`.

---

### Task 5: Wire into ChatService + module + env (integration)
**Modify** `src/modules/chat/chat.service.ts`:
- Constructor: inject `private readonly memory: MemoryCompressionService` and `private readonly contextAssembler: ContextAssemblerService`.
- **tokenCount on save:** add `tokenCount: estimateTokens(content)` to the USER create; `tokenCount: estimateTokens(JSON.stringify(call.input))` (TOOL_CALL); `tokenCount: estimateTokens(exec.toolResult)` (TOOL_RESULT); `tokenCount: estimateTokens(finalText)` (ASSISTANT). Import `estimateTokens`.
- **Replace** the inline system+history block (the `buildSystemPrompt` call + the `conversationMessage.findMany({ ... take: FREE_ACTIVE_WINDOW })` + `messages` map) with:
  ```ts
  const baseSystem = await this.buildSystemPrompt(workspace, user);
  const { system, messages } = await this.contextAssembler.buildContext(conversationId, baseSystem);
  ```
- **Replace** the FREE-only `pruneActiveWindow` block (after the `conversation.update`) with:
  ```ts
  if (workspace.tier === 'FREE') {
    await this.memory.maintain(conversationId, workspace.tier); // sync eviction
  } else {
    void this.memory.maintain(conversationId, workspace.tier);  // fire-and-forget compression
  }
  ```
- **Delete** the now-unused `FREE_ACTIVE_WINDOW` const and the `pruneActiveWindow` method.
- Update `chat.service.spec.ts` for the new collaborators (inject mocks for `memory.maintain` + `contextAssembler.buildContext`) so the suite stays green.

**Modify** `src/modules/chat/chat.module.ts`: add `MemoryPolicyService`, `MemoryCompressionService`, `ContextAssemblerService` to `providers`.

**Modify** `src/config/env.schema.ts` (after the email block):
```ts
  // Chat memory token budgets
  FREE_ACTIVE_WINDOW_TOKEN_BUDGET: z.coerce.number().int().positive().default(4000),
  PRO_COMPRESSION_THRESHOLD: z.coerce.number().int().positive().default(8000),
  PREMIUM_COMPRESSION_THRESHOLD: z.coerce.number().int().positive().default(12000),
```
**Modify** root `.env.example`: add the three with defaults + a comment.

Verify: `pnpm --filter finby-api exec tsc --noEmit` (0) + `pnpm --filter finby-api exec jest` (all pass).
Commit: `feat(api): wire tiered memory (token window + compression) into chat`.

---

### Task 6: Verify + smoke + finish
- Full suite green, tsc 0, `pnpm --filter finby-api build`.
- Manual smoke: set `FREE_ACTIVE_WINDOW_TOKEN_BUDGET=500`, send several FREE-tier messages, confirm oldest `isInActiveWindow=false` in psql and the assistant still replies; reset env.
- superpowers:finishing-a-development-branch.

## Self-Review
Covers all 7 prompt steps (token util · policy · compression[in-process] · context assembly · chat wiring · tokenCount-on-save · env) + tests. Guardrails respected: only `chat.service.ts` modified in the existing pipeline; no migration; no `any`; compression never blocks chat (FREE evict sync, PRO+ fire-and-forget); budgets from env. Naming consistent (`estimateTokens`, `MemoryPolicyService`, `MemoryCompressionService.maintain`, `ContextAssemblerService.buildContext`).
