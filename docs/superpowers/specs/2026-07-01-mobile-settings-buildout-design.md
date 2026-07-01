# Mobile Settings Build-Out — Design

**Date:** 2026-07-01
**Status:** Approved design → ready for implementation plan
**Scope:** Port the remaining PWA settings sections to the Expo/React Native app.

## Goal

The web PWA settings page (`apps/web/src/app/(app)/settings/page.tsx`) renders 12
sections. The mobile app (`apps/mobile/src/screens/settings-screen.tsx`) already has
4 pieces: the **Streak row**, **Plan & Billing** card, **Biometric toggle**, and
**Log out** button. This project builds out the remaining sections in React Native.

## Scope decisions (locked)

- **In scope:** Profile, Preferences (display dropdowns only), Currencies
  (base + preferred, combined), Accounts CRUD, Family members, Feedback, Support,
  Refer & Earn (coming-soon), About/Privacy.
- **Out of scope (separate follow-up plan):** the native push-notification +
  daily-reminder subsystem (`expo-notifications`). The Preferences section therefore
  contributes only its three display dropdowns; the streak row already exists.
- **Navigation pattern:** settings **hub + sub-screens** (iOS-style), not one long
  scroll. Keeps each file well under the 500-line project limit.
- **Currencies:** base-currency picker and preferred-currency chips live on **one
  combined screen** (web splits them into two sections).
- **Family members:** stays in this plan as the **final phase**, not a separate flow.

## Architecture

The existing settings screen becomes a **hub** of grouped, tappable rows. Each
heavy/interactive section becomes its own `expo-router` screen.

### File layout

```
apps/mobile/app/(app)/settings/
  _layout.tsx              // Stack for the settings sub-tree
  index.tsx                // hub (or keep settings.tsx exporting the hub screen)
  profile.tsx
  preferences.tsx
  currencies.tsx           // base currency + preferred currencies combined
  accounts.tsx
  members.tsx              // FAMILY tier only
  feedback.tsx
  support.tsx

apps/mobile/src/screens/settings/
  settings-hub-screen.tsx  // restructured from the current settings-screen.tsx
  profile-screen.tsx
  preferences-screen.tsx
  currencies-screen.tsx
  accounts-screen.tsx
  members-screen.tsx
  feedback-screen.tsx
  support-screen.tsx

apps/mobile/src/components/settings/
  settings-row.tsx
  settings-group.tsx
  confirm-sheet.tsx
  upgrade-gate.tsx
  color-picker.tsx
  star-rating.tsx
```

Each route file under `app/` is a thin `export { X as default }` wrapper; the real
screen lives in `src/screens/settings/`.

### Hub layout (top → bottom)

- Streak row *(exists)* → navigates to `/streaks`
- Plan & Billing card *(exists)*
- **Account** group: `Profile ›`, `Preferences ›`, `Currencies ›`, `Accounts ›`
- **Family** group *(FAMILY tier only)*: `Family members ›`
- **Support & feedback** group: `Feedback ›`, `Support ›`, `Refer & Earn`
  (disabled coming-soon row), `Privacy Policy ↗` (opens URL)
- **Security**: Biometric toggle *(exists, inline)*
- Log out *(exists, inline)*

## New shared primitives (build once, reuse)

- **`SettingsRow`** — label + optional value / chevron / trailing switch; pressable.
  Both the hub and detail screens are composed from it.
- **`SettingsGroup`** — grouped card with an uppercase header; wraps existing
  `SectionCard` styling/tokens.
- **`UpgradeGate`** (mobile) — mirrors web's tier gate. Wraps the preferred-currencies
  control; shows an upgrade prompt for FREE tier that opens the existing
  `PlanCarouselSheet`.
- **`ConfirmSheet`** — `BottomSheet`-based confirm dialog. Used by base-currency
  change, account archive, member remove, and leave-family.
- **`ColorPicker`** — swatch row for account colors.
- **`StarRating`** — 1–5 star selector for Feedback.

## Screens (data + controls)

### Profile — `PATCH /auth/profile`
- Account number display + copy button (`expo-clipboard`, "Copied" for ~1.5s).
- Name `Input`, Timezone `Input`, Email `Input` (read-only, "Email can't be changed.").
- Save button — disabled until dirty / while saving. On success:
  `api.settings.updateProfile({ displayName, timezone })`, then update auth store
  (`setUser`-equivalent) and persist to identity store.

### Preferences — `PATCH /auth/profile` (preferences key)
- Three `Dropdown`s, each auto-saving on change (no Save button):
  - Date format: MEDIUM / SHORT / ISO
  - Currency display: SYMBOL / CODE
  - Number format: GROUPED / PLAIN
- Inline "saving / saved / error" status indicator (mirror web `saveState`).
- **Deferred:** iOS push notice, push toggle, daily reminder. Streak row already
  exists on the hub.

### Currencies (combined) — base + preferred
- **Base currency** `Dropdown` (all `CURRENCIES`). Selecting a different code opens
  `ConfirmSheet` warning about recalculating transactions/budgets/investments.
  Confirm → `api.settings.updateBaseCurrency(workspaceId, code)`; show
  "Recalculated N transaction(s) into {base}." Cancel reverts.
- **Preferred currencies** chips below, wrapped in `UpgradeGate requiredTier="PRO"`.
  Base is always selected + locked. Toggle chips, Save → `api.settings.updateCurrencies`.
- Auth-store setters added for `baseCurrency` and `preferredCurrencies`, persisted via
  identity store.

### Accounts — `GET/POST/PATCH /workspaces/{id}/accounts`
- List: active accounts first, then archived. Each row: color dot, name
  ("(archived)" suffix), type label, formatted balance (read-only).
- Add form in a `BottomSheet`: name (required), account type `Dropdown`, currency
  `Dropdown` (base + preferred only), opening balance (optional, default "0"),
  `ColorPicker`.
- Inline edit: name + color; Save/Cancel. Archive/unarchive with `ConfirmSheet`.
- Permissions: `VIEWER` sees a read-only list + "Only owners and co-managers can add
  or edit accounts."; `OWNER`/`CO_MANAGER` can edit.

### Family members — `api.members.*` (FAMILY tier only)
- Members list: name ("(you)"), email, role badge or role `Dropdown`
  (VIEWER/CO_MANAGER, OWNER-only, not shown for the OWNER row), remove (OWNER-only).
- Invite form (OWNER-only): email + role `Dropdown` → `inviteMember`.
- Pending invites (OWNER-only): resend / cancel.
- Leave-family (non-OWNER): `ConfirmSheet` → `leaveWorkspace`, then refresh workspaces
  and switch active workspace.
- Screen is only reachable/rendered when `workspace.tier === 'FAMILY'`.

### Feedback — `POST /feedback`
- `StarRating` (1–5) + optional comment (max 2000). Submit disabled until rating ≥ 1.
- Success state ("Thank you…"). Track `feedback_submitted` analytics event.

### Support — `GET/POST /support/tickets`
- Form: category `Dropdown`, subject (max 160, required), message (max 5000, required).
- Ticket history list with status badges (OPEN / IN_PROGRESS / RESOLVED), lazy-loaded.

### Refer & Earn / About
- Refer & Earn: static disabled "coming soon" row on the hub.
- Privacy Policy: row opening the privacy URL via `Linking.openURL`.

## Data & state

- Reuse `@finby/core` API factories already wired into the mobile `api.*` object
  (`settings`, `accounts`, `members`, `support`, `feedback`, `billing`).
- Add currency/user setters to the mobile auth store where the web store has them
  (`setBaseCurrency`, `setPreferredCurrencies`, user-merge), persisting to the
  identity store so changes survive relaunch.
- No new global stores beyond that; screens use local `useState` + the existing
  `SectionState` loading/error pattern.

## Reuse of existing mobile primitives

`Toggle`, `Dropdown`, `BottomSheet`, `Button`, `Input`, `SectionCard`
(+`SectionLoading`/`SectionError`), `TierBadge`, `PlanCarouselSheet`, theme tokens
(`COLORS`), and NativeWind classes. Navigation via `expo-router` `useRouter().push`.

## Testing

- Follow existing mobile Vitest/RNTL patterns. Each screen: happy path + one error
  path. New primitives (`SettingsRow`, `ConfirmSheet`, `UpgradeGate`, `StarRating`,
  `ColorPicker`) get focused unit tests.
- Run the mobile test suite, typecheck, and lint before completion.

## Phase ordering (single plan, sequential)

1. **Primitives + hub** — `SettingsRow`, `SettingsGroup`, `ConfirmSheet`; restructure
   the current settings screen into the hub; add the settings `Stack` and routes.
2. **Profile + Preferences + About/Refer** (light screens).
3. **Feedback + Support.**
4. **Currencies** (combined) + mobile `UpgradeGate`.
5. **Accounts CRUD** + `ColorPicker`.
6. **Family members.**

## Risks / dependencies

- **Base currency editing** depends on the in-flight FX work
  (`docs/superpowers/plans/2026-06-13-editable-base-currency.md` and
  `…-fx-provider-fallback.md`). The `updateBaseCurrency` endpoint exists, but if it is
  not yet on the backend the mobile client targets, the base-currency picker should
  ship gated behind that rollout (preferred-currency chips can ship independently).
- Family invite lifecycle (invite/resend/cancel/leave + active-workspace switch) is the
  most stateful screen; it is intentionally sequenced last.
