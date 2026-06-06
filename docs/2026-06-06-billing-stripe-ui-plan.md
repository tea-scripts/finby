# Billing & Subscription UI + Stripe-default Backend — Implementation Plan (repo-accurate)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD where noted. Steps use `- [ ]`.

**User decisions (locked):**
1. **Stripe becomes the DEFAULT processor; KEEP the `BillingProvider` port + LemonSqueezy + Paystack as fallbacks. DELETE NOTHING.** (LS was chosen because Stripe KYC is unavailable in PH/Nigeria; user now has Stripe access. The other providers stay as fallback.)
2. **Pricing: keep existing `@finby/shared` `TIER_PRICING` ($4.99 / $9.99 / $14.99 USD, monthly). MONTHLY ONLY — no annual, no interval toggle.**

## Deviations from the original prompt (and why)
- **No deletions.** The prompt said "delete all Lemon Squeezy code, Stripe-only." Rejected per decision #1 — the codebase is a deliberate provider-agnostic port; we switch the default and finish Stripe, keeping LS/Paystack.
- **Paths:** billing is `apps/api/src/modules/billing/` (not `src/billing/`). Web app under `apps/web/src/`.
- **No Stripe Price IDs needed.** `StripeProvider.createCheckout` already builds inline `price_data` from `TIER_PRICING` — so go-live needs only `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (both already in `env.schema.ts`), NOT six `STRIPE_*_PRICE_ID` env vars. The prompt's Price-ID env block is dropped.
- **No `subscriptionTier`/`subscriptionStatus` on Workspace.** Gating field is `workspace.tier`. Subscription state lives on the `Subscription` model (`status`, `currentPeriodEnd`, `cancelAtPeriodEnd`, per-provider IDs) — all already present. **No migration for Stripe fields** (already exist on `Subscription`).
- **API surface:** reuse the existing `/workspaces/:id/subscription/*` endpoints (not a parallel `/billing/*`). Add a public `GET /billing/plans` (pricing is public) and a Stripe customer-portal action.
- **Webhook + raw body already exist** (`POST /webhooks/stripe`, `rawBody: true` in `main.ts`). No `main.ts` middleware change.
- **Icons:** `@phosphor-icons/react` (not lucide). **Web tests:** Vitest (not Jest).
- **Pkg/commands:** `pnpm --filter finby-api` / `pnpm --filter finby-web`. API tests: `pnpm --filter finby-api exec jest`. Web tests: `pnpm --filter finby-web exec vitest run`.

## Conventions
- No `any`. Conventional commits, **NO AI-attribution trailer**. Keep all existing tests green (API 167, web suite).
- API tests `pnpm --filter finby-api exec jest <pat>`; typecheck `pnpm --filter finby-api exec tsc --noEmit`. Web typecheck `pnpm --filter finby-web exec tsc --noEmit`; web tests `pnpm --filter finby-web exec vitest run <pat>`.
- Web: `'use client'` components, `ui/*` primitives (Modal `{open,onClose,title,children}`, Skeleton `{className}`, Button `primary|ghost` w/ loading), Tailwind dark navy tokens, store via `useAuth`, API via `useAuth.getState().authed()`.

---

## PART A — Backend (apps/api/src/modules/billing) — small delta, keep all providers

### Task B1: Stripe-default + invoice status events + portal-ready webhook (TDD)
**Modify** `dto/billing.schemas.ts`: change `provider` default `'LEMONSQUEEZY'` → `'STRIPE'`.
**Modify** `providers/stripe.provider.ts` `parseWebhook`: additionally handle
- `invoice.payment_failed` → normalized **status-only** event: `type:'SUBSCRIPTION_UPDATED'`, `status:'PAST_DUE'`, `tier:null` (DO NOT downgrade), workspaceId from the subscription/invoice metadata (read `invoice.subscription_details?.metadata` or fall back to fetching — simplest: include workspaceId via the `subscription` metadata already set at checkout; if metadata absent on the invoice object, return `IGNORED`).
- `invoice.payment_succeeded` → `type:'SUBSCRIPTION_UPDATED'`, `status:'ACTIVE'`, `tier:null`.
Keep existing `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` handling.
**Modify** `subscription.service.ts` `applyWebhookEvent`: add a **status-only** branch — when `type==='SUBSCRIPTION_UPDATED' && event.tier===null`, update ONLY `subscription.status` (and re-activate: if new status `ACTIVE` and prior was `PAST_DUE`, clear nothing else); DO NOT touch `workspace.tier` or upsert tier. (Current code defaults tier to `'PRO'` when `event.tier` is null — that bug must not fire for status-only events; guard it.)
**Tests** (`subscription.service.spec.ts` + `stripe.provider.spec.ts`, create the latter if absent): `invoice.payment_failed` → status PAST_DUE, tier unchanged; `invoice.payment_succeeded` after PAST_DUE → ACTIVE, tier unchanged; existing canceled/active paths still pass.
Commit: `feat(api): stripe default + invoice payment status webhooks`.

### Task B2: Webhook idempotency (TDD + migration)
**Add** Prisma model `ProcessedWebhookEvent { id String @id @default(cuid()) provider String eventId String createdAt DateTime @default(now()) @@unique([provider, eventId]) }`. Migration `add_processed_webhook_event`.
**Modify** providers to surface the native event id on `BillingWebhookEvent` (add `eventId: string | null` to the normalized type; Stripe sets `event.id`, LS/Paystack set their id or null).
**Modify** `applyWebhookEvent` (or the webhook controller): before applying, `processedWebhookEvent.create` inside a try; on unique-constraint violation, treat as already-processed and no-op. Re-processing the same event id is a guaranteed no-op.
**Tests**: duplicate `(provider,eventId)` → second `applyWebhookEvent` makes no further DB mutations.
Commit: `feat(api): idempotent billing webhooks via processed-event table`.

### Task B3: Stripe customer portal + enriched subscription view (TDD)
**Modify** `providers/stripe.provider.ts`: add `createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<{ url: string }>` (Stripe-specific; NOT on the generic `BillingProvider` port — keep the port unchanged, add this method on `StripeProvider` only and access it via a typed check in the service).
**Modify** `billing.types.ts` `SubscriptionView`: add `nextBillingDate: string | null` (= `currentPeriodEnd`) and `customerPortalUrl: string | null`.
**Modify** `subscription.service.ts` `getSubscription`: when `billingProvider==='STRIPE'` and `stripeCustomerId` present, generate a portal URL (return URL = `${WEB_URL}/settings`); cache in Redis 60s TTL **if** Redis is available, never block on miss; else null. Set `nextBillingDate = currentPeriodEnd`.
**Add** controller route `POST /workspaces/:id/subscription/portal` (`@Roles('OWNER')`) → `{ url }` (regenerates a fresh portal session) for the "Manage Billing" button; OR rely on `customerPortalUrl` from GET — implement the POST (fresh session is safer than a cached URL). 
**Tests**: portal URL present only for Stripe+customer; `nextBillingDate` mirrors `currentPeriodEnd`; non-Stripe → portal null.
Commit: `feat(api): stripe customer portal + enriched subscription view`.

### Task B4: Public plans endpoint (TDD)
**Add** `PlansController` (`@Public()`, route `GET /billing/plans`) returning `{ plans: Array<{ tier, name, priceDisplay, amountMinor, currency, interval, highlights: string[] }> }` sourced from `@finby/shared` `TIER_PRICING` + a `TIER_HIGHLIGHTS` map (Pro/Premium/Family bullet lists per the prompt). Add `formatTierPrice` + `TIER_HIGHLIGHTS` to `@finby/shared` (rebuild shared via turbo). Register controller in `billing.module.ts`.
**Tests**: returns 3 tiers with correct display prices ($4.99/$9.99/$14.99) + highlights.
Commit: `feat(api): public billing plans endpoint`.

### Task B5: env.example note
`.env.example`/`env.schema.ts` already have `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Add a comment that these two (no Price IDs) are all Stripe needs. No code beyond a comment. (Folded into B1's commit if trivial.)

---

## PART B — Web UI (apps/web)

### Task W0: Component test harness (jsdom + RTL)
The web suite is node-env logic-only today. **Add** `@testing-library/react` + `jsdom` (dev deps) and a per-file `// @vitest-environment jsdom` (or extend `vitest.config.ts` with an environmentMatchGlobs for `*.test.tsx`). Minimal setup file if needed. Verify an existing logic test still passes. (If the user prefers zero new deps, fall back to logic-only tests on the api module + pure helpers — but default is to enable render tests since the spec asks for them.)
Commit: `test(web): enable jsdom + react-testing-library for component tests`.

### Task W1: billing-api client + types (TDD-light)
**Create** `apps/web/src/lib/billing-api.ts` mirroring `transactions-api.ts` (uses `useAuth.getState().authed()`):
- `getSubscription(workspaceId)` → `SubscriptionView`
- `getPlans()` → `{ plans }` (public — use `apiFetch` directly, no auth)
- `startCheckout(workspaceId, tier)` → `{ url }` (POST checkout, provider defaults to STRIPE server-side; may omit provider)
- `openPortal(workspaceId)` → `{ url }` (POST portal)
- `cancelSubscription(workspaceId)` / `resumeSubscription(workspaceId)` → `SubscriptionView`
**Add** matching types to `lib/types.ts` (`SubscriptionView`, `BillingPlan`).
Test (`billing-api.test.ts`, node-env): URL/method/body shape per function (mock `authed`/`apiFetch`).
Commit: `feat(web): billing api client`.

### Task W2: PlanCard (TDD)
**Create** `components/billing/PlanCard.tsx`: states Free (limits + "Upgrade to Pro" CTA → opens UpgradeModal), Paid (tier badge, next billing date, cancel-at-period-end warning, "Manage Billing" → `openPortal` redirect), Loading (Skeleton), Error. Tier badge colors: Free=slate, Pro=blue #1d6ef5, Premium=purple, Family=emerald. Collapsible feature table (collapsed on mobile). Dark navy card.
Test `PlanCard.test.tsx`: free→CTA; paid→manage button; loading; error.
Commit: `feat(web): plan card`.

### Task W3: UpgradeModal (TDD)
**Create** `components/billing/UpgradeModal.tsx` using `ui/modal` (bottom-sheet feel on mobile via existing modal; monthly-only — **no interval toggle**). Plan tabs Pro|Premium|Family with highlights (from `getPlans()`), price display, "Start Upgrade" → `startCheckout(tier)` → `window.location = url`. Button loading + error states.
Test `UpgradeModal.test.tsx`: 3 tabs render; start-upgrade calls checkout; loading/error.
Commit: `feat(web): upgrade modal`.

### Task W4: UpgradeGate (TDD)
**Create** `components/billing/UpgradeGate.tsx`: `{ requiredTier, featureName, children }`. Entitled (tier rank ≥ required via a small `tierRank` helper) → renders children. Gated → lock + featureName + one-line benefit + "Upgrade" opening `UpgradeModal`. Reads `useAuth((s)=>s.workspace?.tier)`.
Test `UpgradeGate.test.tsx`: entitled→children; gated→gate UI; upgrade opens modal.
Commit: `feat(web): upgrade gate`.

### Task W5: Settings page + success/cancel routes
**Create** `app/(app)/settings/page.tsx`: Profile section (displayName, email read-only, "edit coming soon") + Plan & Billing section rendering `<PlanCard>`. Uses app shell.
**Create** `app/(app)/billing/success/page.tsx` (refresh subscription/workspace tier — call `getSubscription` + store `refreshUser()`; brief poll for webhook lag; "You're on {tier} 🎉" + link to /settings) and `app/(app)/billing/cancel/page.tsx` (checkout canceled, back to /settings).
Commit: `feat(web): settings page + billing success/cancel routes`.

### Task W6: Nav Settings link
**Modify** `components/app/app-nav.tsx`: add `{ href: '/settings', label: 'Settings', Icon: GearSix }` (from `@phosphor-icons/react`). Add only.
Commit: `feat(web): settings nav link`.

---

## Task FINAL: Verify + smoke + finish
- API: `pnpm --filter finby-api exec jest` (all green) + `tsc --noEmit` + `build`. Web: `pnpm --filter finby-web exec vitest run` + `tsc --noEmit` + `build` (stop `next dev` first if running).
- Manual smoke (needs `STRIPE_SECRET_KEY` test key in `.env`): `/settings` loads; Free → PlanCard upgrade CTA; UpgradeModal tabs render; "Start Upgrade" → `/workspaces/:id/subscription/checkout` returns a Stripe Checkout URL (redirects). Webhook: `stripe trigger checkout.session.completed` (Stripe CLI) → workspace tier flips. If no Stripe test key configured, report BLOCKED on that step only (env-gated; code path verified by unit tests + the checkout call returning a clear Stripe auth error).
- superpowers:finishing-a-development-branch → branch `feat/billing-stripe-ui` → PR or merge per user.

## Go-live (user actions, not code)
Create Stripe account/Atlas → set `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`) on Render → register webhook `https://api.finby.app/api/v1/webhooks/stripe` for events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.payment_succeeded. No Price IDs (inline pricing). LS/Paystack remain available as fallback providers.

## Self-Review
Honors both locked decisions (Stripe default, keep fallbacks, no deletions; existing monthly pricing). No migration except the idempotency table. Reuses existing API surface + UI conventions (phosphor, vitest, ui/* primitives, store). Backend changes are additive + guarded (status-only invoice events must not downgrade tier). Frontend is the bulk. All env-gated so it no-ops safely until Stripe keys are set.
