# Mobile Workspace Switcher + Post-Leave Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the mobile app switch the active workspace from Settings, and after leaving a family switch to a remaining workspace (or log out) instead of being stuck on the left one.

**Architecture:** The active workspace is client-held — switching = replacing the auth store's `workspace` and persisting it. Add a `workspaces` list + `setActiveWorkspace(id)` (reconstructs a full `ApiWorkspace` from the `/auth/workspaces` summary, which we extend to carry `preferredCurrencies`). Key the authed Tabs subtree on `workspace.id` so all screens re-fetch after a switch. Add a Settings switcher and wire the members leave() to switch/logout.

**Tech Stack:** NestJS + Prisma (backend), `@finby/shared` types, Expo/React Native + Zustand (mobile). Tests: backend **jest** (`apps/api`), mobile **vitest** (store/logic) + **jest** (components).

## Global Constraints

- Active workspace is client-held; switching replaces the store `workspace` + persists via identity store. No server-side active-workspace concept.
- `setActiveWorkspace(id)` reconstructs a **complete** `ApiWorkspace` (incl. `preferredCurrencies`) from the matching `WorkspaceMembershipSummary`; no-op if id not found. Distinct from `setWorkspace(patch)` (merge).
- Switcher: a Settings-hub "Workspace" group showing the active name; a `BottomSheet` picker only when `workspaces.length > 1`; non-interactive label when ≤1.
- Remount on switch: key the authed Tabs subtree on `workspace.id` (not the object) in `app/(app)/_layout.tsx`. Accepted trade-off: a switch resets navigation to the default tab.
- Post-leave: on `leaveWorkspace` success → refresh list → switch to a remaining workspace; if none / fetch fails → `logout()`. Existing `leaveError`/`busy`/`ApiError` handling on the leave call itself is unchanged.
- NEVER use native form controls (reuse `BottomSheet`/`SettingsGroup`/`SettingsRow`/`Text`). Keep files under 500 lines.
- Commit messages: NO AI-attribution trailer, NO "Generated with" boilerplate; atomic; stage explicitly.

## Reference: current shapes

- `packages/shared/src/api-types.ts:418` `WorkspaceMembershipSummary { workspaceId, name, slug, tier, role, baseCurrency }` (add `preferredCurrencies`).
- `ApiWorkspace { id, name, slug, tier, baseCurrency, preferredCurrencies }`.
- Backend `auth.service.ts:450` `listWorkspaces` (select + map — add `preferredCurrencies`); `auth.types.ts:47` `WorkspaceMembershipView` (add field); spec at `auth.service.spec.ts:603`.
- Mobile store `auth-store.ts`: `createStore<AuthState>((set, get) => …)`; existing `setUser`/`setWorkspace` persist via `identityStore.save({ user, workspace })` (lines 147-158).
- Mobile `api.members.listWorkspaces(): Promise<WorkspaceMembershipSummary[]>`.
- Members `leave()` (`members-screen.tsx`): calls `api.members.leaveWorkspace(workspace!.id)`; has `leaving`/`leaveError`/`busy`; `logout` is NOT yet imported there.
- Settings hub (`settings-hub-screen.tsx`): `ScrollView` with a streak row then `Plan & Billing`; uses `useAuthStore` + `api` from runtime.
- Authed layout (`app/(app)/_layout.tsx`): `AppLockGate > Tabs` (+ `useNotificationResponder()`).

---

## Task 1: Backend + shared — `preferredCurrencies` in the workspaces summary

**Files:**
- Modify: `packages/shared/src/api-types.ts` (`WorkspaceMembershipSummary`)
- Modify: `apps/api/src/modules/auth/auth.types.ts` (`WorkspaceMembershipView`)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`listWorkspaces`)
- Test: `apps/api/src/modules/auth/auth.service.spec.ts` (extend `listWorkspaces` test)

**Interfaces:**
- Produces: `WorkspaceMembershipSummary.preferredCurrencies: string[]` (shared) + the backend returning it. Consumed by the store's `setActiveWorkspace` (Task 2).

- [ ] **Step 1: Add the field to the shared type**

In `packages/shared/src/api-types.ts`, add to `WorkspaceMembershipSummary` (after `baseCurrency`):

```ts
  preferredCurrencies: string[];
```

- [ ] **Step 2: Add it to the backend view type**

In `apps/api/src/modules/auth/auth.types.ts` `WorkspaceMembershipView` (after `baseCurrency`):

```ts
  preferredCurrencies: string[];
```

- [ ] **Step 3: Update the failing test (extend the existing `listWorkspaces` spec)**

In `apps/api/src/modules/auth/auth.service.spec.ts`, update the `listWorkspaces` test to include `preferredCurrencies` in both the mocked workspace rows and the expected output:

```ts
      prisma.workspaceMember.findMany.mockResolvedValue([
        { role: 'OWNER', workspace: { id: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', baseCurrency: 'USD', preferredCurrencies: ['USD'] } },
        { role: 'VIEWER', workspace: { id: 'w2', name: 'Fam', slug: 's2', tier: 'FAMILY', baseCurrency: 'USD', preferredCurrencies: ['USD', 'EUR'] } },
      ]);
      const service = buildService(prisma);
      const result = await service.listWorkspaces('u1');
      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(result).toEqual([
        { workspaceId: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] },
        { workspaceId: 'w2', name: 'Fam', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'USD', preferredCurrencies: ['USD', 'EUR'] },
      ]);
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/auth/auth.service.spec.ts -t listWorkspaces`
Expected: FAIL — result missing `preferredCurrencies`.

- [ ] **Step 5: Implement in `listWorkspaces`**

In `apps/api/src/modules/auth/auth.service.ts`, add `preferredCurrencies: true` to the workspace `select` and to the mapped object:

```ts
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, tier: true, baseCurrency: true, preferredCurrencies: true } },
      },
```
```ts
    return memberships.map((m) => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      tier: m.workspace.tier,
      role: m.role,
      baseCurrency: m.workspace.baseCurrency,
      preferredCurrencies: m.workspace.preferredCurrencies,
    }));
```

- [ ] **Step 6: Run test + rebuild shared**

Run: `cd apps/api && pnpm exec jest src/modules/auth/auth.service.spec.ts -t listWorkspaces`
Expected: PASS.
Run: `cd packages/shared && pnpm run build`
Expected: rebuilt so the mobile app resolves the new field.
Run: `cd apps/api && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/api-types.ts apps/api/src/modules/auth/auth.types.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(api): include preferredCurrencies in the workspaces summary"
```

---

## Task 2: Mobile store — workspaces list + setActiveWorkspace

**Files:**
- Modify: `apps/mobile/src/lib/auth-store.ts`
- Test: `apps/mobile/src/lib/auth-store.test.ts`

**Interfaces:**
- Consumes: `WorkspaceMembershipSummary` (with `preferredCurrencies`, Task 1).
- Produces: `AuthState.workspaces: WorkspaceMembershipSummary[]`, `setWorkspaces(list): void`, `setActiveWorkspace(id: string): void`. Consumed by the switcher (Task 4) and members leave (Task 5).

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/lib/auth-store.test.ts` (mirror the existing `makeStore`/fakes pattern already in the file):

```ts
it('setActiveWorkspace replaces the workspace from the summary list and persists', () => {
  const deps = makeDeps() as never as Parameters<typeof createAuthStore>[0];
  const store = createAuthStore(deps);
  store.setState({
    user: { id: 'u1' } as never,
    workspace: { id: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', baseCurrency: 'USD', preferredCurrencies: ['USD'] } as never,
    workspaces: [
      { workspaceId: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] },
      { workspaceId: 'w2', name: 'Fam', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] },
    ] as never,
  });

  store.getState().setActiveWorkspace('w2');

  expect(store.getState().workspace).toEqual({
    id: 'w2', name: 'Fam', slug: 's2', tier: 'FAMILY', baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'],
  });
  expect(deps.identityStore.save).toHaveBeenCalledWith(
    expect.objectContaining({ workspace: expect.objectContaining({ id: 'w2', preferredCurrencies: ['EUR', 'USD'] }) }),
  );
});

it('setActiveWorkspace is a no-op for an unknown id', () => {
  const deps = makeDeps() as never as Parameters<typeof createAuthStore>[0];
  const store = createAuthStore(deps);
  store.setState({ user: { id: 'u1' } as never, workspace: { id: 'w1' } as never, workspaces: [] as never });
  store.getState().setActiveWorkspace('nope');
  expect(store.getState().workspace).toEqual({ id: 'w1' });
});
```

(If the file's helper is named differently than `makeDeps`, use the file's existing dep-builder — the point is a store built with fake `identityStore.save`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/auth-store.test.ts`
Expected: FAIL — `setActiveWorkspace is not a function`.

- [ ] **Step 3: Implement**

In `auth-store.ts`, add the import:

```ts
import type { ApiUser, ApiWorkspace, RegisterInput, WorkspaceMembershipSummary } from '@finby/shared';
```

Add to the `AuthState` interface (near `setWorkspace`):

```ts
  /** All workspaces the user belongs to (for the switcher). */
  workspaces: WorkspaceMembershipSummary[];
  setWorkspaces(list: WorkspaceMembershipSummary[]): void;
  /** Replace the active workspace with another one the user belongs to (by id). */
  setActiveWorkspace(id: string): void;
```

Add `workspaces: []` to the initial state object (next to `workspace: null`).

Add the methods next to `setWorkspace`:

```ts
    setWorkspaces: (list) => set({ workspaces: list }),

    setActiveWorkspace: (id) => {
      const target = get().workspaces.find((w) => w.workspaceId === id);
      if (!target) return;
      const workspace: ApiWorkspace = {
        id: target.workspaceId,
        name: target.name,
        slug: target.slug,
        tier: target.tier,
        baseCurrency: target.baseCurrency,
        preferredCurrencies: target.preferredCurrencies,
      };
      set({ workspace });
      const { user } = get();
      if (user) void identityStore.save({ user, workspace });
    },
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/auth-store.test.ts`
Expected: PASS.
Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/auth-store.ts apps/mobile/src/lib/auth-store.test.ts
git commit -m "feat(mobile): workspaces list + setActiveWorkspace in auth store"
```

---

## Task 3: Authed layout — remount on workspace switch

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`workspace?.id`).
- Produces: the authed Tabs subtree remounts when `workspace.id` changes.

- [ ] **Step 1: Implement (glue; verified by tsc + full suite + device)**

Rewrite `app/(app)/_layout.tsx` to key a wrapper `View` (reading the active workspace id) around `<Tabs>`:

```tsx
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';
import { FloatingTabBar } from '../../src/components/nav/floating-tab-bar';
import { TABS } from '../../src/components/nav/tabs-config';
import { useNotificationResponder } from '../../src/lib/use-notification-responder';
import { useAuthStore } from '../../src/lib/use-auth-store';

export default function AppLayout() {
  useNotificationResponder();
  // Remount the whole tab subtree when the active workspace changes, so every
  // screen re-fetches for the new workspace (some use once-guards). Keyed on the
  // id (not the object) so currency-preference merges don't remount.
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  return (
    <AppLockGate>
      <View key={workspaceId ?? 'none'} style={{ flex: 1 }}>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <FloatingTabBar {...props} />}
        >
          {TABS.map((t) => (
            <Tabs.Screen key={t.name} name={t.name} />
          ))}
          <Tabs.Screen name="streaks" options={{ href: null }} />
        </Tabs>
      </View>
    </AppLockGate>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.
Run: `cd apps/mobile && pnpm run test`
Expected: full suite still passes (no test renders this layout directly; this confirms no import/type regressions).

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): remount authed tabs on active-workspace change"
```

---

## Task 4: Workspace switcher UI (Settings hub)

**Files:**
- Create: `apps/mobile/src/components/settings/workspace-switcher.tsx`
- Modify: `apps/mobile/src/screens/settings/settings-hub-screen.tsx` (render it near the top)
- Test: `apps/mobile/src/components/settings/workspace-switcher.test.tsx`
- Modify: `apps/mobile/src/screens/settings/settings-hub-screen.test.tsx` (add `members.listWorkspaces` to the runtime mock)

**Interfaces:**
- Consumes: `useAuthStore` (`workspace`, `workspaces`, `setWorkspaces`, `setActiveWorkspace`), `api.members.listWorkspaces`, `BottomSheet`, `SettingsGroup`, `SettingsRow`.
- Produces: `WorkspaceSwitcher` component.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/settings/workspace-switcher.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setWorkspaces = jest.fn();
const setActiveWorkspace = jest.fn();
let state: Record<string, unknown>;
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(state) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { members: { listWorkspaces: jest.fn() } } }));
import { WorkspaceSwitcher } from './workspace-switcher';
import { api } from '../../lib/runtime.native';
const members = api.members as unknown as { listWorkspaces: jest.Mock };

const W1 = { workspaceId: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] };
const W2 = { workspaceId: 'w2', name: 'The Smiths', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'USD', preferredCurrencies: ['USD'] };

beforeEach(() => {
  setWorkspaces.mockReset(); setActiveWorkspace.mockReset();
  members.listWorkspaces.mockReset().mockResolvedValue([W1, W2]);
  state = { workspace: { id: 'w1', name: 'Mine' }, workspaces: [W1, W2], setWorkspaces, setActiveWorkspace };
});

it('shows the active workspace name and switches on select', async () => {
  render(<WorkspaceSwitcher />);
  expect(screen.getByText('Mine')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Switch workspace'));
  await fireEvent.press(screen.getByText('The Smiths'));
  expect(setActiveWorkspace).toHaveBeenCalledWith('w2');
});

it('is non-interactive with a single workspace', async () => {
  state = { workspace: { id: 'w1', name: 'Mine' }, workspaces: [W1], setWorkspaces, setActiveWorkspace };
  render(<WorkspaceSwitcher />);
  expect(screen.getByText('Mine')).toBeTruthy();
  expect(screen.queryByLabelText('Switch workspace')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/settings/workspace-switcher.test.tsx`
Expected: FAIL — cannot find module `./workspace-switcher`.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/components/settings/workspace-switcher.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SettingsGroup } from './settings-group';
import { BottomSheet } from '../ui/bottom-sheet';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', CO_MANAGER: 'Co-manager', VIEWER: 'Viewer' };

export function WorkspaceSwitcher() {
  const workspace = useAuthStore((s) => s.workspace);
  const workspaces = useAuthStore((s) => s.workspaces);
  const setWorkspaces = useAuthStore((s) => s.setWorkspaces);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.members.listWorkspaces().then(setWorkspaces).catch(() => undefined);
  }, [setWorkspaces]);

  if (!workspace) return null;
  const multiple = workspaces.length > 1;

  return (
    <SettingsGroup title="Workspace">
      <Pressable
        onPress={multiple ? () => setOpen(true) : undefined}
        disabled={!multiple}
        accessibilityRole={multiple ? 'button' : undefined}
        accessibilityLabel={multiple ? 'Switch workspace' : undefined}
        className="min-h-12 flex-row items-center justify-between px-4 py-3"
      >
        <Text className="text-base text-ink">{workspace.name}</Text>
        {multiple ? <Text className="text-base text-faint">›</Text> : null}
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Switch workspace">
        <View className="gap-1 pb-2">
          {workspaces.map((w) => {
            const active = w.workspaceId === workspace.id;
            return (
              <Pressable
                key={w.workspaceId}
                onPress={() => { setActiveWorkspace(w.workspaceId); setOpen(false); }}
                accessibilityRole="button"
                className="flex-row items-center justify-between rounded-xl px-4 py-3"
              >
                <View>
                  <Text className={`text-base ${active ? 'text-accent' : 'text-ink'}`}>{w.name}</Text>
                  <Text className="text-xs text-faint">{ROLE_LABEL[w.role] ?? w.role}</Text>
                </View>
                {active ? <Text className="text-base text-accent">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SettingsGroup>
  );
}
```

- [ ] **Step 4: Render it on the hub + fix the hub test mock**

In `settings-hub-screen.tsx`, import and render `<WorkspaceSwitcher />` as the first child inside the `ScrollView` (above the streak row):

```tsx
import { WorkspaceSwitcher } from '../../components/settings/workspace-switcher';
```
```tsx
      <ScrollView contentContainerClassName="gap-6 p-6" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        <WorkspaceSwitcher />
        <Pressable
          onPress={() => router.push('/streaks')}
```

In `settings-hub-screen.test.tsx`, the switcher calls `api.members.listWorkspaces` on mount — extend the existing `jest.mock('../../lib/runtime.native', …)` so `api` includes:

```ts
    members: { listWorkspaces: jest.fn().mockResolvedValue([]) },
```
(keep the existing `billing` mock). Also ensure the hub test's `useAuthStore` mock state includes `workspaces: []`, `setWorkspaces: jest.fn()`, `setActiveWorkspace: jest.fn()` so the switcher's selectors resolve.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/mobile && pnpm exec jest src/components/settings/workspace-switcher.test.tsx src/screens/settings/settings-hub-screen.test.tsx`
Expected: PASS (switcher's 2 tests + the hub's existing tests).
Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/settings/workspace-switcher.tsx apps/mobile/src/components/settings/workspace-switcher.test.tsx apps/mobile/src/screens/settings/settings-hub-screen.tsx apps/mobile/src/screens/settings/settings-hub-screen.test.tsx
git commit -m "feat(mobile): workspace switcher on the settings hub"
```

---

## Task 5: Post-leave switch (members screen)

**Files:**
- Modify: `apps/mobile/src/screens/settings/members-screen.tsx`
- Test: `apps/mobile/src/screens/settings/members-screen.test.tsx`

**Interfaces:**
- Consumes: `api.members.listWorkspaces`, `useAuthStore` (`setWorkspaces`, `setActiveWorkspace`, `logout`), existing `leave()`.

- [ ] **Step 1: Write the failing test (extend the members test)**

Add to `members-screen.test.tsx`. The existing mocks provide `useAuthStore` (workspace `{ id: 'w1', tier: 'FAMILY' }`) and `api.members`. Extend the auth-store mock state with `setWorkspaces`, `setActiveWorkspace`, `logout` (jest.fns), and the `api.members` mock with `listWorkspaces`. Then, since the leave path is behind the ConfirmSheet, drive it:

```ts
it('switches to a remaining workspace after leaving', async () => {
  members.listMembers.mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: true },
  ]);
  members.leaveWorkspace.mockResolvedValue(undefined);
  members.listWorkspaces.mockResolvedValue([
    { workspaceId: 'w9', name: 'Mine', slug: 's9', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] },
  ]);
  render(<MembersScreen />);
  await waitFor(() => expect(screen.getByText(/Leave/)).toBeTruthy());
  await fireEvent.press(screen.getByText('Leave this family'));         // opens ConfirmSheet
  await fireEvent.press(screen.getByText('Leave'));                     // confirm
  await waitFor(() => expect(members.leaveWorkspace).toHaveBeenCalledWith('w1'));
  await waitFor(() => expect(setActiveWorkspace).toHaveBeenCalledWith('w9'));
  expect(logout).not.toHaveBeenCalled();
});

it('logs out when no workspace remains after leaving', async () => {
  members.listMembers.mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: true },
  ]);
  members.leaveWorkspace.mockResolvedValue(undefined);
  members.listWorkspaces.mockResolvedValue([]);
  render(<MembersScreen />);
  await fireEvent.press(screen.getByText('Leave this family'));
  await fireEvent.press(screen.getByText('Leave'));
  await waitFor(() => expect(logout).toHaveBeenCalled());
});
```

(Match the exact leave button/confirm labels in the file — `Leave this family` opens the sheet, `Leave` confirms. Adjust the auth-store mock to expose `setWorkspaces`/`setActiveWorkspace`/`logout` and the members mock to add `listWorkspaces`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/members-screen.test.tsx`
Expected: FAIL — `setActiveWorkspace`/`logout` not called (leave only closes the sheet today).

- [ ] **Step 3: Implement**

In `members-screen.tsx`, pull the new store methods (near the existing `useAuthStore` selectors):

```tsx
  const setWorkspaces = useAuthStore((s) => s.setWorkspaces);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const logout = useAuthStore((s) => s.logout);
```

Replace `leave()` with the switch/logout logic:

```tsx
  async function leave() {
    if (!workspace) return;
    const leftId = workspace.id;
    setBusy(true);
    setLeaveError(null);
    try {
      await api.members.leaveWorkspace(leftId);
    } catch (e) {
      setBusy(false);
      if (!(e instanceof ApiError)) throw e;
      setLeaveError(e.message);
      return;
    }
    // Left successfully — switch to a remaining workspace, or log out if none.
    try {
      const list = await api.members.listWorkspaces();
      setWorkspaces(list);
      const remaining = list.find((w) => w.workspaceId !== leftId);
      if (remaining) {
        setLeaving(false);
        setActiveWorkspace(remaining.workspaceId);
      } else {
        await logout();
      }
    } catch {
      await logout();
    } finally {
      setBusy(false);
    }
  }
```

(Note: on the remaining branch, `setActiveWorkspace` changes `workspace.id` → the authed layout (Task 3) remounts, unmounting this screen; no explicit navigation needed.)

- [ ] **Step 4: Run test + typecheck**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/members-screen.test.tsx`
Expected: PASS (existing + 2 new).
Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/members-screen.tsx apps/mobile/src/screens/settings/members-screen.test.tsx
git commit -m "feat(mobile): switch to a remaining workspace after leaving a family"
```

---

## Task 6: Full gate — api + shared + mobile

**Files:** none (verification; fix-forward only).

- [ ] **Step 1: Backend + shared**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm test -- src/modules/auth`
Run: `cd packages/shared && pnpm run build`
Expected: tsc clean; auth specs pass; shared builds.

- [ ] **Step 2: Mobile**

Run: `cd apps/mobile && pnpm exec tsc --noEmit && pnpm run test`
Expected: tsc clean; vitest + jest all pass.

- [ ] **Step 3: Lint**

Run: `pnpm -w run lint`
Expected: no NEW errors from this work (pre-existing unrelated warnings acceptable).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A apps/api packages/shared apps/mobile
git commit -m "chore: typecheck/lint/test gate for mobile workspace switcher"
```

---

## Self-Review

**Spec coverage:**
- Store `workspaces` + `setWorkspaces` + `setActiveWorkspace` (full ApiWorkspace incl. preferredCurrencies, persist, no-op unknown id) → Task 2 ✓
- Backend `preferredCurrencies` in `/auth/workspaces` (service + view type + shared) → Task 1 ✓
- Remount authed subtree on `workspace.id` → Task 3 ✓
- Switcher UI (hub group; picker when >1; label when ≤1; fetch on mount) → Task 4 ✓
- Post-leave switch to remaining / logout when none / logout on fetch failure → Task 5 ✓
- Testing across api/store/switcher/members → Tasks 1–5 + gate Task 6 ✓
- Out of scope (server active-workspace, workspace CRUD) → not implemented ✓

**Deviation from spec (intentional):** the spec suggested a shared `fetchWorkspaces()` helper; the plan **inlines** `api.members.listWorkspaces()` + `setWorkspaces(list)` at the two call sites (switcher mount, members leave). Rationale: the helper would import the runtime singletons (awkward to unit-test), and inlining keeps each path naturally covered by its own component test. Two one-line call sites, no meaningful duplication.

**Placeholder scan:** none — every step carries concrete code/commands. The two test steps that say "match the exact labels/adjust the mock" point at real, named elements (`Leave this family`/`Leave`, the existing runtime mock) rather than vague TODOs.

**Type consistency:** `WorkspaceMembershipSummary.preferredCurrencies: string[]` defined in Task 1, consumed by `setActiveWorkspace` (Task 2) and the switcher/members mocks (Tasks 4–5). `setWorkspaces(list)` / `setActiveWorkspace(id)` signatures identical across store def (Task 2) and consumers (Tasks 4–5). Reconstructed `ApiWorkspace` field set matches the `ApiWorkspace` interface exactly.
