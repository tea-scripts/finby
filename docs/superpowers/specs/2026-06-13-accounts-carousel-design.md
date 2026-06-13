# Accounts Carousel — Dashboard

**Date:** 2026-06-13
**Status:** Approved design (pending spec review)
**Area:** `apps/web` — Dashboard accounts view

## Summary

Replace the read-only vertical accounts list on the Dashboard (`AccountList`) with a
**swipeable carousel of per-account balance cards** — one card per account, shown in its own
currency, with a circular currency flag and pagination dots. The carousel is a standalone hero
element (no surrounding titled box), preceded by a quiet uppercase "Accounts" legend.

This is a Dashboard-only, presentational change. Account data, fetching, and the read model
(`AccountView`) are unchanged. The Settings → `AccountsSection` remains the place to view and
manage all accounts (active + archived, add/rename/archive).

## Goals

- A glanceable, swipeable view where a user can tell at a glance: "I have $10,000.00 in Chase
  Checking (USD)" and swipe to "$380.00 in Wise (USD)".
- One card per account — **not** aggregated by currency.
- Consistent rendering across every OS/browser (no emoji flags, no native controls), per the
  Finby UI hard-rule.
- Reusable carousel and currency-flag primitives that other features can adopt later.

## Non-goals (out of scope this iteration)

- Aggregating or grouping accounts by currency ("show all USD accounts together"). Parked as a
  future enhancement on the Settings accounts view.
- Any change to the Settings accounts management UI.
- Any backend / API / data-model change.
- Desktop chevron arrows (dots + swipe + keyboard only; chevrons can be added later if needed).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Card granularity | One card per account (not per currency) |
| Card style | Dark card with **full gradient tint** from the account's color |
| Currency badge | **SVG circle flag** (vendored), symbol-in-circle fallback when unmapped |
| Navigation | **Swipe + dots only** + keyboard arrows; no chevrons |
| Placement | **Replace** `AccountList` on the Dashboard |
| Chrome | **Standalone hero card** (no titled box), with a small uppercase "Accounts" legend above |

## Architecture & Components

Four new components plus a vendored flag set. The carousel and flag are generic/reusable and
know nothing about accounts; only the two `dashboard/` pieces are account-aware.

### 1. `components/ui/carousel.tsx` — generic carousel (reusable)

- Renders one slide at a time with pagination dots beneath.
- Interaction: pointer/touch **drag to swipe**, **click a dot** to jump, **←/→ keyboard** when
  focused. No chevron buttons.
- Accessibility: container `role="group"` + `aria-roledescription="carousel"`; each slide
  `role="group"` + `aria-roledescription="slide"` + `aria-label="slide X of N"`; a visually
  hidden `aria-live="polite"` region announces the active slide. Dots are real `<button>`s with
  `aria-label` (e.g. "Go to slide 2") and `aria-current` on the active one.
- API (proposed):
  ```ts
  interface CarouselProps {
    children: React.ReactNode[];      // one node per slide
    ariaLabel: string;                // labels the carousel group, e.g. "Accounts"
    showDots?: boolean;               // default true; caller hides for single slide
    initialIndex?: number;            // default 0
    onIndexChange?: (index: number) => void;
  }
  ```
- Manages its own index internally (uncontrolled); `onIndexChange` is informational.
- Drag threshold: commit to next/prev when drag distance exceeds ~25% of slide width or a
  quick flick; otherwise spring back. Implemented with pointer events (no external dep).
- Keep under 500 lines; no external carousel/animation library.

### 2. `components/ui/currency-flag.tsx` + `components/ui/flags/`

- `CurrencyFlag` props: `{ currency: string; size?: number; className?: string }`.
- Maps currency code → ISO country/region code → a vendored **circular SVG** flag rendered as
  an inline React component (no network request, no runtime dependency).
- `components/ui/flags/` holds the small set of circular SVGs needed for the supported
  currencies (`CURRENCIES` in `@finby/shared`), copied from a permissively-licensed set
  (MIT/CC0 — e.g. `circle-flags`). A `currency → countryCode` map lives alongside.
  - Examples: `USD→us`, `EUR→eu` (EU flag), `GBP→gb`, `PHP→ph`, `NGN→ng`, etc.
- Fallback: if a currency has no mapped flag, render the **currency symbol in a circle**
  (symbol resolved the same way `format.ts` does via `CURRENCIES`), so the component never
  renders blank for any supported or future currency.
- LICENSE/attribution for the vendored flags noted in the `flags/` directory if the source
  requires it.

### 3. `components/dashboard/account-card.tsx` — one slide

- Props: `{ account: AccountView }`.
- Layout (matches the approved mockup):
  - Top-left: "Balance" label (`text-muted`).
  - Balance: large bold, `formatMoney(account.balance, account.currency)` via `useFormatters`.
    Balance stays a decimal string — never parsed to a number.
  - Sub-line: `name · {ACCOUNT_TYPE_LABELS[accountType]}` (`text-faint`).
  - Top-right: `CurrencyFlag` + currency code.
- Gradient tint: `linear-gradient(135deg, <accountColor>20 0%, surface 55%)` with a matching
  translucent border, where `<accountColor>` is `account.color` if set, else the app accent
  (`#1d6ef5`). Helper converts the hex + alpha safely; null/invalid color → accent fallback.
- Rounded `rounded-2xl`, padding consistent with existing cards.

### 4. `components/dashboard/account-carousel.tsx` — dashboard glue

- Props: `{ state: SectionState<AccountView[]> }` (same shape `AccountList` consumes today).
- Filters out `isArchived` accounts (same as current behavior).
- Renders the uppercase "Accounts" legend, then state-dependent content:
  - **loading** → a single skeleton card (reuse `Skeleton`), no dots.
  - **error** → existing `SectionError`.
  - **empty** (no active accounts) → a single placeholder card "No accounts yet" (reuse
    `SectionEmpty` styling inside a card), no dots.
  - **single account** → render the one `AccountCard`, `showDots={false}`.
  - **multiple** → `Carousel` of `AccountCard`s with dots, `ariaLabel="Accounts"`.

### 5. Wiring & cleanup

- `app/(app)/dashboard/page.tsx`: replace `<AccountList state={accounts} />` with
  `<AccountCarousel state={accounts} />`.
- Remove `components/dashboard/account-list.tsx` and `account-list.test.tsx` (no other
  consumers — verified via grep).

## Data flow

Unchanged from today: Dashboard fetches accounts via `listAccounts(workspaceId)` into a
`SectionState<AccountView[]>`; that state is handed to `AccountCarousel` exactly as it is to
`AccountList` now. No new fetching, caching, or API calls.

## Error / edge handling

- Loading, error, empty, single-account, and archived-exclusion behaviors are specified per
  component above.
- Drag/keyboard never navigate past the ends (clamped at slide 0 and N-1).
- Missing/null `account.color` → accent-colored gradient.
- Unmapped currency → symbol-circle flag fallback.

## Testing (test-first, Vitest + Testing Library)

Mirror existing `*.test.tsx` conventions.

- `carousel.test.tsx`: dots render per slide; clicking a dot changes slide; ←/→ keyboard
  navigates and clamps at ends; aria roles/labels and live-region present; `showDots={false}`
  hides dots.
- `currency-flag.test.tsx`: known code renders the mapped flag SVG; unknown code renders the
  symbol fallback; `size`/`className` applied.
- `account-card.test.tsx`: renders formatted balance, name and type label, currency code;
  uses account color for the gradient; falls back to accent when color is null.
- `account-carousel.test.tsx`: loading → skeleton, no dots; error → error message; empty →
  placeholder, no dots; single account → card with no dots; multiple → dots + all cards;
  archived accounts excluded.

Before commit: `npm run test`, `npm run lint`, and the build all pass.

## File checklist

New:
- `apps/web/src/components/ui/carousel.tsx`
- `apps/web/src/components/ui/carousel.test.tsx`
- `apps/web/src/components/ui/currency-flag.tsx`
- `apps/web/src/components/ui/currency-flag.test.tsx`
- `apps/web/src/components/ui/flags/` (vendored circular SVGs + `currency→country` map)
- `apps/web/src/components/dashboard/account-card.tsx`
- `apps/web/src/components/dashboard/account-card.test.tsx`
- `apps/web/src/components/dashboard/account-carousel.tsx`
- `apps/web/src/components/dashboard/account-carousel.test.tsx`

Modified:
- `apps/web/src/app/(app)/dashboard/page.tsx` (swap `AccountList` → `AccountCarousel`)

Removed:
- `apps/web/src/components/dashboard/account-list.tsx`
- `apps/web/src/components/dashboard/account-list.test.tsx`
