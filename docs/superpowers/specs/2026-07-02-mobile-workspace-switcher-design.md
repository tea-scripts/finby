# Mobile Workspace Switcher + Post-Leave Switch — Design

**Date:** 2026-07-02
**Status:** Approved design → ready for implementation plan
**Scope:** Let the mobile app switch the active workspace (a switcher in Settings) and, after
leaving a family, switch to a remaining workspace instead of being stuck pointing at the one
just left.

## Background (verified)

- The active workspace is **purely client-held**: there is no server-side session→workspace
  binding and no "switch" endpoint. Every API call takes `:workspaceId` in the path, read from
  the auth store's single `workspace: ApiWorkspace`. Switching = replacing that object + persisting.
- The mobile store has a single `workspace` and no list; its `setWorkspace(patch)` *merges*
  (used for currency edits). Switching needs a *replace*.
- `GET /auth/workspaces` (`api.members.listWorkspaces()`) returns `WorkspaceMembershipSummary[]`
  with `workspaceId, name, slug, tier, role, baseCurrency` — everything for an `ApiWorkspace`
  **except `preferredCurrencies`** (web reconstructs with `[]`).
- Tab screens are inconsistent: transactions re-fetches on `workspace` change, but dashboard and
  settings-hub use `useRef` once-guards (`dashboard-screen.tsx:126-132`) and would show the old
  workspace's data after a switch.
- A user in a family always also has their own personal workspace, so leaving always leaves ≥1.

## 1. Store — workspaces list + switch (`apps/mobile/src/lib/auth-store.ts`)

- Add `workspaces: WorkspaceMembershipSummary[]` (default `[]`), `setWorkspaces(list)`, and
  `setActiveWorkspace(id: string)`.
- `setActiveWorkspace(id)`: find the summary in `workspaces`; **reconstruct a full `ApiWorkspace`**
  (`{ id: workspaceId, name, slug, tier, baseCurrency, preferredCurrencies }`); set it as
  `workspace`; persist via the identity store (reuse the existing persist path). No-op if the id
  isn't found. (Distinct from `setWorkspace(patch)` which merges.)
- Fetching stays in the UI layer (mobile pattern): a small `fetchWorkspaces()` helper
  (`apps/mobile/src/lib/workspaces.ts`) calls `api.members.listWorkspaces()` then
  `authStore.getState().setWorkspaces(list)` and returns the list. Called on settings-hub mount
  and after leaving.

## 2. Backend — include `preferredCurrencies` in `/auth/workspaces`

So the reconstructed `ApiWorkspace` is complete (no `[]` gap for switched-to workspaces, which
would otherwise break the Currencies screen + account currency dropdown for non-default
workspaces):
- `apps/api/src/modules/auth/auth.service.ts` `listWorkspaces()`: add `preferredCurrencies: true`
  to the workspace `select` and to the mapped result.
- `apps/api/src/modules/auth/auth.types.ts` `WorkspaceMembershipView`: add `preferredCurrencies: string[]`.
- `packages/shared` `WorkspaceMembershipSummary`: add `preferredCurrencies: string[]`.
- (Web may later drop its `[]` default; out of scope here.)

## 3. Data refresh on switch — remount the authed subtree

Because some screens once-guard their fetch, key the authed Tabs subtree on `workspace.id` in
`apps/mobile/app/(app)/_layout.tsx`: wrap `<Tabs>` in `<View key={workspace?.id ?? 'none'}
style={{ flex: 1 }}>` (reading `workspace?.id` via `useAuthStore`). Switching remounts every
screen → all re-fetch for the new workspace; future screens are covered automatically. Keying on
`.id` (not the object) means currency-edit merges don't remount. Trade-off (accepted): a switch
resets navigation to the default tab — the desirable behavior when changing workspaces.

## 4. Switcher UI — settings-hub row + picker

- A **Workspace** `SettingsGroup`/row near the top of the settings hub showing the active
  workspace's name (from `workspace.name`).
- When `workspaces.length > 1`, the row is pressable and opens a `BottomSheet` listing the
  workspaces (name + role label; the active one — `w.workspaceId === workspace.id` — checked).
  Selecting calls `setActiveWorkspace(id)` and closes the sheet.
- When the user has ≤1 workspace, render a plain non-interactive label (no chevron, no sheet).
- Fetch the list on hub mount via `fetchWorkspaces()` (best-effort; failure just leaves the row
  as the current single label).

## 5. Post-leave switch (`members-screen.tsx` `leave()`)

After `api.members.leaveWorkspace(workspace.id)` succeeds:
1. `const list = await fetchWorkspaces()`.
2. `const remaining = list.find((w) => w.workspaceId !== leftId)`.
3. If `remaining` → `setActiveWorkspace(remaining.workspaceId)` (the layout remount lands the user
   in the new workspace; the FAMILY-only Members screen unmounts). Close the confirm sheet.
4. If no remaining, or the fetch throws → `logout()` (safe fallback; the left workspace is now
   invalid). Keep the existing `ApiError` narrowing; on a `leaveWorkspace` failure, surface
   `leaveError` and stay (unchanged).

## Error handling

- `fetchWorkspaces` failure on hub mount: non-fatal; switcher shows the current workspace only.
- `fetchWorkspaces`/no-remaining failure after a successful leave: `logout()` (consistent state).
- `setActiveWorkspace` with an unknown id: no-op (guards against races).

## Testing

- **Store:** `setWorkspaces` sets the list; `setActiveWorkspace` reconstructs a full `ApiWorkspace`
  (incl. `preferredCurrencies`) from the matching summary, sets `workspace`, persists via identity
  store; unknown id is a no-op.
- **Backend:** `auth.service` `listWorkspaces` includes `preferredCurrencies` (extend the existing spec).
- **Switcher:** renders the active workspace name; with >1 workspaces the picker switches on select;
  with ≤1 it's a non-interactive label.
- **Members leave:** switches to the remaining workspace on success; `logout()` when none remain.
- **Layout:** (light) the authed layout wraps Tabs in a `key`ed view driven by `workspace?.id`.

## Out of scope

- A server-side "active workspace" concept / workspace-scoped tokens (not needed; client-held).
- Creating/deleting workspaces from mobile; inviting into a non-family workspace.
- Reconciling already-open web sessions (web already has its own switcher).
