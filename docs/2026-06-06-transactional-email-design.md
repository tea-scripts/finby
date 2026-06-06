# Transactional Email — Verification, Welcome & Password Reset

**Date:** 2026-06-06
**Scope:** `apps/api` (new EmailModule + auth wiring) and `apps/web` (banner + 3 pages).
**Status:** Approved (design), pending implementation plan.

## Problem

Finby has no email infrastructure. Three gaps:
1. New signups are never asked to verify their email (`User.emailVerified` defaults
   to `false` and nothing ever flips it).
2. There is no welcome email.
3. `AuthService.forgotPassword()` generates and stores a reset token but has a
   `// TODO(Phase 2): email rawToken` — the reset email is never sent, so the
   password-reset flow is a dead end. No frontend reset pages exist either.

## Decisions (locked)

- **Verification enforcement: soft nag.** Users are logged in immediately on
  signup and can use the app. A dismissible banner prompts them to verify;
  nothing is blocked.
- **Build all three emails:** verification (on signup), welcome (after verify),
  password reset (finish the existing flow).
- **Provider: Resend** (already used by the marketing site), behind a
  provider-agnostic port mirroring the existing `BillingProvider` pattern.
- **Welcome timing:** sent **after** the user verifies (verify email is first).

## Pre-existing facts (no change needed)

- `User` already has `emailVerified Boolean @default(false)`, `emailVerifyToken
  String? @unique`, `emailVerifyExpiry DateTime?` → **no migration** for
  verification.
- `User` already has `resetToken` / `resetTokenExpiry`; `forgotPassword()` /
  `resetPassword()` backend logic exists and works — only the email send and the
  frontend pages are missing.
- Frontend `User` type already includes `emailVerified: boolean` (store-ready).
- `WEB_URL` env exists (`https://chat.finby.app` in prod) — used to build links.

## Design

### 1. EmailModule (apps/api/src/modules/email)

- **`EmailProvider` port** (interface): `send(msg: { to; subject; html }): Promise<void>`.
- **`ResendProvider implements EmailProvider`** — the ONLY file importing the
  Resend SDK. Reads `RESEND_API_KEY` + `EMAIL_FROM`. **If `RESEND_API_KEY` is
  unset: log once and no-op** (so local dev / pre-go-live prod don't fail) —
  mirrors StripeProvider/VAPID behaviour.
- **`EmailService`** — domain methods that render templates and call the provider:
  - `sendVerification(to, displayName, verifyUrl)`
  - `sendWelcome(to, displayName)`
  - `sendPasswordReset(to, resetUrl)`
  - Templates are small inline HTML (clean, light-background, on-brand accent
    `#1d6ef5`), kept in a `email.templates.ts`.
- Module exports `EmailService`; `AuthModule` imports `EmailModule`.

### 2. Verification (apps/api/src/modules/auth)

Token strategy mirrors the reset flow: store `sha256(raw)` in `emailVerifyToken`,
email the `raw`. Expiry 24h.

- **`register()`**: after the user/workspace transaction, generate + persist the
  verify token and call `email.sendVerification(user.email, displayName,
  \`${WEB_URL}/verify-email?token=${raw}\`)`. Wrapped in try/catch — a mail
  failure logs but does NOT fail registration. Returns the same `AuthResult`.
- **`verifyEmail(token)`**: hash → find by `emailVerifyToken` → check
  `emailVerifyExpiry` → set `emailVerified=true`, null the token/expiry → call
  `email.sendWelcome(...)`. Throws `UnauthorizedException('Invalid or expired
  verification link.')` on miss/expiry.
- **`resendVerification(userId)`**: regenerate token + resend. No-op (silent) if
  already verified.
- **Controller**:
  - `POST /auth/verify-email` — body `{ token }` (Zod), public.
  - `POST /auth/resend-verification` — JWT-guarded, uses `req.user.sub`.
- **DTOs**: `verifyEmailSchema = z.object({ token: z.string().min(1) })`.

### 3. Password reset completion (apps/api)

- In `forgotPassword()`, replace the TODO with
  `email.sendPasswordReset(user.email, \`${WEB_URL}/reset-password?token=${raw}\`)`.
  The non-enumerating response and the existing token logic are unchanged.

### 4. Frontend (apps/web)

- **`lib/auth-api.ts`** (new): `verifyEmail(token)`, `forgotPassword(email)`,
  `resetPassword(token, newPassword)` via `apiFetch` (public); `resendVerification()`
  uses the store's `authed()` bearer helper (logged-in only).
- **Store**: a `markVerified()` action (or reuse setter) to flip
  `user.emailVerified = true` after the verify page succeeds.
- **Verification banner** `components/app/verify-email-banner.tsx` — slim
  dismissible bar (mirrors `InstallBanner`), mounted in `(app)/layout.tsx`,
  rendered only when `user && !user.emailVerified`. "Verify your email" + a
  **Resend** button (calls `resendVerification`, shows a sent/again state).
- **`app/verify-email/page.tsx`** — reads `?token`, calls `verifyEmail`, shows
  loading → success ("Email verified 🎉", link to /chat, flips store) or error
  ("link expired or invalid" + Resend if logged in). Outside the `(app)` group.
- **`app/forgot-password/page.tsx`** — email field → `forgotPassword` → always
  shows "If that email exists, we've sent a reset link." Uses `AuthShell`.
- **`app/reset-password/page.tsx`** — reads `?token`, new-password (+ confirm) →
  `resetPassword` → success → link/redirect to `/login`. Uses `AuthShell` +
  `PasswordInput`.
- **`/login`**: add a "Forgot password?" link → `/forgot-password`.

### 5. Config / env (set at go-live)

| Var | Example | Notes |
|-----|---------|-------|
| `RESEND_API_KEY` | `re_…` | unset ⇒ email no-ops |
| `EMAIL_FROM` | `Finby <noreply@finby.app>` | sender |
| `WEB_URL` | `https://chat.finby.app` | already set; link base |

Plus a **deploy step** (not code): verify the `finby.app` domain in Resend (SPF/
DKIM/DMARC DNS). Inert until done.

### 6. Testing

- **`ResendProvider` / `EmailService`** (`*.spec.ts`, Resend SDK mocked):
  no-op when key unset; correct `{to, subject, html}` per method; links present.
- **`AuthService`** (extend existing spec, inject a mock `EmailService`):
  - register → calls `sendVerification`; a thrown email error does NOT fail register.
  - `verifyEmail` valid → sets `emailVerified`, clears token, calls `sendWelcome`.
  - `verifyEmail` expired/invalid → throws, no state change.
  - `resendVerification` on a verified user → no send.
  - `forgotPassword` for an existing user → calls `sendPasswordReset`; unknown
    email → no send, no throw.
  - Inject the mock so the **114 existing API tests stay green**.
- **Frontend**: typecheck; pages are forms over the auth client (no new pure logic
  to unit-test beyond what the api client already covers).

## Files

| File | Change |
|------|--------|
| `apps/api/src/modules/email/email.module.ts` | new |
| `apps/api/src/modules/email/email.service.ts` | new |
| `apps/api/src/modules/email/email.templates.ts` | new |
| `apps/api/src/modules/email/email.provider.ts` (port) | new |
| `apps/api/src/modules/email/providers/resend.provider.ts` | new |
| `apps/api/src/modules/email/*.spec.ts` | new |
| `apps/api/src/modules/auth/auth.service.ts` | register hook, verifyEmail, resendVerification, forgotPassword email |
| `apps/api/src/modules/auth/auth.controller.ts` | verify-email, resend-verification routes |
| `apps/api/src/modules/auth/dto/auth.schemas.ts` | verifyEmailSchema |
| `apps/api/src/modules/auth/auth.module.ts` | import EmailModule |
| `apps/api/src/modules/auth/auth.service.spec.ts` | extend |
| `apps/api/.env.example` (+ root) | RESEND_API_KEY, EMAIL_FROM |
| `apps/web/src/lib/auth-api.ts` | verify/resend/forgot/reset calls |
| `apps/web/src/lib/store.ts` | markVerified |
| `apps/web/src/components/app/verify-email-banner.tsx` | new |
| `apps/web/src/app/(app)/layout.tsx` | mount banner |
| `apps/web/src/app/verify-email/page.tsx` | new |
| `apps/web/src/app/forgot-password/page.tsx` | new |
| `apps/web/src/app/reset-password/page.tsx` | new |
| `apps/web/src/app/login/page.tsx` | "Forgot password?" link |

## Sequence (for the plan)

1. EmailModule (provider + service + templates + tests).
2. Verification backend (register hook, verify-email, resend) + welcome.
3. Verification frontend (banner, verify-email page, store).
4. Password reset (backend email wire + forgot/reset pages + login link).

## Risks / Notes

- Resend domain not yet verified ⇒ emails no-op in prod until DNS is set; the app
  stays fully usable (soft-nag). Surface this clearly at go-live.
- `verify-email` / `reset-password` pages live OUTSIDE the `(app)` auth group
  (a logged-out user may click a link). Verify works without a session; resend
  requires one (only offered when logged in).
- Account-enumeration: keep the generic forgot-password response; verify-email
  errors are generic too.
