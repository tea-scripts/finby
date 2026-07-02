# Mobile Polish & Hardening — Design Spec

**Date:** 2026-07-02
**Status:** Approved (scope confirmed in Session 10 handover §5; one sub-decision resolved — see "Open / Deferred")
**Area:** `apps/mobile` (UI polish + coverage) and `apps/api` (backend hardening)

## Goal

A rolled-up "polish & hardening" pass on the mobile app and its push backend. No
new user-facing features — this tightens the design-system primitives, adds a
small UX nicety, closes targeted test gaps, and fixes two real backend
correctness/perf issues in the push module.

## Motivation

After the mobile Settings build-out, push notifications, inline account edit, and
workspace switcher all merged, a set of small non-blocking improvements were
identified during review:

- The `Button` component has only `primary`/`ghost` variants. `ConfirmSheet`'s
  destructive confirm hacks a red text label onto a blue `primary` button
  (`text-danger` on `bg-accent`) — low contrast, off-design. Inline text-link
  affordances are hand-rolled `<Text onPress>` elements with no shared primitive.
- The Preferences screen shows a "Saved" status that never clears until the next
  save — it should auto-dismiss.
- A few branches lack test coverage (notifications `urlFromResponse` non-null,
  auth-store `setActiveWorkspace` no-op persistence, a Preferences dropdown save).
- **Backend:** `expoUnregister` deletes a device row by token with **no ownership
  scoping** — any authenticated member can unregister any device by guessing/
  replaying a token. The web-push `unsubscribe` correctly scopes by `userId`.
- **Backend:** the daily-reminder fan-out runs `mobilePushDevice.findMany({ where:
  { userId } })`, but the only index is compound `@@index([workspaceId, userId])`,
  which cannot serve a `userId`-only lookup (leftmost-prefix rule). It needs a
  standalone `@@index([userId])`.

## Scope

### 1. Button `danger` + `link` variants

- **`danger`** — `bg-danger` background, white text, white spinner. A first-class
  destructive button.
- **`link`** — text-only (no background, no border), `text-accent`, **no forced
  `min-h-12`** and reduced padding, for inline affordances.
- `ConfirmSheet`'s `danger` prop renders `<Button variant="danger">` with a plain
  string `confirmLabel` — dropping the `text-danger`-on-`bg-accent` hack.

### 2. Preferences "Saved" auto-dismiss

- After a successful save sets `status` to `'saved'`, revert to `'idle'` after
  ~2000ms. Timer held in a ref; cleared on a new save and on unmount. `'saving'`
  and `'error'` states are NOT auto-dismissed.

### 3. Targeted test coverage

- **notifications** (`notifications.test.ts`, vitest): `addResponseListener`
  delivers the payload `url` when present (the non-null `urlFromResponse` branch);
  `getInitialUrl` returns the cold-start url when present.
- **auth-store** (`auth-store.test.ts`, vitest): extend the existing
  `setActiveWorkspace is a no-op for an unknown id` test to assert
  `identityStore.save` was NOT called.
- **Preferences** (`preferences-screen.test.tsx`, jest): "Saved" auto-dismisses
  after the timer (fake timers); a non-date dropdown (Number format) save calls
  `updateProfile` with the right patch.
- **Button** (`button.test.tsx`, jest): `danger` renders label + white spinner
  while loading; `link` renders text-only and fires `onPress`.

### 4. Backend hardening

- **`expoUnregister` ownership scoping** — thread `userId` (and it already has
  `workspaceId` on the route) so `unregisterExpoDevice` deletes only the caller's
  own device: `deleteMany({ where: { expoPushToken: token, userId } })`. Mirrors
  the web `unsubscribe(workspaceId, userId, endpoint)` shape; scope to `userId`
  (a device token is user-owned, not workspace-owned — matches the daily-reminder
  `findMany({ where: { userId } })`).
- **`@@index([userId])` on `MobilePushDevice`** — add the standalone index +
  a Prisma migration. Keep the existing `@@index([workspaceId, userId])`.

## Non-Goals / Open / Deferred

- **Converting the 6 existing inline text-links to `<Button variant="link">`** is
  **deferred**. Reason: 3 of the 6 affordances are intentionally destructive and
  use `text-danger` (Accounts "Archive"/"Unarchive" is accent; **Members "Remove"**
  and **"Cancel"** are `text-danger`). The approved `link` variant is `text-accent`
  only, so converting the danger-toned links would either regress their color to
  blue or require an unapproved `link`-danger tone. **Open question for the user:**
  do we want a danger-toned `link` (or a `tone` prop) and then convert all call
  sites, or leave the inline links as-is? Until answered, the variant is added but
  unused at call sites.
- Multi-workspace `sendToUser` only reaching the last-registered workspace (web-push
  parity issue) — out of scope here.
- Live on-device push verification (EAS/FCM/APNs) — user-owned, out of band.

## Global Constraints

- **UI components (hard rule):** use custom components from
  `apps/mobile/src/components/ui`; never native controls in feature code.
- **NativeWind classes** for styling (Tailwind-in-RN); colors are semantic tokens
  (`bg-danger`, `text-accent`, `text-white`, `text-ink`, etc.).
- **Test-runner split:** mobile logic `*.test.ts` → **vitest**; components
  `*.test.tsx` → **jest**. `pnpm run test` runs both.
- **RNTL v14:** `await` `render()` and `fireEvent()`; jest-hoisted mock vars must
  be named `mock*`.
- **Prisma migrate:** from `apps/api`, run
  `pnpm exec dotenv -e ../../.env -- prisma migrate dev --name <name>`
  (NOT `pnpm run prisma:migrate -- --name`, which mangles args and hangs).
- **Commit hygiene:** atomic commits; no AI-attribution trailers; stage files
  explicitly (never `git add -A` in the shared tree).
