# Mobile Phase 5c — Transactions List & Edit

**Date:** 2026-06-25
**Status:** Approved design (pre-plan)
**Scope:** Replace the Transactions tab placeholder with a full, native transactions
experience: a day-grouped, infinitely-scrolling list with filters and an edit
sheet. Goal is to **beat the PWA** on flow, UI, and motion — not mirror it.

---

## 1. Goal & Context

The Transactions tab currently shows a "Coming soon" placeholder
(`transactions-placeholder-screen.tsx`, from slice 5a). This slice builds the real
screen, backed by the already-bound `api.transactions`
(`listTransactions`/`updateTransaction`/`voidTransaction`/`listCategories` — see
`apps/mobile/src/lib/api.ts`). No API/core changes.

**PWA reference** (`apps/web/src/app/(app)/transactions/page.tsx` + the
`components/transactions/*` and the custom `components/ui/date-picker.tsx`): a
4-control filter grid, a flat list with a per-row date, a **"Load more"** button,
and a center **edit modal**.

**Where we beat it** (decided with the user):
1. **Day-grouped** list (Today / Yesterday / "Thu, Jun 5" headers) — not a date on
   every flat row.
2. **Infinite scroll** + **pull-to-refresh** — not a "Load more" button.
3. **Staggered entry animation** on rows (RN `Animated`).
4. **Cleaner filters**: an always-visible **segmented Type** control + a **filter
   bottom sheet** (Category, Currency, date **presets + custom range**) with an
   active-filter count badge.
5. **Edit as a slide-up bottom sheet** (native feel), not a center modal.

**Non-goals:** receipt scanner (camera — deferred to a later phase), creating
transactions from this screen (chat already does that), swipe-to-delete gestures
(Reanimated/worklets are disabled in Expo Go — would need a dev build), and any
backend change.

---

## 2. Constraints (verified in the codebase)

- **No Reanimated in Expo Go**: `babel.config.js` sets `worklets:false, reanimated:false`. All motion uses RN core `Animated` (works in Expo Go). No `react-native-gesture-handler` swipe rows.
- **No `DatePicker`/`BottomSheet` primitives yet** — both are built here, brand-consistent (our tokens, our `Modal`/Dropdown patterns). **No native date control** — the user requires a custom, on-brand picker (mirrors the project's web hard-rule).
- **Existing primitives reused**: `Button`, `Input`, `Field`, `Dropdown`, `CurrencyFlag` (`src/components/ui/`).
- **Formatting/data from `@finby/core`**: `money`, `shortDate`, `dayLabel`, `dayKey`, `currentMonthRange`. **Types from `@finby/shared`**: `Transaction`, `TransactionQuery`, `TransactionPatch`, `Category`.
- **jest-expo test conventions** (mock store/api/`expo-router`/safe-area; `await` every `fireEvent`; mock native deps; no JSX in `jest.mock` factories) — per the `mobile-app-architecture` memory.
- **Commit rule (HARD)**: no AI-attribution trailers; atomic commits.

---

## 3. New Reusable Primitives

### 3.1 `BottomSheet` (`src/components/ui/bottom-sheet.tsx`)
RN core `Modal` (`transparent animationType="none"`) with a custom **`Animated`
slide-up** panel + a fading scrim. Props: `open`, `onClose`, `title?`, `children`.
- Scrim `Pressable` closes on tap; panel anchored to the bottom, `bg-surface`,
  rounded top corners, a grab handle, safe-area bottom padding.
- Slide: `Animated.timing` translateY (panel height → 0) on open, reverse on close;
  scrim opacity 0→1. `useNativeDriver: true`.
- Content scrolls if tall (`ScrollView`, `keyboardShouldPersistTaps="handled"`).

### 3.2 `SegmentedControl` (`src/components/ui/segmented-control.tsx`)
A pill row of options with a sliding accent indicator (RN `Animated` translateX,
same technique as the floating tab bar). Props:
`options: {value, label}[]`, `value`, `onChange`. Used for the Type filter.

### 3.3 `DatePicker` (`src/components/ui/date-picker.tsx`)
Custom, brand-consistent calendar — a port of the web's
`components/ui/date-picker.tsx`. A trigger (looks like our `Input`: formatted date
or placeholder + a calendar glyph) opens a `BottomSheet` containing a month-nav
header (‹ "June 2026" ›) and a 7-column day grid; the selected day is the accent
pill. Value is an ISO `'YYYY-MM-DD'` string. **Timezone-safe** date math is ported
verbatim (`parseISO`/`toISO`/`daysInMonth`/`firstWeekday` — never `new Date(str)`).
Pure helpers live in `src/lib/calendar.ts` (unit-tested with Vitest).

---

## 4. Transactions Feature

### 4.1 Pure logic (`src/lib/transactions-view.ts`, Vitest)
- `groupByDay(txs: Transaction[]): { key: string; title: string; data: Transaction[] }[]`
  — preserves input order (the API returns newest-first), groups consecutive
  same-day items using `dayKey`, titles via `dayLabel` (Today/Yesterday/date).
- `DATE_PRESETS` + `presetRange(preset, now): { fromDate?: string; toDate?: string }`
  — `THIS_MONTH` (current-month range), `LAST_MONTH`, `LAST_90`, `ALL` (no dates),
  `CUSTOM` (caller supplies). `now` is injected for testability.
- `activeFilterCount(query): number` — counts set Category/Currency/date filters
  (drives the filter button's badge; Type is excluded — it's always visible).

### 4.2 `TransactionRow` (`src/components/transactions/transaction-row.tsx`)
A `Pressable` row: `merchant ?? description ?? 'Transaction'`, a category chip +
tag chips (muted/accent pills), and a right-aligned **mono** (Menlo) signed toned
amount (`+`/success for INCOME, `−`/danger for EXPENSE, plain for TRANSFER), from
`money(amountOriginal, currencyOriginal)`. `onPress` opens the edit sheet.

### 4.3 `TransactionFiltersSheet` (`src/components/transactions/transaction-filters-sheet.tsx`)
A `BottomSheet`: **Category** `Dropdown` (All + non-archived), **Currency**
`Dropdown` (workspace `preferredCurrencies` ?? `CURRENCY_CODES`, + All), **Date**
preset `SegmentedControl`/row (This month · Last month · Last 90 days · All · Custom)
→ Custom reveals two `DatePicker`s (From/To). "Apply" / "Reset". Type is NOT here
(it's the always-visible segmented control on the screen).

### 4.4 `EditTransactionSheet` (`src/components/transactions/edit-transaction-sheet.tsx`)
A `BottomSheet` titled "Edit transaction": a read-only `type · amount currency`
line (amount/currency aren't editable — same as web), then `Category` `Dropdown`,
`Merchant` `Input`, `Description` `Input`, `Date` `DatePicker`, `Tags` `Input`
(comma-separated). Footer: **Void** (tap → "Confirm void", danger) on the left;
**Cancel** / **Save** on the right. Calls `updateTransaction(patch)` /
`voidTransaction`; surfaces an inline error; reports `onSaved(tx)` / `onVoided(id)`.

### 4.5 `TransactionsScreen` (`src/screens/transactions-screen.tsx`)
- State: `filters: TransactionQuery` (default `presetRange('THIS_MONTH')` + the
  current Type), items, cursor, hasMore, loading, loadingMore, refreshing, error,
  categories, editing, filtersOpen.
- **Type**: an always-visible `SegmentedControl` (All / Expense / Income / Transfer)
  under the header; changing it updates `filters.type` and reloads page 1.
- **Filter button** (header, with active-count badge) opens `TransactionFiltersSheet`.
- **List**: `SectionList` of `groupByDay(items)` with sticky day headers and
  `TransactionRow`s; `onEndReached` → `loadMore()` (cursor); `RefreshControl` →
  reload page 1; `ListFooterComponent` spinner while `loadingMore`.
- **States**: skeleton rows while `loading`; inline error + Retry; empty state
  ("No transactions match these filters.") when `items` is empty.
- **Entry animation**: each row mounts with a short `Animated` fade + translateY,
  staggered by index within the first page (cap the stagger so deep pages don't
  delay).
- Categories loaded once (for filter + edit pickers). Edits update the item
  in-place; voids remove it. Bottom padding via `useTabBarSpace()` (floating nav).
- **Route**: `app/(app)/transactions.tsx` re-exports `TransactionsScreen` as
  default (replacing the placeholder; delete `transactions-placeholder-screen.*`).

---

## 5. Testing

- **Pure logic** (Vitest): `transactions-view.ts` (`groupByDay` ordering/labels,
  `presetRange` for each preset with an injected `now`, `activeFilterCount`) and
  `calendar.ts` (`parseISO`/`toISO`/`daysInMonth`/`firstWeekday`, incl. leap year).
- **Primitives** (RNTL): `SegmentedControl` (renders options, fires onChange);
  `BottomSheet` (renders children when open, scrim closes); `DatePicker` (opens,
  month nav, selecting a day fires `onChange` with the ISO string).
- **Feature** (RNTL): `TransactionRow` (label/amount/sign/tone, onPress);
  `TransactionFiltersSheet` (apply/reset, custom range reveal);
  `EditTransactionSheet` (save calls `updateTransaction` with the patch; void→
  confirm→`voidTransaction`); `TransactionsScreen` (mock `api.transactions`:
  renders grouped rows, type segment reloads, infinite scroll appends, empty/error).
- **Gate**: `pnpm --filter finby-mobile test` (vitest + jest), `tsc --noEmit` (run
  the `expo start` typegen first — no new routes, but safe), `pnpm lint` (0 errors),
  headless `expo export:embed` → 0 `SharedArrayBuffer.prototype`.

---

## 6. Risks & Notes

- **SectionList + sticky headers + infinite scroll**: ensure `onEndReached`
  doesn't double-fire (guard on `loadingMore`/`hasMore`); `keyExtractor` by tx id.
- **BottomSheet keyboard**: the edit sheet has inputs — the panel must avoid the
  keyboard (`KeyboardAvoidingView` inside, or shift on `Keyboard` events).
- **DatePicker correctness**: port the timezone-safe math verbatim; cover a leap
  February in tests.
- **Animation pristine-ness**: `Animated` with `useNativeDriver` must not warn in
  jest (the unlock screen already uses this pattern — follow it).
- **Placeholder removal**: delete `transactions-placeholder-screen.tsx` + its test;
  no other references (only the route file imports it).
- **Out of scope reminders**: no receipt scanner, no swipe gestures, no create-tx.
