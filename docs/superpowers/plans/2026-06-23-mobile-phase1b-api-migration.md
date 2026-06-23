# Mobile Phase 1b — API-Module + Domain-Type Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Finby's data layer mobile-ready by moving the portable `*-api.ts` modules and the domain DTOs out of `apps/web` into shared packages (`@finby/core` / `@finby/shared`), as dependency-injected factories — with zero web behavior change and the web app green throughout.

**Architecture:** Each portable `apps/web/src/lib/<name>-api.ts` becomes a `createXxxApi(deps)` factory in `packages/core/src/api/<name>-api.ts` that takes its transport via injected callbacks (`AuthedFetch` / `AuthedStream` / `ApiFetch`, and where needed `apiBase`) instead of reaching into the web Zustand store. The web module at the original path becomes a thin shim: it binds the factory to `useAuth.getState()` and re-exports the same named functions, so the existing ~consumer import sites and tests are untouched. Domain DTOs move to `@finby/shared`; `apps/web/src/lib/types.ts` becomes a re-export shim.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Turbo, Vitest. Builds on Phase 1's `@finby/core` kernel (`createHttpClient`, `createAuthedClient`, `parseSseFrames`, formatters).

## Global Constraints

- Node `>=20`; pnpm `10.28.1`.
- Commit messages: NO AI-attribution trailers, NO "Generated with" boilerplate. One logical change per commit (atomic).
- TypeScript strict + `noUncheckedIndexedAccess`.
- `@finby/core` must NEVER import `localStorage`, `window`, `document`, `navigator`, `process`, `next/*`, `react`, `react-dom`, `react-native`, or `zustand`. This is enforced by the ESLint guard added in Phase 1 (`no-restricted-globals` / `no-restricted-imports` scoped to `packages/core/src/**`). If a module's logic needs a platform global, that part stays in the web shim.
- Behavior-preserving: every migrated function keeps its exact name, signature, URL path, HTTP method, and request/response handling. Web consumer import sites stay working via the shim's named re-exports.
- Web app must stay green after every task: `pnpm --filter finby-web typecheck` and `pnpm --filter finby-web test` pass. `@finby/core` must be rebuilt before web typecheck/test resolves new exports.
- Fresh-checkout note: this worktree needs `pnpm install` (done at worktree setup) and the `@finby/shared` + `@finby/core` dist built before tests resolve workspace imports. The verify steps below rebuild core; build shared once at the start if needed (`pnpm --filter @finby/shared build`).

## Migration Recipe (orientation — full code is in each task)

For a portable module `apps/web/src/lib/<name>-api.ts`:

1. `git mv apps/web/src/lib/<name>-api.ts packages/core/src/api/<name>-api.ts` (preserve history).
2. In the moved file: delete `import { useAuth } from './store';` and the local `function authed<T>(...)` helper; wrap every exported function as a method of an object returned by `export function createXxxApi(deps): XxxApi { ... }`, where `deps` is the injected transport (`AuthedFetch`, and/or `AuthedStream` / `ApiFetch` / `apiBase`). Change `import type { ... } from './types'` to `from '@finby/shared'`. Module-local input/result interfaces (e.g. `CreateAccountInput`) stay defined in the core file and are re-exported by the shim.
3. Export `createXxxApi` (and any moved interfaces) from `packages/core/src/index.ts`.
4. Recreate `apps/web/src/lib/<name>-api.ts` as a shim: build the dependency closures from `useAuth.getState()` / `api-client`, call the factory once, and `export const { fn1, fn2, ... } = createXxxApi(...)` plus re-export any moved interface types.
5. Add a focused core test in `packages/core/src/api/<name>-api.test.ts` that calls the factory with a mock `authed` and asserts path/method/body/transform. Leave the existing `apps/web/src/lib/<name>-api.test.ts` (if any) in place — it now exercises the shim.
6. Rebuild core, verify web green, commit.

The standard shim closures (used verbatim across tasks):

```ts
import type { AuthedFetch, AuthedStream } from '@finby/core';
import { useAuth } from './store';
const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);
const authedStream: AuthedStream = (p: string, i?: RequestInit) => useAuth.getState().authedStream(p, i);
```

---

### Task 1: Move domain DTOs into `@finby/shared`

**Files:**
- Create: `packages/shared/src/api-types.ts`
- Modify: `packages/shared/src/index.ts`
- Move (git mv): `apps/web/src/lib/types.ts` → `packages/shared/src/api-types.ts` (then web `types.ts` recreated as shim)
- Create: `apps/web/src/lib/types.ts` (re-export shim at original path)

**Interfaces:**
- Consumes: existing `@finby/shared` types (`SupportCategory`, `SupportStatus`, `UserPreferences`).
- Produces (now exported from `@finby/shared`): all DTOs currently in `apps/web/src/lib/types.ts` — `SubscriptionTier`, `SupportTicketView`, `ApiUser`, `ApiWorkspace`, `AuthResult`, `TokenPair`, `RegisterInput`, `ChatMessageView`, `ChatActionPreview`, `TransactionCreatedAction`, `BudgetSetAction`, `ChatAction`, `PendingConfirmation`, `ChatResult`, `ChatStreamHandlers`, `ConversationSummary`, `ConversationListResult`, `CreatedConversation`, `MessagesResult`, `SummaryResult`, `BudgetView`, `AccountView`, `Category`, `Transaction`, `TransactionListResult`, `CreateTransactionInput`, `TransactionPatch`, `TransactionQuery`, `ReceiptLineItem`, `ReceiptExtraction`, `SubscriptionStatus`, `BillingProviderName`, `SubscriptionView`, `BillingPlan`, `StreakStatus`, `StreakCalendar`, `XpEvent`, `AchievementTierName`, `AchievementCategoryName`, `XpSummary`, `XpTransactionView`, `AchievementDefView`, `UnlockedAchievement`, `LockedAchievement`, `AchievementsResult`, `NewAchievement`, `WorkspaceMemberRole`, `WorkspaceMembershipSummary`, `MemberView`, `InviteView`, `InvitePreview`, `AlertView`, `AlertListResult`.

- [ ] **Step 1: Move the types file into shared**

Run:
```bash
git mv apps/web/src/lib/types.ts packages/shared/src/api-types.ts
```

- [ ] **Step 2: Fix the import path inside the moved file**

In `packages/shared/src/api-types.ts`, the first line currently imports from the `@finby/shared` package entry:
```ts
import type { SupportCategory, SupportStatus, UserPreferences } from '@finby/shared';
```
Change it to relative imports (the file now lives *inside* shared — importing the package from itself would be circular). These three names live in two different shared modules: `UserPreferences` is in `packages/shared/src/types.ts`; `SupportCategory` and `SupportStatus` are in `packages/shared/src/constants.ts`:
```ts
import type { UserPreferences } from './types';
import type { SupportCategory, SupportStatus } from './constants';
```

- [ ] **Step 3: Export the DTOs from the shared entry point**

Add to `packages/shared/src/index.ts` (after the existing exports):
```ts
export * from './api-types';
```

- [ ] **Step 4: Recreate the web `types.ts` as a re-export shim**

The `git mv` removed `apps/web/src/lib/types.ts`. Create it again at the same path with only:
```ts
// Domain DTOs now live in @finby/shared (shared by web + mobile). Re-exported
// here so existing `@/lib/types` / `./types` import sites keep working whether
// they import the name as a type or (harmlessly) as a value.
export * from '@finby/shared';
```

- [ ] **Step 5: Build shared and verify web stays green**

Run: `pnpm --filter @finby/shared build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS. (`store.ts`, `dashboard-api.ts`, components, etc. import from `./types`/`@/lib/types`, which now re-export from shared.)

- [ ] **Step 6: Rebuild core and confirm it still builds**

Run: `pnpm --filter @finby/core build`
Expected: PASS (core does not yet depend on these types; this just confirms no breakage).

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/web/src/lib/types.ts
git commit -m "refactor(shared): move domain DTOs into @finby/shared"
```

---

### Task 2: API transport contract + `dashboard-api` exemplar

**Files:**
- Create: `packages/core/src/api/contract.ts`
- Move (git mv): `apps/web/src/lib/dashboard-api.ts` → `packages/core/src/api/dashboard-api.ts`
- Create: `packages/core/src/api/dashboard-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/dashboard-api.ts` (shim at original path)

**Interfaces:**
- Consumes: `@finby/shared` DTOs (`AccountView`, `BudgetView`, `SummaryResult`, `Transaction`).
- Produces (exported from `@finby/core`):
  - `type AuthedFetch = <T>(path: string, init?: RequestInit) => Promise<T>`
  - `type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>`
  - `type AuthedStream = (path: string, init?: RequestInit) => Promise<Response>`
  - `interface SectionState<T> { data: T | null; loading: boolean; error: string | null }`
  - `interface DashboardApi { getSummary(workspaceId, from, to): Promise<SummaryResult>; listBudgets(workspaceId): Promise<BudgetView[]>; listRecentTransactions(workspaceId, limit?): Promise<Transaction[]>; listAccounts(workspaceId): Promise<AccountView[]> }`
  - `function createDashboardApi(authed: AuthedFetch): DashboardApi`

- [ ] **Step 1: Create the transport contract**

`packages/core/src/api/contract.ts`:
```ts
// Injected transport contracts for @finby/core API factories. The web app
// supplies these from its Zustand store / http client; a future mobile app
// supplies its own equivalents. Keeping them injected is what makes the API
// layer platform-agnostic.
export type AuthedFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
export type AuthedStream = (path: string, init?: RequestInit) => Promise<Response>;
```

- [ ] **Step 2: Write the failing dashboard test**

First move the implementation so the test can import it, then write the test. Run:
```bash
git mv apps/web/src/lib/dashboard-api.ts packages/core/src/api/dashboard-api.ts
```
Create `packages/core/src/api/dashboard-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createDashboardApi } from './dashboard-api';

function mockAuthed(payload: unknown) {
  return vi.fn(async (_path: string, _init?: RequestInit) => payload as never);
}

describe('createDashboardApi', () => {
  it('getSummary builds the analytics path with from/to query', async () => {
    const authed = mockAuthed({ totalIncome: '0' });
    const api = createDashboardApi(authed);
    await api.getSummary('ws1', '2026-06-01', '2026-06-23');
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/analytics/summary?from=2026-06-01&to=2026-06-23',
    );
  });

  it('listBudgets unwraps the { budgets } envelope', async () => {
    const authed = mockAuthed({ budgets: [{ id: 'b1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listBudgets('ws1')).resolves.toEqual([{ id: 'b1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/budgets');
  });

  it('listRecentTransactions defaults limit to 10 and unwraps { transactions }', async () => {
    const authed = mockAuthed({ transactions: [{ id: 't1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listRecentTransactions('ws1')).resolves.toEqual([{ id: 't1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions?limit=10');
  });

  it('listAccounts unwraps the { accounts } envelope', async () => {
    const authed = mockAuthed({ accounts: [{ id: 'a1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listAccounts('ws1')).resolves.toEqual([{ id: 'a1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createDashboardApi` is not exported yet (the moved file still has the old free-function shape importing `./store`).

- [ ] **Step 4: Rewrite the moved file as a factory**

Replace `packages/core/src/api/dashboard-api.ts` contents with:
```ts
import type { AccountView, BudgetView, SummaryResult, Transaction } from '@finby/shared';
import type { AuthedFetch } from './contract';

/** Per-section async state so each dashboard section paints independently. */
export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface DashboardApi {
  getSummary(workspaceId: string, from: string, to: string): Promise<SummaryResult>;
  listBudgets(workspaceId: string): Promise<BudgetView[]>;
  listRecentTransactions(workspaceId: string, limit?: number): Promise<Transaction[]>;
  listAccounts(workspaceId: string): Promise<AccountView[]>;
}

/** Dashboard data helpers. Transport (bearer + 401 refresh) is injected. */
export function createDashboardApi(authed: AuthedFetch): DashboardApi {
  return {
    getSummary(workspaceId, from, to) {
      const q = new URLSearchParams({ from, to });
      return authed<SummaryResult>(`/workspaces/${workspaceId}/analytics/summary?${q}`);
    },
    async listBudgets(workspaceId) {
      const res = await authed<{ budgets: BudgetView[] }>(`/workspaces/${workspaceId}/budgets`);
      return res.budgets;
    },
    async listRecentTransactions(workspaceId, limit = 10) {
      const res = await authed<{ transactions: Transaction[] }>(
        `/workspaces/${workspaceId}/transactions?limit=${limit}`,
      );
      return res.transactions;
    },
    async listAccounts(workspaceId) {
      const res = await authed<{ accounts: AccountView[] }>(`/workspaces/${workspaceId}/accounts`);
      return res.accounts;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS — the four dashboard tests green.

- [ ] **Step 6: Export the contract + factory from core**

Add to `packages/core/src/index.ts`:
```ts
export type { AuthedFetch, ApiFetch, AuthedStream } from './api/contract';
export { createDashboardApi } from './api/dashboard-api';
export type { DashboardApi, SectionState } from './api/dashboard-api';
```

- [ ] **Step 7: Recreate the web `dashboard-api.ts` as a shim**

Create `apps/web/src/lib/dashboard-api.ts`:
```ts
import { createDashboardApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { SectionState } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { getSummary, listBudgets, listRecentTransactions, listAccounts } =
  createDashboardApi(authed);
```

- [ ] **Step 8: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS. (Consumers import `getSummary`/`SectionState` from `@/lib/dashboard-api`, which still resolves.)

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/web/src/lib/dashboard-api.ts
git commit -m "refactor(core): migrate dashboard-api to injected factory"
```

---

### Task 3: Migrate `transactions-api`

**Files:**
- Move (git mv): `apps/web/src/lib/transactions-api.ts` → `packages/core/src/api/transactions-api.ts`
- Create: `packages/core/src/api/transactions-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/transactions-api.ts` (shim)

**Interfaces:**
- Consumes: `AuthedFetch`; `@finby/shared` (`Category`, `CreateTransactionInput`, `Transaction`, `TransactionListResult`, `TransactionPatch`, `TransactionQuery`).
- Produces: `interface TransactionsApi { listTransactions(workspaceId, query): Promise<TransactionListResult>; createTransaction(workspaceId, input): Promise<Transaction>; updateTransaction(workspaceId, id, patch): Promise<Transaction>; voidTransaction(workspaceId, id): Promise<{ message: string }>; listCategories(workspaceId): Promise<Category[]> }` and `createTransactionsApi(authed: AuthedFetch): TransactionsApi`.

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/transactions-api.ts packages/core/src/api/transactions-api.ts`
Create `packages/core/src/api/transactions-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createTransactionsApi } from './transactions-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createTransactionsApi', () => {
  it('listTransactions builds the query string (default limit 20, optional filters)', async () => {
    const authed = ok({ transactions: [], nextCursor: null, hasMore: false });
    await createTransactionsApi(authed).listTransactions('ws1', { type: 'EXPENSE', currency: 'USD' });
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/transactions?limit=20&type=EXPENSE&currency=USD',
    );
  });

  it('createTransaction POSTs the input as JSON', async () => {
    const authed = ok({ id: 't1' });
    await createTransactionsApi(authed).createTransaction('ws1', {
      type: 'EXPENSE', amountOriginal: '5', currencyOriginal: 'USD',
    });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'EXPENSE', amountOriginal: '5', currencyOriginal: 'USD' }),
    });
  });

  it('voidTransaction issues a DELETE', async () => {
    const authed = ok({ message: 'ok' });
    await createTransactionsApi(authed).voidTransaction('ws1', 't1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions/t1', { method: 'DELETE' });
  });

  it('listCategories unwraps the { categories } envelope', async () => {
    const authed = ok({ categories: [{ id: 'c1', name: 'Food', isArchived: false }] });
    await expect(createTransactionsApi(authed).listCategories('ws1')).resolves.toEqual([
      { id: 'c1', name: 'Food', isArchived: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createTransactionsApi` not exported.

- [ ] **Step 3: Rewrite as a factory**

Replace `packages/core/src/api/transactions-api.ts` contents with:
```ts
import type {
  Category,
  CreateTransactionInput,
  Transaction,
  TransactionListResult,
  TransactionPatch,
  TransactionQuery,
} from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface TransactionsApi {
  listTransactions(workspaceId: string, query: TransactionQuery): Promise<TransactionListResult>;
  createTransaction(workspaceId: string, input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(workspaceId: string, id: string, patch: TransactionPatch): Promise<Transaction>;
  voidTransaction(workspaceId: string, id: string): Promise<{ message: string }>;
  listCategories(workspaceId: string): Promise<Category[]>;
}

export function createTransactionsApi(authed: AuthedFetch): TransactionsApi {
  return {
    listTransactions(workspaceId, query) {
      const q = new URLSearchParams();
      q.set('limit', String(query.limit ?? 20));
      if (query.cursor) q.set('cursor', query.cursor);
      if (query.type) q.set('type', query.type);
      if (query.categoryId) q.set('categoryId', query.categoryId);
      if (query.fromDate) q.set('fromDate', query.fromDate);
      if (query.toDate) q.set('toDate', query.toDate);
      if (query.currency) q.set('currency', query.currency);
      return authed<TransactionListResult>(`/workspaces/${workspaceId}/transactions?${q}`);
    },
    createTransaction(workspaceId, input) {
      return authed<Transaction>(`/workspaces/${workspaceId}/transactions`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateTransaction(workspaceId, id, patch) {
      return authed<Transaction>(`/workspaces/${workspaceId}/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    voidTransaction(workspaceId, id) {
      return authed<{ message: string }>(`/workspaces/${workspaceId}/transactions/${id}`, {
        method: 'DELETE',
      });
    },
    async listCategories(workspaceId) {
      const res = await authed<{ categories: Category[] }>(`/workspaces/${workspaceId}/categories`);
      return res.categories;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createTransactionsApi } from './api/transactions-api';
export type { TransactionsApi } from './api/transactions-api';
```

- [ ] **Step 6: Recreate the web shim**

Create `apps/web/src/lib/transactions-api.ts`:
```ts
import { createTransactionsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { listTransactions, createTransaction, updateTransaction, voidTransaction, listCategories } =
  createTransactionsApi(authed);
```

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/transactions-api.ts
git commit -m "refactor(core): migrate transactions-api to injected factory"
```

---

### Task 4: Migrate `accounts-api`

**Files:**
- Move (git mv): `apps/web/src/lib/accounts-api.ts` → `packages/core/src/api/accounts-api.ts`
- Create: `packages/core/src/api/accounts-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/accounts-api.ts` (shim)
- Note: `apps/web/src/lib/accounts-api.test.ts` already exists — leave it (it exercises the shim).

**Interfaces:**
- Consumes: `AuthedFetch`; `@finby/shared` (`AccountView`, `AccountType`).
- Produces: `interface CreateAccountInput`, `interface UpdateAccountInput`, `interface AccountsApi { createAccount(workspaceId, input): Promise<AccountView>; updateAccount(workspaceId, accountId, patch): Promise<AccountView> }`, `createAccountsApi(authed: AuthedFetch): AccountsApi`. (`CreateAccountInput`/`UpdateAccountInput` stay defined in the core file and are re-exported by the shim — consumers import them from `@/lib/accounts-api`.)

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/accounts-api.ts packages/core/src/api/accounts-api.ts`
Create `packages/core/src/api/accounts-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createAccountsApi } from './accounts-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAccountsApi', () => {
  it('createAccount POSTs the input as JSON', async () => {
    const authed = ok({ id: 'a1' });
    await createAccountsApi(authed).createAccount('ws1', {
      name: 'Cash', accountType: 'CASH', currency: 'USD',
    });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cash', accountType: 'CASH', currency: 'USD' }),
    });
  });

  it('updateAccount PATCHes the account by id', async () => {
    const authed = ok({ id: 'a1' });
    await createAccountsApi(authed).updateAccount('ws1', 'a1', { name: 'Wallet' });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts/a1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Wallet' }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createAccountsApi` not exported.

- [ ] **Step 3: Rewrite as a factory**

Replace `packages/core/src/api/accounts-api.ts` contents with:
```ts
import type { AccountType, AccountView } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface CreateAccountInput {
  name: string;
  accountType: AccountType;
  currency: string;
  /** Non-negative decimal string; backend defaults to '0' when omitted. */
  initialBalance?: string;
  color?: string;
}

export interface UpdateAccountInput {
  name?: string;
  /** A hex color, or `null` to clear back to the default accent. */
  color?: string | null;
  icon?: string;
  isArchived?: boolean;
}

export interface AccountsApi {
  createAccount(workspaceId: string, input: CreateAccountInput): Promise<AccountView>;
  updateAccount(workspaceId: string, accountId: string, patch: UpdateAccountInput): Promise<AccountView>;
}

export function createAccountsApi(authed: AuthedFetch): AccountsApi {
  return {
    createAccount(workspaceId, input) {
      return authed<AccountView>(`/workspaces/${workspaceId}/accounts`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateAccount(workspaceId, accountId, patch) {
      return authed<AccountView>(`/workspaces/${workspaceId}/accounts/${accountId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createAccountsApi } from './api/accounts-api';
export type { AccountsApi, CreateAccountInput, UpdateAccountInput } from './api/accounts-api';
```

- [ ] **Step 6: Recreate the web shim**

Create `apps/web/src/lib/accounts-api.ts`:
```ts
import { createAccountsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { CreateAccountInput, UpdateAccountInput } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { createAccount, updateAccount } = createAccountsApi(authed);
```

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS — including the existing `apps/web/src/lib/accounts-api.test.ts` (now exercising the shim).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/accounts-api.ts
git commit -m "refactor(core): migrate accounts-api to injected factory"
```

---

### Task 5: Migrate `streaks-api` and `alerts-api`

**Files:**
- Move (git mv): `apps/web/src/lib/streaks-api.ts` → `packages/core/src/api/streaks-api.ts`
- Move (git mv): `apps/web/src/lib/alerts-api.ts` → `packages/core/src/api/alerts-api.ts`
- Create: `packages/core/src/api/streaks-api.test.ts`, `packages/core/src/api/alerts-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/streaks-api.ts`, `apps/web/src/lib/alerts-api.ts` (shims)
- Note: `apps/web/src/lib/streaks-api.test.ts` already exists — leave it.

**Interfaces:**
- Produces: `createStreaksApi(authed: AuthedFetch): StreaksApi` with `getStreakStatus`, `repairStreak`, `getStreakCalendar`; `createAlertsApi(authed: AuthedFetch): AlertsApi` with `listAlerts`, `updateAlertStatus`, `markAllAlertsRead`.

- [ ] **Step 1: Move both impls + write failing tests**

Run:
```bash
git mv apps/web/src/lib/streaks-api.ts packages/core/src/api/streaks-api.ts
git mv apps/web/src/lib/alerts-api.ts packages/core/src/api/alerts-api.ts
```
Create `packages/core/src/api/streaks-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createStreaksApi } from './streaks-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createStreaksApi', () => {
  it('getStreakStatus GETs the streaks path', async () => {
    const authed = ok({ currentStreak: 1 });
    await createStreaksApi(authed).getStreakStatus('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/streaks');
  });
  it('repairStreak POSTs to streaks/repair', async () => {
    const authed = ok({ currentStreak: 1 });
    await createStreaksApi(authed).repairStreak('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/streaks/repair', { method: 'POST' });
  });
});
```
Create `packages/core/src/api/alerts-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createAlertsApi } from './alerts-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAlertsApi', () => {
  it('listAlerts omits the query string when no params', async () => {
    const authed = ok({ alerts: [], unreadCount: 0, nextCursor: null, hasMore: false });
    await createAlertsApi(authed).listAlerts('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts');
  });
  it('listAlerts appends status/limit when provided', async () => {
    const authed = ok({ alerts: [], unreadCount: 0, nextCursor: null, hasMore: false });
    await createAlertsApi(authed).listAlerts('ws1', { status: 'UNREAD', limit: 5 });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts?status=UNREAD&limit=5');
  });
  it('updateAlertStatus PATCHes the alert with the new status', async () => {
    const authed = ok({ id: 'al1' });
    await createAlertsApi(authed).updateAlertStatus('ws1', 'al1', 'READ');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts/al1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'READ' }),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createStreaksApi` / `createAlertsApi` not exported.

- [ ] **Step 3: Rewrite `streaks-api.ts` as a factory**

Replace `packages/core/src/api/streaks-api.ts` contents with:
```ts
import type { StreakStatus, StreakCalendar } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface StreaksApi {
  getStreakStatus(workspaceId: string): Promise<StreakStatus>;
  repairStreak(workspaceId: string): Promise<StreakStatus>;
  getStreakCalendar(workspaceId: string): Promise<StreakCalendar>;
}

export function createStreaksApi(authed: AuthedFetch): StreaksApi {
  return {
    getStreakStatus(workspaceId) {
      return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks`);
    },
    repairStreak(workspaceId) {
      return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks/repair`, { method: 'POST' });
    },
    getStreakCalendar(workspaceId) {
      return authed<StreakCalendar>(`/workspaces/${workspaceId}/streaks/calendar`);
    },
  };
}
```

- [ ] **Step 4: Rewrite `alerts-api.ts` as a factory**

Replace `packages/core/src/api/alerts-api.ts` contents with:
```ts
import type { AlertListResult, AlertView } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface AlertsApi {
  listAlerts(
    workspaceId: string,
    params?: { status?: 'UNREAD' | 'READ' | 'DISMISSED'; cursor?: string; limit?: number },
  ): Promise<AlertListResult>;
  updateAlertStatus(
    workspaceId: string,
    alertId: string,
    status: 'READ' | 'DISMISSED',
  ): Promise<AlertView>;
  markAllAlertsRead(workspaceId: string): Promise<{ updated: number }>;
}

export function createAlertsApi(authed: AuthedFetch): AlertsApi {
  return {
    listAlerts(workspaceId, params) {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.cursor) q.set('cursor', params.cursor);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return authed<AlertListResult>(`/workspaces/${workspaceId}/alerts${qs ? `?${qs}` : ''}`);
    },
    updateAlertStatus(workspaceId, alertId, status) {
      return authed<AlertView>(`/workspaces/${workspaceId}/alerts/${alertId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    markAllAlertsRead(workspaceId) {
      return authed<{ updated: number }>(`/workspaces/${workspaceId}/alerts/mark-all-read`, {
        method: 'PATCH',
      });
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 6: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createStreaksApi } from './api/streaks-api';
export type { StreaksApi } from './api/streaks-api';
export { createAlertsApi } from './api/alerts-api';
export type { AlertsApi } from './api/alerts-api';
```

- [ ] **Step 7: Recreate the web shims**

Create `apps/web/src/lib/streaks-api.ts`:
```ts
import { createStreaksApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { getStreakStatus, repairStreak, getStreakCalendar } = createStreaksApi(authed);
```
Create `apps/web/src/lib/alerts-api.ts`:
```ts
import { createAlertsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from '@/lib/store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { listAlerts, updateAlertStatus, markAllAlertsRead } = createAlertsApi(authed);
```

- [ ] **Step 8: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (including existing `streaks-api.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/web/src/lib/streaks-api.ts apps/web/src/lib/alerts-api.ts
git commit -m "refactor(core): migrate streaks-api and alerts-api to injected factories"
```

---

### Task 6: Migrate `settings-api`, `support-api`, and `feedback-api`

**Files:**
- Move (git mv): `settings-api.ts`, `support-api.ts`, `feedback-api.ts` from `apps/web/src/lib/` → `packages/core/src/api/`
- Create: `packages/core/src/api/settings-api.test.ts`, `support-api.test.ts`, `feedback-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: web shims at the three original paths
- Note: existing `settings-api.test.ts`, `support-api.test.ts`, `feedback-api.test.ts` under `apps/web/src/lib/` — leave them.

**Interfaces:**
- Produces:
  - `createSettingsApi(authed): SettingsApi` with `updateProfile(patch)`, `updateCurrencies(workspaceId, currencies)`, `updateBaseCurrency(workspaceId, baseCurrency)`; interfaces `ProfilePatch`, `UpdateBaseCurrencyResult` (defined in core file, re-exported by shim).
  - `createSupportApi(authed): SupportApi` with `createSupportTicket(input)`, `listSupportTickets()`; interface `CreateSupportTicketInput`.
  - `createFeedbackApi(authed): FeedbackApi` with `submitFeedback(rating, comment?)`; interface `FeedbackResult`.

- [ ] **Step 1: Move impls + write failing tests**

Run:
```bash
git mv apps/web/src/lib/settings-api.ts packages/core/src/api/settings-api.ts
git mv apps/web/src/lib/support-api.ts packages/core/src/api/support-api.ts
git mv apps/web/src/lib/feedback-api.ts packages/core/src/api/feedback-api.ts
```
Create `packages/core/src/api/settings-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createSettingsApi } from './settings-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createSettingsApi', () => {
  it('updateProfile PATCHes /auth/profile with the patch', async () => {
    const authed = ok({ id: 'u1' });
    await createSettingsApi(authed).updateProfile({ displayName: 'Tee' });
    expect(authed).toHaveBeenCalledWith('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Tee' }),
    });
  });
  it('updateBaseCurrency PATCHes the base-currency endpoint', async () => {
    const authed = ok({ baseCurrency: 'USD', preferredCurrencies: [], recomputed: 0 });
    await createSettingsApi(authed).updateBaseCurrency('ws1', 'USD');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/currencies/base', {
      method: 'PATCH',
      body: JSON.stringify({ baseCurrency: 'USD' }),
    });
  });
});
```
Create `packages/core/src/api/support-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createSupportApi } from './support-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createSupportApi', () => {
  it('createSupportTicket POSTs the ticket', async () => {
    const authed = ok({ id: 's1' });
    await createSupportApi(authed).createSupportTicket({
      category: 'BUG', subject: 'x', message: 'y',
    });
    expect(authed).toHaveBeenCalledWith('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ category: 'BUG', subject: 'x', message: 'y' }),
    });
  });
  it('listSupportTickets unwraps the { tickets } envelope', async () => {
    const authed = ok({ tickets: [{ id: 's1' }] });
    await expect(createSupportApi(authed).listSupportTickets()).resolves.toEqual([{ id: 's1' }]);
  });
});
```
Create `packages/core/src/api/feedback-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createFeedbackApi } from './feedback-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createFeedbackApi', () => {
  it('submitFeedback POSTs rating, trimming and including a non-empty comment', async () => {
    const authed = ok({ id: 'f1' });
    await createFeedbackApi(authed).submitFeedback(5, '  great  ');
    expect(authed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 5, comment: 'great' }),
    });
  });
  it('submitFeedback omits an empty/whitespace comment', async () => {
    const authed = ok({ id: 'f1' });
    await createFeedbackApi(authed).submitFeedback(4, '   ');
    expect(authed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 4 }),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — the three `createXxxApi` not exported.

- [ ] **Step 3: Rewrite `settings-api.ts` as a factory**

Replace `packages/core/src/api/settings-api.ts` contents with:
```ts
import type { ApiUser, UserPreferences } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface ProfilePatch {
  displayName?: string;
  timezone?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UpdateBaseCurrencyResult {
  baseCurrency: string;
  preferredCurrencies: string[];
  recomputed: number;
}

export interface SettingsApi {
  updateProfile(patch: ProfilePatch): Promise<ApiUser>;
  updateCurrencies(workspaceId: string, currencies: string[]): Promise<{ preferredCurrencies: string[] }>;
  updateBaseCurrency(workspaceId: string, baseCurrency: string): Promise<UpdateBaseCurrencyResult>;
}

export function createSettingsApi(authed: AuthedFetch): SettingsApi {
  return {
    updateProfile(patch) {
      return authed<ApiUser>(`/auth/profile`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    updateCurrencies(workspaceId, currencies) {
      return authed<{ preferredCurrencies: string[] }>(
        `/workspaces/${workspaceId}/currencies`,
        { method: 'PATCH', body: JSON.stringify({ currencies }) },
      );
    },
    updateBaseCurrency(workspaceId, baseCurrency) {
      return authed<UpdateBaseCurrencyResult>(
        `/workspaces/${workspaceId}/currencies/base`,
        { method: 'PATCH', body: JSON.stringify({ baseCurrency }) },
      );
    },
  };
}
```

- [ ] **Step 4: Rewrite `support-api.ts` as a factory**

Replace `packages/core/src/api/support-api.ts` contents with:
```ts
import type { SupportCategory, SupportTicketView } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface CreateSupportTicketInput {
  category: SupportCategory;
  subject: string;
  message: string;
}

export interface SupportApi {
  createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicketView>;
  listSupportTickets(): Promise<SupportTicketView[]>;
}

export function createSupportApi(authed: AuthedFetch): SupportApi {
  return {
    createSupportTicket(input) {
      return authed<SupportTicketView>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listSupportTickets() {
      const res = await authed<{ tickets: SupportTicketView[] }>('/support/tickets');
      return res.tickets;
    },
  };
}
```

- [ ] **Step 5: Rewrite `feedback-api.ts` as a factory**

Replace `packages/core/src/api/feedback-api.ts` contents with:
```ts
import type { AuthedFetch } from './contract';

export interface FeedbackResult {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface FeedbackApi {
  submitFeedback(rating: number, comment?: string): Promise<FeedbackResult>;
}

export function createFeedbackApi(authed: AuthedFetch): FeedbackApi {
  return {
    submitFeedback(rating, comment) {
      return authed<FeedbackResult>('/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating, ...(comment?.trim() ? { comment: comment.trim() } : {}) }),
      });
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 7: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createSettingsApi } from './api/settings-api';
export type { SettingsApi, ProfilePatch, UpdateBaseCurrencyResult } from './api/settings-api';
export { createSupportApi } from './api/support-api';
export type { SupportApi, CreateSupportTicketInput } from './api/support-api';
export { createFeedbackApi } from './api/feedback-api';
export type { FeedbackApi, FeedbackResult } from './api/feedback-api';
```

- [ ] **Step 8: Recreate the web shims**

Create `apps/web/src/lib/settings-api.ts`:
```ts
import { createSettingsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { ProfilePatch, UpdateBaseCurrencyResult } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { updateProfile, updateCurrencies, updateBaseCurrency } = createSettingsApi(authed);
```
Create `apps/web/src/lib/support-api.ts`:
```ts
import { createSupportApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { CreateSupportTicketInput } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { createSupportTicket, listSupportTickets } = createSupportApi(authed);
```
Create `apps/web/src/lib/feedback-api.ts`:
```ts
import { createFeedbackApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { FeedbackResult } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { submitFeedback } = createFeedbackApi(authed);
```

- [ ] **Step 9: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (including the three existing web tests).

- [ ] **Step 10: Commit**

```bash
git add packages/core apps/web/src/lib/settings-api.ts apps/web/src/lib/support-api.ts apps/web/src/lib/feedback-api.ts
git commit -m "refactor(core): migrate settings/support/feedback APIs to injected factories"
```

---

### Task 7: Migrate `members-api` and `auth-api` (introduces `ApiFetch` injection)

**Files:**
- Move (git mv): `members-api.ts`, `auth-api.ts` from `apps/web/src/lib/` → `packages/core/src/api/`
- Create: `packages/core/src/api/members-api.test.ts`, `auth-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: web shims at both original paths

**Context:** These modules call BOTH the authenticated `authed` and the unauthenticated `apiFetch` (public invite preview / signup, email verify / password reset). The factory takes both: `{ authed, apiFetch }`.

**Interfaces:**
- Produces:
  - `createMembersApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): MembersApi` with `listWorkspaces`, `listMembers`, `listInvites`, `inviteMember`, `cancelInvite`, `resendInvite`, `changeMemberRole`, `removeMember`, `leaveWorkspace`, `previewInvite` (apiFetch), `acceptInvite` (authed), `acceptInviteSignup` (apiFetch).
  - `createAuthApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): AuthApi` with `verifyEmail` (apiFetch), `forgotPassword` (apiFetch), `resetPassword` (apiFetch), `resendVerification` (authed).

- [ ] **Step 1: Move impls + write failing tests**

Run:
```bash
git mv apps/web/src/lib/members-api.ts packages/core/src/api/members-api.ts
git mv apps/web/src/lib/auth-api.ts packages/core/src/api/auth-api.ts
```
Create `packages/core/src/api/members-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createMembersApi } from './members-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createMembersApi', () => {
  it('inviteMember POSTs email + role via authed', async () => {
    const authed = ok({ id: 'i1' });
    const apiFetch = ok({});
    await createMembersApi({ authed, apiFetch }).inviteMember('ws1', 'a@b.com', 'VIEWER');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/invites', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', role: 'VIEWER' }),
    });
  });
  it('previewInvite uses the UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ workspaceName: 'W' });
    await createMembersApi({ authed, apiFetch }).previewInvite('tok123');
    expect(apiFetch).toHaveBeenCalledWith('/invites/tok123');
    expect(authed).not.toHaveBeenCalled();
  });
});
```
Create `packages/core/src/api/auth-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from './auth-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAuthApi', () => {
  it('verifyEmail POSTs the token via UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ message: 'ok' });
    await createAuthApi({ authed, apiFetch }).verifyEmail('tok');
    expect(apiFetch).toHaveBeenCalledWith('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
    });
    expect(authed).not.toHaveBeenCalled();
  });
  it('resendVerification uses authed', async () => {
    const authed = ok({ message: 'ok' });
    const apiFetch = ok({});
    await createAuthApi({ authed, apiFetch }).resendVerification();
    expect(authed).toHaveBeenCalledWith('/auth/resend-verification', { method: 'POST' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createMembersApi` / `createAuthApi` not exported.

- [ ] **Step 3: Rewrite `members-api.ts` as a factory**

Replace `packages/core/src/api/members-api.ts` contents with:
```ts
import type {
  AuthResult, InvitePreview, InviteView, MemberView, WorkspaceMembershipSummary, WorkspaceMemberRole,
} from '@finby/shared';
import type { ApiFetch, AuthedFetch } from './contract';

export interface MembersApi {
  listWorkspaces(): Promise<WorkspaceMembershipSummary[]>;
  listMembers(workspaceId: string): Promise<MemberView[]>;
  listInvites(workspaceId: string): Promise<InviteView[]>;
  inviteMember(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, 'OWNER'>): Promise<InviteView>;
  cancelInvite(workspaceId: string, inviteId: string): Promise<void>;
  resendInvite(workspaceId: string, inviteId: string): Promise<InviteView>;
  changeMemberRole(workspaceId: string, memberId: string, role: WorkspaceMemberRole): Promise<MemberView>;
  removeMember(workspaceId: string, memberId: string): Promise<void>;
  leaveWorkspace(workspaceId: string): Promise<void>;
  previewInvite(token: string): Promise<InvitePreview>;
  acceptInvite(token: string): Promise<{ workspaceId: string }>;
  acceptInviteSignup(
    token: string,
    body: { displayName: string; password: string; baseCurrency?: string; timezone?: string },
  ): Promise<AuthResult>;
}

export function createMembersApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): MembersApi {
  const { authed, apiFetch } = deps;
  return {
    listWorkspaces() {
      return authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
    },
    listMembers(workspaceId) {
      return authed<MemberView[]>(`/workspaces/${workspaceId}/members`);
    },
    listInvites(workspaceId) {
      return authed<InviteView[]>(`/workspaces/${workspaceId}/invites`);
    },
    inviteMember(workspaceId, email, role) {
      return authed<InviteView>(`/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
    },
    cancelInvite(workspaceId, inviteId) {
      return authed<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
    },
    resendInvite(workspaceId, inviteId) {
      return authed<InviteView>(`/workspaces/${workspaceId}/invites/${inviteId}/resend`, { method: 'POST' });
    },
    changeMemberRole(workspaceId, memberId, role) {
      return authed<MemberView>(`/workspaces/${workspaceId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    removeMember(workspaceId, memberId) {
      return authed<void>(`/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' });
    },
    leaveWorkspace(workspaceId) {
      return authed<void>(`/workspaces/${workspaceId}/members/me`, { method: 'DELETE' });
    },
    previewInvite(token) {
      return apiFetch<InvitePreview>(`/invites/${token}`);
    },
    acceptInvite(token) {
      return authed<{ workspaceId: string }>(`/invites/${token}/accept`, { method: 'POST' });
    },
    acceptInviteSignup(token, body) {
      return apiFetch<AuthResult>(`/invites/${token}/accept-signup`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  };
}
```

- [ ] **Step 4: Rewrite `auth-api.ts` as a factory**

Replace `packages/core/src/api/auth-api.ts` contents with:
```ts
import type { ApiFetch, AuthedFetch } from './contract';

export interface AuthApi {
  verifyEmail(token: string): Promise<{ message: string }>;
  forgotPassword(email: string): Promise<{ message: string }>;
  resetPassword(token: string, newPassword: string): Promise<{ message: string }>;
  resendVerification(): Promise<{ message: string }>;
}

export function createAuthApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): AuthApi {
  const { authed, apiFetch } = deps;
  return {
    verifyEmail(token) {
      return apiFetch<{ message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
    forgotPassword(email) {
      return apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },
    resetPassword(token, newPassword) {
      return apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
    },
    resendVerification() {
      return authed<{ message: string }>('/auth/resend-verification', { method: 'POST' });
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 6: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createMembersApi } from './api/members-api';
export type { MembersApi } from './api/members-api';
export { createAuthApi } from './api/auth-api';
export type { AuthApi } from './api/auth-api';
```

- [ ] **Step 7: Recreate the web shims**

Create `apps/web/src/lib/members-api.ts`:
```ts
import { createMembersApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const {
  listWorkspaces, listMembers, listInvites, inviteMember, cancelInvite, resendInvite,
  changeMemberRole, removeMember, leaveWorkspace, previewInvite, acceptInvite, acceptInviteSignup,
} = createMembersApi({ authed, apiFetch });
```
Create `apps/web/src/lib/auth-api.ts`:
```ts
import { createAuthApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { verifyEmail, forgotPassword, resetPassword, resendVerification } =
  createAuthApi({ authed, apiFetch });
```

- [ ] **Step 8: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/web/src/lib/members-api.ts apps/web/src/lib/auth-api.ts
git commit -m "refactor(core): migrate members-api and auth-api to injected factories"
```

---

### Task 8: Migrate `billing-api` (authed + apiFetch; `openBillingUrl` stays web-only)

**Files:**
- Move (git mv): `apps/web/src/lib/billing-api.ts` → `packages/core/src/api/billing-api.ts`
- Create: `packages/core/src/api/billing-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/billing-api.ts` (shim — also keeps the web-only `openBillingUrl`)
- Note: existing `apps/web/src/lib/billing-api.test.ts` — leave it (it exercises the shim, incl. `openBillingUrl`).

**Context:** All billing functions are portable EXCEPT `openBillingUrl`, which uses `window.open` / `window.location` and must NOT move into core (the ESLint guard would reject it). It stays defined in the web shim.

**Interfaces:**
- Produces: `createBillingApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): BillingApi` with `getSubscription`, `getPlans` (apiFetch), `startCheckout`, `openPortal`, `changePlan`, `cancelSubscription`, `resumeSubscription`.

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/billing-api.ts packages/core/src/api/billing-api.ts`
Create `packages/core/src/api/billing-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createBillingApi } from './billing-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createBillingApi', () => {
  it('getSubscription GETs the subscription via authed', async () => {
    const authed = ok({ tier: 'FREE' });
    const apiFetch = ok({});
    await createBillingApi({ authed, apiFetch }).getSubscription('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/subscription');
  });
  it('getPlans uses the UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ plans: [] });
    await createBillingApi({ authed, apiFetch }).getPlans();
    expect(apiFetch).toHaveBeenCalledWith('/billing/plans');
    expect(authed).not.toHaveBeenCalled();
  });
  it('startCheckout POSTs the tier', async () => {
    const authed = ok({ url: 'https://x' });
    const apiFetch = ok({});
    await createBillingApi({ authed, apiFetch }).startCheckout('ws1', 'PRO');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PRO' }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createBillingApi` not exported.

- [ ] **Step 3: Rewrite as a factory (drop `openBillingUrl` — it moves to the shim)**

Replace `packages/core/src/api/billing-api.ts` contents with:
```ts
import type { BillingPlan, SubscriptionTier, SubscriptionView } from '@finby/shared';
import type { ApiFetch, AuthedFetch } from './contract';

export interface BillingApi {
  getSubscription(workspaceId: string): Promise<SubscriptionView>;
  getPlans(): Promise<{ plans: BillingPlan[] }>;
  startCheckout(workspaceId: string, tier: Exclude<SubscriptionTier, 'FREE'>): Promise<{ url: string }>;
  openPortal(workspaceId: string): Promise<{ url: string }>;
  changePlan(workspaceId: string, tier: Exclude<SubscriptionTier, 'FREE'>): Promise<SubscriptionView>;
  cancelSubscription(workspaceId: string): Promise<SubscriptionView>;
  resumeSubscription(workspaceId: string): Promise<SubscriptionView>;
}

export function createBillingApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): BillingApi {
  const { authed, apiFetch } = deps;
  return {
    getSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription`);
    },
    getPlans() {
      return apiFetch<{ plans: BillingPlan[] }>(`/billing/plans`);
    },
    startCheckout(workspaceId, tier) {
      return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/checkout`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    },
    openPortal(workspaceId) {
      return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/portal`, {
        method: 'POST',
      });
    },
    changePlan(workspaceId, tier) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/change-plan`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    },
    cancelSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/cancel`, {
        method: 'POST',
      });
    },
    resumeSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/resume`, {
        method: 'POST',
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createBillingApi } from './api/billing-api';
export type { BillingApi } from './api/billing-api';
```

- [ ] **Step 6: Recreate the web shim (with the web-only `openBillingUrl` kept here verbatim)**

Create `apps/web/src/lib/billing-api.ts`:
```ts
import { createBillingApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const {
  getSubscription, getPlans, startCheckout, openPortal, changePlan, cancelSubscription, resumeSubscription,
} = createBillingApi({ authed, apiFetch });

/**
 * Open a Stripe billing URL (resolved asynchronously) in a separate browser tab.
 * Web-only (uses window) — stays in the web app rather than @finby/core.
 *
 * In a standalone PWA on iOS, navigating the app's own context to an external
 * URL opens an in-app browser overlay; dismissing it (the X) corrupts the PWA's
 * viewport and navigation. Opening in a new tab keeps the installed app intact.
 *
 * The blank tab is opened *synchronously* inside the click handler so Safari
 * preserves the user gesture and does not block the popup — its location is set
 * once the async URL resolves. If the popup is blocked (no handle), fall back to
 * a same-context redirect so the action still works.
 */
export async function openBillingUrl(resolveUrl: () => Promise<string>): Promise<void> {
  const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (tab) {
    tab.opener = null;
  }
  try {
    const url = await resolveUrl();
    if (tab) {
      tab.location.href = url;
    } else if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
```

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (including the existing `billing-api.test.ts`, which covers `openBillingUrl`).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/billing-api.ts
git commit -m "refactor(core): migrate billing-api to injected factory (openBillingUrl stays web-only)"
```

---

### Task 9: Migrate `receipts-api`

**Files:**
- Move (git mv): `apps/web/src/lib/receipts-api.ts` → `packages/core/src/api/receipts-api.ts`
- Create: `packages/core/src/api/receipts-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/receipts-api.ts` (shim)

**Context:** `extractReceipt` uploads a `File` via `FormData` (the core HTTP client already omits the JSON `Content-Type` for `FormData` bodies). `File`/`FormData` are DOM-lib types available in core's typecheck; the browser/RN runtime supplies them. Keep the `File` parameter type for now (web callers pass a `File`); mobile's file-upload shape is a Phase 5 concern.

**Interfaces:**
- Produces: `createReceiptsApi(authed: AuthedFetch): ReceiptsApi` with `extractReceipt(workspaceId, file: File): Promise<ReceiptExtraction>`.

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/receipts-api.ts packages/core/src/api/receipts-api.ts`
Create `packages/core/src/api/receipts-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createReceiptsApi } from './receipts-api';

describe('createReceiptsApi', () => {
  it('extractReceipt POSTs a FormData body to the extract endpoint', async () => {
    const authed = vi.fn(async (_path: string, _init?: RequestInit) => ({} as never));
    const file = new File(['x'], 'r.png', { type: 'image/png' });
    await createReceiptsApi(authed).extractReceipt('ws1', file);
    expect(authed).toHaveBeenCalledTimes(1);
    const [path, init] = authed.mock.calls[0]!;
    expect(path).toBe('/workspaces/ws1/receipts/extract');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).get('image')).toBe(file);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createReceiptsApi` not exported.

- [ ] **Step 3: Rewrite as a factory**

Replace `packages/core/src/api/receipts-api.ts` contents with:
```ts
import type { ReceiptExtraction } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface ReceiptsApi {
  /**
   * Upload a receipt photo for extraction. The API holds the image in memory
   * only (never persisted) and returns the structured draft for the user to
   * confirm — nothing is logged until they do.
   */
  extractReceipt(workspaceId: string, file: File): Promise<ReceiptExtraction>;
}

export function createReceiptsApi(authed: AuthedFetch): ReceiptsApi {
  return {
    extractReceipt(workspaceId, file) {
      const form = new FormData();
      form.append('image', file);
      return authed<ReceiptExtraction>(`/workspaces/${workspaceId}/receipts/extract`, {
        method: 'POST',
        body: form,
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createReceiptsApi } from './api/receipts-api';
export type { ReceiptsApi } from './api/receipts-api';
```

- [ ] **Step 6: Recreate the web shim**

Create `apps/web/src/lib/receipts-api.ts`:
```ts
import { createReceiptsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { extractReceipt } = createReceiptsApi(authed);
```

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/receipts-api.ts
git commit -m "refactor(core): migrate receipts-api to injected factory"
```

---

### Task 10: Migrate `gamification-api` (authed + authedStream + apiBase)

**Files:**
- Move (git mv): `apps/web/src/lib/gamification-api.ts` → `packages/core/src/api/gamification-api.ts`
- Create: `packages/core/src/api/gamification-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/gamification-api.ts` (shim)

**Context:** Needs three injected deps: `authed` (XP/achievements), `authedStream` (badge SVG fetched as text), and `apiBase` (the badge URL builder is plain string concatenation). `getBadgeSvgUrl` returns `${apiBase}/...`.

**Interfaces:**
- Produces: `createGamificationApi(deps: { authed: AuthedFetch; authedStream: AuthedStream; apiBase: string }): GamificationApi` with `getXpSummary`, `getXpHistory`, `getAchievements`, `getBadgeSvgUrl(workspaceId, slug): string`, `getBadgeSvg(workspaceId, slug): Promise<string>`.

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/gamification-api.ts packages/core/src/api/gamification-api.ts`
Create `packages/core/src/api/gamification-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createGamificationApi } from './gamification-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

const deps = (authed = ok({}), authedStream = vi.fn()) => ({
  authed,
  authedStream: authedStream as never,
  apiBase: 'https://api.test/v1',
});

describe('createGamificationApi', () => {
  it('getXpSummary GETs the xp path via authed', async () => {
    const authed = ok({ balance: 0, totalEarned: 0, todayEarned: 0 });
    await createGamificationApi(deps(authed)).getXpSummary('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/gamification/xp');
  });
  it('getBadgeSvgUrl builds the absolute URL from apiBase', () => {
    const url = createGamificationApi(deps()).getBadgeSvgUrl('ws1', 'streak-7');
    expect(url).toBe('https://api.test/v1/workspaces/ws1/gamification/achievements/streak-7/badge.svg');
  });
  it('getBadgeSvg fetches via authedStream and returns the text body', async () => {
    const authedStream = vi.fn(async () => ({ text: async () => '<svg/>' }));
    const svg = await createGamificationApi(deps(ok({}), authedStream)).getBadgeSvg('ws1', 'streak-7');
    expect(svg).toBe('<svg/>');
    expect(authedStream).toHaveBeenCalledWith(
      '/workspaces/ws1/gamification/achievements/streak-7/badge.svg',
      { method: 'GET' },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createGamificationApi` not exported.

- [ ] **Step 3: Rewrite as a factory**

Replace `packages/core/src/api/gamification-api.ts` contents with:
```ts
import type { AchievementsResult, XpSummary, XpTransactionView } from '@finby/shared';
import type { AuthedFetch, AuthedStream } from './contract';

export interface GamificationApi {
  getXpSummary(workspaceId: string): Promise<XpSummary>;
  getXpHistory(workspaceId: string): Promise<XpTransactionView[]>;
  getAchievements(workspaceId: string): Promise<AchievementsResult>;
  /** Raw URL of a badge SVG. The endpoint is bearer-authenticated, so this can't
   *  be used directly as an <img src>; fetch it through getBadgeSvg instead. */
  getBadgeSvgUrl(workspaceId: string, slug: string): string;
  getBadgeSvg(workspaceId: string, slug: string): Promise<string>;
}

export function createGamificationApi(deps: {
  authed: AuthedFetch;
  authedStream: AuthedStream;
  apiBase: string;
}): GamificationApi {
  const { authed, authedStream, apiBase } = deps;
  return {
    getXpSummary(workspaceId) {
      return authed<XpSummary>(`/workspaces/${workspaceId}/gamification/xp`);
    },
    getXpHistory(workspaceId) {
      return authed<XpTransactionView[]>(`/workspaces/${workspaceId}/gamification/xp/history`);
    },
    getAchievements(workspaceId) {
      return authed<AchievementsResult>(`/workspaces/${workspaceId}/gamification/achievements`);
    },
    getBadgeSvgUrl(workspaceId, slug) {
      return `${apiBase}/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`;
    },
    async getBadgeSvg(workspaceId, slug) {
      const res = await authedStream(
        `/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`,
        { method: 'GET' },
      );
      return res.text();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createGamificationApi } from './api/gamification-api';
export type { GamificationApi } from './api/gamification-api';
```

- [ ] **Step 6: Recreate the web shim**

Create `apps/web/src/lib/gamification-api.ts`:
```ts
import { createGamificationApi, type AuthedFetch, type AuthedStream } from '@finby/core';
import { API_BASE } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);
const authedStream: AuthedStream = (p: string, i?: RequestInit) => useAuth.getState().authedStream(p, i);

export const { getXpSummary, getXpHistory, getAchievements, getBadgeSvgUrl, getBadgeSvg } =
  createGamificationApi({ authed, authedStream, apiBase: API_BASE });
```

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS. (Note: `apps/web/src/features/gamification/components/BadgeImage.tsx` consumes `getBadgeSvg`/`getBadgeSvgUrl` from `@/lib/gamification-api`, which still resolves.)

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/gamification-api.ts
git commit -m "refactor(core): migrate gamification-api to injected factory"
```

---

### Task 11: Migrate `chat-api` (authed + authedStream + SSE)

**Files:**
- Move (git mv): `apps/web/src/lib/chat-api.ts` → `packages/core/src/api/chat-api.ts`
- Create: `packages/core/src/api/chat-api.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/chat-api.ts` (shim)

**Context:** The flagship module. Plain calls use `authed`; `streamMessage` uses `authedStream` + `parseSseFrames` (already in core) + `TextDecoder` + `ReadableStream.getReader()`. `TextDecoder` is a global in both browsers and React Native; `res.body?.getReader()` depends on the stream transport the injected `authedStream` returns (web's `fetch` Response today; a Phase 4 RN transport later). Keep the streaming logic verbatim — only the transport is injected. Import `parseSseFrames` from core's own module (`../sse`).

**Interfaces:**
- Produces: `createChatApi(deps: { authed: AuthedFetch; authedStream: AuthedStream }): ChatApi` with `listConversations`, `createConversation`, `listMessages`, `appendAssistantNote`, `sendMessage`, `streamMessage(workspaceId, conversationId, content, handlers): Promise<void>`.

- [ ] **Step 1: Move impl + write failing test**

Run: `git mv apps/web/src/lib/chat-api.ts packages/core/src/api/chat-api.ts`
Create `packages/core/src/api/chat-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createChatApi } from './chat-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createChatApi', () => {
  it('listConversations unwraps the { conversations } envelope', async () => {
    const authed = ok({ conversations: [{ id: 'c1' }] });
    const api = createChatApi({ authed, authedStream: vi.fn() as never });
    await expect(api.listConversations('ws1')).resolves.toEqual([{ id: 'c1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/conversations');
  });

  it('sendMessage POSTs the content to the messages endpoint', async () => {
    const authed = ok({ message: { id: 'm1' }, actions: [], pendingConfirmations: [] });
    const api = createChatApi({ authed, authedStream: vi.fn() as never });
    await api.sendMessage('ws1', 'c1', 'hello');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/conversations/c1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
    });
  });

  it('streamMessage parses SSE frames from the stream and dispatches handlers', async () => {
    const frames = [
      'event: text\ndata: {"text":"hi"}\n\n',
      'event: done\ndata: {"message":{"id":"m1","role":"assistant","content":"hi","createdAt":"t"}}\n\n',
    ];
    const enc = new TextEncoder();
    let i = 0;
    const reader = {
      read: async () =>
        i < frames.length
          ? { done: false, value: enc.encode(frames[i++]!) }
          : { done: true, value: undefined },
    };
    const authedStream = vi.fn(async () => ({ body: { getReader: () => reader } }));
    const onText = vi.fn();
    const onDone = vi.fn();
    const api = createChatApi({ authed: ok({}), authedStream: authedStream as never });
    await api.streamMessage('ws1', 'c1', 'hello', {
      onText, onAction: vi.fn(), onPending: vi.fn(), onDone, onError: vi.fn(),
    });
    expect(authedStream).toHaveBeenCalledWith(
      '/workspaces/ws1/conversations/c1/messages/stream',
      { method: 'POST', body: JSON.stringify({ content: 'hello' }) },
    );
    expect(onText).toHaveBeenCalledWith('hi');
    expect(onDone).toHaveBeenCalledWith({ id: 'm1', role: 'assistant', content: 'hi', createdAt: 't' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `createChatApi` not exported.

- [ ] **Step 3: Rewrite as a factory**

Replace `packages/core/src/api/chat-api.ts` contents with:
```ts
import { parseSseFrames } from '../sse';
import type {
  ChatAction,
  ChatMessageView,
  ChatResult,
  ChatStreamHandlers,
  ConversationListResult,
  ConversationSummary,
  CreatedConversation,
  MessagesResult,
  PendingConfirmation,
} from '@finby/shared';
import type { AuthedFetch, AuthedStream } from './contract';

export interface ChatApi {
  listConversations(workspaceId: string): Promise<ConversationSummary[]>;
  createConversation(workspaceId: string): Promise<CreatedConversation>;
  listMessages(workspaceId: string, conversationId: string): Promise<MessagesResult>;
  appendAssistantNote(workspaceId: string, conversationId: string, content: string): Promise<ChatMessageView>;
  sendMessage(workspaceId: string, conversationId: string, content: string): Promise<ChatResult>;
  streamMessage(
    workspaceId: string,
    conversationId: string,
    content: string,
    handlers: ChatStreamHandlers,
  ): Promise<void>;
}

export function createChatApi(deps: { authed: AuthedFetch; authedStream: AuthedStream }): ChatApi {
  const { authed, authedStream } = deps;
  return {
    async listConversations(workspaceId) {
      const res = await authed<ConversationListResult>(`/workspaces/${workspaceId}/conversations`);
      return res.conversations;
    },
    createConversation(workspaceId) {
      return authed<CreatedConversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
      });
    },
    listMessages(workspaceId, conversationId) {
      return authed<MessagesResult>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
      );
    },
    /** Persist a pre-composed assistant bubble (e.g. after a receipt-scan log)
     *  without running the chat AI pipeline. */
    appendAssistantNote(workspaceId, conversationId, content) {
      return authed<ChatMessageView>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/notes`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );
    },
    sendMessage(workspaceId, conversationId, content) {
      return authed<ChatResult>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );
    },
    /** POSTs a chat message and streams the reply over SSE, dispatching events to
     *  the handlers. Throws ApiError (429/503/400) before any handler fires if the
     *  stream never starts — callers route that through their normal error path. */
    async streamMessage(workspaceId, conversationId, content, handlers) {
      const res = await authedStream(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages/stream`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported in this environment.');
      const decoder = new TextDecoder();
      let buffer = '';

      const dispatch = (ev: { event: string; data: string }): void => {
        const payload: unknown = ev.data ? JSON.parse(ev.data) : {};
        switch (ev.event) {
          case 'text':
            handlers.onText((payload as { text: string }).text);
            break;
          case 'action':
            handlers.onAction((payload as { action: ChatAction }).action);
            break;
          case 'pending':
            handlers.onPending((payload as { confirmation: PendingConfirmation }).confirmation);
            break;
          case 'done':
            handlers.onDone((payload as { message: ChatMessageView }).message);
            break;
          case 'error':
            handlers.onError(payload as { code: string; message: string; details?: unknown });
            break;
          // 'start' is a no-op marker that the stream has begun.
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const ev of events) dispatch(ev);
      }

      // Defensive flush: our server \n\n-terminates every frame, but if a final
      // frame arrived without the trailing blank line it would otherwise stay
      // buffered and `done` would never fire (hanging the UI). Appending the
      // delimiter is a no-op when the buffer is already empty.
      const { events } = parseSseFrames(buffer + '\n\n');
      for (const ev of events) dispatch(ev);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS — including the streamMessage SSE dispatch test.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:
```ts
export { createChatApi } from './api/chat-api';
export type { ChatApi } from './api/chat-api';
```

- [ ] **Step 6: Recreate the web shim**

Create `apps/web/src/lib/chat-api.ts`:
```ts
import { createChatApi, type AuthedFetch, type AuthedStream } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);
const authedStream: AuthedStream = (p: string, i?: RequestInit) => useAuth.getState().authedStream(p, i);

export const {
  listConversations, createConversation, listMessages, appendAssistantNote, sendMessage, streamMessage,
} = createChatApi({ authed, authedStream });
```

- [ ] **Step 7: Rebuild core and verify web stays green; full gate**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Then the full gate: `pnpm lint && pnpm build`
Expected: all PASS. `pnpm build` is 5/5 (run `pnpm db:generate` first if the Prisma client is not yet generated in this checkout).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/chat-api.ts
git commit -m "refactor(core): migrate chat-api (incl. SSE streaming) to injected factory"
```

---

## Phase 1b Done — What Exists After This Plan

- `@finby/core/src/api/` holds dependency-injected factories for 12 API modules (dashboard, transactions, accounts, streaks, alerts, settings, support, feedback, members, auth, billing, receipts, gamification, chat), all unit-tested in core with mock transports.
- Domain DTOs live in `@finby/shared`; `apps/web/src/lib/types.ts` is a re-export shim.
- The web app consumes every factory through a thin shim bound to its Zustand store, with zero behavior change. All existing web `*-api.test.ts` files still pass against the shims.
- `@finby/core` remains platform-agnostic (ESLint guard intact).

## Excluded / Deferred (intentional, not gaps)

- **`push.ts`** — entirely browser-coupled (serviceWorker / Notification / PushManager). Mobile push is a separate native implementation in Phase 6. Left untouched in `apps/web/src/lib/`.
- **`billing-api.openBillingUrl`** — uses `window.open` / `window.location`; stays in the web `billing-api.ts` shim (the rest of billing migrated).
- **`announcements-api.ts`** — maps server views onto a web presentational `Announcement` type (`apps/web/src/lib/announcements.ts`). Defer until the mobile announcements UI is built; left untouched.
- **`store.ts`** — stays web-specific (Zustand + localStorage persistence). Its `authed`/`authedStream` already delegate to `@finby/core` (Phase 1). A mobile app will implement its own state container that injects the same `AuthedFetch`/`AuthedStream` contracts into these factories.
- **Phase 5 follow-up:** `receipts-api.extractReceipt` keeps a `File` parameter (web). Mobile file upload may need a `Blob`/RN-file shape — revisit when building the mobile receipts flow.

## Next Phase

Phase 2 — scaffold the Expo app (`apps/mobile`): expo-router, NativeWind, EAS, design tokens, native primitives, and the platform adapters (SecureStore token storage, an RN `AuthedStream`/SSE transport, posthog-react-native) that inject into these `@finby/core` factories. Gets its own plan via the writing-plans skill.
