# Mobile Billing — PWA-parity redesign (Phase 5e redesign)

Date: 2026-07-01
Status: Approved (design)
App: `apps/mobile` (Expo SDK 54, RN 0.81, expo-router, NativeWind)

## 1. Goal

Replace the Phase 5e dedicated subscription **page** with the PWA's inline pattern:
the user sees their **current plan inline in Settings**, and "Change plan"/"Upgrade"
opens a **swipeable carousel** of all plans (current plan included). This kills the
"navigate to a page just to see your plan" UX. Purchase/management still hands off
to the web + Stripe portal via `Linking` — **no in-app purchase** (unchanged App
Store 3.1.1 stopgap from 5e; real StoreKit/RevenueCat IAP remains the deferred,
blocked slice).

## 2. ⚠️ App Store compliance note (load-bearing, unchanged from 5e)

Every upgrade/change CTA opens `WEB_BILLING_URL = 'https://chat.finby.app/settings'`
(the web app, where the web `UpgradeModal` lives) via `Linking.openURL`. This is an
App Store **3.1.1 "steering" pre-submission stopgap** — must be revisited before any
App Store submission (StoreKit/RevenueCat IAP, or removed). The carousel copies the
PWA carousel's *look*, but its card CTAs do NOT call `startCheckout`/`changePlan`
on device — they close the sheet and `Linking` out to the web. "Manage Billing"
(paid + Stripe) opens the Stripe-hosted portal (no in-app login) and is fine.

## 3. How the PWA works (source of truth — read from the code)

- **`apps/web/src/components/billing/PlanCard.tsx`** (inline in `settings/page.tsx`):
  fetches `getSubscription`. FREE → "Current Plan" header + `TierBadge`, free-limit
  rows derived from `TIER_LIMITS.FREE` (AI messages, currencies, transaction history,
  custom categories, members), the `PLAN_FEATURES.FREE.limitation` callout, an
  "Upgrade to Pro" button (opens `UpgradeModal`), and a collapsible **Compare plans**
  table. Paid → header + badge, `condensedFeatures(tier)` rows, billing dates
  (`currentPeriodEnd` → "Next billing date", `cancelAtPeriodEnd`, `pendingTier` +
  `pendingTierEffectiveAt`), a "Change plan" button (opens `UpgradeModal`), a
  "Manage Billing" button (Stripe only → `openPortal` → external URL), and the same
  Compare toggle.
- **`apps/web/src/components/billing/UpgradeModal.tsx`**: a swipeable **carousel** of
  PRO/PREMIUM/FAMILY cards (snap-x, neighbours peek at ~6% edge inset, focused card
  full / others `opacity-50`, position dots that widen for the active tier, ‹ ›
  arrows, ArrowLeft/Right keyboard nav). Each card: tier name, `plan.priceDisplay`,
  `PlanFeatureList` for `PLAN_FEATURES[tier]`, and a per-card CTA. In manage mode the
  current tier's card shows "Current plan" (disabled); other cards show "Upgrade
  to…"/"Switch to…" with proration notes, calling `startCheckout`/`changePlan`.
- **`CompareTable`** (inside `PlanCard.tsx`): a Free/Pro/Premium/Family × features grid
  built from `TIER_LIMITS` (`COMPARE_FEATURES`: AI messages/day, currencies, history,
  portfolio, AI coaching, streak repair, members, data export).

## 4. What the mobile app already has (reuse)

- `src/components/billing/{plan-feature-row,plan-card,current-plan}.tsx` (from 5e).
- `src/components/ui/bottom-sheet.tsx` — RN core Modal + Animated rise + scrim (no
  reanimated), the sheet container for the carousel.
- `src/components/dashboard/*` `AccountCarousel` — the reference swipe pattern
  (horizontal snap `ScrollView`, `Animated` scale/opacity on focus, widening dots).
- `@finby/shared`: `TIER_LIMITS`, `TIER_PRICING`/`formatTierPrice`, `PLAN_FEATURES`/
  `condensedFeatures`, `SubscriptionTier`, `SubscriptionView`.
- `api.billing.getSubscription` / `api.billing.openPortal` (bound on mobile).

## 5. What gets removed

- `src/screens/subscription-screen.tsx` + `subscription-screen.test.tsx`.
- `app/(app)/subscription.tsx` route + the hidden `<Tabs.Screen name="subscription"
  options={{ href: null }} />` line in `app/(app)/_layout.tsx`. Regenerate
  `apps/mobile/.expo/types/router.d.ts` so `/subscription` is no longer a valid Href.
- `WEB_BILLING_URL` migrates from the deleted screen into a shared
  `src/lib/billing-links.ts` (needed by the Settings card + the chat notice path).
- The 5e `PlanCard` (single-tier card, name/price/features) is **extended** into the
  carousel deck card (adds per-card CTA + "Current plan" marker + focus styling);
  the 5e `CurrentPlan` is **extended** into `CurrentPlanCard`.

## 6. Components & files

### 6.1 `src/lib/billing-links.ts`
`export const WEB_BILLING_URL = 'https://chat.finby.app/settings';` plus a helper
`openWebBilling()` that does `Linking.openURL(WEB_BILLING_URL).catch(() => {})`.

### 6.2 `src/components/billing/current-plan-card.tsx` (extends 5e `CurrentPlan`)
`CurrentPlanCard({ onChangePlan, onManage, managing })` — the inline card for Settings.
- Fetches nothing itself; receives `sub: SubscriptionView` (Settings owns the fetch +
  section state) — same shape as the 5e `CurrentPlan` props, plus a compare toggle.
- FREE: "Current Plan" header + tier badge; **free-limit rows** from `TIER_LIMITS.FREE`
  (mobile port of `FREE_LIMIT_ROWS`); the `PLAN_FEATURES.FREE.limitation` callout;
  an "Upgrade to Pro" button → `onChangePlan()`; a "Compare plans" toggle → renders
  `<CompareTable/>`.
- Paid: header + badge; `condensedFeatures(tier)` via `PlanFeatureRow`; billing-date
  lines; a "Change plan" button → `onChangePlan()`; "Manage Billing" (Stripe only,
  `loading={managing}`) → `onManage()`; the same Compare toggle.
- A small `TierBadge` (subscription tiers) is added under `src/components/ui/` (or a
  local styled label) — mobile has no subscription `TierBadge` yet (the streak
  `TierChip` is for achievement tiers, not reused here).

### 6.3 `src/components/billing/compare-table.tsx`
`CompareTable()` — a horizontally-scrollable native grid: a header row (Feature / Free
/ Pro / Premium / Family) + one row per `COMPARE_FEATURES` entry, values from
`TIER_LIMITS[tier]`. Pure display from shared constants. Collapsible via the card's
toggle (the card conditionally mounts it).

### 6.4 `src/components/billing/plan-deck-card.tsx` (extends/wraps 5e `PlanCard`)
`PlanDeckCard({ tier, current, focused, onSelect })` — one carousel card: tier name,
price (`formatTierPrice`, FREE = "Free"), full `PLAN_FEATURES[tier]` list via
`PlanFeatureRow`, focus styling (focused = accent border/full opacity; unfocused =
dim), and the per-card CTA:
- `current` → "Current plan", disabled (ghost).
- tier ranked **above** current → "Upgrade to {Tier}" (primary) → `onSelect()`.
- tier ranked **below** current → "Switch to {Tier}" (primary) → `onSelect()`.
  (Rank order FREE < PRO < PREMIUM < FAMILY, only to pick the Upgrade/Switch verb so a
  paid user never sees "Upgrade to Free". No proration note — every non-current CTA is
  the same web hand-off: `onSelect()` closes the sheet + `openWebBilling`.)

### 6.5 `src/components/billing/plan-carousel-sheet.tsx`
`PlanCarouselSheet({ open, onClose, currentTier })` — a `BottomSheet` wrapping the
swipeable deck of **all four tiers** (FREE/PRO/PREMIUM/FAMILY), reusing the
AccountCarousel pattern: a horizontal snap `ScrollView` where the focused card is full
width with neighbours peeking, `Animated`/scroll-driven focus tracking, widening
position dots, and ‹ › step arrows. The card matching `currentTier` is marked
"Current plan" (disabled). Any other card's CTA → `onClose()` then `openWebBilling()`.
Self-contained: both Settings and Chat mount it; it needs no network (pricing/features
from shared constants; `currentTier` passed in).

### 6.6 Screen/route changes
- **`src/screens/settings-screen.tsx`**: remove the "Plan & Billing" navigation row;
  mount `CurrentPlanCard` inline under a "Plan & Billing" heading. Settings owns the
  `getSubscription` fetch + loading/error/retry (reuse the dashboard `SectionState`
  helpers) + the `managing` state for `openPortal` (→ `Linking`), and holds the
  `sheetOpen` state driving `PlanCarouselSheet` (passing the fetched tier as
  `currentTier`). After the sheet closes, no refetch is required (web hand-off doesn't
  change local state), but a refetch-on-focus is acceptable if cheap.
- **`src/screens/chat-screen.tsx`**: the upgrade notice (`notice.upgrade`) no longer
  `router.push('/subscription')`; it opens a `PlanCarouselSheet` mounted in the chat
  screen (`currentTier` from cached `workspace.tier`, default `'FREE'`).
- Delete the subscription screen + route + registration (§5).

## 7. Data contracts (unchanged)

- `getSubscription(workspaceId): SubscriptionView` — current plan (Settings only).
- `openPortal(workspaceId): { url }` — Stripe portal (paid + Stripe; Settings card).
- Pricing/features from `@finby/shared` (`TIER_PRICING`/`formatTierPrice`,
  `PLAN_FEATURES`, `TIER_LIMITS`). **No `getPlans` call** (5e decision holds).

## 8. Testing

- RNTL `current-plan-card.test.tsx`: FREE (limit rows + limitation + "Upgrade to Pro"
  fires `onChangePlan` + compare toggle reveals the table, no Manage); paid+Stripe
  (condensed features + billing date + "Change plan" fires `onChangePlan` + "Manage
  Billing" fires `onManage`).
- RNTL `plan-deck-card.test.tsx`: paid card shows price + features + "Upgrade to {Tier}"
  → `onSelect`; the `current` card shows "Current plan" disabled.
- RNTL `plan-carousel-sheet.test.tsx`: renders all four tier cards; the `currentTier`
  card is marked/disabled; a non-current CTA calls `onClose` + `Linking.openURL(
  WEB_BILLING_URL)`; dots/arrows step the focus. Mock `expo-blur`, RN `Linking`.
- RNTL `compare-table.test.tsx`: renders the tier columns + a couple of known feature
  rows/values from `TIER_LIMITS`.
- RNTL: `settings-screen.test.tsx` — the inline card renders (mock `getSubscription`);
  "Change plan"/"Upgrade" opens the sheet. `chat-screen.test.tsx` — the upgrade notice
  tap opens the sheet (no navigation).
- Delete `subscription-screen.test.tsx`.
- Vitest: any pure helper (e.g. the free-limit-row derivation) if extracted.
- Gate stays pristine (jest-expo/RNTL is async; filter only the benign act() string);
  `tsc --noEmit` clean after typedRoutes regen (route removed); `pnpm lint` 0 errors.

## 9. RNTL / RN gotchas to carry in (from 5e + prior slices)

- `getByText('X')` matches a host `<Text>`'s FULL concatenated descendant text — wrap
  an asserted string in its OWN inner `<Text>` (keeps inline flow); NEVER a sibling
  `<Text>` inside a Pressable/View (they stack vertically in column layout).
- jest.mock factory vars referencing an outer `const` must be `mock`-prefixed
  (babel-jest hoist): `mockPush`, `mockBack`, etc.
- Any test whose tree imports `useTabBarSpace`/floating-tab-bar or the sheet must mock
  `expo-blur`.
- typedRoutes: after removing the route, regenerate `.expo/types/router.d.ts`
  (`EXPO_NO_TELEMETRY=1 CI=1 timeout 90 npx expo start --port <p>`), then `tsc`.
- Carousel peek: RN `ScrollView` needs `snapToInterval` (card width + gap) + horizontal
  padding so neighbours peek — `pagingEnabled` alone gives full-width pages (see
  AccountCarousel for the working pattern).

## 10. Out of scope (unchanged deferred IAP slice)

StoreKit/RevenueCat in-app purchases; in-app `startCheckout`/`changePlan`/`cancel`/
`resume`; native checkout; backend Apple-receipt validation; Google Play Billing — all
blocked on the paid Apple Developer account + an EAS dev build.
