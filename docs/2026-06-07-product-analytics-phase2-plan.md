# Product Analytics (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostHog product analytics (client-first) to the Finby web app — pageviews + a typed, PII-safe event catalog for activation, feature-usage, retention, and conversion — plus a small chat-action API tweak so chat-set budgets are trackable.

**Architecture:** A single typed wrapper (`lib/analytics.ts`, the only `posthog-js` importer) with `init/identify/reset/track/capturePageview` and a `sanitizeProps` allow-list backstop; a client `PostHogProvider` (init + pathname pageviews + identify) mounted in the root layout; identify/reset wired into the auth store; events fired at UI moments; and the chat `ChatAction` union extended with `txType` + a `BUDGET_SET` variant. Everything **no-ops when `NEXT_PUBLIC_POSTHOG_KEY` is unset** (prod-only).

**Tech Stack:** `posthog-js`, Next 15 App Router, Zustand, Vitest+jsdom (web), Jest (API), TS strict.

**Spec:** `docs/2026-06-07-product-analytics-phase2-design.md`

**Conventions:**
- Web tests: `pnpm --filter finby-web exec vitest run` (single file: append path). Typecheck: `pnpm --filter finby-web exec tsc --noEmit`.
- API tests: `cd apps/api && pnpm exec jest`. Typecheck: `pnpm --filter finby-api exec tsc --noEmit`.
- After editing `@finby/shared` you must rebuild it — **not needed here** (we don't touch shared).
- Conventional commits, **NO AI-attribution trailers**. Branch already created: `feat/product-analytics-phase2`.
- `NEXT_PUBLIC_POSTHOG_KEY` is unset locally → all analytics no-op; tests mock `posthog-js`.

---

## File Structure

**Web (`apps/web/`)**
- Create `src/lib/analytics.ts` — the typed PostHog wrapper (sole `posthog-js` importer).
- Create `src/lib/analytics.test.ts` — wrapper tests.
- Create `src/components/analytics/posthog-provider.tsx` — init + pageview + identify provider.
- Modify `src/app/layout.tsx` — mount the provider.
- Modify `src/lib/store.ts` — identify on login/register, reset on logout, re-identify on tier change.
- Modify `src/lib/types.ts` — `ChatAction` union (`txType` + `BUDGET_SET`).
- Modify `src/app/(app)/chat/page.tsx` — `chat_message_sent`, `transaction_logged`, `budget_set`.
- Modify `src/components/chat/action-card.tsx` — narrow the action union; render `BUDGET_SET`.
- Modify `src/components/onboarding/onboarding-carousel.tsx` — onboarding events.
- Modify `src/components/billing/UpgradeModal.tsx` — `upgrade_modal_viewed` + `checkout_started` + `source` prop.
- Modify `src/components/billing/UpgradeGate.tsx` — pass `source="upgrade_gate"`.
- Modify `src/app/(app)/billing/success/page.tsx` — `subscription_activated`.

**API (`apps/api/`)**
- Modify `src/modules/chat/chat.types.ts` — `ChatAction` union (`txType` + `BUDGET_SET`).
- Modify `src/modules/chat/chat.service.ts` — set `txType`; emit `BUDGET_SET` from `execSetBudget`.
- Modify `src/modules/chat/chat.service.spec.ts` — assert `txType` + `BUDGET_SET`.

---

## Task 1: Install posthog-js

**Files:** `apps/web/package.json`

- [ ] **Step 1: Install**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-web add posthog-js
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add posthog-js"
```

---

## Task 2: Extend the ChatAction union (API + web types)

**Files:**
- Modify `apps/api/src/modules/chat/chat.types.ts`
- Modify `apps/web/src/lib/types.ts`

- [ ] **Step 1: Update the API type**

In `apps/api/src/modules/chat/chat.types.ts`, replace the `ChatAction` interface (lines ~8-12) with:
```ts
export interface TransactionCreatedAction {
  type: 'TRANSACTION_CREATED';
  transactionId: string;
  txType: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  preview: ChatActionPreview;
}

export interface BudgetSetAction {
  type: 'BUDGET_SET';
  preview: { currency: string; amount?: string; category?: string | null };
}

export type ChatAction = TransactionCreatedAction | BudgetSetAction;
```
(Keep the existing `ChatActionPreview` interface above it unchanged.)

- [ ] **Step 2: Mirror the web type**

In `apps/web/src/lib/types.ts`, replace the `ChatAction` interface (lines ~60-64) with the identical union:
```ts
export interface TransactionCreatedAction {
  type: 'TRANSACTION_CREATED';
  transactionId: string;
  txType: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  preview: ChatActionPreview;
}

export interface BudgetSetAction {
  type: 'BUDGET_SET';
  preview: { currency: string; amount?: string; category?: string | null };
}

export type ChatAction = TransactionCreatedAction | BudgetSetAction;
```

- [ ] **Step 3: Typecheck both (expect failures to fix next)**

Run: `pnpm --filter finby-api exec tsc --noEmit; pnpm --filter finby-web exec tsc --noEmit`
Expected: TS errors where actions are built (missing `txType`) and where `action.preview` is accessed without narrowing — these are fixed in Tasks 3 and 7. If there are NO errors, that's fine too (means consumers already narrow). Do not commit yet — commit happens after Task 3 (API) compiles. For the web side, its errors are resolved in Task 7; if web `tsc` blocks, proceed to those tasks before the web commit. Commit the **API + web type files** now since they are pure type changes:

```bash
git add apps/api/src/modules/chat/chat.types.ts apps/web/src/lib/types.ts
git commit -m "feat(chat): ChatAction union — add txType + BUDGET_SET variant"
```

---

## Task 3: Emit txType + BUDGET_SET from the chat service

**Files:**
- Modify `apps/api/src/modules/chat/chat.service.ts`
- Modify `apps/api/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/modules/chat/chat.service.spec.ts`, add `txType` assertions to the existing `log_expense ... returns an action` test (after the `result.action?.transactionId` assertion at ~line 97):
```ts
    expect(result.action?.type).toBe('TRANSACTION_CREATED');
    if (result.action?.type === 'TRANSACTION_CREATED') {
      expect(result.action.txType).toBe('EXPENSE');
    }
```
And add a new test in the `describe('ChatService.executeTool', ...)` block:
```ts
  it('set_budget returns a BUDGET_SET action carrying only the currency', async () => {
    const { service, budgets, categories } = build();
    categories.findByName.mockResolvedValue({ id: 'c1', name: 'Groceries' });
    budgets.createOrUpdate.mockResolvedValue({
      category: { name: 'Groceries' },
      amountLimit: '300',
      currency: 'USD',
      period: 'MONTHLY',
      amountSpent: '0',
      utilizationPercent: 0,
    });

    const result = await service.executeTool(
      workspace,
      'u1',
      call('set_budget', { categoryName: 'Groceries', amountLimit: '300' }),
    );

    expect(result.action?.type).toBe('BUDGET_SET');
    if (result.action?.type === 'BUDGET_SET') {
      expect(result.action.preview.currency).toBe('USD');
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest chat.service.spec`
Expected: FAIL — `txType` undefined and `set_budget` returns no `action`.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/chat/chat.service.ts`:

(a) The `execLog` action (~line 384) — add `txType: type` (the `type` param is `'EXPENSE' | 'INCOME'`):
```ts
      const action: ChatAction = {
        type: 'TRANSACTION_CREATED',
        transactionId: tx.id,
        txType: type,
        preview: {
          amount: tx.amountOriginal,
          currency: tx.currencyOriginal,
          merchant: tx.merchant,
          category: tx.category?.name ?? null,
        },
      };
```

(b) The `execTransfer` action (~line 475) — add `txType: 'TRANSFER'`:
```ts
      const action: ChatAction = {
        type: 'TRANSACTION_CREATED',
        transactionId: tx.id,
        txType: 'TRANSFER',
        preview: { amount: tx.amountOriginal, currency: tx.currencyOriginal, merchant: null, category: null },
      };
```

(c) In `execSetBudget` (~line 496), build and return a `BUDGET_SET` action on success. Replace the success `return { toolResult: ... }` with:
```ts
      const action: ChatAction = {
        type: 'BUDGET_SET',
        preview: {
          currency: budget.currency,
          amount: budget.amountLimit,
          category: budget.category.name,
        },
      };
      return {
        toolResult: JSON.stringify({
          status: 'budget_set',
          category: budget.category.name,
          amountLimit: budget.amountLimit,
          currency: budget.currency,
          period: budget.period,
          alreadySpent: budget.amountSpent,
          utilizationPercent: budget.utilizationPercent,
        }),
        action,
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest chat.service.spec && pnpm --filter finby-api exec tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat.service.ts apps/api/src/modules/chat/chat.service.spec.ts
git commit -m "feat(api): set txType on tx actions + emit BUDGET_SET from set_budget"
```

---

## Task 4: The typed analytics wrapper

**Files:**
- Create `apps/web/src/lib/analytics.ts`
- Test `apps/web/src/lib/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-js before importing the module under test.
const mockPosthog = {
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
};
vi.mock('posthog-js', () => ({ default: mockPosthog }));

import { sanitizeProps, track, identifyUser, resetAnalytics } from './analytics';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sanitizeProps', () => {
  it('drops financial/PII keys (case-insensitive), keeps the rest', () => {
    const out = sanitizeProps({ amount: '5', Balance: '9', merchant: 'KFC', tier: 'PRO', currency: 'USD' });
    expect(out).toEqual({ tier: 'PRO', currency: 'USD' });
  });
  it('returns {} for undefined', () => {
    expect(sanitizeProps()).toEqual({});
  });
});

describe('analytics no-op without a key', () => {
  it('track/identify/reset do nothing when NEXT_PUBLIC_POSTHOG_KEY is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    track('chat_message_sent');
    identifyUser('u1', 'PRO');
    resetAnalytics();
    expect(mockPosthog.capture).not.toHaveBeenCalled();
    expect(mockPosthog.identify).not.toHaveBeenCalled();
    expect(mockPosthog.reset).not.toHaveBeenCalled();
  });
});

describe('analytics active with a key', () => {
  it('track sanitizes props; identify sends only { tier }', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    track('transaction_logged', { tx_type: 'EXPENSE', currency: 'USD', amount: '5' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('transaction_logged', { tx_type: 'EXPENSE', currency: 'USD' });

    identifyUser('user-1', 'PRO');
    expect(mockPosthog.identify).toHaveBeenCalledWith('user-1', { tier: 'PRO' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-web exec vitest run src/lib/analytics.test.ts`
Expected: FAIL — cannot resolve `./analytics`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/analytics.ts`:
```ts
import posthog from 'posthog-js';
import type { SubscriptionTier } from './types';
import { DENY_KEYS } from './observability/scrub';

/** Allow-listed event names — `track` accepts nothing else (compile-time + catalog). */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'signed_up'
  | 'chat_message_sent'
  | 'transaction_logged'
  | 'budget_set'
  | 'upgrade_modal_viewed'
  | 'checkout_started'
  | 'subscription_activated';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

let initialized = false;

/** Analytics is prod-only: active only in the browser with a key configured. */
function enabled(): boolean {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

/** Drop any property whose key matches the financial/PII deny-list. Total — never throws. */
export function sanitizeProps(props?: AnalyticsProps): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (DENY_KEYS.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function initAnalytics(): void {
  if (initialized || !enabled()) return;
  try {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      autocapture: false, // never capture typed/on-screen values (finance app)
      capture_pageview: false, // we fire pageviews manually on route change
      disable_session_recording: true,
      person_profiles: 'identified_only',
    });
    initialized = true;
  } catch {
    /* analytics must never break the app */
  }
}

export function identifyUser(userId: string, tier: SubscriptionTier): void {
  if (!enabled()) return;
  try {
    posthog.identify(userId, { tier });
  } catch {
    /* ignore */
  }
}

export function resetAnalytics(): void {
  if (!enabled()) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!enabled()) return;
  try {
    posthog.capture(event, sanitizeProps(props));
  } catch {
    /* ignore */
  }
}

export function capturePageview(path: string): void {
  if (!enabled()) return;
  try {
    posthog.capture('$pageview', { $current_url: path });
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-web exec vitest run src/lib/analytics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analytics.ts apps/web/src/lib/analytics.test.ts
git commit -m "feat(web): typed PII-safe posthog analytics wrapper"
```

---

## Task 5: PostHogProvider + mount in layout

**Files:**
- Create `apps/web/src/components/analytics/posthog-provider.tsx`
- Modify `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Create the provider**

`apps/web/src/components/analytics/posthog-provider.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, capturePageview, identifyUser } from '@/lib/analytics';
import { useAuth } from '@/lib/store';

/**
 * Initialises PostHog once, identifies the signed-in (or rehydrated) user, and
 * fires a $pageview on every App-Router navigation. No-ops when no key is set.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const userId = useAuth((s) => s.user?.id);
  const tier = useAuth((s) => s.workspace?.tier);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (userId && tier) identifyUser(userId, tier);
  }, [userId, tier]);

  useEffect(() => {
    if (pathname) capturePageview(pathname);
  }, [pathname]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Mount it in the root layout**

In `apps/web/src/app/layout.tsx`, import the provider and wrap `{children}`:
```tsx
import { PostHogProvider } from '@/components/analytics/posthog-provider';
```
Change the body to:
```tsx
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/analytics/posthog-provider.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): posthog provider — init, identify, pageviews"
```

---

## Task 6: Identify/reset in the auth store

**Files:** Modify `apps/web/src/lib/store.ts`

- [ ] **Step 1: Import the analytics helpers**

At the top of `apps/web/src/lib/store.ts`, after the existing imports, add:
```ts
import { identifyUser, resetAnalytics } from './analytics';
```

- [ ] **Step 2: Identify on register**

In `register`, after the `set({ ... status: 'authed' })` call, add:
```ts
        identifyUser(result.user.id, result.workspace.tier);
```

- [ ] **Step 3: Identify on login**

In `login`, after its `set({ ... status: 'authed' })` call, add:
```ts
        identifyUser(result.user.id, result.workspace.tier);
```

- [ ] **Step 4: Reset on logout**

In `logout`, after `set({ ...CLEARED });`, add:
```ts
        resetAnalytics();
```

- [ ] **Step 5: Re-identify on tier change**

In `setWorkspaceTier`, replace the body with:
```ts
      setWorkspaceTier: (tier) => {
        const { workspace, user } = get();
        if (workspace) set({ workspace: { ...workspace, tier } });
        if (user) identifyUser(user.id, tier);
      },
```

- [ ] **Step 6: Typecheck + full web suite (no regressions)**

Run: `pnpm --filter finby-web exec tsc --noEmit && pnpm --filter finby-web exec vitest run`
Expected: tsc exit 0; all tests green (posthog-js is mocked only in analytics.test.ts; in other tests analytics no-ops because no key — store tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/store.ts
git commit -m "feat(web): identify/reset analytics from the auth store"
```

---

## Task 7: Chat events + action-card narrowing

**Files:**
- Modify `apps/web/src/app/(app)/chat/page.tsx`
- Modify `apps/web/src/components/chat/action-card.tsx`

- [ ] **Step 1: Narrow the action union in action-card**

Read `apps/web/src/components/chat/action-card.tsx` first. It currently assumes a `TRANSACTION_CREATED` action and reads `action.preview.*`. Make it handle the union: render the existing transaction card only when `action.type === 'TRANSACTION_CREATED'`, and render a minimal budget card for `BUDGET_SET`. Wrap the existing return in a guard and add the budget branch. Concretely, at the top of the component body add:
```tsx
  if (action.type === 'BUDGET_SET') {
    return (
      <div className="rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-muted">
        Budget set{action.preview.category ? ` for ${action.preview.category}` : ''}.
      </div>
    );
  }
```
(Everything below it then operates on the narrowed `TRANSACTION_CREATED` action — `action.preview.amount` etc. now typecheck because the `BUDGET_SET` case returned early.)

- [ ] **Step 2: Fire chat + action events in the chat page**

In `apps/web/src/app/(app)/chat/page.tsx`, import the tracker:
```ts
import { track } from '@/lib/analytics';
```
In `handleSend`, after `setSending(true);` (before the `try`), add:
```ts
    track('chat_message_sent');
```
Inside the `try`, after `setMessages((m) => [...])` that appends the result, add:
```ts
      for (const a of result.actions) {
        if (a.type === 'TRANSACTION_CREATED') {
          track('transaction_logged', { tx_type: a.txType, currency: a.preview.currency });
        } else if (a.type === 'BUDGET_SET') {
          track('budget_set', { currency: a.preview.currency });
        }
      }
```

- [ ] **Step 3: Typecheck + chat-related tests**

Run: `pnpm --filter finby-web exec tsc --noEmit && pnpm --filter finby-web exec vitest run`
Expected: tsc exit 0; all green.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/chat/page.tsx" apps/web/src/components/chat/action-card.tsx
git commit -m "feat(web): track chat_message_sent, transaction_logged, budget_set"
```

---

## Task 8: Onboarding events

**Files:** Modify `apps/web/src/components/onboarding/onboarding-carousel.tsx`

- [ ] **Step 1: Import the tracker**

Add to the imports:
```ts
import { track } from '@/lib/analytics';
```

- [ ] **Step 2: Fire `onboarding_started` on mount**

Add a `useEffect` after the existing hooks (e.g. after the keydown effect ~line 60):
```ts
  useEffect(() => {
    track('onboarding_started');
  }, []);
```

- [ ] **Step 3: `onboarding_completed` on "Get started"**

In `next` (~lines 46-49), fire completion before finishing on the last slide:
```ts
  const next = useCallback(() => {
    if (last) {
      track('onboarding_completed');
      finish('/login');
    } else setIndex((i) => i + 1);
  }, [last, finish]);
```

- [ ] **Step 4: `onboarding_skipped` on the Skip button**

In the Skip button `onClick` (~line 68), change to:
```tsx
          onClick={() => {
            track('onboarding_skipped');
            finish('/login');
          }}
```

- [ ] **Step 5: Typecheck + suite**

Run: `pnpm --filter finby-web exec tsc --noEmit && pnpm --filter finby-web exec vitest run`
Expected: tsc 0; all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/onboarding/onboarding-carousel.tsx
git commit -m "feat(web): track onboarding started/completed/skipped"
```

---

## Task 9: Conversion events (upgrade modal, checkout, activation)

**Files:**
- Modify `apps/web/src/components/billing/UpgradeModal.tsx`
- Modify `apps/web/src/components/billing/UpgradeGate.tsx`
- Modify `apps/web/src/app/(app)/billing/success/page.tsx`

- [ ] **Step 1: UpgradeModal — `source` prop + events**

In `apps/web/src/components/billing/UpgradeModal.tsx`:

Import the tracker:
```ts
import { track } from '@/lib/analytics';
```
Add `source` to the props interface and signature:
```ts
export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  initialTier?: UpgradeTier;
  source?: string;
}

export function UpgradeModal({ open, onClose, initialTier = 'PRO', source = 'unknown' }: UpgradeModalProps) {
```
Fire `upgrade_modal_viewed` when the modal opens — inside the existing `useEffect(() => { if (!open) return; ... }, [open, initialTier])` (the one that loads plans, ~line 46), add right after `if (!open) return;`:
```ts
    track('upgrade_modal_viewed', { source });
```
And add `source` to that effect's dependency array: `}, [open, initialTier, source]);`
Fire `checkout_started` in `handleUpgrade`, right before `const result = await startCheckout(...)`:
```ts
      track('checkout_started', { target_tier: selectedTier });
```

- [ ] **Step 2: UpgradeGate — pass the source**

In `apps/web/src/components/billing/UpgradeGate.tsx`, pass `source` to the modal (~line 54):
```tsx
      <UpgradeModal open={open} onClose={() => setOpen(false)} initialTier={requiredTier} source="upgrade_gate" />
```

- [ ] **Step 3: billing/success — `subscription_activated`**

In `apps/web/src/app/(app)/billing/success/page.tsx`, import the tracker:
```ts
import { track } from '@/lib/analytics';
```
In the `poll` function, inside `if (sub.tier !== 'FREE') { ... }` (~line 46), after `setWorkspaceTier(sub.tier);` add:
```ts
          track('subscription_activated', { tier: sub.tier });
```

- [ ] **Step 4: Typecheck + suite**

Run: `pnpm --filter finby-web exec tsc --noEmit && pnpm --filter finby-web exec vitest run`
Expected: tsc 0; all green (existing UpgradeModal.test.tsx still passes — `source` is optional with a default; analytics no-ops without a key).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/UpgradeModal.tsx apps/web/src/components/billing/UpgradeGate.tsx "apps/web/src/app/(app)/billing/success/page.tsx"
git commit -m "feat(web): track upgrade_modal_viewed, checkout_started, subscription_activated"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: API suite + typecheck**

Run:
```bash
cd /home/unicorn/Documents/finby/apps/api && pnpm exec jest && pnpm exec tsc --noEmit
```
Expected: all green (≈224 tests); tsc 0.

- [ ] **Step 2: Web suite + typecheck**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-web exec vitest run && pnpm --filter finby-web exec tsc --noEmit
```
Expected: all green (≈97 tests: 92 + 5 analytics); tsc 0.

- [ ] **Step 3: Lint changed files**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-web exec eslint src/lib/analytics.ts src/components/analytics src/lib/store.ts "src/app/(app)/chat/page.tsx" src/components/chat/action-card.tsx src/components/onboarding/onboarding-carousel.tsx src/components/billing/UpgradeModal.tsx src/components/billing/UpgradeGate.tsx
pnpm --filter finby-api exec eslint src/modules/chat/chat.service.ts src/modules/chat/chat.types.ts
```
Expected: exit 0.

- [ ] **Step 4: Web production build smoke** (only if `next dev` is NOT running — shared `.next`)

Run: `pnpm --filter finby-web build`
Expected: build succeeds.

---

## Deployment & external setup (post-merge, user actions)

Not code tasks — do after merge so prod activates analytics:
1. Create a PostHog Cloud (**US**) project → copy the **project API key** (`phc_...`).
2. Set on **Vercel** (`finby-web`): `NEXT_PUBLIC_POSTHOG_KEY=phc_...`, `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`. Redeploy.
3. Verify in PostHog: events arrive, `$pageview` fires on navigation, persons are identified by UUID with a `tier` property and **no email/financial fields**.
4. Build dashboards: activation funnel (`onboarding_started`→`signed_up`→`chat_message_sent`→`transaction_logged`→`budget_set`), upgrade funnel (`upgrade_modal_viewed`→`checkout_started`→`subscription_activated`), feature-usage (pageviews), retention.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3 wrapper → T4; provider/pageviews/identify → T5; store identify/reset → T6; §4 event catalog → T6 (identify), T7 (chat/transaction/budget), T8 (onboarding), T9 (conversion), T5 ($pageview); §6 ChatAction tweaks (txType + BUDGET_SET) → T2/T3; §7 config + sanitizeProps deny-list → T4; §8 env → T4 + deployment; §10 testing → tests in T3/T4 + verification T10. All covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; the Task 2 "errors fixed later" note points to concrete later tasks (3 + 7), not a placeholder.
- **Type consistency:** `ChatAction` union (`TransactionCreatedAction` with `txType`, `BudgetSetAction`) identical in API + web (T2); `track(event, props)` + `sanitizeProps` + `AnalyticsEvent` names match across the wrapper (T4) and all call sites (T6-T9); `identifyUser(userId, tier)`/`resetAnalytics()`/`capturePageview(path)` signatures consistent provider↔store↔wrapper; `DENY_KEYS` reused from the Phase-1 `lib/observability/scrub.ts`.
