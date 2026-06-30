# Mobile Phase 5e — Subscription & Plans (display layer)

Date: 2026-07-01
Status: Approved (design)
App: `apps/mobile` (Expo SDK 54, RN 0.81, expo-router, NativeWind)

## 1. Goal

Give the mobile app a subscription surface that mirrors the web: show the user's
current plan + limits, let them compare plans, and hand off upgrade/manage intent
to the existing web/Stripe flow. **Display layer only — no in-app purchase.** Real
StoreKit/RevenueCat IAP is a separate, later slice (blocked on a paid Apple
Developer account + an EAS dev build + backend Apple-receipt validation; Stripe
checkout *inside* the iOS app would violate App Store 3.1.1).

## 2. ⚠️ App Store compliance note (load-bearing)

The Upgrade/Change CTA opens the **web app** (`https://chat.finby.app/settings`,
where the web `UpgradeModal` lives) via `Linking.openURL`. Linking out to external
purchase from inside an iOS app is an App Store **3.1.1 "steering" risk** — fine
**pre-submission**, but **MUST be revisited before any App Store submission**
(StoreKit/RevenueCat IAP, or removed). `chat.finby.app/settings` is behind auth,
so a mobile user not signed in on web will log in before reaching the modal — an
accepted stopgap. ("Manage Billing" below is different: it opens a Stripe-hosted
portal link with no web login, and is fine.)

## 3. How the web actually works (source of truth — read from the code)

- Billing has **no dedicated page**; it's `<PlanCard />` inside `apps/web/src/app/(app)/settings/page.tsx` (`/billing/*` is only the Stripe success/cancel return routes). The Stripe portal `return_url` is `/settings`.
- **`PlanCard`** fetches `getSubscription`. **FREE** → free-limit rows + a limitation note + "Upgrade to Pro" (opens `UpgradeModal`) + a collapsible **Compare-plans** table. **Paid** → condensed feature rows + billing dates + "Change plan" (UpgradeModal) + "Manage Billing" (`openPortal` → Stripe portal, STRIPE provider only) + Compare.
- **`UpgradeModal`** fetches `getPlans()` (pricing) and, on plan select, calls `startCheckout(tier)` → opens the returned Stripe checkout URL.
- **Feature/limit data** = `TIER_LIMITS` in `@finby/shared/constants` (single source of truth; per tier: `chatMessagesPerDay`, `currencies`, `transactionHistoryDays`, `portfolio`, `proactiveCoaching`, `streakRepair`, `maxMembers`, `dataExport`, …). **Display copy** = `PLAN_FEATURES` + `condensedFeatures` in `apps/web/src/lib/plan-features.ts` (pure, web-only today → hoist to shared). **Pricing** = `getPlans()` (`BillingPlan.priceDisplay`).

## 4. Data contracts (reused; `api.billing` already bound on mobile)

- `getSubscription(workspaceId): Promise<SubscriptionView>` — `{ tier, status, billingProvider, currentPeriodEnd, cancelAtPeriodEnd, pendingTier, pendingTierEffectiveAt }`.
- `getPlans(): Promise<{ plans: BillingPlan[] }>` — `BillingPlan = { tier:'PRO'|'PREMIUM'|'FAMILY'; name; priceDisplay; amountMinor; currency; interval; highlights[] }` (used for the **price line** only).
- `openPortal(workspaceId): Promise<{ url: string }>` — Stripe customer-portal URL (paid + STRIPE only).
- `TIER_LIMITS` (`@finby/shared`) — the feature/limit matrix, **no network**.

(`startCheckout`/`changePlan`/`cancel`/`resume` are intentionally **NOT** called from mobile in this slice — payment hand-off goes through the web.)

## 5. Navigation

- New route `app/(app)/subscription.tsx` re-exporting `SubscriptionScreen` from `src/screens/subscription-screen.tsx`; registered in `app/(app)/_layout.tsx` as `<Tabs.Screen name="subscription" options={{ href: null }} />` (hidden, like `streaks`). Header + back (`router.back()`).
- Reached from: (a) a new **Settings "Plan & Billing" row** (shows the current tier label from the cached `workspace.tier`) → `router.push('/subscription')`; (b) the chat **429 upgrade notice** (`notice.upgrade === true`) made tappable → `router.push('/subscription')`.

## 6. Sections (one vertical ScrollView, boxless dashboard style)

1. **Current plan** (`getSubscription`, own `SectionState` loading/error/retry):
   - Tier label/badge + status; for paid: "Next billing date {date}", "Cancels at period end" (`cancelAtPeriodEnd`), "Changes to {pendingTier} on {date}" (`pendingTier`/`pendingTierEffectiveAt`).
   - **FREE** → free-limit rows (derived from `TIER_LIMITS.FREE`) + the limitation note (from hoisted `PLAN_FEATURES.FREE.limitation`) + an **"Upgrade"** button → `Linking.openURL(WEB_BILLING_URL)`.
   - **Paid** → condensed feature rows (from hoisted `condensedFeatures(tier)`) + billing dates + a **"Change plan"** button → `Linking.openURL(WEB_BILLING_URL)` + (STRIPE only) a **"Manage Billing"** button → `openPortal` → `Linking.openURL(url)` (own loading/error).
2. **Compare plans** (`TIER_LIMITS`, no network; a `PlanCompareTable`): a FREE/PRO/PREMIUM/FAMILY × features grid (a horizontally-scrollable native table or stacked per-tier rows — decide layout in the plan). Column headers carry each paid tier's `priceDisplay` from `getPlans` when loaded (its own `SectionState`; the table still renders from `TIER_LIMITS` if pricing fails).

`WEB_BILLING_URL = 'https://chat.finby.app/settings'` — a single constant. Note: a **different domain** from the marketing `PRIVACY_URL = 'https://finby.app/privacy'`; the web *app* is `chat.finby.app`, marketing is `finby.app` — do not consolidate.

## 7. Components & files

- `src/screens/subscription-screen.tsx` — composes the sections, per-section fetch state (reuse `SectionCard`/`SectionLoading`/`SectionError`/`SectionState` from dashboard), header + back, the `openPortal` manage action, the `Linking` hand-offs.
- `src/components/billing/current-plan.tsx` — `CurrentPlan({ sub: SubscriptionView; onUpgrade: () => void; onManage: () => void; managing: boolean })`: tier + status + dates + free-limit/condensed-feature rows + the CTAs.
- `src/components/billing/plan-compare-table.tsx` — `PlanCompareTable({ plans?: BillingPlan[] })`: the `TIER_LIMITS` matrix (price headers from `plans` when present).
- New route `app/(app)/subscription.tsx`; `_layout.tsx` hidden-route registration.
- Modify `src/screens/settings-screen.tsx` — add a "Plan & Billing" row → `/subscription`.
- Modify `src/screens/chat-screen.tsx` — when `notice.upgrade`, render the notice as a `Pressable` that navigates to `/subscription` (non-upgrade notices stay plain text).

**DRY hoist to `@finby/shared`:** move `apps/web/src/lib/plan-features.ts` (`PLAN_FEATURES`, `condensedFeatures`, the `PlanFeature`/`PlanFeatureSet` types) into the shared package; web re-exports it (mirrors the `streak-messages`/`relative-time` precedent). It is pure copy with no web deps. `TIER_LIMITS` is already shared.

## 8. Testing

- Vitest: the hoisted `plan-features` (in shared) + any pure mobile helper (e.g. free-limit-row derivation from `TIER_LIMITS`).
- RNTL `subscription-screen.test.tsx`: FREE state (free limits + Upgrade → `Linking.openURL(WEB_BILLING_URL)`, no Manage); paid state (condensed features + dates + "Change plan" → web link + "Manage Billing" → `openPortal` + `Linking.openURL(portalUrl)`); per-section loading/error/retry; back navigates. Mock `api`, `Linking`, `expo-router`.
- RNTL `current-plan.test.tsx`, `plan-compare-table.test.tsx`.
- RNTL: Settings "Plan & Billing" row navigates; chat upgrade-notice tap navigates (extend `settings-screen.test.tsx` + `chat-screen.test.tsx`).
- Gate stays pristine; tsc + lint clean.

## 9. Risks / notes

- **Compliance (§2):** the external upgrade link is a pre-submission stopgap.
- **No new native deps** — Expo-Go-safe; `Linking` is built in.
- **PWA parity:** the feature matrix and copy come from the same `TIER_LIMITS` + (hoisted) `plan-features` the web uses, so mobile and web stay in lockstep.

## 10. Out of scope (the deferred IAP slice)

StoreKit/RevenueCat in-app purchases; in-app `startCheckout`/`changePlan`/`cancel`/`resume`; a native `UpgradeModal`/checkout; backend Apple-receipt validation; Google Play Billing. All blocked on the paid Apple Developer account + an EAS dev build.
