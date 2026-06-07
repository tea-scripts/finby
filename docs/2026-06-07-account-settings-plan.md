# Account Settings, Identity & Date-picker Polish — Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD where noted. Steps use `- [ ]`. Paste FULL task text into each implementer (don't make them read this file). Spec: `docs/2026-06-07-account-settings-design.md`.

**Goal:** Add a Settings configuration system (editable profile, tier-gated "currencies I use", display/notification prefs), a unique per-user account number, a header tier chip, and uniform date-picker widths.

**Architecture:** First-class DB columns for `User.accountNumber` (unique) + `Workspace.preferredCurrencies` (array) + a Zod-validated `User.preferences` JSON; new PATCH endpoints + expanded `/auth/me`; web Settings sections + store actions; shared `CURRENCIES` list. Theme is OUT (Phase 2).

**Tech Stack:** NestJS 10 + Prisma 5.22 (`finby-api`), Next 15 + Zustand + Vitest/jsdom (`finby-web`), `@finby/shared` (consumed from `dist/`).

## Conventions
- No `any`. Conventional commits, **NO AI-attribution trailer**. Keep all tests green (API 192, web 49).
- API tests `pnpm --filter finby-api exec jest <pat>`; typecheck `pnpm --filter finby-api exec tsc --noEmit`. Web tests `pnpm --filter finby-web exec vitest run <pat>`; typecheck `pnpm --filter finby-web exec tsc --noEmit`. Shared rebuild: `pnpm --filter @finby/shared build`. Migrate: `pnpm --filter finby-api exec dotenv -e ../../.env -- prisma migrate dev --name <n>` (Postgres on :5434). Do NOT run `pnpm test`; do NOT `pnpm --filter finby-web build` while `next dev` runs.
- Branch `feat/account-settings`. Do not push/merge until the finish step.

---

## Task S1: Shared currency list + preference types (TDD)
**Files:** Modify `packages/shared/src/constants.ts`, `packages/shared/src/types.ts` (or wherever `SubscriptionTier` lives — check the barrel `index.ts`); Test `packages/shared/src/constants.spec.ts` (create if absent; check how shared is tested — if shared has no test runner, skip the spec and rely on API/web tests, but still add the exports).

- [ ] **Add to `types.ts`:**
```ts
export type DateFormat = 'MEDIUM' | 'SHORT' | 'ISO';
export type NumberFormat = 'GROUPED' | 'PLAIN';
export type CurrencyDisplay = 'SYMBOL' | 'CODE';
export interface UserPreferences {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  currencyDisplay: CurrencyDisplay;
}
```
- [ ] **Add to `constants.ts`:**
```ts
export const DEFAULT_PREFERENCES: import('./types').UserPreferences = {
  dateFormat: 'MEDIUM',
  numberFormat: 'GROUPED',
  currencyDisplay: 'SYMBOL',
};

export interface Currency { code: string; name: string; symbol: string }
/** Canonical currency list — single source of truth for all pickers + validation. */
export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
];
export const CURRENCY_CODES: string[] = CURRENCIES.map((c) => c.code);
export function isCurrencyCode(code: string): boolean { return CURRENCY_CODES.includes(code); }
```
- [ ] Ensure all are re-exported from the package barrel (`index.ts` uses `export * from './constants'`/`'./types'` — verify).
- [ ] **Rebuild:** `pnpm --filter @finby/shared build`. Verify `pnpm --filter finby-api exec tsc --noEmit` still 0.
Commit: `feat(shared): currency list + user preference types`.

---

## Task B1: Schema + migration + backfill
**Files:** Modify `apps/api/prisma/schema.prisma`; new migration under `apps/api/prisma/migrations/`.

- [ ] **Schema** — `User`: add `accountNumber String? @unique` and `preferences Json?`. `Workspace`: add `preferredCurrencies String[] @default([])`.
- [ ] **Generate migration WITHOUT applying** so you can edit the SQL (backfill must run before the unique index):
  `cd /home/unicorn/Documents/finby && pnpm --filter finby-api exec dotenv -e ../../.env -- prisma migrate dev --name add_account_settings --create-only`
- [ ] **Edit the generated `migration.sql`** so the order is: (1) `ALTER TABLE "User" ADD COLUMN "accountNumber" TEXT;` + `ADD COLUMN "preferences" JSONB;` (2) `ALTER TABLE "Workspace" ADD COLUMN "preferredCurrencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];` (3) backfill:
```sql
-- backfill account numbers for existing users (random 9-digit, FB- prefix)
UPDATE "User"
SET "accountNumber" = 'FB-' || lpad((floor(random() * 900000000) + 100000000)::bigint::text, 9, '0')
WHERE "accountNumber" IS NULL;
-- existing workspaces use their base currency as the only preferred currency
UPDATE "Workspace" SET "preferredCurrencies" = ARRAY["baseCurrency"] WHERE "preferredCurrencies" = ARRAY[]::TEXT[];
```
  (4) `CREATE UNIQUE INDEX "User_accountNumber_key" ON "User"("accountNumber");`
  (Match exact column/table casing to the existing migrations — Prisma uses quoted PascalCase identifiers; verify against a prior migration file.)
- [ ] **Apply:** `pnpm --filter finby-api exec dotenv -e ../../.env -- prisma migrate dev` (runs the edited migration + `prisma generate`). Confirm client has `accountNumber`, `preferences`, `preferredCurrencies`.
- [ ] Verify `pnpm --filter finby-api exec tsc --noEmit` 0.
Commit: `feat(api): account settings columns + backfill migration`.

---

## Task B2: Account-number util + register wiring (TDD)
**Files:** Create `apps/api/src/modules/auth/account-number.util.ts` (+ `.spec.ts`); Modify `apps/api/src/modules/auth/auth.service.ts` `register()`.

- [ ] **Util:**
```ts
import type { PrismaService } from '../../prisma/prisma.service';

/** Random per-user account number, brokerage style: FB- + 9 digits (first 1-9). */
export function generateAccountNumber(): string {
  const n = Math.floor(Math.random() * 900_000_000) + 100_000_000; // 100000000..999999999
  return `FB-${n}`;
}

/** Generate a unique account number, retrying on the rare unique-constraint collision. */
export async function uniqueAccountNumber(
  prisma: Pick<PrismaService, 'user'>,
  maxTries = 5,
): Promise<string> {
  for (let i = 0; i < maxTries; i += 1) {
    const candidate = generateAccountNumber();
    const clash = await prisma.user.findUnique({ where: { accountNumber: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new Error('Could not generate a unique account number');
}
```
- [ ] **Test** `account-number.util.spec.ts`: `generateAccountNumber()` matches `/^FB-[1-9]\d{8}$/`; `uniqueAccountNumber` returns a non-clashing one (mock `prisma.user.findUnique` → first call returns a row, second returns null → returns the second candidate; assert format). Note: since the value is random, test the format + that it queries; use a mock that returns null to get a value, and a mock returning {id} once then null to exercise retry.
- [ ] **Wire into `register()`:** in the `$transaction`, after creating the user, set `accountNumber` and the workspace `preferredCurrencies`. Simplest: generate the account number BEFORE the tx via `uniqueAccountNumber(this.prisma)`, pass it into `tx.user.create({ data: { …, accountNumber } })`; and set `tx.workspace.create({ data: { …, preferredCurrencies: [input.baseCurrency] } })`. Also set `preferences: DEFAULT_PREFERENCES` on the user create (import from `@finby/shared`; Prisma `Json` accepts the object — cast as needed, e.g. `preferences: DEFAULT_PREFERENCES as unknown as Prisma.InputJsonValue`).
- [ ] Update the register `select`/return so `AuthResult.user` includes `accountNumber` + `preferences` and `workspace` includes `preferredCurrencies` (see B3 for the view shape).
- [ ] `pnpm --filter finby-api exec jest account-number auth.service` green; tsc 0.
Commit: `feat(api): generate unique account number on register`.

---

## Task B3: Expand auth views — user + workspace fields (TDD)
**Files:** Modify `apps/api/src/modules/auth/auth.service.ts` (`getMe`, register/login mappers), `auth.types.ts` (view types), `auth.service.spec.ts`.

**Note:** Keep `GET /auth/me`'s response SHAPE unchanged (it returns the user view only — do NOT change it to `{user, workspace}`; that would break the web `refreshUser`). Just ENRICH the user view. `preferredCurrencies` rides on the workspace view returned by login/register (and the currencies PATCH response in B5); the web store seeds it at login and updates it on PATCH.

- [ ] **View types** (`auth.types.ts`): extend `AuthUserView` with `accountNumber: string | null` and `preferences: UserPreferences` (import from `@finby/shared`); extend the workspace view (used by login/register `AuthResult`) with `preferredCurrencies: string[]`.
- [ ] **`getMe(userId)`**: load user incl `accountNumber`, `preferences`; return the (enriched) `AuthUserView` only — same shape as before, plus the two new fields. Map preferences via `parsePreferences(user.preferences)`.
- [ ] **register/login mappers**: include `accountNumber` + `preferences` on the user view and `preferredCurrencies` on the workspace view (consistent enriched fields across login/register/me-for-the-user-parts).
- [ ] **`parsePreferences(json): UserPreferences`** helper: a helper that merges DB JSON over `DEFAULT_PREFERENCES` + validates with a Zod schema — invalid/missing → defaults.
- [ ] **Zod preferences schema** (in `auth` dto or a shared validator): `z.object({ dateFormat: z.enum(['MEDIUM','SHORT','ISO']), numberFormat: z.enum(['GROUPED','PLAIN']), currencyDisplay: z.enum(['SYMBOL','CODE']) }).partial()` for PATCH; a `parsePreferences(json): UserPreferences` that `safeParse`s and falls back to defaults per field.
- [ ] **Tests** (`auth.service.spec.ts`): `getMe` returns workspace + `accountNumber` + `preferences` (defaults when DB json null); `parsePreferences` returns defaults for null/garbage and respects valid values.
- [ ] tsc 0; `pnpm --filter finby-api exec jest auth.service` green.
Commit: `feat(api): expand /auth/me + auth views with account settings`.

---

## Task B4: PATCH /auth/profile (TDD)
**Files:** Modify `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`, `auth/dto/auth.schemas.ts`, `auth.service.spec.ts`.

- [ ] **DTO** (`auth.schemas.ts`): `updateProfileSchema = z.object({ displayName: z.string().trim().min(1).max(120).optional(), timezone: z.string().trim().min(1).max(64).optional(), preferences: <the partial preferences schema from B3>.optional() })`. Type `UpdateProfileInput`.
- [ ] **Service `updateProfile(userId, dto)`**: build a Prisma update — set displayName/timezone if present; if `dto.preferences`, merge over the user's current preferences (`{ ...parsePreferences(current), ...dto.preferences }`) and store as Json. Return the updated `AuthUserView` (incl accountNumber + preferences).
- [ ] **Controller**: `@Patch('profile')` (JWT-guarded — NOT `@Public`), `@Body(new ZodValidationPipe(updateProfileSchema))`, `@CurrentUser()` → `auth.updateProfile(user.userId, body)`. Returns the user view.
- [ ] **Tests**: valid displayName/timezone update persists + returns; preferences merge (partial patch keeps untouched fields); invalid enum value rejected by the schema (controller-level Zod — test the schema parse rejects).
- [ ] tsc 0; jest green.
Commit: `feat(api): PATCH /auth/profile (name, timezone, preferences)`.

---

## Task B5: PATCH workspace currencies (tier-gated) (TDD)
**Files:** Create `apps/api/src/modules/settings/settings.module.ts`, `settings.controller.ts`, `settings.service.ts`, `dto/settings.schemas.ts`, `settings.service.spec.ts`. Register `SettingsModule` in `app.module.ts`.

- [ ] **DTO**: `updateCurrenciesSchema = z.object({ currencies: z.array(z.string().trim().toUpperCase()).min(1).max(20) })`.
- [ ] **Service `updateCurrencies(workspaceId, tier, currencies)`**: load workspace (`baseCurrency`); validate every code ∈ `CURRENCY_CODES` (`@finby/shared`) else `BadRequestException('Unknown currency')`; must include `baseCurrency` else `BadRequestException('Base currency must be included')`; **tier gate**: if `TIER_LIMITS[tier].currencies !== null` (FREE), require `currencies` to equal `[baseCurrency]` else `throw new ForbiddenException({ error: 'tier_limit', message: 'Multiple currencies require Pro.' })`. De-dupe; persist `preferredCurrencies`. Return the workspace view `{ …, preferredCurrencies }`.
- [ ] **Controller** `@Controller('workspaces/:workspaceId/currencies')` + `@UseGuards(WorkspaceMemberGuard)`: `@Patch()` `@Roles('OWNER')` `@UseGuards(RolesGuard)` `@Workspace() ws` `@Body(ZodValidationPipe(updateCurrenciesSchema))` → `service.updateCurrencies(ws.id, ws.tier, body.currencies)`. (Mirror `subscription.controller.ts` decorators exactly.)
- [ ] **Tests**: PRO with `[base, 'EUR']` → saved; FREE with `[base, 'EUR']` → 403 tier_limit; missing base → 400; unknown code → 400; FREE with exactly `[base]` → ok.
- [ ] Register module; tsc 0; `pnpm --filter finby-api exec jest settings` green; full suite green.
Commit: `feat(api): tier-gated workspace currencies endpoint`.

---

## Task W0: shared rebuild sanity
- [ ] Confirm `pnpm --filter @finby/shared build` ran (from S1) and `pnpm --filter finby-web exec tsc --noEmit` resolves `CURRENCIES`, `UserPreferences`, `DEFAULT_PREFERENCES` from `@finby/shared`. (No commit — sanity gate before web tasks.)

## Task W1: store + types extension (TDD-light)
**Files:** Modify `apps/web/src/lib/types.ts`, `apps/web/src/lib/store.ts`; Test `apps/web/src/lib/store.test.ts`.

- [ ] **types.ts**: extend `ApiUser` with `accountNumber: string | null` and `preferences: UserPreferences` (import from `@finby/shared`); extend `ApiWorkspace` with `preferredCurrencies: string[]`.
- [ ] **store.ts**: login/register seed `user.accountNumber`/`user.preferences` + `workspace.preferredCurrencies`; `refreshUser` (`/auth/me`, unchanged user-only shape) refreshes the user fields. Verify the store mappers don't whitelist fields (if they construct `ApiUser`/`ApiWorkspace` explicitly, add the new fields). Add actions:
  - `setUser(patch: Partial<ApiUser>)` (or reuse an existing user-setter) to merge updated profile/preferences.
  - `setPreferredCurrencies(codes: string[])` → merge into `workspace`.
  Keep `setWorkspaceTier` (exists). Default `user.preferences` to `DEFAULT_PREFERENCES` if absent.
- [ ] **Test**: setUser merges preferences; setPreferredCurrencies updates workspace; absent preferences fall back to defaults.
Commit: `feat(web): store fields + actions for account settings`.

## Task W2: settings-api client (TDD-light)
**Files:** Create `apps/web/src/lib/settings-api.ts`, `settings-api.test.ts`.
- [ ] Mirror `billing-api.ts` (`authed()` helper). Functions: `updateProfile(patch: { displayName?; timezone?; preferences? })` → `PATCH /auth/profile`; `updateCurrencies(workspaceId, currencies: string[])` → `PATCH /workspaces/:id/currencies`. Return the updated views.
- [ ] **Test** (node env): assert path/method/body for each (mock `authed`).
Commit: `feat(web): settings api client`.

## Task W3: Settings — editable Profile + account number (TDD)
**Files:** Create `apps/web/src/components/settings/profile-section.tsx` (+ test); Modify `apps/web/src/app/(app)/settings/page.tsx`.
- [ ] `<ProfileSection>`: editable display name + timezone (inputs + Save button, loading/error), email read-only, **account number** shown (monospace, with a copy button). On Save → `updateProfile` then `setUser`. Use `ui/field`, `ui/input`, `ui/button`.
- [ ] Mount in `settings/page.tsx` replacing the read-only profile block.
- [ ] **Test** (jsdom): renders name/email/account number; editing + Save calls `updateProfile` with the patch; error state on reject.
Commit: `feat(web): editable profile + account number in settings`.

## Task W4: Settings — tier-gated Currencies section (TDD)
**Files:** Create `apps/web/src/components/settings/currencies-section.tsx` (+ test); Modify `settings/page.tsx`.
- [ ] `<CurrenciesSection>`: list `CURRENCIES` (from `@finby/shared`) as toggleable chips; base currency (`workspace.baseCurrency`) pinned + disabled (always selected); selected set seeded from `workspace.preferredCurrencies`. **Tier gate**: if `tierRank(tier) < PRO` (reuse the `UpgradeGate`/tier logic), show base only + an upgrade nudge (reuse `<UpgradeGate requiredTier="PRO" featureName="Multiple currencies">` wrapping the multi-select, or inline). Save → `updateCurrencies(workspace.id, codes)` then `setPreferredCurrencies`. Loading/error.
- [ ] Mount in settings page.
- [ ] **Test**: PRO shows multi-select + Save calls updateCurrencies incl base; FREE shows the gated/upgrade UI and base-only; base chip can't be deselected.
Commit: `feat(web): tier-gated currencies section`.

## Task W5: Settings — Preferences section (TDD)
**Files:** Create `apps/web/src/components/settings/preferences-section.tsx` (+ test); Modify `settings/page.tsx`. Check the existing push toggle: `components/chat/notif-toggle.tsx` + `lib/push.ts`.
- [ ] `<PreferencesSection>`: a date-format `Dropdown` (MEDIUM/SHORT/ISO with example labels), a currency-display `Dropdown` (SYMBOL/CODE) + number-format (GROUPED/PLAIN), and the **push notifications toggle** (reuse the existing push subscribe/unsubscribe logic from `notif-toggle`/`lib/push.ts` — extract a small shared hook if needed, don't duplicate). Changing a pref → `updateProfile({ preferences: { … } })` then `setUser`.
- [ ] Mount in settings page.
- [ ] **Test**: changing date format calls updateProfile with the new preferences; push toggle invokes subscribe/unsubscribe (mock `lib/push`).
Commit: `feat(web): preferences section (date/number/currency + push)`.

## Task W6: Currency picker consumers (TDD-light)
**Files:** Modify `apps/web/src/components/transactions/transaction-filters.tsx`, `apps/web/src/components/transactions/edit-transaction-modal.tsx`, `apps/web/src/app/register/page.tsx`. Delete the two hardcoded `CURRENCIES` arrays.
- [ ] `transaction-filters.tsx` + `edit-transaction-modal.tsx` currency options come from the user's `preferredCurrencies` (`useAuth((s)=>s.workspace?.preferredCurrencies)`, fallback to `CURRENCY_CODES`). `register/page.tsx` base-currency select uses `CURRENCIES` from `@finby/shared` (no preference pre-signup).
- [ ] Keep the existing "All currencies" empty option in the filter.
- [ ] **Test**: filter renders options from preferredCurrencies (mock store).
Commit: `feat(web): currency pickers use shared list + preferences`.

## Task W7: Preference-aware formatters (TDD)
**Files:** Modify `apps/web/src/lib/format.ts`; Create `apps/web/src/lib/use-formatters.ts` (+ test). Apply on primary surfaces: dashboard, transactions list, chat amount cards.
- [ ] `format.ts`: `shortDate(iso, fmt: DateFormat = 'MEDIUM')` and `money(amount, currency, opts?: { display?: CurrencyDisplay; grouping?: NumberFormat })` — pure, default to today's behavior when opts omitted (no regression).
- [ ] `use-formatters.ts`: `useFormatters()` reads `useAuth((s)=>s.user?.preferences) ?? DEFAULT_PREFERENCES` and returns `{ formatDate(iso), formatMoney(amount, currency) }` bound to those prefs.
- [ ] Swap the **primary surfaces** (dashboard cards, transactions list rows, chat TRANSACTION_CREATED card) to `useFormatters()`. Note in the commit which surfaces are covered; others migrate later.
- [ ] **Test**: `shortDate`/`money` honor each format option; `useFormatters` reflects store prefs (mock store).
Commit: `feat(web): preference-aware date/money formatting`.

## Task W8: Header tier chip (TDD)
**Files:** Create `apps/web/src/components/ui/tier-badge.tsx` (extract from `PlanCard.tsx`) (+ test); Modify `PlanCard.tsx` to import it; Modify `apps/web/src/components/app/app-header.tsx`.
- [ ] Extract the inline `TierBadge` from `PlanCard.tsx` into `ui/tier-badge.tsx` (`<TierBadge tier />`, the existing badge colors). Update PlanCard to import it (no visual change).
- [ ] In `app-header.tsx`, render `<TierBadge tier={tier} />` next to the logo (`tier = useAuth((s)=>s.workspace?.tier) ?? 'FREE'`). Mobile-safe (small).
- [ ] **Test**: TierBadge renders the tier label/color; header shows it.
Commit: `feat(web): tier chip in app header`.

## Task W9: Uniform date-picker width (TDD)
**Files:** Modify `apps/web/src/components/ui/input.tsx` (+ a test, `input.test.tsx` if absent).
- [ ] In `Input`, when `props.type === 'date'`, append `appearance-none` to the className (base already `w-full`). This fixes the edit-transaction modal and any date input uniformly (iOS `<input type=date>` ignores width without `appearance-none`).
- [ ] Optionally drop the now-redundant manual `appearance-none` in `transaction-filters.tsx` (leave the `min-w-0`/grid which serve the stacking layout).
- [ ] **Test** (jsdom): `<Input type="date" />` has class `appearance-none`; `<Input type="text" />` does not.
Commit: `fix(web): uniform date-picker width via appearance-none`.

---

## Task FINAL: Verify + smoke + finish
- [ ] API: `pnpm --filter finby-api exec jest` (all green) + `tsc --noEmit` + `pnpm --filter finby-api build`. Web: `pnpm --filter finby-web exec vitest run` + `tsc --noEmit` + `pnpm --filter finby-web build` (stop `next dev` first).
- [ ] **Live smoke** (local API + .env): register a new user → response/`/auth/me` includes `accountNumber` (matches `/^FB-[1-9]\d{8}$/`) + `preferences` + `workspace.preferredCurrencies=[base]`. `PATCH /auth/profile` updates name/timezone/prefs. `PATCH /workspaces/:id/currencies` — PRO ok, FREE non-base → tier_limit. Existing backfilled users have an account number (psql: `SELECT "accountNumber" FROM "User" LIMIT 5;`).
- [ ] Manual web check (local `next dev`): Settings shows account number + editable profile + currencies + prefs + tier chip in header; date inputs uniform.
- [ ] superpowers:finishing-a-development-branch → merge/PR per user. New migration runs on Render via `prisma migrate deploy` (preDeploy). New env: none.

## Self-Review (coverage)
Spec → tasks: shared currencies/prefs (S1) · schema+backfill (B1) · account number (B2) · /auth/me expand (B3) · profile PATCH (B4) · currencies PATCH tier-gate (B5) · store (W1) · settings-api (W2) · profile+account# UI (W3) · currencies UI (W4) · prefs UI (W5) · picker consumers (W6) · formatters (W7) · tier chip (W8) · date-picker (W9) · verify (FINAL). Theme excluded by design. No `any`; TDD on logic-bearing tasks; migration backfills existing users; tier gating server-enforced (B5) + UI (W4).
