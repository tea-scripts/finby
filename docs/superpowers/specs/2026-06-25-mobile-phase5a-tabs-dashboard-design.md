# Mobile Phase 5a + 5b — Tab Shell + Dashboard

**Date:** 2026-06-25
**Status:** Approved design (pre-plan)
**Scope:** First slice of Phase 5 (feature-parity screens). Adds the bottom-tab
navigation shell and the read-only Dashboard screen. Transactions, Streaks, and
Billing are explicitly **out of scope** here — each is its own later slice.

---

## 1. Goal & Context

Finby mobile (`apps/mobile`, Expo SDK 54, expo-router, NativeWind) currently has
Chat as the `(app)` landing and a single stacked Settings screen reached via a
gear in the chat header. There is **no tab navigator**.

This slice:
- **5a** — converts `(app)` into an Expo Router **`Tabs`** navigator that mirrors
  the web's four-item nav (`apps/web/src/components/app/app-nav.tsx`):
  **Chat · Dashboard · Transactions · Settings**.
- **5b** — builds the **Dashboard** screen, porting the web dashboard
  (`apps/web/src/app/(app)/dashboard/page.tsx`) natively.

All dashboard data already exists in `@finby/core` (`createDashboardApi`) and is
already bound on the mobile session as `api.dashboard.*` (see
`apps/mobile/src/lib/api.ts`). No API, transport, or `@finby/core` changes are
needed.

**Non-goals:** Transactions list/filters/edit (5c), interactive Streaks
calendar/sheet (5d), Billing/IAP (5e), offline support (deferred project-wide),
any backend change.

---

## 2. Navigation Architecture (5a)

### 2.1 Route restructure

`(app)/_layout.tsx` changes from a `Stack` to a `Tabs` navigator, still wrapped
by the existing `AppLockGate` (the PIN/biometric lock continues to gate the whole
authed area). Resulting tree:

```
app/(app)/
  _layout.tsx        AppLockGate → <Tabs ...>      (lock wraps all tabs)
  index.tsx          Chat         — tab 1 (default landing, unchanged screen)
  dashboard.tsx      Dashboard    — tab 2 (NEW route → <DashboardScreen/>)
  transactions.tsx   Transactions — tab 3 (NEW route → placeholder, see 2.4)
  settings.tsx       Settings     — tab 4 (existing screen, now a tab)
```

- **Chat stays the default tab** (`index`), preserving the current landing and the
  established "chat is the `(app)` landing" decision. The root gate's
  `nextRoute()` continues to return `/(app)`, which resolves to the first tab.
- Each `app/(app)/*.tsx` route file stays a thin re-export wrapper around a
  component in `src/screens/` (the project's existing convention; test files must
  never live under `app/`).

### 2.2 Chat header cleanup

With Settings promoted to a tab, the **gear icon in the chat header is removed**
(it's now redundant). The chat header keeps the `Wordmark` logo + "New chat".
The `router.push('/settings')` call and its `Pressable` are deleted from
`chat-screen.tsx`. (The settings screen itself is unchanged.)

### 2.3 Tab bar visual (Instagram-style, per user reference)

Reference: Instagram's bottom nav — icons only, edge-to-edge, dark, with the
active icon filled and sitting on a subtle rounded highlight.

- Default `Tabs` bar (edge-to-edge, safe-area aware) themed to our dark palette.
- **`tabBarShowLabel: false`** — icons only (no text). Icons are explicit enough.
- **Active** tab: the **filled** Ionicon in accent `#1d6ef5`, rendered on a soft
  accent rounded-pill background (`bg-accent-soft`, rounded-full/`rounded-2xl`).
  **Inactive**: the **outline** Ionicon in `muted`.
- Implemented via a small custom `tabBarIcon` wrapper component (filled vs
  outline by `focused`, pill background when `focused`) — NOT a fully custom
  `tabBar`. Bar background = `surface`/`canvas` token with a hairline top border;
  `tabBarActiveTintColor`/`tabBarInactiveTintColor` set from tokens.
- Icon set (Ionicons via `@expo/vector-icons`, already a dependency):
  | Tab | Outline | Filled |
  |---|---|---|
  | Chat | `chatbubble-ellipses-outline` | `chatbubble-ellipses` |
  | Dashboard | `grid-outline` | `grid` |
  | Transactions | `receipt-outline` | `receipt` |
  | Settings | `settings-outline` | `settings` |

### 2.4 Transactions placeholder

Tab 3 renders a minimal **"Coming soon"** placeholder screen
(`src/screens/transactions-placeholder-screen.tsx`): centered icon + title +
one-line subtitle, on `bg-canvas`. Keeping all four tabs from the start locks the
bar's final shape (no re-layout when 5c lands) and reads better than three icons.
Slice 5c replaces this screen's body.

---

## 3. Dashboard Screen (5b)

Native port of `apps/web/src/app/(app)/dashboard/page.tsx`. New
`src/screens/dashboard-screen.tsx` + section components under
`src/components/dashboard/`.

### 3.1 Layout

```
SafeAreaView (top), bg-canvas, scrollable (RefreshControl)
  Header row:  "Dashboard"            [StreakBadge]
  MonthSummary
  Budgets
  Accounts (horizontal carousel)
  Recent transactions
```

Single vertical `ScrollView`/`FlatList`-free scroll (sections are few and fixed);
sections stack vertically (no web two-column grid). A `SectionCard` wrapper gives
each section a consistent title + surface treatment.

### 3.2 Data loading model

Mirror the web `SectionState<T> = { data, loading, error }` pattern (the type
already exists in `@finby/core` `DashboardApi` module, re-exported as
`SectionState`). On mount (workspace known), fire **four independent parallel
fetches** so each section paints as its own data arrives; one section failing
never blanks the others:

| Section | Call | Notes |
|---|---|---|
| MonthSummary | `api.dashboard.getSummary(wsId, from, to)` | `from/to` from `currentMonthRange()` (`@finby/core`) |
| Budgets | `api.dashboard.listBudgets(wsId)` | `BudgetView[]` |
| Accounts | `api.dashboard.listAccounts(wsId)` | `AccountView[]` |
| Recent | `api.dashboard.listRecentTransactions(wsId, 10)` | `Transaction[]` |

A guard (`useRef`) prevents duplicate initial fetches (as web does). Workspace +
user come from `useAuthStore`.

### 3.3 Sections & data shapes

All types from `@finby/shared`. Formatting via `@finby/core`: `money(amount,
currency)` for amounts, `shortDate(iso)` for dates.

- **MonthSummary** — `SummaryResult` (`totalIncome`, `totalExpenses`,
  `netSavings`, `savingsRate`, `currency`, `transactionCount`). Shows income /
  expenses / net for the current month with the savings rate.
- **BudgetList** — `BudgetView[]`: per budget show `category.name`,
  `amountSpent`/`amountLimit` (via `money`), and a progress bar from
  `utilizationPercent` (color shifts as it approaches/exceeds 100%). Empty → "No
  budgets yet."
- **AccountCarousel** — `AccountView[]`: horizontal paged scroll of `AccountCard`s
  showing `name`, `accountType`, `balance` (via `money` with `currency`), tinted
  by `color` when present (fallback accent). Archived (`isArchived`) excluded.
  Empty → "No accounts yet."
- **RecentTransactions** — `Transaction[]` (read-only rows): `merchant ??
  description ?? category?.name`, `transactionDate` (via `shortDate`), and amount
  (`money(amountBase, currencyBase)`) signed/colored by `type`. Rows are **not
  tappable in this slice** (edit lands in 5c). Empty → "No transactions yet."
- **StreakBadge** — read-only: a flame glyph + `user.currentStreak` count
  (`showZero`). No calendar/sheet/start-prompt here (those are 5d).

### 3.4 Per-section states

Every section renders one of: **loading** (lightweight skeleton/spinner inside
the `SectionCard`), **error** (inline "Could not load this section." + a small
**Retry** that re-runs just that section's fetch), **empty** (section-specific
copy above), or **data**.

### 3.5 Pull-to-refresh

The scroll view uses a `RefreshControl`; pulling re-runs all four fetches
(resetting each to loading). This is the one deliberate enhancement beyond strict
web parity (standard mobile expectation).

---

## 4. Components & Files

**New** (`src/components/dashboard/`): `section-card.tsx`, `month-summary.tsx`,
`budget-list.tsx`, `account-carousel.tsx` (+ `account-card.tsx`),
`recent-transactions.tsx` (+ row), `streak-badge.tsx`.
**New screens** (`src/screens/`): `dashboard-screen.tsx`,
`transactions-placeholder-screen.tsx`.
**New routes** (`app/(app)/`): `dashboard.tsx`, `transactions.tsx`.
**New nav** (`src/components/nav/`): `tab-bar-icon.tsx` (focused/pill wrapper).
**Modified:** `app/(app)/_layout.tsx` (Stack→Tabs), `src/screens/chat-screen.tsx`
(remove gear), `app/(app)/settings.tsx` (unchanged screen, now a tab — verify it
still resolves).

Reused as-is: `useAuthStore`, `api.dashboard.*`, `@finby/core` `money` /
`shortDate` / `currentMonthRange` / `SectionState`, existing `ui/` primitives.

---

## 5. Testing

Follow the established jest-expo conventions (mock store via `mock`-prefixed
shared object; mock `expo-router`; `await` every `fireEvent`; no JSX in
`jest.mock` factories — see `mobile-app-architecture` memory).

- **Section components** (RNTL): `MonthSummary`, `BudgetList`, `AccountCarousel`,
  `RecentTransactions`, `StreakBadge` each tested with sample data **and**
  loading / error / empty states.
- **DashboardScreen** (RNTL): mock `api.dashboard.*` (success + one section
  rejecting) → assert sections render independently and a failed section shows
  its error + Retry without blanking the others; assert pull-to-refresh re-fetches.
- **Tab layout** (jest-expo): smoke render of `(app)/_layout` — four tabs present,
  labels hidden, Chat default.
- **Transactions placeholder**: smoke render shows "Coming soon" copy.
- No new pure helpers (formatters/`currentMonthRange` already covered in
  `@finby/core`).

**Gate (must stay green):** `pnpm --filter finby-mobile test` (vitest + jest),
`tsc --noEmit` (run `expo start` typegen first — new routes change
`router.d.ts`; see typedRoutes gotcha), `pnpm lint` (0 errors), and the headless
bundle export sanity (`expo export:embed` → 0 `SharedArrayBuffer.prototype`).

---

## 6. Risks & Notes

- **typedRoutes regen:** adding `dashboard`/`transactions` routes changes the
  generated `apps/mobile/.expo/types/router.d.ts`. Run
  `EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port <p>` once before `tsc`, else tsc
  errors that the new hrefs aren't valid `Href`. Extend `nextRoute()`'s
  `GateRoute` union only if a tab becomes a gate target (not expected — gate still
  targets `/(app)`).
- **Settings as a tab:** confirm the existing `settings.tsx` screen renders fine
  inside `Tabs` (it was previously a pushed stack screen; no back button now —
  acceptable, it's a root tab).
- **Account `color`/`icon`:** `color` is a hex string or null; `icon` is a string
  or null. Use `color` for tinting with an accent fallback; ignore `icon` for now
  (no icon-name→glyph mapping in this slice).
- **Out of scope reminders:** recent-transaction rows are non-tappable here;
  streak badge is display-only here.
