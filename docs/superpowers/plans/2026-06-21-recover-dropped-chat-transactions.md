# Recover Dropped Chat Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct chat transactions that were never saved (the LLM said "Logged!" without calling the tool), insert them dated to the original day, and retroactively restore each affected user's streak and the XP they should have earned — all via a dry-run-first CLI, with no end-user action.

**Architecture:** An injectable `ChatRecoveryService` (Nest DI, reuses `LlmService`, `TransactionsService`, `CategoriesService`, `AccountsService`, `StreaksService`, `XpService`, `PrismaService`) holds the recovery logic; two pure helpers (`computeStreakFromActiveDays`, `detectDroppedTurns`) are unit-tested in isolation. A thin CLI script under `prisma/` bootstraps a minimal Nest application context, resolves the service, runs dry-run by default (`--commit` to write), and prints a review report. Reconstruction is LLM replay of the original user message; streak restoration is a full per-user recompute; XP is awarded only for the recovered dates.

**Tech Stack:** NestJS, Prisma (PostgreSQL), TypeScript, Jest, `ts-node` (seed/script runner), Anthropic via the existing `LlmService` port.

## Global Constraints

- No AI-attribution trailers on commits or PR bodies (project rule). Strip the default `Co-Authored-By`/`Generated with` lines before committing.
- Custom UI components only — N/A here (backend only).
- New code is test-first (Jest), mirroring existing `*.spec.ts`. Run `pnpm jest`, lint the changed files (`npx eslint <files>`), and `pnpm build` (in `apps/api`) before committing.
- Reuse existing helpers verbatim: `localDayInfo`, `previousLocalDate` (`src/modules/reminders/reminders.time.ts`); `XP_BASE`, `XP_MULTIPLIER`, `STREAK_MILESTONES` (`src/modules/gamification/xp.constants.ts`).
- Idempotency is mandatory: a recovered transaction sets `sourceMessageId` = the original USER message id and a `chat-recovery` tag; XP awards key on `meta.date` (+ `event`). Re-runs must be safe.
- Dry-run is the default; only `--commit` (or `COMMIT=1`) writes.
- All work on branch `feat/recover-dropped-chat-transactions` (already created). Commit after each task.

---

### Task 1: Add `createdAt` + `skipEngagement` to `TransactionsService.create()`

Recovery must (a) place the row on the original day so the streak/calendar see it correctly, and (b) suppress the live now-based streak/XP side-effect (Task 5 owns date-correct streak/XP). Both additions are opt-in; defaults preserve all current behavior.

**Files:**
- Modify: `apps/api/src/modules/transactions/transactions.types.ts` (`CreateTransactionParams`)
- Modify: `apps/api/src/modules/transactions/transactions.service.ts:41-164` (`create`)
- Test: `apps/api/src/modules/transactions/transactions.service.spec.ts`

**Interfaces:**
- Produces: `CreateTransactionParams` gains `createdAt?: Date` and `skipEngagement?: boolean`. When `createdAt` is set, the row's `createdAt` column is written to it. When `skipEngagement` is true, `create()` does NOT call `streaks.onTransactionLogged`, and the returned `currentStreak` is `null` with `newAchievements` `[]`.

- [ ] **Step 1: Write the failing test**

Open `apps/api/src/modules/transactions/transactions.service.spec.ts`. Find the existing `create` describe block and the mock setup for `streaks` (a `StreaksService` mock with `onTransactionLogged`). Add:

```ts
it('skips the streak/XP side-effect and backdates createdAt when asked', async () => {
  // streaksMock.onTransactionLogged is the shared jest.fn() from the suite's setup
  const backdated = new Date('2026-06-18T12:00:00.000Z');
  const result = await service.create({
    workspaceId: 'w1',
    loggedByUserId: 'u1',
    baseCurrency: 'USD',
    tier: 'FREE',
    type: 'EXPENSE',
    amountOriginal: '1000',
    currencyOriginal: 'PHP',
    transactionDate: '2026-06-18',
    createdAt: backdated,
    skipEngagement: true,
  });

  expect(streaksMock.onTransactionLogged).not.toHaveBeenCalled();
  expect(result.currentStreak).toBeNull();
  expect(result.newAchievements).toEqual([]);
  // The createdAt override is forwarded into the Prisma create payload.
  const createArg = prismaMock.transaction.create.mock.calls[0][0];
  expect(createArg.data.createdAt).toBe(backdated);
});
```

> If the suite mocks `prisma.$transaction` by invoking the callback with a `txc` whose `transaction.create` is a jest.fn, assert on that fn instead. Match whatever the existing `create` tests already assert against — reuse the suite's existing mock handles (`prismaMock`, `streaksMock`); do not introduce new ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/transactions/transactions.service.spec.ts -t "skips the streak"`
Expected: FAIL — `onTransactionLogged` was called / `createdAt` not present in payload.

- [ ] **Step 3: Add the params**

In `transactions.types.ts`, inside `CreateTransactionParams` (after `status?`):

```ts
  /** Override the row's createdAt (recovery backfill dates rows to the original
   *  day so streak/calendar bucketing places them correctly). */
  createdAt?: Date;
  /** Skip the streak/XP/achievement side-effect. Used by recovery, which
   *  recomputes streak + awards XP for the correct historical date itself. */
  skipEngagement?: boolean;
```

- [ ] **Step 4: Forward `createdAt` into the create payload**

In `transactions.service.ts`, in the `txc.transaction.create({ data: { … } })` block (around line 78-99), add to `data` (after `sourceMessageId`):

```ts
          ...(params.createdAt ? { createdAt: params.createdAt } : {}),
```

- [ ] **Step 5: Gate the engagement side-effect**

In `transactions.service.ts`, wrap the streak block (lines ~151-161). Replace:

```ts
    let currentStreak: number | null = null;
    let newAchievements: NewAchievement[] = [];
    try {
      const streak = await this.streaks.onTransactionLogged(params.loggedByUserId, params.tier);
      currentStreak = streak.currentStreak;
      newAchievements = streak.newAchievements;
    } catch (error) {
      this.logger.error(
        `Streak update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
```

with:

```ts
    let currentStreak: number | null = null;
    let newAchievements: NewAchievement[] = [];
    if (!params.skipEngagement) {
      try {
        const streak = await this.streaks.onTransactionLogged(params.loggedByUserId, params.tier);
        currentStreak = streak.currentStreak;
        newAchievements = streak.newAchievements;
      } catch (error) {
        this.logger.error(
          `Streak update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && pnpm jest src/modules/transactions/transactions.service.spec.ts`
Expected: PASS (new test + all existing `create` tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/transactions/transactions.types.ts apps/api/src/modules/transactions/transactions.service.ts apps/api/src/modules/transactions/transactions.service.spec.ts
git commit -m "feat(transactions): opt-in createdAt + skipEngagement on create() for recovery"
```

---

### Task 2: Pure helper `computeStreakFromActiveDays`

Recompute streak counters from a set of active local dates — correct for any gap pattern, unlike incremental adjustment.

**Files:**
- Create: `apps/api/src/modules/streaks/streaks.recompute.ts`
- Test: `apps/api/src/modules/streaks/streaks.recompute.spec.ts`

**Interfaces:**
- Produces: `computeStreakFromActiveDays(activeDates: string[], _today?: string): { currentStreak: number; longestStreak: number; lastStreakDate: string | null }`. `currentStreak` = length of the consecutive run ending at the most recent active day (matches what the live incremental algorithm would have stored as of the last log). `longestStreak` = longest consecutive run overall. `lastStreakDate` = the most recent active day, or `null` if none. Dates are `YYYY-MM-DD`; duplicates are ignored. (`_today` is accepted but unused — reserved so callers can pass it without churn.)

- [ ] **Step 1: Write the failing test**

```ts
import { computeStreakFromActiveDays } from './streaks.recompute';

describe('computeStreakFromActiveDays', () => {
  it('returns zeros for no active days', () => {
    expect(computeStreakFromActiveDays([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastStreakDate: null,
    });
  });

  it('counts a single consecutive run', () => {
    const r = computeStreakFromActiveDays(['2026-06-16', '2026-06-17', '2026-06-18']);
    expect(r).toEqual({ currentStreak: 3, longestStreak: 3, lastStreakDate: '2026-06-18' });
  });

  it('current run ends at the most recent day; longest can be earlier', () => {
    // 4-day run (Jun 1-4), gap, then 2-day run (Jun 10-11)
    const r = computeStreakFromActiveDays([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-10', '2026-06-11',
    ]);
    expect(r).toEqual({ currentStreak: 2, longestStreak: 4, lastStreakDate: '2026-06-11' });
  });

  it('dedupes and is order-independent', () => {
    const r = computeStreakFromActiveDays(['2026-06-18', '2026-06-17', '2026-06-18']);
    expect(r).toEqual({ currentStreak: 2, longestStreak: 2, lastStreakDate: '2026-06-18' });
  });

  it('a restored day that bridges two runs joins them', () => {
    // Jun 1-2, [Jun 3 restored], Jun 4-5  → one run of 5
    const r = computeStreakFromActiveDays([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
    ]);
    expect(r).toEqual({ currentStreak: 5, longestStreak: 5, lastStreakDate: '2026-06-05' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/streaks/streaks.recompute.spec.ts`
Expected: FAIL — cannot find module `./streaks.recompute`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/streaks/streaks.recompute.ts`:

```ts
import { previousLocalDate } from '../reminders/reminders.time';

/** Recompute streak counters from a set of active local dates (YYYY-MM-DD).
 *  Pure and order-independent. currentStreak is the consecutive run ending at
 *  the most recent active day — the same value the live incremental algorithm
 *  would have stored as of the last log. */
export function computeStreakFromActiveDays(
  activeDates: string[],
  _today?: string,
): { currentStreak: number; longestStreak: number; lastStreakDate: string | null } {
  const set = new Set(activeDates);
  if (set.size === 0) return { currentStreak: 0, longestStreak: 0, lastStreakDate: null };

  const sorted = [...set].sort(); // YYYY-MM-DD sorts chronologically

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (previousLocalDate(sorted[i]!) === sorted[i - 1]) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  const last = sorted[sorted.length - 1]!;
  let current = 1;
  let cursor = last;
  while (set.has(previousLocalDate(cursor))) {
    current += 1;
    cursor = previousLocalDate(cursor);
  }

  return { currentStreak: current, longestStreak: longest, lastStreakDate: last };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm jest src/modules/streaks/streaks.recompute.spec.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.recompute.ts apps/api/src/modules/streaks/streaks.recompute.spec.ts
git commit -m "feat(streaks): pure computeStreakFromActiveDays recompute helper"
```

---

### Task 3: Pure helper `detectDroppedTurns`

Identify turns where the user reported something but no logging tool succeeded, from an ordered transcript.

**Files:**
- Create: `apps/api/src/modules/chat/recovery/dropped-turn-detector.ts`
- Test: `apps/api/src/modules/chat/recovery/dropped-turn-detector.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TranscriptMessage {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'TOOL_CALL' | 'TOOL_RESULT';
    toolName: string | null;
    createdTransactionId: string | null;
    createdAt: Date;
  }
  export interface DroppedTurn { userMessageId: string; }
  export function detectDroppedTurns(
    messages: TranscriptMessage[],
    opts: { alreadyRecoveredUserMessageIds: Set<string> },
  ): DroppedTurn[];
  ```
- A *turn* spans from a `USER` message up to (not including) the next `USER` message. A turn is dropped when it contains **no** `TOOL_CALL` with `toolName` in `{log_expense, log_income, log_transfer}` that was followed in the same turn by a `TOOL_RESULT` with a non-null `createdTransactionId`. Skip a turn whose `userMessageId` is in `alreadyRecoveredUserMessageIds`. Detection deliberately does not inspect the assistant text — reconstruction in Task 4 (LLM replay) is the real "was this a logging intent?" filter.

- [ ] **Step 1: Write the failing test**

```ts
import { detectDroppedTurns, type TranscriptMessage } from './dropped-turn-detector';

const t = (over: Partial<TranscriptMessage>): TranscriptMessage => ({
  id: 'm', role: 'USER', toolName: null, createdTransactionId: null,
  createdAt: new Date('2026-06-18T10:00:00Z'), ...over,
});

describe('detectDroppedTurns', () => {
  it('flags a USER→ASSISTANT turn with no successful log tool call', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'a1', role: 'ASSISTANT' }), // "Logged! ..."
    ];
    const out = detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() });
    expect(out).toEqual([{ userMessageId: 'u1' }]);
  });

  it('does NOT flag a turn where a log tool created a transaction', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: 'tx1' }),
      t({ id: 'a1', role: 'ASSISTANT' }),
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() })).toEqual([]);
  });

  it('flags a turn where the log tool call FAILED (no createdTransactionId)', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: null }),
      t({ id: 'a1', role: 'ASSISTANT' }),
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() }))
      .toEqual([{ userMessageId: 'u1' }]);
  });

  it('skips already-recovered user messages', () => {
    const msgs = [t({ id: 'u1', role: 'USER' }), t({ id: 'a1', role: 'ASSISTANT' })];
    const out = detectDroppedTurns(msgs, {
      alreadyRecoveredUserMessageIds: new Set(['u1']),
    });
    expect(out).toEqual([]);
  });

  it('handles multiple turns independently', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: 'tx1' }), // logged ok
      t({ id: 'u2', role: 'USER' }),
      t({ id: 'a2', role: 'ASSISTANT' }),                                // dropped
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() }))
      .toEqual([{ userMessageId: 'u2' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/dropped-turn-detector.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/chat/recovery/dropped-turn-detector.ts`:

```ts
export interface TranscriptMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL_CALL' | 'TOOL_RESULT';
  toolName: string | null;
  createdTransactionId: string | null;
  createdAt: Date;
}

export interface DroppedTurn {
  userMessageId: string;
}

/** Split an ordered transcript into turns (USER → next USER) and return turns
 *  with no successful logging tool call. Reconstruction (LLM replay) is the real
 *  "was this a logging intent?" filter; this just finds turns that produced no
 *  saved transaction. */
export function detectDroppedTurns(
  messages: TranscriptMessage[],
  opts: { alreadyRecoveredUserMessageIds: Set<string> },
): DroppedTurn[] {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const dropped: DroppedTurn[] = [];

  let i = 0;
  while (i < ordered.length) {
    if (ordered[i]!.role !== 'USER') {
      i += 1;
      continue;
    }
    const userMsg = ordered[i]!;
    let j = i + 1;
    let loggedOk = false;
    while (j < ordered.length && ordered[j]!.role !== 'USER') {
      const m = ordered[j]!;
      if (m.role === 'TOOL_RESULT' && m.createdTransactionId) loggedOk = true;
      j += 1;
    }
    if (!loggedOk && !opts.alreadyRecoveredUserMessageIds.has(userMsg.id)) {
      dropped.push({ userMessageId: userMsg.id });
    }
    i = j;
  }
  return dropped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/dropped-turn-detector.spec.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/recovery/dropped-turn-detector.ts apps/api/src/modules/chat/recovery/dropped-turn-detector.spec.ts
git commit -m "feat(chat): pure detectDroppedTurns transcript helper"
```

---

### Task 4: `ChatRecoveryService.reconstructTurn` — LLM replay of one dropped turn

Re-run the real extraction on the original user message, with the workspace's accounts/categories and "today" pinned to the message's local date.

**Files:**
- Create: `apps/api/src/modules/chat/recovery/chat-recovery.service.ts` (this task adds the class shell + `reconstructTurn`)
- Test: `apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts`

**Interfaces:**
- Consumes: `LlmService.buildSystemPrompt(ctx)`, `LlmService.getTools()`, `LlmService.createMessage({ system, messages, tools })` → `LlmResponse` (`.toolCalls: { name, input }[]`); `localDayInfo` from `reminders.time`.
- Produces:
  ```ts
  export interface ReconstructedTransaction {
    type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
    amountOriginal: string;
    currencyOriginal: string;
    categoryName: string | null;
    accountName: string | null;
    merchant: string | null;
    transactionDate: string; // YYYY-MM-DD
    confidence: number;
    needsManual: boolean;     // true for TRANSFER (not auto-inserted in v1)
  }
  // returns null when the message was not a logging intent (no log_* tool call)
  async reconstructTurn(input: {
    workspace: { id: string; baseCurrency: string; tier: SubscriptionTier };
    user: { displayName: string; timezone: string };
    accounts: Array<{ name: string; currency: string }>;
    categories: string[];
    userText: string;
    messageLocalDate: string; // YYYY-MM-DD, the day the user spoke
  }): Promise<ReconstructedTransaction | null>
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { Test } from '@nestjs/testing';
import { ChatRecoveryService } from './chat-recovery.service';
import { LlmService } from '../../llm/llm.service';
// plus the other injected services — provide jest-mock objects for each.

describe('ChatRecoveryService.reconstructTurn', () => {
  let service: ChatRecoveryService;
  const llm = {
    buildSystemPrompt: jest.fn().mockReturnValue('SYS'),
    getTools: jest.fn().mockReturnValue([]),
    createMessage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatRecoveryService,
        { provide: LlmService, useValue: llm },
        // Provide the remaining deps as empty mocks (PrismaService,
        // TransactionsService, CategoriesService, AccountsService,
        // StreaksService, XpService) — reconstructTurn only uses llm.
        { provide: require('../../../prisma/prisma.service').PrismaService, useValue: {} },
        { provide: require('../../transactions/transactions.service').TransactionsService, useValue: {} },
        { provide: require('../../categories/categories.service').CategoriesService, useValue: {} },
        { provide: require('../../accounts/accounts.service').AccountsService, useValue: {} },
        { provide: require('../../streaks/streaks.service').StreaksService, useValue: {} },
        { provide: require('../../gamification/xp.service').XpService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChatRecoveryService);
  });

  const baseInput = {
    workspace: { id: 'w1', baseCurrency: 'USD', tier: 'FREE' as const },
    user: { displayName: 'Tim', timezone: 'Asia/Manila' },
    accounts: [], categories: ['Transport'],
    userText: 'Spent 1000₱ on gas today',
    messageLocalDate: '2026-06-18',
  };

  it('returns a reconstructed expense from a log_expense tool call', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_expense', input: {
        amountOriginal: '1000', currencyOriginal: 'PHP', categoryName: 'Transport',
        merchant: 'gas', confidence: 0.95,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({
      type: 'EXPENSE', amountOriginal: '1000', currencyOriginal: 'PHP',
      categoryName: 'Transport', merchant: 'gas', transactionDate: '2026-06-18',
      needsManual: false,
    });
    // "today" was pinned to the message's local date, not the real today.
    expect(llm.buildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ today: '2026-06-18' }),
    );
  });

  it('returns null when no log tool was called (not a logging intent)', async () => {
    llm.createMessage.mockResolvedValue({ toolCalls: [] });
    expect(await service.reconstructTurn(baseInput)).toBeNull();
  });

  it('marks a transfer as needsManual', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_transfer', input: {
        amountOriginal: '500', currencyOriginal: 'PHP', confidence: 0.9,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({ type: 'TRANSFER', needsManual: true });
  });

  it('falls back to the message local date when the tool omits transactionDate', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_income', input: {
        amountOriginal: '2000', currencyOriginal: 'USD', confidence: 1,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({ type: 'INCOME', transactionDate: '2026-06-18' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/chat-recovery.service.spec.ts`
Expected: FAIL — cannot find module `./chat-recovery.service`.

- [ ] **Step 3: Implement the class shell + `reconstructTurn`**

Create `apps/api/src/modules/chat/recovery/chat-recovery.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { StreaksService } from '../../streaks/streaks.service';
import { XpService } from '../../gamification/xp.service';

export interface ReconstructedTransaction {
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountOriginal: string;
  currencyOriginal: string;
  categoryName: string | null;
  accountName: string | null;
  merchant: string | null;
  transactionDate: string;
  confidence: number;
  needsManual: boolean;
}

const LOG_TOOL_TYPE: Record<string, 'EXPENSE' | 'INCOME' | 'TRANSFER'> = {
  log_expense: 'EXPENSE',
  log_income: 'INCOME',
  log_transfer: 'TRANSFER',
};

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

@Injectable()
export class ChatRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly streaks: StreaksService,
    private readonly xp: XpService,
  ) {}

  async reconstructTurn(input: {
    workspace: { id: string; baseCurrency: string; tier: SubscriptionTier };
    user: { displayName: string; timezone: string };
    accounts: Array<{ name: string; currency: string }>;
    categories: string[];
    userText: string;
    messageLocalDate: string;
  }): Promise<ReconstructedTransaction | null> {
    const system = this.llm.buildSystemPrompt({
      user: { displayName: input.user.displayName, timezone: input.user.timezone },
      workspace: { baseCurrency: input.workspace.baseCurrency, tier: input.workspace.tier },
      accounts: input.accounts,
      categories: input.categories,
      budgets: [],
      today: input.messageLocalDate, // pin "today" to the day the user spoke
    });

    const response = await this.llm.createMessage({
      system,
      messages: [{ role: 'user', content: input.userText }],
      tools: this.llm.getTools(),
    });

    const call = response.toolCalls.find((c) => c.name in LOG_TOOL_TYPE);
    if (!call) return null; // not a logging intent

    const type = LOG_TOOL_TYPE[call.name]!;
    const amountOriginal = asString(call.input.amountOriginal);
    const currencyOriginal = asString(call.input.currencyOriginal)?.toUpperCase();
    if (!amountOriginal || !currencyOriginal) return null;

    return {
      type,
      amountOriginal,
      currencyOriginal,
      categoryName: asString(call.input.categoryName) ?? null,
      accountName: asString(call.input.accountName) ?? null,
      merchant: asString(call.input.merchant) ?? null,
      transactionDate: (asString(call.input.transactionDate) ?? input.messageLocalDate).slice(0, 10),
      confidence: asNumber(call.input.confidence) ?? 1,
      needsManual: type === 'TRANSFER',
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/chat-recovery.service.spec.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/recovery/chat-recovery.service.ts apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts
git commit -m "feat(chat): ChatRecoveryService.reconstructTurn (LLM replay)"
```

---

### Task 5: `ChatRecoveryService.restoreUserStreakAndXp` — date-correct streak + XP

After recovered rows exist, recompute the user's streak and award XP only for the recovered dates.

**Files:**
- Modify: `apps/api/src/modules/chat/recovery/chat-recovery.service.ts`
- Test: `apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`transaction.findMany`, `user.findUnique`, `user.update`, `xpTransaction.findMany`), `XpService.awardXp(userId, tier, event, meta)` (the canonical award path — same call the live streak system uses), `computeStreakFromActiveDays` (Task 2), `bucketLocalDays` (`src/modules/streaks/streaks.calendar.ts`), `XP_BASE`/`XP_MULTIPLIER`/`STREAK_MILESTONES`, `XpEvent` from `@prisma/client`.
- Produces:
  ```ts
  export interface StreakRestoreResult {
    before: { currentStreak: number; longestStreak: number };
    after: { currentStreak: number; longestStreak: number };
    xpAwards: Array<{ date: string; event: 'STREAK_DAY' | 'STREAK_MILESTONE'; delta: number }>;
  }
  async restoreUserStreakAndXp(input: {
    userId: string;
    tier: SubscriptionTier;
    timezone: string;
    recoveredDates: string[]; // YYYY-MM-DD local dates we restored for this user
    commit: boolean;
  }): Promise<StreakRestoreResult>
  ```
- Behaviour: recompute streak from ALL of the user's active days (by local `createdAt` date, matching the calendar); update the `User` row when `commit`. For each *recovered* date with no existing `STREAK_DAY` XP (`meta.date` match), award `STREAK_DAY` (× tier); if the recomputed streak makes that date a milestone day, also award `STREAK_MILESTONE`. All XP writes are idempotent on `meta.date` + `event` and only happen when `commit`.

- [ ] **Step 1: Write the failing test**

Add to `chat-recovery.service.spec.ts` a new describe block. Provide a `PrismaService` mock with the methods used. Example:

Build the module with a richer `PrismaService` mock and an `XpService` mock exposing `awardXp`:

```ts
import { XpEvent } from '@prisma/client';

describe('ChatRecoveryService.restoreUserStreakAndXp', () => {
  const prisma = {
    transaction: { findMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    xpTransaction: { findMany: jest.fn() },
  };
  const xp = { awardXp: jest.fn().mockResolvedValue({}) };
  // …compile the testing module providing `prisma` as PrismaService and `xp` as
  // XpService (the other deps stay as empty mocks). clearAllMocks in beforeEach.

  it('recomputes streak and awards STREAK_DAY for a recovered date (commit)', async () => {
    // Active days incl. the recovered one (createdAt noon UTC → Manila same day):
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-16T12:00:00Z') },
      { createdAt: new Date('2026-06-17T12:00:00Z') },
      { createdAt: new Date('2026-06-18T12:00:00Z') }, // recovered
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 2, longestStreak: 2 });
    prisma.xpTransaction.findMany.mockResolvedValue([]); // none awarded yet

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });

    expect(res.after.currentStreak).toBe(3);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ currentStreak: 3, longestStreak: 3, lastStreakDate: '2026-06-18' }),
    }));
    expect(res.xpAwards).toEqual([{ date: '2026-06-18', event: 'STREAK_DAY', delta: 1 }]);
    expect(xp.awardXp).toHaveBeenCalledWith('u1', 'FREE', XpEvent.STREAK_DAY, {
      date: '2026-06-18', source: 'chat-recovery',
    });
  });

  it('does not award XP for a recovered date already credited', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-18T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 0, longestStreak: 0 });
    prisma.xpTransaction.findMany.mockResolvedValue([
      { event: XpEvent.STREAK_DAY, meta: { date: '2026-06-18' } },
    ]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });
    expect(res.xpAwards).toEqual([]);
    expect(xp.awardXp).not.toHaveBeenCalled();
  });

  it('writes nothing in dry-run but reports the planned changes', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-18T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 0, longestStreak: 0 });
    prisma.xpTransaction.findMany.mockResolvedValue([]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: false,
    });
    expect(res.after.currentStreak).toBe(1);
    expect(res.xpAwards).toEqual([{ date: '2026-06-18', event: 'STREAK_DAY', delta: 1 }]);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(xp.awardXp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/chat-recovery.service.spec.ts -t "restoreUserStreakAndXp"`
Expected: FAIL — method not defined.

- [ ] **Step 3: Implement**

Add imports at the top of `chat-recovery.service.ts`:

```ts
import { XpEvent } from '@prisma/client';
import { computeStreakFromActiveDays } from '../../streaks/streaks.recompute';
import { bucketLocalDays } from '../../streaks/streaks.calendar';
import { XP_BASE, XP_MULTIPLIER, STREAK_MILESTONES } from '../../gamification/xp.constants';
```

Add the result interface near `ReconstructedTransaction`:

```ts
export interface StreakRestoreResult {
  before: { currentStreak: number; longestStreak: number };
  after: { currentStreak: number; longestStreak: number };
  xpAwards: Array<{ date: string; event: 'STREAK_DAY' | 'STREAK_MILESTONE'; delta: number }>;
}
```

Add the method to the class:

```ts
  async restoreUserStreakAndXp(input: {
    userId: string;
    tier: SubscriptionTier;
    timezone: string;
    recoveredDates: string[];
    commit: boolean;
  }): Promise<StreakRestoreResult> {
    const tz = input.timezone || 'UTC';

    const txns = await this.prisma.transaction.findMany({
      where: { loggedByUserId: input.userId },
      select: { createdAt: true },
    });
    const activeDays = bucketLocalDays(txns.map((t) => t.createdAt), tz);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { currentStreak: true, longestStreak: true },
    });
    const before = {
      currentStreak: user?.currentStreak ?? 0,
      longestStreak: user?.longestStreak ?? 0,
    };

    const recomputed = computeStreakFromActiveDays(activeDays);
    const after = {
      currentStreak: recomputed.currentStreak,
      longestStreak: recomputed.longestStreak,
    };

    if (input.commit) {
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          currentStreak: recomputed.currentStreak,
          longestStreak: recomputed.longestStreak,
          lastStreakDate: recomputed.lastStreakDate,
        },
      });
    }

    // Which dates already have STREAK_DAY / STREAK_MILESTONE XP.
    const existing = await this.prisma.xpTransaction.findMany({
      where: { userId: input.userId, event: { in: [XpEvent.STREAK_DAY, XpEvent.STREAK_MILESTONE] } },
      select: { event: true, meta: true },
    });
    const credited = new Set<string>();
    for (const row of existing) {
      const date = (row.meta as { date?: string } | null)?.date;
      if (date) credited.add(`${row.event}:${date}`);
    }

    // Streak length at each active day, so we can tell whether a recovered date
    // is a milestone day in the corrected timeline.
    const activeSet = new Set(activeDays);
    const streakLenAt = (date: string): number => {
      let len = 1;
      let cursor = date;
      while (activeSet.has(previousLocalDate(cursor))) {
        len += 1;
        cursor = previousLocalDate(cursor);
      }
      return len;
    };

    const xpAwards: StreakRestoreResult['xpAwards'] = [];
    const mult = XP_MULTIPLIER[input.tier];

    for (const date of [...new Set(input.recoveredDates)].sort()) {
      if (!activeSet.has(date)) continue; // recovered row didn't land on this local day
      const dayKey = `${XpEvent.STREAK_DAY}:${date}`;
      if (!credited.has(dayKey)) {
        const delta = XP_BASE[XpEvent.STREAK_DAY] * mult;
        xpAwards.push({ date, event: 'STREAK_DAY', delta });
        // Reuse the canonical award path (same call the live streak system makes);
        // our credited-set check above is what makes re-runs idempotent.
        if (input.commit) {
          await this.xp.awardXp(input.userId, input.tier, XpEvent.STREAK_DAY, {
            date, source: 'chat-recovery',
          });
        }
        credited.add(dayKey);
      }
      const len = streakLenAt(date);
      const mileKey = `${XpEvent.STREAK_MILESTONE}:${date}`;
      if (STREAK_MILESTONES.has(len) && !credited.has(mileKey)) {
        const delta = XP_BASE[XpEvent.STREAK_MILESTONE] * mult;
        xpAwards.push({ date, event: 'STREAK_MILESTONE', delta });
        if (input.commit) {
          await this.xp.awardXp(input.userId, input.tier, XpEvent.STREAK_MILESTONE, {
            date, source: 'chat-recovery',
          });
        }
        credited.add(mileKey);
      }
    }

    return { before, after, xpAwards };
  }
```

Add the time-helper import at the top of the file (used here and in Task 6):

```ts
import { localDayInfo, previousLocalDate } from '../../reminders/reminders.time';
```

> Note: `bucketLocalDays(dates: Date[], tz: string): string[]` is the existing helper used by `StreaksService.getCalendar`; confirm its exact signature in `src/modules/streaks/streaks.calendar.ts` and adapt the call if it differs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/chat-recovery.service.spec.ts`
Expected: PASS (reconstructTurn + restoreUserStreakAndXp blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/recovery/chat-recovery.service.ts apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts
git commit -m "feat(chat): ChatRecoveryService streak recompute + targeted XP restore"
```

---

### Task 6: `ChatRecoveryService.run` + module wiring (orchestration)

Tie detection → reconstruction → insert → restore into one entry point that returns a report, and wire the service for DI.

**Files:**
- Modify: `apps/api/src/modules/chat/recovery/chat-recovery.service.ts` (add `run`)
- Create: `apps/api/src/modules/chat/recovery/recovery.module.ts`
- Test: `apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts` (add a `run` block)

**Interfaces:**
- Consumes: `detectDroppedTurns` (Task 3), `reconstructTurn` (Task 4), `restoreUserStreakAndXp` (Task 5), `TransactionsService.create` (Task 1 params), `CategoriesService.findByName`, `AccountsService.findByName`.
- Produces:
  ```ts
  export interface RecoveryReport {
    commit: boolean;
    since: string;
    candidates: number;
    inserted: Array<{ userId: string; conversationId: string; userMessageId: string;
      type: string; amountOriginal: string; currencyOriginal: string;
      categoryName: string | null; transactionDate: string; confidence: number; }>;
    needsManual: Array<{ userId: string; conversationId: string; userMessageId: string; userText: string }>;
    skippedAlreadyRecovered: number;
    notLoggingIntent: number;
    streakRestores: Array<{ userId: string } & StreakRestoreResult>;
  }
  async run(opts: { since: string; commit: boolean }): Promise<RecoveryReport>
  ```
- Flow: scan conversations with messages since `opts.since`; for each conversation, load its ordered messages + its workspace/user; `detectDroppedTurns` (passing the set of user-message ids that already have a recovered/normal transaction via `sourceMessageId`); `reconstructTurn` each candidate (null → `notLoggingIntent++`); TRANSFER or `needsManual` → push to `needsManual`, do not insert; otherwise insert via Task 3-style resolution (`findByName` for category w/ `Other` fallback + account) and `transactions.create({ …, transactionDate, createdAt: noonUtc(date), tags:['chat-recovery'], sourceMessageId: userMessageId, skipEngagement: true, status: 'CONFIRMED' })` when `commit`; accumulate recovered dates per user; finally `restoreUserStreakAndXp` per affected user. In dry-run, reconstruct + compute restores but perform no writes.

- [ ] **Step 1: Write the failing test**

Add a `describe('ChatRecoveryService.run')` block. Mock `prisma.conversation.findMany` to return one conversation with `userId`, `workspaceId`, and nested `messages`; mock `prisma.workspace.findUnique`/`prisma.user.findUnique`/`prisma.account.findMany`/`prisma.category.findMany` for context; mock `transactions.create` to resolve `{ transaction: { id: 'tx1' } }`; spy on `reconstructTurn` and `restoreUserStreakAndXp` (or drive them via the llm mock). Assert:

```ts
it('dry-run reconstructs and reports without writing', async () => {
  // …mocks producing one dropped turn that reconstructs to an EXPENSE…
  const report = await service.run({ since: '2026-06-15', commit: false });
  expect(report.commit).toBe(false);
  expect(report.candidates).toBe(1);
  expect(report.inserted).toHaveLength(1);
  expect(transactionsMock.create).not.toHaveBeenCalled();
  expect(report.streakRestores[0].after.currentStreak).toBeGreaterThanOrEqual(1);
});

it('commit inserts the transaction with recovery markers', async () => {
  // …same mocks, commit: true…
  const report = await service.run({ since: '2026-06-15', commit: true });
  expect(transactionsMock.create).toHaveBeenCalledWith(expect.objectContaining({
    skipEngagement: true,
    sourceMessageId: expect.any(String),
    tags: ['chat-recovery'],
  }));
  expect(report.inserted).toHaveLength(1);
});
```

> Keep the orchestration test focused: it's acceptable to spy on `service.reconstructTurn`/`service.restoreUserStreakAndXp` with `jest.spyOn` to isolate `run`'s control flow, since those are covered by Tasks 4–5.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery/chat-recovery.service.spec.ts -t "run"`
Expected: FAIL — `run` not defined.

- [ ] **Step 3: Implement `run`**

Add helper + method to `chat-recovery.service.ts`:

```ts
  /** An instant that falls on `localDate` in the user's timezone for streak/
   *  calendar bucketing. Noon UTC is safe for all timezones within ±12h. */
  private createdAtForDate(localDate: string): Date {
    return new Date(`${localDate}T12:00:00.000Z`);
  }

  private localDateOf(at: Date, timezone: string | null): string {
    try {
      return localDayInfo(at, timezone || 'UTC').date;
    } catch {
      return localDayInfo(at, 'UTC').date;
    }
  }

  async run(opts: { since: string; commit: boolean }): Promise<RecoveryReport> {
    const sinceDate = new Date(`${opts.since}T00:00:00.000Z`);
    const report: RecoveryReport = {
      commit: opts.commit, since: opts.since, candidates: 0,
      inserted: [], needsManual: [], skippedAlreadyRecovered: 0,
      notLoggingIntent: 0, streakRestores: [],
    };

    const conversations = await this.prisma.conversation.findMany({
      where: { messages: { some: { createdAt: { gte: sinceDate } } } },
      select: {
        id: true, userId: true, workspaceId: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, toolName: true, createdTransactionId: true, createdAt: true },
        },
      },
    });

    const recoveredDatesByUser = new Map<string, { tier: SubscriptionTier; timezone: string; dates: Set<string> }>();

    for (const convo of conversations) {
      // Context: workspace tier/baseCurrency, user displayName/timezone, accounts, categories.
      const [workspace, user] = await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: convo.workspaceId },
          select: { tier: true, baseCurrency: true },
        }),
        this.prisma.user.findUnique({
          where: { id: convo.userId },
          select: { displayName: true, timezone: true },
        }),
      ]);
      if (!workspace || !user) continue;

      const [accountRows, categoryRows] = await Promise.all([
        this.prisma.account.findMany({
          where: { workspaceId: convo.workspaceId, isArchived: false },
          select: { name: true, currency: true },
        }),
        this.prisma.category.findMany({
          where: { workspaceId: convo.workspaceId, isArchived: false },
          select: { name: true },
        }),
      ]);

      // Idempotency: user-message ids that already produced a transaction.
      const userMsgIds = convo.messages.filter((m) => m.role === 'USER').map((m) => m.id);
      const existingTx = await this.prisma.transaction.findMany({
        where: { sourceMessageId: { in: userMsgIds } },
        select: { sourceMessageId: true },
      });
      const alreadyRecovered = new Set(
        existingTx.map((t) => t.sourceMessageId).filter((v): v is string => !!v),
      );

      const dropped = detectDroppedTurns(
        convo.messages.map((m) => ({
          id: m.id,
          role: m.role as TranscriptMessage['role'],
          toolName: m.toolName,
          createdTransactionId: m.createdTransactionId,
          createdAt: m.createdAt,
        })),
        { alreadyRecoveredUserMessageIds: alreadyRecovered },
      );
      report.skippedAlreadyRecovered += userMsgIds.filter((id) => alreadyRecovered.has(id)).length;

      for (const turn of dropped) {
        const msg = convo.messages.find((m) => m.id === turn.userMessageId)!;
        report.candidates += 1;
        const messageLocalDate = this.localDateOf(msg.createdAt, user.timezone);
        const recon = await this.reconstructTurn({
          workspace: { id: convo.workspaceId, baseCurrency: workspace.baseCurrency, tier: workspace.tier },
          user: { displayName: user.displayName, timezone: user.timezone },
          accounts: accountRows,
          categories: categoryRows.map((c) => c.name),
          userText: msg.content,
          messageLocalDate,
        });
        if (!recon) { report.notLoggingIntent += 1; continue; }
        if (recon.needsManual) {
          report.needsManual.push({
            userId: convo.userId, conversationId: convo.id,
            userMessageId: turn.userMessageId, userText: msg.content,
          });
          continue;
        }

        if (opts.commit) {
          const category = recon.categoryName
            ? ((await this.categories.findByName(convo.workspaceId, recon.categoryName)) ??
               (await this.categories.findByName(convo.workspaceId, 'Other')))
            : null;
          const account = recon.accountName
            ? await this.accounts.findByName(convo.workspaceId, recon.accountName)
            : null;
          await this.transactions.create({
            workspaceId: convo.workspaceId,
            loggedByUserId: convo.userId,
            baseCurrency: workspace.baseCurrency,
            tier: workspace.tier,
            type: recon.type as 'EXPENSE' | 'INCOME',
            amountOriginal: recon.amountOriginal,
            currencyOriginal: recon.currencyOriginal,
            transactionDate: recon.transactionDate,
            categoryId: category?.id ?? null,
            accountId: account?.id ?? null,
            merchant: recon.merchant,
            aiConfidence: recon.confidence,
            sourceMessageId: turn.userMessageId,
            tags: ['chat-recovery'],
            createdAt: this.createdAtForDate(recon.transactionDate),
            skipEngagement: true,
            status: 'CONFIRMED',
          });
        }

        report.inserted.push({
          userId: convo.userId, conversationId: convo.id, userMessageId: turn.userMessageId,
          type: recon.type, amountOriginal: recon.amountOriginal, currencyOriginal: recon.currencyOriginal,
          categoryName: recon.categoryName, transactionDate: recon.transactionDate, confidence: recon.confidence,
        });

        const bucket = recoveredDatesByUser.get(convo.userId) ?? {
          tier: workspace.tier, timezone: user.timezone, dates: new Set<string>(),
        };
        bucket.dates.add(recon.transactionDate);
        recoveredDatesByUser.set(convo.userId, bucket);
      }
    }

    for (const [userId, info] of recoveredDatesByUser) {
      const restore = await this.restoreUserStreakAndXp({
        userId, tier: info.tier, timezone: info.timezone,
        recoveredDates: [...info.dates], commit: opts.commit,
      });
      report.streakRestores.push({ userId, ...restore });
    }

    return report;
  }
```

Add the `RecoveryReport` interface (near the others) and import `TranscriptMessage` + `detectDroppedTurns`:

```ts
import { detectDroppedTurns, type TranscriptMessage } from './dropped-turn-detector';
```

> Verify field names against `schema.prisma`: `Conversation.userId`/`workspaceId`, `Account.isArchived`, `Category.isArchived`, `Workspace.tier`/`baseCurrency`. Adjust selects if a name differs.

- [ ] **Step 4: Create the module**

Create `apps/api/src/modules/chat/recovery/recovery.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { TransactionsModule } from '../../transactions/transactions.module';
import { CategoriesModule } from '../../categories/categories.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { StreaksModule } from '../../streaks/streaks.module';
import { GamificationModule } from '../../gamification/gamification.module';
import { ChatRecoveryService } from './chat-recovery.service';

@Module({
  imports: [
    PrismaModule, LlmModule, TransactionsModule, CategoriesModule,
    AccountsModule, StreaksModule, GamificationModule,
  ],
  providers: [ChatRecoveryService],
  exports: [ChatRecoveryService],
})
export class RecoveryModule {}
```

> Confirm each imported module **exports** the service this depends on (`LlmService`, `TransactionsService`, `CategoriesService`, `AccountsService`, `StreaksService`, `XpService`). If `GamificationModule` doesn't export `XpService`, add it to that module's `exports`, or import whichever module does. If any import path/name differs, fix it — the build will tell you.

- [ ] **Step 5: Run tests + build**

Run: `cd apps/api && pnpm jest src/modules/chat/recovery && pnpm build`
Expected: PASS + clean build (build proves the module wiring + imports resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/chat/recovery/chat-recovery.service.ts apps/api/src/modules/chat/recovery/chat-recovery.service.spec.ts apps/api/src/modules/chat/recovery/recovery.module.ts
git commit -m "feat(chat): ChatRecoveryService.run orchestration + RecoveryModule"
```

---

### Task 7: CLI script `prisma/recover-dropped-chat-transactions.ts`

Thin wrapper: bootstrap Nest, resolve `ChatRecoveryService`, run dry-run by default, print the report.

**Files:**
- Create: `apps/api/prisma/recover-dropped-chat-transactions.ts`

**Interfaces:**
- Consumes: `ChatRecoveryService.run({ since, commit })` → `RecoveryReport`.

- [ ] **Step 1: Implement the script**

Create `apps/api/prisma/recover-dropped-chat-transactions.ts`:

```ts
/**
 * One-off recovery: reconstruct chat transactions that were never saved (the LLM
 * said "Logged!" without calling the tool), insert them dated to the original
 * day, and restore each affected user's streak + the STREAK_DAY/MILESTONE XP for
 * those dates. See docs/superpowers/specs/2026-06-21-recover-dropped-chat-transactions-design.md.
 *
 * Safety: DRY-RUN by default — prints what it would do and writes nothing. Pass
 * --commit (or COMMIT=1) to write. Idempotent: recovered rows carry
 * sourceMessageId + a 'chat-recovery' tag; XP keys on meta.date.
 *
 * Reconstruction replays the original message through the LLM, so the run needs
 * ANTHROPIC_API_KEY in the environment in addition to the DB URL.
 *
 * Run (preview, last 7 days):
 *   DATABASE_URL="$DIRECT_DATABASE_URL" ANTHROPIC_API_KEY=… pnpm --filter finby-api exec \
 *     ts-node --project tsconfig.seed.json prisma/recover-dropped-chat-transactions.ts
 * Run (commit):  …same… prisma/recover-dropped-chat-transactions.ts --commit
 * Override window:  …same… --since=2026-06-14
 *
 * Note: connect via the DIRECT (non-pooled) URL by exporting it as DATABASE_URL
 * for the run, since the Nest PrismaService reads DATABASE_URL.
 */
import { NestFactory } from '@nestjs/core';
import { RecoveryModule } from '../src/modules/chat/recovery/recovery.module';
import { ChatRecoveryService } from '../src/modules/chat/recovery/chat-recovery.service';

const COMMIT = process.argv.includes('--commit') || process.env.COMMIT === '1';

function resolveSince(): string {
  const arg = process.argv.find((a) => a.startsWith('--since='));
  if (arg) return arg.slice('--since='.length);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const since = resolveSince();
  console.log(`[recover] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} since=${since}`);

  const app = await NestFactory.createApplicationContext(RecoveryModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(ChatRecoveryService);
    const report = await service.run({ since, commit: COMMIT });

    console.log(`[recover] candidates=${report.candidates} ` +
      `reconstructed=${report.inserted.length} needsManual=${report.needsManual.length} ` +
      `notLoggingIntent=${report.notLoggingIntent} skippedAlreadyRecovered=${report.skippedAlreadyRecovered}`);

    for (const i of report.inserted) {
      console.log(`[recover] ${COMMIT ? 'inserted' : 'would insert'} user=${i.userId} ` +
        `${i.type} ${i.amountOriginal} ${i.currencyOriginal} ` +
        `cat=${i.categoryName ?? '-'} date=${i.transactionDate} conf=${i.confidence} ` +
        `(msg=${i.userMessageId})`);
    }
    for (const m of report.needsManual) {
      console.log(`[recover] NEEDS MANUAL (transfer) user=${m.userId} msg=${m.userMessageId}: "${m.userText}"`);
    }
    for (const s of report.streakRestores) {
      console.log(`[recover] user=${s.userId} streak ${s.before.currentStreak}→${s.after.currentStreak} ` +
        `(longest ${s.before.longestStreak}→${s.after.longestStreak}); ` +
        `xp: ${s.xpAwards.map((x) => `${x.event} ${x.date} +${x.delta}`).join(', ') || 'none'}`);
    }
    if (!COMMIT) console.log('[recover] DRY-RUN — nothing was written. Re-run with --commit to apply.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[recover] FAILED:', err);
  process.exitCode = 1;
});
```

> If `createApplicationContext(RecoveryModule)` fails to resolve a transitive provider, fall back to bootstrapping the full app module: `import { AppModule } from '../src/app.module'` and `createApplicationContext(AppModule, …)`. AppModule loads everything (incl. schedulers) but the process is short-lived and the recovery writes are idempotent.

- [ ] **Step 2: Type-check the script compiles**

Run: `cd apps/api && npx tsc --noEmit --project tsconfig.seed.json` (or the project that includes `prisma/`).
Expected: no errors. (If `tsconfig.seed.json` doesn't include `prisma/`, mirror how `backfill-daily-login-xp.ts` is type-checked — it runs under the same `--project tsconfig.seed.json`.)

- [ ] **Step 3: Lint the script**

Run: `cd apps/api && npx eslint prisma/recover-dropped-chat-transactions.ts`
Expected: clean (exit 0).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/recover-dropped-chat-transactions.ts
git commit -m "feat(chat): CLI to recover dropped chat transactions (dry-run default)"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run the whole API suite, lint, build**

Run:
```bash
cd apps/api && pnpm jest && pnpm build && \
  npx eslint src/modules/chat/recovery src/modules/streaks/streaks.recompute.ts \
             src/modules/transactions/transactions.service.ts prisma/recover-dropped-chat-transactions.ts
```
Expected: all tests pass, build clean, lint clean.

- [ ] **Step 2: Dry-run rehearsal (operator, against prod via Render shell)**

This is a manual gate, not code. In the Render shell:
```bash
DATABASE_URL="$DIRECT_DATABASE_URL" pnpm --filter finby-api exec \
  ts-node --project tsconfig.seed.json prisma/recover-dropped-chat-transactions.ts
```
Review the printed candidates, reconstructed transactions, `NEEDS MANUAL` transfers, and per-user streak/XP deltas. Only when the report looks right, re-run with `--commit`.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git add -A apps/api
git commit -m "chore(chat): recovery script verification cleanup" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Scope:** EXPENSE and INCOME are auto-reconstructed and inserted. TRANSFER candidates are detected and surfaced under `needsManual` for manual handling (two-account reconstruction is higher-risk and rare) — this is a deliberate v1 boundary, documented in the spec.
- **The replay runs in dry-run too** (it must, to show what would be inserted) — so dry-run consumes LLM calls. The window is tight, so this is a handful of calls.
- **createdAt placement** uses noon UTC of the recovered date; correct for all timezones within ±12h (covers the affected users). The dry-run report shows the resulting date for review.
- **Daily-login XP** for recovered dates is almost certainly already covered by the earlier active-users backfill (a chat message existed that day). If the dry-run reveals a gap, run `backfill-daily-login-xp.ts` with `BACKFILL_DATES` set to the affected dates — do not duplicate that logic here.
