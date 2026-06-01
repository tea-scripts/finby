# Budgy — Data Model Design Decisions
Version: 1.0.0 | Derived from PRD v1.0 (LOCKED)

---

## Architecture: Workspace-First Multi-Tenancy

Every financial entity (`Transaction`, `Budget`, `Account`, `Category`, `PortfolioHolding`, `Conversation`, `Alert`, `FxRateSnapshot`) carries a `workspaceId` foreign key. There are no entities owned directly by a `User`.

**Why:** The PRD locked multi-user Family plan support. Even though Family ships post-MVP, retrofitting multi-tenancy into a user-first schema is the single most painful refactor in SaaS history. We absorb a small upfront complexity cost to avoid a catastrophic future rewrite.

**What this means in the service layer:** Every query is workspace-scoped. `findMany({ where: { workspaceId } })` is the default pattern. No query should ever return financial data without a `workspaceId` filter.

---

## Multi-Currency: The Dual-Amount Pattern

Every monetary record stores **both** the original amount and a base-currency equivalent frozen at entry time.

```
amountOriginal   : the number the user typed (e.g. 2200)
currencyOriginal : the currency they typed (e.g. "PHP")
amountBase       : equivalent in workspace.baseCurrency at entry (e.g. 38.42)
currencyBase     : workspace.baseCurrency at entry time (e.g. "USD")
fxRateUsed       : the rate applied (e.g. 57.26)
fxRateTimestamp  : when that rate was fetched
```

**Why freeze at entry:** FX rates move constantly. If you compute `amountBase` at query time, a transaction logged at 57.26 PHP/USD will show a different USD value six months later when the rate is 59.10. This destroys historical analytics — a month-over-month comparison becomes meaningless. The frozen rate is immutable truth.

**Query pattern for analytics:** `SUM(amountBase)` for cross-currency totals. `amountOriginal` for single-currency views and receipt-level display.

---

## Account Balance: Materialized, Not Computed

`Account.balance` is stored as a column and updated atomically (inside a DB transaction) every time a `Transaction` is saved or voided. It is **not** computed via `SUM(transactions)` at query time.

**Why:** A SUM over potentially thousands of transactions on every balance display would be expensive and gets worse over time. The materialized balance is fast at any scale. The trade-off is that balance updates must be atomic and tested carefully — a failed transaction that partially updates the balance is a critical bug.

**How:** NestJS transaction service wraps `prisma.$transaction([createTransaction, updateAccountBalance])` in every write.

---

## Budget: Pre-Materialized `amountSpent`

Same pattern as Account balance. `Budget.amountSpent` is updated atomically when a transaction in the budget's category and period is saved or voided. Alert thresholds (75%, 90%, 100%) are checked immediately in the same service call.

**Why:** Real-time budget alerts require instant access to current utilization. A SUM query on every transaction write is O(n) and gets worse as transaction history grows. Materialized spend is O(1).

---

## Conversation Memory: Tiered Architecture

The `Conversation` model has:
- `rollingContextSummary`: compressed AI summary of older messages
- `summarizedTokenCount`: token budget tracking
- `messageCount`: total messages (for window calculation)

Each `ConversationMessage` has:
- `isInActiveWindow`: whether this message is included in LLM context injection
- `tokenCount`: approximate token cost

**Free tier (sliding window = 20):**
- Only the 20 most recent messages with `isInActiveWindow = true` are sent to the LLM.
- Older messages have `isInActiveWindow = false`. They are retained in DB for 3 months then purged.
- No `rollingContextSummary` is maintained.

**Pro tier (90-day compressed):**
- Messages older than 90 days: a background job (weekly cron) runs the LLM over them and appends to `rollingContextSummary`. Sets `isInActiveWindow = false` on compressed messages.
- Recent 90 days remain `isInActiveWindow = true`.
- Summary injected into every LLM call before recent messages.

**Premium / Family tier (full dossier):**
- All messages retained forever.
- Background job compresses messages older than 90 days into summary.
- Raw messages remain in DB (not deleted) for full audit/replay.
- Summary grows over time — a cron re-summarizes the summary itself when it exceeds token budget.

**LLM context assembly (all tiers):**
```
[System Prompt — workspace context + financial dossier]
[rollingContextSummary — if exists]
[Recent messages where isInActiveWindow = true]
[Current user message]
```

---

## Investment Events: Immutable Ledger + Materialized Position

`PortfolioHolding` stores the current position (`quantity`, `avgCostBasis`). `InvestmentEvent` stores the immutable history of every action.

**Why both:** The holding gives you O(1) current position. The event ledger gives you full audit trail and enables cost-basis recalculation (e.g. FIFO vs average cost methods in the future). The holding is a materialized view of the event ledger — always derivable from events, but not re-derived on every read.

---

## `aiConfidence` on Transaction

When the LLM extracts a transaction from a user message, it includes a confidence score (0.0–1.0). The service layer checks this:
- `>= 0.85`: auto-confirm, status = `CONFIRMED`
- `0.70 – 0.84`: save as `CONFIRMED` but include a clarification prompt in the response
- `< 0.70`: save as `PENDING`, ask user to confirm before committing

This prevents silent data quality issues when the LLM is uncertain (e.g. "I think I spent around 40 dollars on something yesterday").

---

## `sourceMessageId` on Transaction and InvestmentEvent

Links a financial record back to the conversation message that created it. This enables:
- "Undo" — user says "wait, remove that last transaction" and Budgy can find and void it
- Audit trail — support can trace exactly what was said when a disputed record was created
- Confidence display — UI can show "logged via chat" vs "logged manually"

---

## Index Strategy

Indexes are placed on:
1. All foreign keys (Prisma does NOT add these automatically — they must be explicit)
2. `workspaceId` on every workspace-scoped table (the most frequent filter)
3. Composite indexes for the most common analytics queries:
   - `(workspaceId, transactionDate)` — time-range queries
   - `(workspaceId, type)` — expense vs income splits
   - `(workspaceId, categoryId)` — category-level analytics
   - `(workspaceId, periodStart, periodEnd)` — budget period queries
   - `(workspaceId, userId, status)` — unread alerts per user

---

## What Is Intentionally NOT in This Schema

| Omitted | Reason |
|---|---|
| Bank sync / Plaid integration | Out of scope v1 — manual entry + chat only |
| Crypto portfolio | Post-v1 |
| Recurring transactions | Post-MVP |
| Tax records | Out of scope v1 |
| Shared household splits (who owes whom) | Not in Family plan scope v1 |
| Push notification tokens | Added when PWA push is implemented (Phase 5) |

---

## Migration Strategy

1. Run `prisma migrate dev --name init` to create the initial migration.
2. Seed with default categories per workspace on workspace creation.
3. All subsequent schema changes go through Prisma migrations — **never** raw SQL alterations.
4. Production migrations run via `prisma migrate deploy` in the CI/CD pipeline before the app server restarts.

---

## Next Artifact

**API Contract** — define all NestJS endpoints, request/response shapes, and tool definitions for the LLM tool-calling layer. The schema is the foundation; the API contract is the interface on top of it.
