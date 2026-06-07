# Product Analytics (Phase 2) — Design

Date: 2026-06-07
Status: Approved (brainstorm) — pending implementation plan

## 1. Context

Phase 2 of the monitoring/analytics initiative (Phase 1 — Sentry/pino observability —
shipped at `main @ 9f66d82`). This phase adds **product analytics** so we can see how
people use Finby: activation, feature usage, retention, and FREE→PRO conversion.

### Decisions carried in from the brainstorm
- **Tool:** PostHog Cloud, **US** region.
- **Capture posture:** automatic **pageviews on**, **autocapture off** (autocapture could
  scoop typed/on-screen financial values), **no session replay**.
- **Privacy (finance app):** users keyed by **UUID only**; **no financial PII ever**
  (no amounts, balances, merchant, account numbers, email, names). Only anonymized
  behavioral events with non-financial properties.
- **Architecture:** Approach A — **client-first** (`posthog-js`) behind a thin typed
  wrapper, plus one **small API tweak** so chat-set budgets surface to the client.
- **Budget/cost:** within free tier (1M events/mo); fine to grow to ~$5–30/mo later.

## 2. Goals / Non-goals

**Goals**
- Activation funnel: onboarding → sign-up → first chat message → first transaction → first budget.
- Feature usage: which surfaces get used (via pageviews) + key actions.
- Retention/engagement: DAU/WAU/MAU and return behavior (via pageviews + identify).
- Conversion: upgrade-modal → checkout → subscription-activated.
- Zero financial PII leaves our infra; prod-only (no-op without a key).

**Non-goals (Phase 2)**
- Server-side events / Stripe-webhook-authoritative "paid" (Approach B). `/billing/success`
  is the v1 paid signal; **Stripe remains the source of truth for revenue.**
- Cookie-consent banner, feature flags / A-B experiments, session replay.

## 3. Architecture

Small, isolated units with clear interfaces:

1. **`apps/web/src/lib/analytics.ts`** — the ONLY importer of `posthog-js`. Public API:
   - `initAnalytics(): void` — `posthog.init` (no-op if `NEXT_PUBLIC_POSTHOG_KEY` unset).
   - `identifyUser(userId: string, tier: SubscriptionTier): void` — `posthog.identify(userId, { tier })`.
   - `resetAnalytics(): void` — `posthog.reset()`.
   - `track(event: AnalyticsEvent, props?: AnalyticsProps): void` — typed event from the
     catalog; props passed through `sanitizeProps` (allow-list backstop) before sending.
   - `capturePageview(path: string): void` — manual `$pageview` for App-Router navigations.
2. **`apps/web/src/components/analytics/posthog-provider.tsx`** (`'use client'`) — calls
   `initAnalytics()` once, identifies the rehydrated user, and renders a pageview tracker
   that fires `capturePageview` on `usePathname()` change. Mounted in the root layout.
3. **Store wiring** (`apps/web/src/lib/store.ts`) — `identifyUser` in `login`/`register`,
   `resetAnalytics()` in `logout`, re-identify (new tier) in `setWorkspaceTier`.
4. **API tweak** (`apps/api/src/modules/chat/`) — emit a `BUDGET_SET` chat action so the
   client can fire `budget_set` (see §6).

All instrumentation **no-ops when `NEXT_PUBLIC_POSTHOG_KEY` is unset** (dev/local/test),
matching the Phase-1 "prod-only integration" pattern.

## 4. Event taxonomy (PII-safe)

Keyed by `userId` (UUID). Every property is non-financial. `track()` only accepts events
from this catalog (a TS union); unknown events are a type error.

| Goal | Event | Properties |
|---|---|---|
| Activation | `onboarding_started` | — |
| Activation | `onboarding_completed` | — |
| Activation | `onboarding_skipped` | — |
| Activation | `signed_up` | `method` (`'password'`) |
| Activation / Engagement | `chat_message_sent` | — |
| Activation / Usage | `transaction_logged` | `tx_type` (`'EXPENSE'\|'INCOME'\|'TRANSFER'`), `currency` (code) |
| Activation / Usage | `budget_set` | `currency` (code) |
| Conversion | `upgrade_modal_viewed` | `source` (string, which gate) |
| Conversion | `checkout_started` | `target_tier` (`SubscriptionTier`) |
| Conversion | `subscription_activated` | `tier` (`SubscriptionTier`) |
| Feature usage / Retention | `$pageview` (automatic, manual fire on route change) | path only |

Notes:
- **No `is_first` flags** — PostHog funnels compute first-occurrence; we fire the same
  event every time.
- Retention/DAU/WAU/MAU derive from `$pageview` + `identify` (no dedicated events).
- `currency` is a 3-letter code (USD/PHP/…), never an amount.

## 5. Instrumentation points (where each event fires)

| Event | Location |
|---|---|
| `onboarding_started/completed/skipped` | `components/onboarding/onboarding-carousel.tsx` (mount, "Get started", "Skip") |
| `signed_up` | `lib/store.ts` `register` (after success) |
| `chat_message_sent` | `app/(app)/chat/page.tsx` send handler (after `sendMessage` dispatch) |
| `transaction_logged` | `app/(app)/chat/page.tsx` when a returned action is `TRANSACTION_CREATED` (props from `action.preview.* ` — only `tx_type` + `currency`, NOT amount/merchant) |
| `budget_set` | `app/(app)/chat/page.tsx` when a returned action is `BUDGET_SET` (props: `currency` only) |
| `upgrade_modal_viewed` | `components/billing/UpgradeModal.tsx` (on open) |
| `checkout_started` | `lib/billing-api.ts` checkout call / `UpgradeModal` CTA (props: `target_tier`) |
| `subscription_activated` | `app/(app)/billing/success/page.tsx` once the polled sub is ACTIVE (props: `tier`) |
| `identify` / `reset` | `lib/store.ts` login/register/logout/setWorkspaceTier + provider on rehydrate |
| `$pageview` | `posthog-provider` pageview tracker (`usePathname` change) |

## 6. The chat-action API tweaks (minimal)

Two small additions to the `ChatAction` union in BOTH
`apps/api/src/modules/chat/chat.types.ts` and `apps/web/src/lib/types.ts`:

1. **New `BUDGET_SET` variant:**
   `{ type: 'BUDGET_SET'; preview: { currency: string; amount?: string; category?: string | null } }`.
   In `chat.service.ts` `set_budget` case (~line 261), build that action and return it on the
   exec result so the existing `actions.push(exec.action)` path surfaces it.
2. **Add `txType` to the existing `TRANSACTION_CREATED` action** so the client can send
   `tx_type` without inferring it: the two action-build sites in `chat.service.ts` (~lines
   385 and 476) already know whether it's an expense/income vs transfer, so set
   `txType: 'EXPENSE' | 'INCOME' | 'TRANSFER'` on the action. (The `transaction_logged`
   event reads `action.txType` + `action.preview.currency` — never the amount/merchant.)
- The action's `preview` may carry the budget amount for UI display (the user's own data on
  their own screen). **The analytics `budget_set` event sends only `currency`.**
- Rendering a `BUDGET_SET` card in `components/chat/action-card.tsx` is optional polish; the
  event only needs the action present in the response. (Plan will render a minimal card for
  consistency, or skip — decided in the plan.)

## 7. PostHog config & privacy safeguards

`initAnalytics()` calls:
```
posthog.init(NEXT_PUBLIC_POSTHOG_KEY, {
  api_host: NEXT_PUBLIC_POSTHOG_HOST,        // https://us.i.posthog.com
  autocapture: false,                         // never capture typed/on-screen values
  capture_pageview: false,                    // we fire pageviews manually on route change
  disable_session_recording: true,            // no replay (finance)
  person_profiles: 'identified_only',         // anonymous visitors create no profiles
})
```
- **`sanitizeProps` allow-list backstop** in `track()`: drop any prop whose key matches the
  financial/PII deny-list (same list as the Phase-1 Sentry scrubber:
  amount*, balance, pricebase, merchant, accountnumber, email, password, token, secret, refreshtoken).
  Defense-in-depth even though call sites are controlled.
- `identifyUser` sets only `{ tier }` as a person property — never email/name/ip.

## 8. Configuration & enablement

| Var | Value | Where |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog **project** API key (public/client-side by design) | Vercel (prod) |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | Vercel (prod) |

Unset locally → all analytics no-op. Enabled in production only.

## 9. Error handling
- `initAnalytics`/`track`/`identify` guard on the key and wrap in try/catch — analytics must
  never break the app or a user flow.
- `sanitizeProps` is total (never throws).

## 10. Testing
- **Web (Vitest, `posthog-js` mocked):** `track` rejects/ignores non-catalog events (type +
  runtime); `sanitizeProps` strips every financial/PII key; `init`/`identify`/`reset` no-op
  without a key; `identifyUser` payload contains only `{ tier }` (no email/name).
- **API (Jest):** the `set_budget` path returns a `BUDGET_SET` action; existing chat tests
  stay green.
- Full web Vitest + API Jest + both `tsc --noEmit` green.

## 11. User setup (post-merge, cannot be done from dev)
- Create a PostHog Cloud (US) project → copy the **project API key**.
- Set `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` on Vercel → redeploy.
- Build PostHog dashboards/funnels: activation funnel, upgrade funnel, feature-usage,
  retention.

## 12. Open questions
- Render a `BUDGET_SET` action-card in chat, or surface the action for analytics only?
  (Defaulting to a **minimal card** for UI consistency; finalized in the plan.)
- Cookie-consent banner — deferred (no PII sent; revisit if expanding to EU users).
