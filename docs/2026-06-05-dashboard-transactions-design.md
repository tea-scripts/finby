# Design — Dashboard + Transactions screens (with app shell)

Date: 2026-06-05
Status: awaiting approval

## Goal
Add exactly two glance-companion screens to the conversational app — a **Dashboard**
(home overview) and a **Transactions** (history) — plus a simple app nav. Chat
stays the front door. **Zero new/changed backend.**

## Non-goals (explicitly deferred)
- Subscription & Billing screen, Profile & Settings screen, profile-edit endpoints.
- Any backend change. If a screen seems to need one → STOP and flag.

## Conventions (mirrors shipped chat)
- Auth: `useAuth` store; hydration-gated guard → `router.replace('/login')`.
- Fetch: store's `authed<T>(path, init)` via thin `lib/*-api.ts` helpers.
- Style: Tailwind v3 + locked tokens; money in `font-mono`. No new deps.
- UI: `components/ui/*` primitives; small presentational pieces; `'use client'` only when stateful.
- States: chat's `ApiError`→notice mapping (429/503/401) + per-section skeletons.

## App shell (route group)
- `app/(app)/layout.tsx` (client): hydration + auth guard (lifted out of chat),
  responsive nav, shared header (`Logo` · user · `NotifToggle` · Sign out).
  Full-height flex; content region `flex-1 min-h-0` so chat fills height and
  dashboard/transactions scroll within.
  - ≥ md: left **sidebar** nav + main column.
  - < md: main column + bottom **tab bar** nav.
- `components/app/app-nav.tsx` (client): `variant: 'sidebar' | 'bar'`, active via
  `usePathname()`. Destinations: **Chat `/chat` (default)**, **Dashboard `/dashboard`**,
  **Transactions `/transactions`** — each an inline SVG icon + label.
- `components/app/app-header.tsx` (client): the header moved out of chat verbatim.
- **Relocate** `app/chat/page.tsx` → `app/(app)/chat/page.tsx`, removing its own
  header + guard (now in the layout). `/chat` URL, default landing, and behavior
  unchanged. `/`, `/login`, `/register` stay outside the group (no nav).

### Guardrail (build step 1)
After relocation, verify chat is unbroken **before** building the screens:
same `/chat` URL, same default landing, same header, same send/receive, same
guard/redirect. Confirm via build + live browser check.

## Screen 1 — Dashboard (`app/(app)/dashboard/page.tsx`)
Fetches fire **in parallel, each with its own loading/error/data state** (not a
single `Promise.all` await) so sections paint as data arrives. Month range =
current-month-start → today (UTC).

Sections (each: skeleton → data | inline error | empty state):
1. **This month** — 4 stat cards from `analytics/summary`: income, expenses,
   net savings, savings rate. Amounts in `font-mono`.
2. **Budgets** — from `budgets`: per category a utilization bar (spent/limit,
   % used), colored by threshold (success <75, warn 75–99, danger ≥100) to
   match the alert thresholds.
3. **Recent transactions** — `transactions?limit=10`: amount (mono, colored by
   type), merchant, category chip, date. "View all" → `/transactions`.
4. **Account balances** — `accounts` (non-archived): name, currency, balance (mono).

`lib/dashboard-api.ts`: `getSummary`, `listBudgets`, `listRecentTransactions`, `listAccounts`.
(`analytics/by-category` is permitted but unused — the 4 listed sections don't need it.)

## Screen 2 — Transactions (`app/(app)/transactions/page.tsx`)
- **Filters** (exactly four): type (`Dropdown`), category (`Dropdown` from
  `GET categories`), date range (two date inputs), currency (`Dropdown`).
  Changing a filter refetches from the start (clears cursor).
- **List**: `GET transactions` with cursor pagination; "Load more" appends the
  next page (no infinite scroll — matches chat's simplicity). Row: date, type,
  amount (mono, colored), merchant, category chip, currency.
- **Edit** (`components/ui/modal.tsx`): click a row → modal editing **only**
  `category` (Dropdown), `merchant`, `description`, `transactionDate`, `tags`
  (comma input) → `PATCH transactions/:id`. (Amount/currency/type are not editable
  — backend doesn't allow it.)
- **Void/delete**: button in the modal → confirm → `DELETE transactions/:id`
  (soft delete); row removed from the list.

`lib/transactions-api.ts`: `listTransactions(query)`, `updateTransaction`, `voidTransaction`, `listCategories`.

Note: backend caps FREE-tier history to a recent window — the screen reflects that as-is.

## Endpoints used (all existing; zero new backend)
- Dashboard: `GET analytics/summary`, `GET budgets`, `GET transactions`, `GET accounts`.
- Transactions: `GET transactions`, `GET categories`, `PATCH transactions/:id`, `DELETE transactions/:id`.

## New / changed files
- New: `app/(app)/layout.tsx`; `components/app/{app-nav,app-header}.tsx`;
  `app/(app)/dashboard/page.tsx` + `components/dashboard/*`;
  `app/(app)/transactions/page.tsx` + `components/transactions/*`;
  `components/ui/{skeleton,modal}.tsx`; `lib/{dashboard-api,transactions-api}.ts`;
  additions to `lib/types.ts`.
- Moved: `app/chat/page.tsx` → `app/(app)/chat/page.tsx` (trimmed).
- Backend: **none.**

## Build order
1. Route group + shell (layout/nav/header) + relocate chat → **verify chat unbroken**.
2. Dashboard → report (endpoints used, zero new backend).
3. Transactions → report (endpoints used, zero new backend).

## Risks
- Height/scroll coordination when chat's header moves to the shared layout (mitigate
  with `flex-1 min-h-0`; verify chat scroll + composer still pinned).
- New `ui/modal` + `ui/skeleton` are the only new primitives — kept consistent with `ui/*`.
