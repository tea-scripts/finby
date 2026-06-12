# Super Admin Analytics Dashboard — Design

**Date:** 2026-06-12
**Status:** Approved (brainstorming) — pending implementation plan

## Summary

A standalone, security-isolated super-admin dashboard for app-wide analytics across
all users and workspaces. Covers four areas: growth & users, engagement & product
usage, revenue & subscriptions, and operational health. Built as a separate Next.js
app talking to a new admin module in the existing NestJS API, computing all metrics
directly from Postgres (via Prisma) with Redis caching.

This is a brand-new capability: Finby currently has **no platform-level admin
concept**. The only existing roles are workspace-member roles (OWNER/VIEWER/etc.),
and the existing `analytics` module is user-facing (a person's own spending), not
app-wide.

## Goals

- App-wide visibility into growth, engagement, revenue, and operational health.
- Strong isolation: no admin code/logic leaks into the user app; no path for a
  non-admin to reach or breach the dashboard.
- Self-contained: Postgres is the single source of truth; no runtime dependency on
  third-party analytics for the core numbers.

## Non-Goals (v1)

- Full cohort retention curves (signup-week → week-N retention). **Deferred to v2** —
  heaviest queries; v1 ships simpler active-in-last-7/30-days percentages instead.
- Rebuilding error-rate / LLM-cost telemetry. That lives in **Sentry**; the ops panel
  **links out** to Sentry rather than recomputing it from Postgres.
- Per-user drill-down / account administration (suspend, edit, refund). Read-only
  analytics only in v1.
- PostHog query integration (rejected in favor of Postgres-direct).

## Architecture

Three pieces:

1. **`apps/admin`** — new Next.js app, deployed as its own Vercel project at
   `admin.finby.app`, behind Vercel's deployment/access protection. Never bundled
   with the user app.
2. **`admin` module in `apps/api`** — admin-only auth + analytics endpoints under
   `/api/v1/admin/*`, fully separate from user-facing routes.
3. **Postgres (Prisma) + Redis** — all metrics computed via Prisma aggregations,
   results cached in Redis (5–15 min TTL).

**Data flow:**
`admin app → /api/v1/admin/* (admin-scoped JWT) → AdminGuard → AdminAnalyticsService
→ Prisma aggregate over Postgres → Redis cache → JSON`.

## Security model (the core)

Three independent layers; no single failure grants access.

### Layer 1 — Edge gate
Vercel deployment protection in front of `admin.finby.app`. The public cannot load
even the login page.

### Layer 2 — Identity (`POST /admin/auth/login`)
A dedicated login endpoint, separate from user auth, enforces in order:
1. **email + password** verified against existing `User.passwordHash` (reuses the
   existing bcrypt verification — admins are real Finby users).
2. **email ∈ `ADMIN_EMAILS`** allowlist (a deploy-time secret/env var).
   Admin-ness is **never stored as a DB column** → there is no escalation vector:
   no flag for SQL injection, account takeover, or a stray internal endpoint to flip.
   Adding an admin = change a secret + redeploy.
3. **TOTP** 6-digit code (authenticator app).

### Layer 3 — Admin-scoped token
On success, issue a **separate JWT signed with a new `ADMIN_JWT_SECRET`** (NOT the
user `JWT_ACCESS_SECRET`), payload `{ sub, email, scope: 'admin' }`, short TTL
(15m). A new passport strategy `admin-jwt` + `AdminGuard`:
- verifies signature against `ADMIN_JWT_SECRET`,
- requires `scope === 'admin'`,
- **re-checks the `ADMIN_EMAILS` allowlist on every request.**

A normal user access token is cryptographically unable to pass `AdminGuard`
(different signing secret + scope claim + allowlist).

### TOTP storage
New table `AdminTotpSecret { email @id, secret, enrolledAt }`. First login enrolls
(server generates secret, returns provisioning URI/QR); subsequent logins verify.
**A row does not grant admin** — the env allowlist does; the row only holds the
second-factor material. Keeps admin identity out of the main data model.

### New secrets / env
- `ADMIN_EMAILS` — comma-separated allowlist (Render dashboard, `sync: false`).
- `ADMIN_JWT_SECRET` — generated (`generateValue: true`).
- `ADMIN_JWT_TTL` — e.g. `15m`.
- Admin app: `NEXT_PUBLIC_API_URL` → `https://api.finby.app`.

## API: admin analytics endpoints

New `AdminAnalyticsService` (Prisma aggregations, Redis-cached), all behind
`AdminGuard`. Grouped by the four goals. All accept an optional date-range query.

- **`GET /admin/metrics/growth`**
  - total users, total workspaces
  - signups time-series (daily/weekly buckets on `User.createdAt`)
  - DAU / WAU / MAU — *active* = distinct users with a login (`lastLoginAt`), a
    `Transaction`, or a `ConversationMessage` on the day
  - active-in-last-7-days % and active-in-last-30-days %
  - tier split (free vs paid workspaces)
- **`GET /admin/metrics/engagement`**
  - transactions total + per-day series + avg per active user
  - chat usage: conversations and messages counts
  - active-streak distribution (from per-user streak fields)
  - feature-adoption %: share of workspaces with ≥1 Budget / PortfolioHolding / Alert
- **`GET /admin/metrics/revenue`**
  - paid subscriptions by tier and by provider (STRIPE / PAYSTACK)
  - **MRR**: sum over active paid subs of the tier price from `TIER_PRICING`
    (`@finby/shared`, `amountMinor`/`currency`/`interval`); normalize yearly→monthly
  - new conversions and churn (`Subscription.canceledAt`) over time
  - status breakdown (ACTIVE / TRIALING / PAST_DUE / CANCELED / PAUSED)
  - trials (active `TRIALING` / `trialEndsAt`)
- **`GET /admin/metrics/ops`**
  - support/feedback volume + recent items (`prisma.feedback`)
  - billing health: PAST_DUE count
  - **link out to Sentry** for error rates and LLM/AI cost (not recomputed)

## Admin app UI (`apps/admin`)

- **Login page** — email/password → TOTP step (with first-time QR enrollment).
- **Dashboard** — four sections matching the endpoints; each section has summary
  stat cards + time-series charts, plus a global date-range picker. Use a light
  chart lib (e.g. Recharts) — the user app has no charting components.
- Reuse Finby's Tailwind tokens for visual consistency; otherwise self-contained.

## Data-source notes

- `TIER_PRICING`, `formatTierPrice` live in `@finby/shared`.
- `prisma.feedback` model exists (feedback module persists to it).
- Streak data lives on the user record (streaks service reads/writes `prisma.user`).
- The authoritative Prisma schema lives under `apps/api/prisma/` (the root
  `finby-schema.prisma` is a design reference and may lag). The implementation plan
  must confirm exact field names against the live schema before writing queries.

## Testing

- **API**
  - `AdminAnalyticsService` aggregations against seeded fixtures (per metric group).
  - **Auth/guard tests proving a normal user access token is rejected by
    `AdminGuard`**, that non-allowlisted emails are rejected, and that TOTP is
    enforced. Follow existing `*.spec.ts` patterns.
- **Admin app**
  - Component tests for the login flow gating (no token → redirect) and dashboard
    section rendering.

## Open questions / future (v2)

- Full cohort retention curves.
- Per-user/workspace drill-down and admin actions (suspend, refund).
- Pulling Sentry/LLM-cost metrics inline (currently link-out).
