# Account Settings, Identity & Date-picker Polish — Design Spec (v1, repo-accurate)

**Status:** approved design → ready for implementation plan.
**Date:** 2026-06-07.
**Theme / light mode is explicitly OUT of v1** (its own Phase-2 brainstorm + spec).

## Goal
1. A **Settings configuration system** surfaced on the Settings page and consumed elsewhere: editable profile, a tier-gated "currencies I use" list, and display/notification preferences.
2. A **unique per-user account number** (`FB-`+9 digits) generated on signup (and backfilled), shown on Settings — like a brokerage account number.
3. A **tier chip** in the app header on every page.
4. **Date-picker width uniformity** across all date inputs.

## Decisions (locked with user)
- Storage approach **A**: first-class columns for `accountNumber` (unique) + `Workspace.preferredCurrencies` (array); a small Zod-validated `User.preferences` JSON for soft display prefs. No separate settings table.
- Currencies list is **tier-gated**: FREE = base currency only; PRO+ = any subset of the master list that includes base.
- Account number is **per-user**, format `FB-` + 9 random digits (non-sequential), unique.
- Prefs in v1: **date format, number/currency display, push toggle** (+ editable profile, + tier chip). **Theme deferred.**
- Base currency stays **immutable** (changing it would desync `amountBase` frozen on existing transactions).

## Repo facts this builds on (verified)
- Currency list hardcoded in TWO web spots: `apps/web/src/app/register/page.tsx` and `apps/web/src/components/transactions/transaction-filters.tsx` (`['USD','EUR','GBP','NGN','KES','GHS','ZAR','CAD','AUD','INR','JPY']`). No `@finby/shared` currency constant. No PHP despite PH users.
- `User` (cuid id): email, passwordHash, displayName, avatarUrl?, timezone, emailVerified, emailVerifyToken?, resetToken?, resetTokenExpiry?, timestamps, lastLoginAt?. **No** accountNumber/preferences.
- `Workspace`: id, name, slug, tier, maxMembers, **baseCurrency** (`String @default("USD")`), timestamps. **No** preferredCurrencies/settings.
- `register()` in `auth.service.ts` creates User + Workspace(baseCurrency) + OWNER member + 10 `DEFAULT_CATEGORIES`. `AuthResult` = `{user{id,displayName,email,emailVerified,timezone}, workspace{id,name,slug,tier,baseCurrency}, accessToken, refreshToken}`.
- `GET /auth/me` returns **user only** (AuthUserView) — no workspace. `refreshUser()` in the web store calls it.
- **No** profile/settings PATCH endpoints. Settings page = read-only Profile + `<PlanCard/>` ("Editing coming soon.").
- Web store `useAuth`: `user: ApiUser {id,displayName,email,emailVerified,timezone}`, `workspace: ApiWorkspace {id,name,slug,tier,baseCurrency}`.
- `@finby/shared` exports: `TIER_LIMITS` (incl `currencies` cap — FREE=1, PRO+=null), `TIER_PRICING`, `TIER_HIGHLIGHTS`, `formatTierPrice`, `DEFAULT_CATEGORIES`, `SubscriptionTier`. No currency constant.
- Tier in UI: `useAuth((s)=>s.workspace?.tier)`; `UpgradeGate`/`TierBadge` (TierBadge inline in `PlanCard.tsx`). Server: `@RequireTier` + `TierGuard`, `WorkspaceMemberGuard`, `@Roles('OWNER')` + `RolesGuard`.
- Date inputs: `transaction-filters.tsx` uses `className="min-w-0 appearance-none"` (uniform); `edit-transaction-modal.tsx` date `<Input type="date">` has **no** extra classes (wider). `ui/input.tsx` base = `w-full … text-base md:text-sm` + passthrough `className`.
- iOS gotchas (memory): `<input type=date>` ignores `width:100%` → needs `appearance-none`; mobile inputs need 16px (`text-base md:text-sm`) to avoid zoom.

---

## Part A — Shared (`packages/shared`)
**Add `CURRENCIES`** to `src/constants.ts`: canonical list `[{ code, name }]` covering the existing 11 **plus PHP** (PH users) and a few common ones (e.g. SGD, AED, CNY) — final list in the plan. Export a `CurrencyCode` type or keep `string`. Rebuild shared via turbo (consumed from `dist/`).
**Add preference types**: `DateFormat = 'MEDIUM'|'SHORT'|'ISO'`, `NumberFormat = 'GROUPED'|'PLAIN'`, `CurrencyDisplay = 'SYMBOL'|'CODE'`, `UserPreferences` interface, and `DEFAULT_PREFERENCES` (`{dateFormat:'MEDIUM', numberFormat:'GROUPED', currencyDisplay:'SYMBOL'}`).

## Part B — Backend (`apps/api`)

### B1. Schema + migration
- `User.accountNumber String? @unique` and `User.preferences Json?`.
- `Workspace.preferredCurrencies String[] @default([])`. **Always treated as "at least the base currency"**: `register()` sets new workspaces' `preferredCurrencies = [baseCurrency]`; the API/UI treat an empty array as `[baseCurrency]`.
- Migration `add_account_settings`: add columns; **backfill** existing users with a unique `FB-`+9-digit number (SQL `UPDATE … WHERE accountNumber IS NULL`); set existing workspaces' `preferredCurrencies = ARRAY[baseCurrency]`. Add the unique index after backfill.

### B2. Account-number generator
Util `account-number.util.ts`: `generateAccountNumber()` → `FB-` + 9 digits (first digit 1–9). `assignAccountNumber(prisma, userId)` creates-with-retry on unique violation (P2002), max ~5 tries. Called in `register()` after user create (inside or right after the tx). New users always get one.

### B3. Endpoints
- **Expand `GET /auth/me`** → `{ user: {…, accountNumber, preferences}, workspace: {…, preferredCurrencies} }` (the membership's workspace). Update `AuthService.getMe` + the view type. Store hydrates everything from this.
- **`PATCH /auth/profile`** (`@Public()` off; JWT) body `{ displayName?, timezone?, preferences? }` (Zod; preferences merged + validated against the enums) → returns the updated user view. Service: `updateProfile(userId, dto)`.
- **`PATCH /workspaces/:workspaceId/currencies`** (`WorkspaceMemberGuard` + `@Roles('OWNER')` + `RolesGuard`) body `{ currencies: string[] }`. Validation: every code ∈ master list; must include `baseCurrency`; **tier gate** — if `TIER_LIMITS[tier].currencies !== null` (i.e. FREE, cap 1) then `currencies` must equal `[baseCurrency]` (else 403/422 `tier_limit`). Returns updated workspace view (`{…, preferredCurrencies}`). New small `SettingsController`/`SettingsService` under a `settings` module, or fold into existing workspace-scoped module — decide in plan; reuse the `@Workspace()` decorator pattern.
- Push toggle: **reuse existing** `push` endpoints (subscribe/unsubscribe + VAPID pubkey). No new API.

### B4. Tests
account-number util (format, retry on collision); `getMe` returns workspace + new fields; profile PATCH (valid update, invalid pref enum rejected); currencies PATCH (PRO multi ok; FREE non-base rejected; non-base-missing rejected; unknown code rejected).

## Part C — Web (`apps/web`)

### C1. Store + types
Extend `ApiUser` (`accountNumber`, `preferences`) and `ApiWorkspace` (`preferredCurrencies`); hydrate from `/auth/me`, login, register. Add actions: `updateProfile(patch)`, `updatePreferences(patch)`, `updateCurrencies(codes)` — each calls the PATCH endpoint via `authed()` then updates state. Default missing `preferences` to `DEFAULT_PREFERENCES`.

### C2. settings-api client
`lib/settings-api.ts`: `updateProfile`, `updatePreferences` (→ `PATCH /auth/profile`), `updateCurrencies(workspaceId, codes)` (→ `PATCH /workspaces/:id/currencies`).

### C3. Settings page sections (`app/(app)/settings/page.tsx`)
- **Profile** (now editable): display name + timezone inputs with Save; email read-only; **account number** displayed (monospace, copyable). Optimistic-ish save with error state.
- **Currencies**: multi-select chips/list from master `CURRENCIES`; base currency pinned + non-removable. **Tier-gated**: FREE shows base only + an `<UpgradeGate requiredTier="PRO" featureName="Multiple currencies">` style nudge; PRO+ can toggle others. Save → `updateCurrencies`.
- **Preferences**: date-format select, number/currency-display select, **push notifications toggle** (reuse the existing push subscribe/unsubscribe hook/component — relocate/share the header `notif-toggle` logic). Save prefs → `updatePreferences`.
- **Plan & Billing**: existing `<PlanCard/>` unchanged.

### C4. Consumers
- **Currency pickers**: `transaction-filters.tsx` currency dropdown + `edit-transaction-modal.tsx` currency field use the user's `preferredCurrencies` (fallback master list); `register/page.tsx` base-currency select uses the master `CURRENCIES` (no preference exists pre-signup). Delete the two hardcoded arrays.
- **Formatters**: `lib/format.ts` `shortDate`/`money` gain optional format params; add a `useFormatters()` hook that binds the user's `preferences` from the store and returns `{ formatDate, formatMoney }`. Apply on the **primary surfaces** (transactions list, dashboard, chat amount cards) in v1; other spots can migrate incrementally. Document which surfaces are covered.

### C5. Tier chip
Extract `TierBadge` from `PlanCard.tsx` to a shared `components/ui/tier-badge.tsx` (used by PlanCard + header). Render it in `AppHeader` next to the logo (reads `useAuth((s)=>s.workspace?.tier)`) — visible on every `(app)` page. Mobile-safe sizing.

### C6. Date-picker width fix
In `ui/input.tsx`, when `type === 'date'`, append `appearance-none` to the className (base already `w-full`). This makes **every** date input uniform (edit-transaction modal + anywhere) without per-site classes. The filters' manual `appearance-none` becomes redundant (leave or clean up).

### C7. Tests (Vitest + jsdom harness already present)
settings-api shapes; store actions update state; Settings sections render + save (mock api); FREE currencies gating UI; `useFormatters` honors prefs; tier chip renders tier; Input adds `appearance-none` for `type=date`.

## Out of scope (v1)
Theme/light mode; changing base currency; email change; number-format applied to *every* legacy display (primary surfaces only); avatar upload.

## Build order
Shared (`CURRENCIES` + pref types) → schema + migration + backfill → account-number util + register wiring → API endpoints (`/auth/me` expand, profile PATCH, currencies PATCH) → store + settings-api → Settings sections → consumers (pickers + formatters) → tier chip → date-picker fix → verify + finish.

## Verification
API: `pnpm --filter finby-api exec jest` + tsc + build. Web: `pnpm --filter finby-web exec vitest run` + tsc + build. Live smoke: register → account number present; PATCH profile/currencies; FREE currency gate returns tier_limit; Settings page edits persist; tier chip shows; date inputs uniform width (device check for iOS).
