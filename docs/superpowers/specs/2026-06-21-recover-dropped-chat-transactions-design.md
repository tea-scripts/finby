# Recover dropped chat transactions + restore streak/XP — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)

## Problem

A chat bug caused some user-reported transactions to never be saved: the LLM
replied "Logged!" but never called the `log_expense` / `log_income` /
`log_transfer` tool, so no transaction row was created. Affected users saw a
confirmation but no transaction, no streak credit, and no XP for that day. The
prompt/tool fix (commit `138ca04`) stops new occurrences; this spec covers
**recovering the transactions already dropped**, without asking end users to
re-log anything, and restoring the streak + XP they should have earned on those
dates.

The affected window is tight (a few days), so reconstruction is tractable and a
human-review gate is practical.

## Key constraints discovered

1. **Dropped turns carry no structured data.** Because the tool was never
   called, no `TOOL_CALL` row was written — there is no stored
   `{amount, currency, category, date}`. The only evidence is the user's free
   text and the assistant's *fabricated* confirmation (which is unreliable: it
   conflates and hallucinates). Reconstruction is therefore **approximate** and
   must be reviewed before committing.
2. **Streak and the activity calendar key off the logging time, not
   `transactionDate`.** `StreaksService.onTransactionLogged` uses `new Date()`
   and the calendar derives active days from `Transaction.createdAt`. So a
   backdated insert today will not, by itself, restore a past streak day or land
   on the correct calendar square. There is no existing streak-recompute method.
3. **"XP for logging a transaction" = `STREAK_DAY` XP.** `TRANSACTION_LOGGED` is
   defined in the XP constants but never awarded in live code; logging a
   transaction earns `STREAK_DAY` (× tier multiplier), plus `STREAK_MILESTONE`
   on milestone days. Daily-login XP is separate and was almost certainly
   already covered by the earlier active-users backfill (a chat message existed
   on the dropped day), so it is verified, not redone.

## Approach (chosen)

A CLI recovery script that mirrors the existing
`apps/api/prisma/backfill-daily-login-xp.ts` conventions:

- Connects via `DIRECT_DATABASE_URL` (falls back to `DATABASE_URL`).
- **Dry-run by default**; `--commit` to write.
- Configurable window (`--since=YYYY-MM-DD`, default: last 7 days — generous
  margin over the ~3-day bug window; idempotency makes the wider scan safe).
- Idempotent and re-runnable.
- Prints a full review report.

Reconstruction uses **LLM replay** (re-run the real extraction on the original
user message) with **operator review** of the dry-run report before `--commit`.
Streak restoration uses **full per-user recompute** (approach A), scoped to
affected users only.

Non-trivial logic lives in small, unit-tested modules under `src/`; the CLI
script in `prisma/` is a thin orchestration wrapper.

### Considered and rejected

- **Parse the assistant's "Logged!" text** — inherits the model's
  hallucinations/conflation; less faithful than replaying the user's message.
- **Audit-list only (manual entry)** — safest but pushes manual work onto the
  team; the user wants recovery without manual re-logging, and the dry-run
  review gate already provides the safety.
- **Targeted streak day-restore (B)** — "adjust counters" math is error-prone
  when a restored day bridges two streak segments.
- **Replay `onTransactionLogged` with a mocked "now" (C)** — order-dependent and
  fights the user's current `lastStreakDate`; brittle.

## Phases

### Phase 1 — Detect dropped turns

Scan `ConversationMessage` in the window. Within each conversation, a *turn*
runs from a `USER` message to the next `USER` message. A turn is a **drop
candidate** if it contains no successful logging tool call — i.e. no `TOOL_CALL`
for `log_expense` / `log_income` / `log_transfer` that produced a `TOOL_RESULT`
with a non-null `createdTransactionId`.

**Idempotency:** skip the user message if a `Transaction` already exists with
`sourceMessageId` equal to that message's id — this covers both
already-logged-normally and already-recovered turns. (Implementation note:
verify exactly what `sourceMessageId` points to in the normal logging path
during build; the recovered row sets `sourceMessageId` = the user message id and
a `chat-recovery` tag as belt-and-suspenders.)

Pure function `detectDroppedTurns(messages)` → unit-tested.

### Phase 2 — Reconstruct via LLM replay

For each candidate, re-run the real `log_*` extraction: the LLM plus the logging
tool definitions, scoped to **that workspace's accounts and categories** and the
user's timezone, with **"today" pinned to the original message's local date**
(not the current date) so relative dates ("today"/"yesterday") resolve to the
day the user actually spoke.

- If the model returns a `log_*` tool call → reconstruct
  `{type, amount, currency, category, merchant, account, date, confidence}`.
- If the model returns **no** tool call (the message was not a logging intent,
  e.g. a question or correction) → **skip** (not a dropped transaction).
- Low-confidence or ambiguous-currency reconstructions are **flagged** in the
  report for extra operator scrutiny (still listed, not auto-dropped).

### Phase 3 — Insert recovered transactions (`--commit` only)

Reuse `TransactionsService.create()` for financial correctness (FX conversion to
base currency, account-balance delta, budget-spend update), with two minimal,
**opt-in** additions whose defaults preserve current behavior:

- `createdAt?: Date` — set to the original local day so the streak/calendar
  place the row on the correct date.
- `skipEngagement?: boolean` — when true, suppress the now-based
  `onTransactionLogged` streak/XP side-effect; Phase 4 owns streak/XP.

Recovered rows are tagged `chat-recovery` and carry `sourceMessageId` for
idempotency and audit. Covered by a unit test asserting the new params behave
and defaults are unchanged.

### Phase 4 — Restore streak + XP (`--commit` only), affected users only

- **Streak counters: full recompute.** Extract a pure, unit-tested
  `computeStreakFromActiveDays(activeDates, today)` →
  `{currentStreak, longestStreak, lastStreakDate}`. Recompute from the user's
  active-day set (now including recovered rows, keyed on local
  `createdAt` date to match existing calendar semantics) and update the `User`
  row. Correct for any gap pattern.
- **XP: targeted to recovered dates only.** For each recovered date, award
  `STREAK_DAY` (× tier) if no `XpTransaction` exists for that `meta.date`, and
  `STREAK_MILESTONE` if the recomputed streak makes that date a milestone day —
  both idempotent via `meta`. This bounds XP changes to exactly the dropped days
  and will not retroactively inflate XP for unrelated historical gaps. Mirrors
  the daily-login backfill's `XpTransaction.create` + `UserXp.upsert` pattern.

### Phase 5 — Daily-login XP check

For each recovered date, verify the user already has `DAILY_LOGIN` XP (the
earlier active-users backfill likely covered it). Report any gap and award it
idempotently using the same mechanism as the daily-login backfill, so "XP for
that date" is fully whole.

### Report (dry-run output)

Per user / conversation:
- each detected dropped turn (user text + the assistant's claim),
- its reconstructed transaction (`type`, amount, currency, category, merchant,
  date, confidence, flags),
- the before→after streak (`currentStreak` / `longestStreak`), and
- the exact XP that would be awarded (event, delta, date).

Plus totals. The operator reviews this, then runs `--commit`.

## Testing

Unit tests (mirroring existing `*.spec.ts`), with the LLM replay mocked:

- `detectDroppedTurns` — given a message sequence, identifies dropped turns and
  respects the `sourceMessageId` idempotency skip.
- `computeStreakFromActiveDays` — current/longest/last from an active-day set,
  including bridged gaps and today/yesterday boundary rules.
- Relative-date resolution — "today"/"yesterday" resolve against the message's
  local date, not now.
- XP reconciliation idempotency — no duplicate `STREAK_DAY` / `STREAK_MILESTONE`
  / `DAILY_LOGIN` award for a date already credited.
- `TransactionsService.create()` `createdAt` / `skipEngagement` params — behave
  when set, defaults unchanged.

CLI orchestration stays thin and is exercised manually via dry-run.

## Operational notes

- Runs in the Render shell; requires `DIRECT_DATABASE_URL` and
  `ANTHROPIC_API_KEY` (for replay) in the environment.
- Always dry-run first and review the report.
- Re-runnable safely (idempotent on `sourceMessageId` and XP `meta.date`).

## Out of scope

- The underlying prompt/tool fix (already shipped, commit `138ca04`).
- Enabling `TRANSACTION_LOGGED` XP (product decision; not awarded in live code).
- Any global streak recompute beyond affected users.
