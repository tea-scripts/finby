# Mobile Settings Build-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the remaining PWA settings sections (Profile, Preferences, Currencies, Accounts, Family members, Feedback, Support, Refer/About) to the Expo/React Native app as a settings hub with sub-screens.

**Architecture:** The existing settings screen becomes a **hub** of tappable rows. Each interactive section is its own `expo-router` screen under `app/(app)/settings/`, backed by a screen component in `src/screens/settings/`. Screens reuse the existing `@finby/core` API objects (`api.settings`, `api.accounts`, `api.dashboard`, `api.members`, `api.support`, `api.feedback`, `api.billing`) and existing UI primitives, plus a handful of new shared primitives.

**Tech Stack:** Expo Router, React Native, NativeWind (Tailwind classes), Zustand (vanilla store via `useAuthStore`), `@finby/core` transport, `@finby/shared` types/constants. Tests: **jest + @testing-library/react-native** for components/screens (`npm run test:components`), **vitest** for pure logic (`npm run test:logic`). Full gate: `npm run test`.

## Global Constraints

- Keep every file under 500 lines (project rule).
- NEVER use native form controls directly; use existing primitives (`Toggle`, `Dropdown`, `Input`, `BottomSheet`, `Button`) or build a new one in `src/components/ui/` following their patterns.
- Theme via NativeWind classes + tokens in `src/theme/tokens.ts` (`bg-canvas`, `bg-surface`, `border-line`, `text-ink`, `text-muted`, `text-faint`, `text-accent`, `text-danger`). Off/on toggle colors: `#1c2c46` / `#1d6ef5`.
- Commit messages: NO AI-attribution trailer, NO "Generated with" boilerplate. One logical change per commit (atomic).
- All backend calls go through the injected `api` from `../lib/runtime.native` (never construct fetch directly).
- Route files under `app/(app)/settings/` are thin `export { X as default } from '../../../src/screens/settings/…'` wrappers; real screens live in `src/screens/settings/`.
- Currency source of truth: `CURRENCIES` from `@finby/shared`. Account types: `ACCOUNT_TYPES` / `ACCOUNT_TYPE_LABELS`. Support categories: `SUPPORT_CATEGORIES` / `SUPPORT_CATEGORY_LABELS`.

---

## Reference: existing shapes (do not redefine)

From `@finby/shared`:

```ts
interface ApiUser { id; displayName; email; emailVerified; timezone; accountNumber: string | null; preferences: UserPreferences; currentStreak; longestStreak }
interface ApiWorkspace { id; name; slug; tier: SubscriptionTier; baseCurrency: string; preferredCurrencies: string[] }
interface UserPreferences { dateFormat: 'MEDIUM'|'SHORT'|'ISO'; numberFormat: 'GROUPED'|'PLAIN'; currencyDisplay: 'SYMBOL'|'CODE'; dailyReminders; /* +internal fields */ }
interface AccountView { id; name; currency; accountType: string; balance: string; color: string | null; icon: string | null; isArchived: boolean }
interface MemberView { id; userId; displayName; email; role: WorkspaceMemberRole; joinedAt; isSelf: boolean }
interface InviteView { id; email; role: WorkspaceMemberRole; invitedByUserId; expiresAt; createdAt }
type WorkspaceMemberRole = 'OWNER' | 'CO_MANAGER' | 'VIEWER';
type SupportCategory = 'BUG'|'BILLING'|'ACCOUNT'|'FEATURE_REQUEST'|'OTHER';
interface WorkspaceMembershipSummary { workspaceId: string; role: WorkspaceMemberRole; /* … */ }
const CURRENCIES: { code; name; symbol }[]
const ACCOUNT_TYPES; ACCOUNT_TYPE_LABELS; SUPPORT_CATEGORIES; SUPPORT_CATEGORY_LABELS; DEFAULT_PREFERENCES
```

From `@finby/core` (already bound onto `api` in `src/lib/api.ts`):

```ts
api.settings.updateProfile(patch: { displayName?; timezone?; preferences?: Partial<UserPreferences> }): Promise<ApiUser>
api.settings.updateCurrencies(workspaceId, currencies: string[]): Promise<{ preferredCurrencies: string[] }>
api.settings.updateBaseCurrency(workspaceId, baseCurrency): Promise<{ baseCurrency; preferredCurrencies; recomputed: number }>
api.dashboard.listAccounts(workspaceId): Promise<AccountView[]>
api.accounts.createAccount(workspaceId, input): Promise<AccountView>
api.accounts.updateAccount(workspaceId, accountId, patch): Promise<AccountView>
api.members.listWorkspaces(): Promise<WorkspaceMembershipSummary[]>
api.members.listMembers/listInvites/inviteMember/cancelInvite/resendInvite/changeMemberRole/removeMember/leaveWorkspace(…)
api.support.createSupportTicket(input): Promise<SupportTicketView>
api.support.listSupportTickets(): Promise<SupportTicketView[]>
api.feedback.submitFeedback(rating, comment?): Promise<FeedbackResult>
```

Existing primitives (import paths): `Button` `../components/ui/button`, `Toggle` `../components/ui/toggle`, `Dropdown` `../components/ui/dropdown`, `Input` `../components/ui/input`, `Field` `../components/ui/field`, `BottomSheet` `../components/ui/bottom-sheet`, `SectionCard`/`SectionLoading`/`SectionError`/`SectionEmpty`/`SectionState` `../components/dashboard/section-card`, `TierBadge` `../components/ui/tier-badge`, `PlanCarouselSheet` `../components/billing/plan-carousel-sheet`.

> Path depth note: components under `src/screens/settings/` import primitives via `../../components/ui/…` and stores/api via `../../lib/…`.

---

## Task 1: Auth store — `setUser` and `setWorkspace`

The mobile store only exposes `setStreak`. Currency and profile edits need to merge into `user`/`workspace` and persist via the identity store so they survive relaunch.

**Files:**
- Modify: `apps/mobile/src/lib/auth-store.ts`
- Test: `apps/mobile/src/lib/auth-store.test.ts` (create)

**Interfaces:**
- Produces:
  - `AuthState.setUser(patch: Partial<ApiUser>): void`
  - `AuthState.setWorkspace(patch: Partial<ApiWorkspace>): void`
  - Both merge into current state and call `identityStore.save({ user, workspace })` (best-effort; ignore rejection).

- [ ] **Step 1: Write the failing test**

Mirror the existing vitest logic style (this is a `.test.ts`, runs under vitest).

```ts
// apps/mobile/src/lib/auth-store.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAuthStore } from './auth-store';

function makeDeps() {
  const identityStore = { save: vi.fn().mockResolvedValue(undefined), load: vi.fn(), clear: vi.fn() };
  const session = { hydrate: vi.fn(), clearSession: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() };
  const onboardingFlag = { wasSeen: vi.fn(), markSeen: vi.fn(), reset: vi.fn() };
  const lockPref = { isEnabled: vi.fn().mockResolvedValue(false), setEnabled: vi.fn() };
  const lockCode = { isSet: vi.fn().mockResolvedValue(false), set: vi.fn(), verify: vi.fn() };
  return { session, identityStore, onboardingFlag, lockPref, lockCode } as never;
}

describe('auth-store setUser/setWorkspace', () => {
  it('merges a user patch and persists identity', () => {
    const deps = makeDeps() as never as Parameters<typeof createAuthStore>[0];
    const store = createAuthStore(deps);
    store.setState({
      user: { id: 'u1', displayName: 'Old', timezone: 'UTC' } as never,
      workspace: { id: 'w1', baseCurrency: 'USD', preferredCurrencies: ['USD'] } as never,
    });

    store.getState().setUser({ displayName: 'New' });

    expect(store.getState().user?.displayName).toBe('New');
    expect(deps.identityStore.save).toHaveBeenCalledWith({
      user: expect.objectContaining({ displayName: 'New' }),
      workspace: expect.objectContaining({ id: 'w1' }),
    });
  });

  it('merges a workspace patch (base + preferred currencies)', () => {
    const deps = makeDeps() as never as Parameters<typeof createAuthStore>[0];
    const store = createAuthStore(deps);
    store.setState({
      user: { id: 'u1' } as never,
      workspace: { id: 'w1', baseCurrency: 'USD', preferredCurrencies: ['USD'] } as never,
    });

    store.getState().setWorkspace({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] });

    expect(store.getState().workspace?.baseCurrency).toBe('EUR');
    expect(store.getState().workspace?.preferredCurrencies).toEqual(['EUR', 'USD']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx vitest run src/lib/auth-store.test.ts`
Expected: FAIL — `setUser is not a function`.

- [ ] **Step 3: Implement**

In `auth-store.ts`, add the two methods to the `AuthState` interface:

```ts
  /** Merge a patch into the cached user and persist the identity snapshot. */
  setUser(patch: Partial<ApiUser>): void;
  /** Merge a patch into the cached workspace and persist the identity snapshot. */
  setWorkspace(patch: Partial<ApiWorkspace>): void;
```

Change the store factory signature from `createStore<AuthState>((set) => ({` to `createStore<AuthState>((set, get) => ({` and add the implementations next to `setStreak`:

```ts
    setUser: (patch) => {
      set((s) => (s.user ? { user: { ...s.user, ...patch } } : {}));
      const { user, workspace } = get();
      if (user && workspace) void identityStore.save({ user, workspace });
    },

    setWorkspace: (patch) => {
      set((s) => (s.workspace ? { workspace: { ...s.workspace, ...patch } } : {}));
      const { user, workspace } = get();
      if (user && workspace) void identityStore.save({ user, workspace });
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx vitest run src/lib/auth-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/auth-store.ts apps/mobile/src/lib/auth-store.test.ts
git commit -m "feat(mobile): add setUser/setWorkspace to auth store"
```

---

## Task 2: Primitives — `SettingsRow`, `SettingsGroup`, `SettingsHeader`

Shared building blocks for the hub and every sub-screen.

**Files:**
- Create: `apps/mobile/src/components/settings/settings-row.tsx`
- Create: `apps/mobile/src/components/settings/settings-group.tsx`
- Create: `apps/mobile/src/components/settings/settings-header.tsx`
- Test: `apps/mobile/src/components/settings/settings-row.test.tsx` (create)

**Interfaces:**
- Produces:
  - `SettingsRow({ label, value?, onPress?, right?, danger?, disabled?, testID? })` — pressable row; renders a `›` chevron when `onPress` is set and no `right` node is provided.
  - `SettingsGroup({ title?, children })` — card wrapper (rounded, `border-line`, `bg-surface`, dividers between rows).
  - `SettingsHeader({ title })` — top bar with a back chevron calling `router.back()` and the title.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/settings/settings-row.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SettingsRow } from './settings-row';

describe('SettingsRow', () => {
  it('renders label + value and fires onPress', () => {
    const onPress = jest.fn();
    render(<SettingsRow label="Profile" value="Tee" onPress={onPress} />);
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Tee')).toBeTruthy();
    fireEvent.press(screen.getByText('Profile'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    render(<SettingsRow label="Refer & Earn" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Refer & Earn'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/components/settings/settings-row.test.tsx`
Expected: FAIL — cannot find module `./settings-row`.

- [ ] **Step 3: Implement the three files**

```tsx
// apps/mobile/src/components/settings/settings-row.tsx
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function SettingsRow({ label, value, onPress, right, danger, disabled, testID }: SettingsRowProps) {
  const showChevron = !!onPress && !right;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className={`min-h-12 flex-row items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-base ${danger ? 'text-danger' : 'text-ink'}`}>{label}</Text>
      <View className="flex-row items-center gap-2">
        {value ? <Text className="text-sm text-muted">{value}</Text> : null}
        {right ?? (showChevron ? <Text className="text-base text-faint">›</Text> : null)}
      </View>
    </Pressable>
  );
}
```

```tsx
// apps/mobile/src/components/settings/settings-group.tsx
import { Children, type ReactNode } from 'react';
import { Text, View } from 'react-native';

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View className="h-px bg-line" /> : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/settings/settings-header.tsx
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export function SettingsHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-2 border-b border-line px-2 py-3">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        className="px-2 py-1"
      >
        <Text className="text-2xl text-ink">‹</Text>
      </Pressable>
      <Text className="text-lg font-semibold text-ink">{title}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/components/settings/settings-row.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/settings-row.tsx apps/mobile/src/components/settings/settings-group.tsx apps/mobile/src/components/settings/settings-header.tsx apps/mobile/src/components/settings/settings-row.test.tsx
git commit -m "feat(mobile): add SettingsRow/SettingsGroup/SettingsHeader primitives"
```

---

## Task 3: `ConfirmSheet` primitive

A `BottomSheet`-based confirm dialog used by base-currency change, account archive, member remove, and leave-family.

**Files:**
- Create: `apps/mobile/src/components/settings/confirm-sheet.tsx`
- Test: `apps/mobile/src/components/settings/confirm-sheet.test.tsx` (create)

**Interfaces:**
- Produces: `ConfirmSheet({ open, onClose, title, message, confirmLabel?, danger?, busy?, onConfirm })` — renders `BottomSheet` with a message + Confirm/Cancel buttons. Confirm button is primary (or danger-styled label) and shows `busy` spinner.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/settings/confirm-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
import { ConfirmSheet } from './confirm-sheet';

describe('ConfirmSheet', () => {
  it('calls onConfirm when the confirm button is pressed', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmSheet open onClose={jest.fn()} title="Change base currency"
        message="This recalculates everything." confirmLabel="Confirm change" onConfirm={onConfirm} />,
    );
    fireEvent.press(screen.getByText('Confirm change'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/components/settings/confirm-sheet.test.tsx`
Expected: FAIL — cannot find module `./confirm-sheet`.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/components/settings/confirm-sheet.tsx
import { View } from 'react-native';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { Text } from 'react-native';

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmSheet({
  open, onClose, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <View className="gap-4 pb-2">
        <Text className="text-base text-muted">{message}</Text>
        <View className="gap-2">
          <Button variant="primary" loading={busy} onPress={onConfirm}>
            <Text className={`text-base font-medium ${danger ? 'text-white' : 'text-white'}`}>{confirmLabel}</Text>
          </Button>
          <Button variant="ghost" disabled={busy} onPress={onClose}>Cancel</Button>
        </View>
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/components/settings/confirm-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/confirm-sheet.tsx apps/mobile/src/components/settings/confirm-sheet.test.tsx
git commit -m "feat(mobile): add ConfirmSheet primitive"
```

---

## Task 4: Settings Stack + hub restructure + routing

Convert the single `settings.tsx` route into a `settings/` route directory with a nested `Stack`, and rebuild the current screen as the **hub** (`settings-hub-screen.tsx`) using the new primitives. The hub keeps the existing Streak row, Plan & Billing card, biometric toggle, and log out — and adds navigation rows + the Refer (coming-soon) and Privacy rows.

**Files:**
- Delete: `apps/mobile/app/(app)/settings.tsx`
- Create: `apps/mobile/app/(app)/settings/_layout.tsx`
- Create: `apps/mobile/app/(app)/settings/index.tsx`
- Create: `apps/mobile/src/screens/settings/settings-hub-screen.tsx`
- Modify (move logic from): `apps/mobile/src/screens/settings-screen.tsx` → becomes `settings-hub-screen.tsx` (delete the old file)
- Modify: `apps/mobile/src/screens/settings-screen.test.tsx` → move/rename to `apps/mobile/src/screens/settings/settings-hub-screen.test.tsx`

**Interfaces:**
- Consumes: `SettingsGroup`, `SettingsRow` (Task 2), `useAuthStore.setWorkspace/setUser` (Task 1, used by later screens; hub itself only reads).
- Produces: `SettingsHubScreen` default-exported via `app/(app)/settings/index.tsx`. Navigation targets: `/settings/profile`, `/settings/preferences`, `/settings/currencies`, `/settings/accounts`, `/settings/members`, `/settings/feedback`, `/settings/support`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/screens/settings/settings-hub-screen.test.tsx` (port the two existing settings-screen tests, add a nav-row test):

```tsx
// apps/mobile/src/screens/settings/settings-hub-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockAuthState = {
  user: { displayName: 'Tee', currentStreak: 7 },
  workspace: { id: 'w1', tier: 'FREE' },
  logout: jest.fn(),
  resetOnboarding: jest.fn(),
  lockEnabled: false,
  setLockEnabled: jest.fn(),
};
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../../lib/runtime.native', () => ({
  api: { billing: { getSubscription: jest.fn(), openPortal: jest.fn() } },
}));

import { SettingsHubScreen } from './settings-hub-screen';
import { api } from '../../lib/runtime.native';

const billing = api.billing as unknown as { getSubscription: jest.Mock; openPortal: jest.Mock };
const FREE_SUB = { tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null };

beforeEach(() => {
  mockPush.mockReset();
  billing.getSubscription.mockReset().mockResolvedValue(FREE_SUB);
  billing.openPortal.mockReset();
});

describe('SettingsHubScreen', () => {
  it('opens the streaks screen from the streak row', async () => {
    await render(<SettingsHubScreen />);
    await fireEvent.press(screen.getByLabelText('View your streak progress'));
    expect(mockPush).toHaveBeenCalledWith('/streaks');
  });

  it('navigates to the profile sub-screen', async () => {
    await render(<SettingsHubScreen />);
    await fireEvent.press(screen.getByLabelText('Profile'));
    expect(mockPush).toHaveBeenCalledWith('/settings/profile');
  });

  it('hides Family members for non-FAMILY tiers', async () => {
    await render(<SettingsHubScreen />);
    expect(screen.queryByLabelText('Family members')).toBeNull();
  });
});
```

Then delete the old `apps/mobile/src/screens/settings-screen.test.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/settings-hub-screen.test.tsx`
Expected: FAIL — cannot find module `./settings-hub-screen`.

- [ ] **Step 3: Implement the hub screen**

Create `apps/mobile/src/screens/settings/settings-hub-screen.tsx` (port from the old `settings-screen.tsx`, adjust import depth `../../`, and add the new rows). Full file:

```tsx
// apps/mobile/src/screens/settings/settings-hub-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ApiError } from '@finby/core';
import type { SubscriptionView } from '@finby/shared';
import { Button } from '../../components/ui/button';
import { Toggle } from '../../components/ui/toggle';
import { SectionCard, SectionError, SectionLoading, type SectionState } from '../../components/dashboard/section-card';
import { CurrentPlanCard } from '../../components/billing/current-plan-card';
import { PlanCarouselSheet } from '../../components/billing/plan-carousel-sheet';
import { SettingsGroup } from '../../components/settings/settings-group';
import { SettingsRow } from '../../components/settings/settings-row';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const LOADING = { data: null, loading: true, error: null } as const;
const PRIVACY_URL = 'https://finby.app/privacy';

export function SettingsHubScreen() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetOnboarding = useAuthStore((s) => s.resetOnboarding);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const setLockEnabled = useAuthStore((s) => s.setLockEnabled);
  const currentStreak = useAuthStore((s) => s.user?.currentStreak ?? 0);
  const isFamily = workspace?.tier === 'FAMILY';

  const [sub, setSub] = useState<SectionState<SubscriptionView>>(LOADING);
  const [managing, setManaging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setSub(LOADING);
    return api.billing
      .getSubscription(workspace.id)
      .then((d) => setSub({ data: d, loading: false, error: null }))
      .catch((e) => setSub({ data: null, loading: false, error: e instanceof ApiError ? e.message : 'Could not load your plan.' }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void load();
  }, [workspace, load]);

  async function manage() {
    if (!workspace) return;
    setManaging(true);
    try {
      const { url } = await api.billing.openPortal(workspace.id);
      await Linking.openURL(url);
    } catch {
      /* best-effort */
    } finally {
      setManaging(false);
    }
  }

  async function replayOnboarding() {
    await resetOnboarding();
    await logout();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="border-b border-line px-4 py-3">
        <Text className="text-lg font-semibold text-ink">Settings</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 p-6">
        <Pressable
          onPress={() => router.push('/streaks')}
          accessibilityRole="button"
          accessibilityLabel="View your streak progress"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">🔥 {currentStreak}-day streak</Text>
          <Text className="text-sm font-medium text-accent">View progress →</Text>
        </Pressable>

        <SectionCard title="Plan & Billing">
          {sub.loading ? (
            <SectionLoading />
          ) : sub.error || !sub.data ? (
            <SectionError onRetry={load} />
          ) : (
            <CurrentPlanCard sub={sub.data} onChangePlan={() => setSheetOpen(true)} onManage={() => void manage()} managing={managing} />
          )}
        </SectionCard>

        <SettingsGroup title="Account">
          <SettingsRow label="Profile" value={user?.displayName} onPress={() => router.push('/settings/profile')} />
          <SettingsRow label="Preferences" onPress={() => router.push('/settings/preferences')} />
          <SettingsRow label="Currencies" value={workspace?.baseCurrency} onPress={() => router.push('/settings/currencies')} />
          <SettingsRow label="Accounts" onPress={() => router.push('/settings/accounts')} />
        </SettingsGroup>

        {isFamily ? (
          <SettingsGroup title="Family">
            <SettingsRow label="Family members" onPress={() => router.push('/settings/members')} />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Support & feedback">
          <SettingsRow label="Feedback" onPress={() => router.push('/settings/feedback')} />
          <SettingsRow label="Support" onPress={() => router.push('/settings/support')} />
          <SettingsRow label="Refer & Earn" value="Coming soon" disabled />
          <SettingsRow label="Privacy Policy" right={<Text className="text-base text-faint">↗</Text>} onPress={() => void Linking.openURL(PRIVACY_URL)} />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <SettingsRow
            label="Biometric app lock"
            right={<Toggle value={lockEnabled} onValueChange={(v) => void setLockEnabled(v)} accessibilityLabel="Biometric app lock" />}
          />
        </SettingsGroup>

        <Button variant="ghost" onPress={() => void logout()}>Log out</Button>

        {__DEV__ ? (
          <Button variant="ghost" onPress={() => void replayOnboarding()}>Replay onboarding (dev)</Button>
        ) : null}
      </ScrollView>

      <PlanCarouselSheet open={sheetOpen} onClose={() => setSheetOpen(false)} currentTier={sub.data?.tier ?? 'FREE'} />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Create the route files and delete the old screen**

```tsx
// apps/mobile/app/(app)/settings/_layout.tsx
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// apps/mobile/app/(app)/settings/index.tsx
export { SettingsHubScreen as default } from '../../../src/screens/settings/settings-hub-screen';
```

Then remove the superseded files:

```bash
git rm apps/mobile/app/(app)/settings.tsx apps/mobile/src/screens/settings-screen.tsx apps/mobile/src/screens/settings-screen.test.tsx
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/screens/settings/settings-hub-screen.test.tsx`
Expected: PASS (3 tests). Also confirm the tab still resolves: `npx expo export --platform ios` is overkill — instead verify no dangling import: `cd apps/mobile && npx tsc --noEmit`.
Expected: no errors referencing `settings-screen`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/(app)/settings apps/mobile/src/screens/settings/settings-hub-screen.tsx apps/mobile/src/screens/settings/settings-hub-screen.test.tsx
git commit -m "feat(mobile): settings hub + nested stack routing"
```

---

## Task 5: Profile screen

**Files:**
- Create: `apps/mobile/src/screens/settings/profile-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/profile.tsx`
- Test: `apps/mobile/src/screens/settings/profile-screen.test.tsx`

**Interfaces:**
- Consumes: `api.settings.updateProfile`, `useAuthStore.setUser` (Task 1), `SettingsHeader`, `Field`, `Input`, `Button`.
- Produces: `ProfileScreen` (default via route).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/profile-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setUser = jest.fn();
const mockState = { user: { displayName: 'Tee', timezone: 'UTC', email: 't@e.co', accountNumber: 'FB-123' }, setUser };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateProfile: jest.fn() } } }));

import { ProfileScreen } from './profile-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateProfile: jest.Mock };

beforeEach(() => { setUser.mockReset(); settings.updateProfile.mockReset().mockResolvedValue({ displayName: 'Tee 2', timezone: 'UTC' }); });

describe('ProfileScreen', () => {
  it('saves an edited name and updates the store', async () => {
    render(<ProfileScreen />);
    fireEvent.changeText(screen.getByLabelText('Name'), 'Tee 2');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ displayName: 'Tee 2', timezone: 'UTC' }));
    expect(setUser).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/profile-screen.test.tsx`
Expected: FAIL — cannot find module `./profile-screen`.

- [ ] **Step 3: Implement**

Note: uses `expo-clipboard` (already an Expo dep; if missing, add with `npx expo install expo-clipboard`).

```tsx
// apps/mobile/src/screens/settings/profile-screen.tsx
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty = name !== (user?.displayName ?? '') || timezone !== (user?.timezone ?? '');

  async function copyAccount() {
    if (!user?.accountNumber) return;
    await Clipboard.setStringAsync(user.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.settings.updateProfile({ displayName: name.trim(), timezone: timezone.trim() });
      setUser(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Profile" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        {user?.accountNumber ? (
          <View className="gap-1.5">
            <Text className="text-xs font-medium uppercase tracking-wide text-muted">Account number</Text>
            <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3">
              <Text className="font-mono text-base text-ink">{user.accountNumber}</Text>
              <Text onPress={() => void copyAccount()} accessibilityRole="button" className="text-sm font-medium text-accent">
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </View>
          </View>
        ) : null}

        <Field label="Name">
          <Input value={name} onChangeText={setName} autoComplete="name" accessibilityLabel="Name" />
        </Field>
        <Field label="Timezone">
          <Input value={timezone} onChangeText={setTimezone} accessibilityLabel="Timezone" />
        </Field>
        <Field label="Email" hint="Email can't be changed.">
          <Input value={user?.email ?? ''} editable={false} accessibilityLabel="Email" />
        </Field>

        {error ? <Text className="text-sm text-danger">{error}</Text> : null}

        <Button disabled={!dirty} loading={saving} onPress={() => void save()}>Save</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
```

```tsx
// apps/mobile/app/(app)/settings/profile.tsx
export { ProfileScreen as default } from '../../../src/screens/settings/profile-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/profile-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/profile-screen.tsx apps/mobile/src/screens/settings/profile-screen.test.tsx apps/mobile/app/(app)/settings/profile.tsx
git commit -m "feat(mobile): profile settings screen"
```

---

## Task 6: Preferences screen (display dropdowns)

Auto-saving dropdowns for date format, currency display, number format. (Push + daily reminder are intentionally out of scope — separate plan.)

**Files:**
- Create: `apps/mobile/src/screens/settings/preferences-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/preferences.tsx`
- Test: `apps/mobile/src/screens/settings/preferences-screen.test.tsx`

**Interfaces:**
- Consumes: `api.settings.updateProfile`, `useAuthStore.setUser`, `SettingsHeader`, `Field`, `Dropdown`.
- Produces: `PreferencesScreen`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/preferences-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setUser = jest.fn();
const mockState = { user: { preferences: { dateFormat: 'MEDIUM', currencyDisplay: 'SYMBOL', numberFormat: 'GROUPED' } }, setUser };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateProfile: jest.fn() } } }));

import { PreferencesScreen } from './preferences-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateProfile: jest.Mock };

beforeEach(() => { setUser.mockReset(); settings.updateProfile.mockReset().mockResolvedValue({ preferences: { dateFormat: 'ISO' } }); });

describe('PreferencesScreen', () => {
  it('saves a date format change immediately', async () => {
    render(<PreferencesScreen />);
    fireEvent.press(screen.getByLabelText('Date format'));          // open dropdown
    fireEvent.press(screen.getByText('2026-06-07'));                // ISO option label
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ preferences: { dateFormat: 'ISO' } }));
    expect(setUser).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/preferences-screen.test.tsx`
Expected: FAIL — cannot find module `./preferences-screen`.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/screens/settings/preferences-screen.tsx
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UserPreferences } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const DATE_OPTIONS = [
  { value: 'MEDIUM', label: 'Jun 7, 2026' },
  { value: 'SHORT', label: '07/06/2026' },
  { value: 'ISO', label: '2026-06-07' },
] as const;
const CURRENCY_OPTIONS = [
  { value: 'SYMBOL', label: '$1,234.50' },
  { value: 'CODE', label: '1,234.50 USD' },
] as const;
const NUMBER_OPTIONS = [
  { value: 'GROUPED', label: '1,234.50' },
  { value: 'PLAIN', label: '1234.50' },
] as const;

export function PreferencesScreen() {
  const prefs = useAuthStore((s) => s.user?.preferences);
  const setUser = useAuthStore((s) => s.setUser);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function savePref(patch: Partial<UserPreferences>) {
    setStatus('saving');
    try {
      const updated = await api.settings.updateProfile({ preferences: patch });
      setUser(updated);
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      if (!(e instanceof ApiError)) throw e;
    }
  }

  const statusLabel = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save' : '';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Preferences" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        {statusLabel ? <Text className={`text-xs ${status === 'error' ? 'text-danger' : 'text-faint'}`}>{statusLabel}</Text> : null}

        <Field label="Date format" hint="How dates appear across the app.">
          <Dropdown value={prefs?.dateFormat ?? 'MEDIUM'} options={DATE_OPTIONS as never} accessibilityLabel="Date format"
            onSelect={(v) => void savePref({ dateFormat: v as UserPreferences['dateFormat'] })} />
        </Field>
        <Field label="Currency display" hint="Show the currency symbol or its code.">
          <Dropdown value={prefs?.currencyDisplay ?? 'SYMBOL'} options={CURRENCY_OPTIONS as never} accessibilityLabel="Currency display"
            onSelect={(v) => void savePref({ currencyDisplay: v as UserPreferences['currencyDisplay'] })} />
        </Field>
        <Field label="Number format" hint="Group thousands or show plain numbers.">
          <Dropdown value={prefs?.numberFormat ?? 'GROUPED'} options={NUMBER_OPTIONS as never} accessibilityLabel="Number format"
            onSelect={(v) => void savePref({ numberFormat: v as UserPreferences['numberFormat'] })} />
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}
```

```tsx
// apps/mobile/app/(app)/settings/preferences.tsx
export { PreferencesScreen as default } from '../../../src/screens/settings/preferences-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/preferences-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/preferences-screen.tsx apps/mobile/src/screens/settings/preferences-screen.test.tsx apps/mobile/app/(app)/settings/preferences.tsx
git commit -m "feat(mobile): preferences settings screen"
```

---

## Task 7: `StarRating` primitive + Feedback screen

**Files:**
- Create: `apps/mobile/src/components/settings/star-rating.tsx`
- Create: `apps/mobile/src/screens/settings/feedback-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/feedback.tsx`
- Test: `apps/mobile/src/components/settings/star-rating.test.tsx`
- Test: `apps/mobile/src/screens/settings/feedback-screen.test.tsx`

**Interfaces:**
- Produces:
  - `StarRating({ value, onChange, size? })` — five pressable stars; each labelled `Rate N`.
  - `FeedbackScreen`.
- Consumes: `api.feedback.submitFeedback`, `SettingsHeader`, `Field`, `Input`, `Button`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/components/settings/star-rating.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StarRating } from './star-rating';

it('selects a rating', () => {
  const onChange = jest.fn();
  render(<StarRating value={0} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText('Rate 4'));
  expect(onChange).toHaveBeenCalledWith(4);
});
```

```tsx
// apps/mobile/src/screens/settings/feedback-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { feedback: { submitFeedback: jest.fn() } } }));
import { FeedbackScreen } from './feedback-screen';
import { api } from '../../lib/runtime.native';
const feedback = api.feedback as unknown as { submitFeedback: jest.Mock };

beforeEach(() => feedback.submitFeedback.mockReset().mockResolvedValue({ id: 'f1', rating: 5, comment: null, createdAt: '' }));

it('submits a rating and shows the thank-you state', async () => {
  render(<FeedbackScreen />);
  fireEvent.press(screen.getByLabelText('Rate 5'));
  fireEvent.press(screen.getByText('Submit review'));
  await waitFor(() => expect(feedback.submitFeedback).toHaveBeenCalledWith(5, ''));
  await waitFor(() => expect(screen.getByText(/Thank you/)).toBeTruthy());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest src/components/settings/star-rating.test.tsx src/screens/settings/feedback-screen.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/components/settings/star-rating.tsx
import { Pressable, Text, View } from 'react-native';

export function StarRating({ value, onChange, size = 32 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <View className="flex-row gap-1" accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="button" accessibilityLabel={`Rate ${n}`} hitSlop={6}>
          <Text style={{ fontSize: size }} className={n <= value ? 'text-warn' : 'text-line'}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
```

```tsx
// apps/mobile/src/screens/settings/feedback-screen.tsx
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { StarRating } from '../../components/settings/star-rating';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/runtime.native';

export function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function submit() {
    if (rating < 1) return;
    setStatus('submitting');
    try {
      await api.feedback.submitFeedback(rating, comment);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Feedback" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        {status === 'done' ? (
          <View className="items-center gap-3 py-8">
            <Text className="text-4xl">⭐</Text>
            <Text className="text-center text-base text-ink">Thank you! Your feedback helps us make Finby better.</Text>
          </View>
        ) : (
          <>
            <Field label="How would you rate your experience?">
              <StarRating value={rating} onChange={setRating} />
            </Field>
            <Field label="Anything else? (optional)">
              <Input value={comment} onChangeText={setComment} multiline numberOfLines={4} maxLength={2000}
                placeholder="Anything you'd like us to know?" accessibilityLabel="Feedback comment" />
            </Field>
            {status === 'error' ? <Text className="text-sm text-danger">Could not submit. Try again.</Text> : null}
            <Button disabled={rating < 1} loading={status === 'submitting'} onPress={() => void submit()}>Submit review</Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

```tsx
// apps/mobile/app/(app)/settings/feedback.tsx
export { FeedbackScreen as default } from '../../../src/screens/settings/feedback-screen';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/components/settings/star-rating.test.tsx src/screens/settings/feedback-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/star-rating.tsx apps/mobile/src/components/settings/star-rating.test.tsx apps/mobile/src/screens/settings/feedback-screen.tsx apps/mobile/src/screens/settings/feedback-screen.test.tsx apps/mobile/app/(app)/settings/feedback.tsx
git commit -m "feat(mobile): feedback screen + StarRating"
```

---

## Task 8: Support screen

Category + subject + message form; lazy-loaded ticket history with status badges.

**Files:**
- Create: `apps/mobile/src/screens/settings/support-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/support.tsx`
- Test: `apps/mobile/src/screens/settings/support-screen.test.tsx`

**Interfaces:**
- Consumes: `api.support.createSupportTicket`, `api.support.listSupportTickets`, `SUPPORT_CATEGORIES`, `SUPPORT_CATEGORY_LABELS`, `SettingsHeader`, `Field`, `Dropdown`, `Input`, `Button`.
- Produces: `SupportScreen`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/support-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { support: { createSupportTicket: jest.fn(), listSupportTickets: jest.fn() } } }));
import { SupportScreen } from './support-screen';
import { api } from '../../lib/runtime.native';
const support = api.support as unknown as { createSupportTicket: jest.Mock; listSupportTickets: jest.Mock };

beforeEach(() => {
  support.listSupportTickets.mockReset().mockResolvedValue([]);
  support.createSupportTicket.mockReset().mockResolvedValue({ id: 't1', category: 'BUG', subject: 'x', message: 'y', status: 'OPEN', createdAt: '' });
});

it('submits a ticket', async () => {
  render(<SupportScreen />);
  fireEvent.changeText(screen.getByLabelText('Subject'), 'Broken button');
  fireEvent.changeText(screen.getByLabelText('Message'), 'It does nothing.');
  fireEvent.press(screen.getByText('Send'));
  await waitFor(() => expect(support.createSupportTicket).toHaveBeenCalledWith({ category: 'BUG', subject: 'Broken button', message: 'It does nothing.' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/support-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/screens/settings/support-screen.tsx
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, type SupportCategory, type SupportTicketView } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/runtime.native';

const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] }));
const STATUS_STYLE: Record<SupportTicketView['status'], string> = {
  OPEN: 'bg-accent/15 text-accent',
  IN_PROGRESS: 'bg-warn/15 text-warn',
  RESOLVED: 'bg-success/15 text-success',
};

export function SupportScreen() {
  const [category, setCategory] = useState<SupportCategory>('BUG');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketView[]>([]);

  useEffect(() => {
    api.support.listSupportTickets().then(setTickets).catch(() => { /* history is best-effort */ });
  }, []);

  async function submit() {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await api.support.createSupportTicket({ category, subject: subject.trim(), message: message.trim() });
      setTickets((prev) => [t, ...prev]);
      setSubject('');
      setMessage('');
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Support" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        <Text className="text-sm text-muted">Hit a snag? Send us a ticket and we&apos;ll reply by email.</Text>
        <Field label="Category">
          <Dropdown value={category} options={CATEGORY_OPTIONS} accessibilityLabel="Category" onSelect={(v) => setCategory(v)} />
        </Field>
        <Field label="Subject">
          <Input value={subject} onChangeText={setSubject} maxLength={160} placeholder="Short summary" accessibilityLabel="Subject" />
        </Field>
        <Field label="Message">
          <Input value={message} onChangeText={setMessage} multiline numberOfLines={4} maxLength={5000} placeholder="What's going on?" accessibilityLabel="Message" />
        </Field>
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        {sent ? <Text className="text-sm text-success">Sent — we&apos;ll be in touch by email.</Text> : null}
        <Button disabled={!subject.trim() || !message.trim()} loading={submitting} onPress={() => void submit()}>Send</Button>

        {tickets.length > 0 ? (
          <View className="gap-2 pt-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Your tickets</Text>
            {tickets.map((t) => (
              <View key={t.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-1 pr-2">
                  <Text numberOfLines={1} className="text-base text-ink">{t.subject}</Text>
                  <Text className="text-xs text-faint">{SUPPORT_CATEGORY_LABELS[t.category]}</Text>
                </View>
                <View className={`rounded-full px-2.5 py-0.5 ${STATUS_STYLE[t.status]}`}>
                  <Text className={`text-xs font-semibold ${STATUS_STYLE[t.status]}`}>{t.status.replace('_', ' ')}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
```

> Note: `SupportTicketView` is exported from `@finby/shared`; if the class-name Tailwind trick on the badge text color misbehaves, split the badge into a `<View>` bg class + `<Text>` color class using the two halves of `STATUS_STYLE` (bg vs text). Match whatever the linter accepts.

```tsx
// apps/mobile/app/(app)/settings/support.tsx
export { SupportScreen as default } from '../../../src/screens/settings/support-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/support-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/support-screen.tsx apps/mobile/src/screens/settings/support-screen.test.tsx apps/mobile/app/(app)/settings/support.tsx
git commit -m "feat(mobile): support ticket screen"
```

---

## Task 9: `UpgradeGate` primitive

Gate a control behind a required tier; for lower tiers show an upgrade prompt that opens the existing `PlanCarouselSheet`.

**Files:**
- Create: `apps/mobile/src/components/settings/upgrade-gate.tsx`
- Test: `apps/mobile/src/components/settings/upgrade-gate.test.tsx`

**Interfaces:**
- Produces: `UpgradeGate({ currentTier, requiredTier, children })` — renders `children` when `tierRank(currentTier) >= tierRank(requiredTier)`, else an upgrade card with an "Upgrade" button that opens `PlanCarouselSheet`.
- Tier rank order: `FREE < PRO < PREMIUM < FAMILY` (FAMILY and PREMIUM both satisfy a `PRO` requirement).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/settings/upgrade-gate.test.tsx
import { render, screen } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../billing/plan-carousel-sheet', () => ({ PlanCarouselSheet: () => null }));
import { Text } from 'react-native';
import { UpgradeGate } from './upgrade-gate';

it('shows children when the tier meets the requirement', () => {
  render(<UpgradeGate currentTier="PRO" requiredTier="PRO"><Text>Chips</Text></UpgradeGate>);
  expect(screen.getByText('Chips')).toBeTruthy();
});

it('gates children on FREE tier', () => {
  render(<UpgradeGate currentTier="FREE" requiredTier="PRO"><Text>Chips</Text></UpgradeGate>);
  expect(screen.queryByText('Chips')).toBeNull();
  expect(screen.getByText('Upgrade')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/components/settings/upgrade-gate.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/components/settings/upgrade-gate.tsx
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { Button } from '../ui/button';
import { PlanCarouselSheet } from '../billing/plan-carousel-sheet';

const RANK: Record<SubscriptionTier, number> = { FREE: 0, PRO: 1, PREMIUM: 2, FAMILY: 3 };

export function UpgradeGate({
  currentTier, requiredTier, children,
}: { currentTier: SubscriptionTier; requiredTier: SubscriptionTier; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (RANK[currentTier] >= RANK[requiredTier]) return <>{children}</>;
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-base text-ink">This is a Pro feature.</Text>
      <Text className="text-sm text-muted">Upgrade to unlock multiple currencies and more.</Text>
      <Button onPress={() => setOpen(true)}>Upgrade</Button>
      <PlanCarouselSheet open={open} onClose={() => setOpen(false)} currentTier={currentTier} />
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/components/settings/upgrade-gate.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/upgrade-gate.tsx apps/mobile/src/components/settings/upgrade-gate.test.tsx
git commit -m "feat(mobile): UpgradeGate primitive"
```

---

## Task 10: Currencies screen (base + preferred, combined)

Base-currency picker (with `ConfirmSheet` + recompute count) and preferred-currency chips (gated behind PRO via `UpgradeGate`).

**Files:**
- Create: `apps/mobile/src/screens/settings/currencies-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/currencies.tsx`
- Test: `apps/mobile/src/screens/settings/currencies-screen.test.tsx`

**Interfaces:**
- Consumes: `api.settings.updateBaseCurrency`, `api.settings.updateCurrencies`, `useAuthStore.workspace/setWorkspace`, `CURRENCIES`, `ConfirmSheet`, `UpgradeGate`, `Dropdown`, `Button`, `SettingsHeader`.
- Produces: `CurrenciesScreen`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/currencies-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
const setWorkspace = jest.fn();
const mockState = { workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD', preferredCurrencies: ['USD'] }, setWorkspace };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateBaseCurrency: jest.fn(), updateCurrencies: jest.fn() } } }));
import { CurrenciesScreen } from './currencies-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateBaseCurrency: jest.Mock; updateCurrencies: jest.Mock };

beforeEach(() => {
  setWorkspace.mockReset();
  settings.updateBaseCurrency.mockReset().mockResolvedValue({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'], recomputed: 12 });
  settings.updateCurrencies.mockReset().mockResolvedValue({ preferredCurrencies: ['USD', 'EUR'] });
});

it('confirms and changes the base currency', async () => {
  render(<CurrenciesScreen />);
  fireEvent.press(screen.getByLabelText('Base currency'));         // open dropdown
  fireEvent.press(screen.getByText('EUR — Euro'));                 // pick EUR
  fireEvent.press(screen.getByText('Confirm change'));             // confirm sheet
  await waitFor(() => expect(settings.updateBaseCurrency).toHaveBeenCalledWith('w1', 'EUR'));
  expect(setWorkspace).toHaveBeenCalledWith({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/currencies-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/screens/settings/currencies-screen.tsx
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCIES } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { UpgradeGate } from '../../components/settings/upgrade-gate';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

export function CurrenciesScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const setWorkspace = useAuthStore((s) => s.setWorkspace);
  const base = workspace?.baseCurrency ?? 'USD';

  const [pendingBase, setPendingBase] = useState<string | null>(null);
  const [changingBase, setChangingBase] = useState(false);
  const [recomputed, setRecomputed] = useState<number | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>(workspace?.preferredCurrencies ?? [base]);
  const [savingPreferred, setSavingPreferred] = useState(false);
  const preferredDirty = useMemo(() => {
    const a = [...selected].sort().join(',');
    const b = [...(workspace?.preferredCurrencies ?? [])].sort().join(',');
    return a !== b;
  }, [selected, workspace?.preferredCurrencies]);

  async function confirmBaseChange() {
    if (!workspace || !pendingBase) return;
    setChangingBase(true);
    setBaseError(null);
    try {
      const res = await api.settings.updateBaseCurrency(workspace.id, pendingBase);
      setWorkspace({ baseCurrency: res.baseCurrency, preferredCurrencies: res.preferredCurrencies });
      setSelected(res.preferredCurrencies);
      setRecomputed(res.recomputed);
      setPendingBase(null);
    } catch (e) {
      setBaseError(e instanceof ApiError ? e.message : 'Could not change base currency.');
    } finally {
      setChangingBase(false);
    }
  }

  function toggleCurrency(code: string) {
    if (code === base) return; // base is always on + locked
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function savePreferred() {
    if (!workspace) return;
    setSavingPreferred(true);
    try {
      const res = await api.settings.updateCurrencies(workspace.id, selected);
      setWorkspace({ preferredCurrencies: res.preferredCurrencies });
      setSelected(res.preferredCurrencies);
    } catch {
      /* surfaced via toast elsewhere; keep local state */
    } finally {
      setSavingPreferred(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Currencies" />
      <ScrollView contentContainerClassName="gap-6 p-6">
        <Field label="Base currency" hint={`All totals are reported in ${base}.`}>
          <Dropdown
            value={base}
            options={CURRENCY_OPTIONS}
            accessibilityLabel="Base currency"
            onSelect={(code) => { if (code !== base) { setPendingBase(code); setRecomputed(null); } }}
          />
        </Field>
        {recomputed !== null ? (
          <Text className="text-sm text-success">Recalculated {recomputed} transaction(s) into {base}.</Text>
        ) : null}
        {baseError ? <Text className="text-sm text-danger">{baseError}</Text> : null}

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Currencies you use</Text>
          <UpgradeGate currentTier={workspace?.tier ?? 'FREE'} requiredTier="PRO">
            <View className="flex-row flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const on = selected.includes(c.code);
                const locked = c.code === base;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => toggleCurrency(c.code)}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.code} ${on ? 'selected' : 'not selected'}`}
                    className={`rounded-full border px-3 py-1.5 ${on ? 'border-accent bg-accent/15' : 'border-line bg-surface'} ${locked ? 'opacity-70' : ''}`}
                  >
                    <Text className={`text-sm ${on ? 'text-accent' : 'text-ink'}`}>{c.symbol} {c.code}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button disabled={!preferredDirty} loading={savingPreferred} onPress={() => void savePreferred()}>Save</Button>
          </UpgradeGate>
        </View>
      </ScrollView>

      <ConfirmSheet
        open={pendingBase !== null}
        onClose={() => setPendingBase(null)}
        busy={changingBase}
        title="Change base currency"
        message={`This recalculates all your transactions, budgets and investments into ${pendingBase ?? ''}. This can take a moment.`}
        confirmLabel="Confirm change"
        onConfirm={() => void confirmBaseChange()}
      />
    </SafeAreaView>
  );
}
```

```tsx
// apps/mobile/app/(app)/settings/currencies.tsx
export { CurrenciesScreen as default } from '../../../src/screens/settings/currencies-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/currencies-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/currencies-screen.tsx apps/mobile/src/screens/settings/currencies-screen.test.tsx apps/mobile/app/(app)/settings/currencies.tsx
git commit -m "feat(mobile): combined currencies settings screen"
```

---

## Task 11: `ColorPicker` primitive + `useWorkspaceRole` hook

Two small building blocks for the Accounts (and Members) screens.

**Files:**
- Create: `apps/mobile/src/components/settings/color-picker.tsx`
- Create: `apps/mobile/src/lib/use-workspace-role.ts`
- Test: `apps/mobile/src/components/settings/color-picker.test.tsx`
- Test: `apps/mobile/src/lib/use-workspace-role.test.tsx`

**Interfaces:**
- Produces:
  - `ColorPicker({ value, onChange })` — swatch row from a fixed palette; `null` = default accent. Each swatch labelled `Color <hex>`; a "None" swatch sets `null`.
  - `ACCOUNT_COLORS: string[]` (exported from color-picker).
  - `useWorkspaceRole(): WorkspaceMemberRole` — reads the active workspace id from the store, fetches `api.members.listWorkspaces()` once, returns the matching role (defaults `'VIEWER'` until loaded).

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/components/settings/color-picker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ColorPicker, ACCOUNT_COLORS } from './color-picker';

it('picks a color', () => {
  const onChange = jest.fn();
  render(<ColorPicker value={null} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText(`Color ${ACCOUNT_COLORS[0]}`));
  expect(onChange).toHaveBeenCalledWith(ACCOUNT_COLORS[0]);
});
```

```tsx
// apps/mobile/src/lib/use-workspace-role.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
jest.mock('./use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1' } }) }));
jest.mock('./runtime.native', () => ({ api: { members: { listWorkspaces: jest.fn().mockResolvedValue([{ workspaceId: 'w1', role: 'OWNER' }]) } } }));
import { useWorkspaceRole } from './use-workspace-role';

function Probe() { return <Text>{useWorkspaceRole()}</Text>; }

it('resolves the active workspace role', async () => {
  render(<Probe />);
  await waitFor(() => expect(screen.getByText('OWNER')).toBeTruthy());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest src/components/settings/color-picker.test.tsx src/lib/use-workspace-role.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/components/settings/color-picker.tsx
import { Pressable, Text, View } from 'react-native';

export const ACCOUNT_COLORS = ['#1d6ef5', '#1fae6a', '#f5a524', '#ef4444', '#a78bfa', '#06b6d4'];

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2.5">
      <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel="Color none"
        className={`h-8 w-8 items-center justify-center rounded-full border ${value === null ? 'border-ink' : 'border-line'} bg-surface`}>
        <Text className="text-xs text-faint">—</Text>
      </Pressable>
      {ACCOUNT_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onChange(c)} accessibilityRole="button" accessibilityLabel={`Color ${c}`}
          style={{ backgroundColor: c }}
          className={`h-8 w-8 rounded-full border-2 ${value === c ? 'border-ink' : 'border-transparent'}`} />
      ))}
    </View>
  );
}
```

```ts
// apps/mobile/src/lib/use-workspace-role.ts
import { useEffect, useState } from 'react';
import type { WorkspaceMemberRole } from '@finby/shared';
import { useAuthStore } from './use-auth-store';
import { api } from './runtime.native';

/** Resolve the current user's role in the active workspace (VIEWER until loaded). */
export function useWorkspaceRole(): WorkspaceMemberRole {
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const [role, setRole] = useState<WorkspaceMemberRole>('VIEWER');
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    api.members
      .listWorkspaces()
      .then((ws) => {
        if (!active) return;
        setRole(ws.find((w) => w.workspaceId === workspaceId)?.role ?? 'VIEWER');
      })
      .catch(() => { /* default VIEWER */ });
    return () => { active = false; };
  }, [workspaceId]);
  return role;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/components/settings/color-picker.test.tsx src/lib/use-workspace-role.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/color-picker.tsx apps/mobile/src/components/settings/color-picker.test.tsx apps/mobile/src/lib/use-workspace-role.ts apps/mobile/src/lib/use-workspace-role.test.tsx
git commit -m "feat(mobile): ColorPicker + useWorkspaceRole"
```

---

## Task 12: Accounts screen

List (active then archived), add form (BottomSheet), inline edit, archive/unarchive with confirm. Role-gated editing.

**Files:**
- Create: `apps/mobile/src/screens/settings/accounts-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/accounts.tsx`
- Test: `apps/mobile/src/screens/settings/accounts-screen.test.tsx`

**Interfaces:**
- Consumes: `api.dashboard.listAccounts`, `api.accounts.createAccount`, `api.accounts.updateAccount`, `useWorkspaceRole`, `useAuthStore.workspace`, `ACCOUNT_TYPES`, `ACCOUNT_TYPE_LABELS`, `CURRENCIES`, `money` (from `@finby/core`), `ColorPicker`, `ConfirmSheet`, `BottomSheet`, `Dropdown`, `Input`, `Button`, `SettingsHeader`, `SectionLoading`, `SectionError`.
- Produces: `AccountsScreen`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/accounts-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1', baseCurrency: 'USD', preferredCurrencies: ['USD'] } }) }));
jest.mock('../../lib/use-workspace-role', () => ({ useWorkspaceRole: () => 'OWNER' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {}, money: (v: string, c: string) => `${c} ${v}` }));
jest.mock('../../lib/runtime.native', () => ({ api: {
  dashboard: { listAccounts: jest.fn() },
  accounts: { createAccount: jest.fn(), updateAccount: jest.fn() },
} }));
import { AccountsScreen } from './accounts-screen';
import { api } from '../../lib/runtime.native';
const dash = api.dashboard as unknown as { listAccounts: jest.Mock };
const accounts = api.accounts as unknown as { createAccount: jest.Mock; updateAccount: jest.Mock };

const ACC = { id: 'a1', name: 'BDO', currency: 'USD', accountType: 'BANK', balance: '100.00', color: null, icon: null, isArchived: false };
beforeEach(() => {
  dash.listAccounts.mockReset().mockResolvedValue([ACC]);
  accounts.createAccount.mockReset();
  accounts.updateAccount.mockReset().mockResolvedValue({ ...ACC, isArchived: true });
});

it('lists accounts on load', async () => {
  render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/accounts-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/screens/settings/accounts-screen.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, CURRENCIES, type AccountType, type AccountView } from '@finby/shared';
import { ApiError, money } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { SectionLoading, SectionError } from '../../components/dashboard/section-card';
import { BottomSheet } from '../../components/ui/bottom-sheet';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ColorPicker } from '../../components/settings/color-picker';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { useWorkspaceRole } from '../../lib/use-workspace-role';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

export function AccountsScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const role = useWorkspaceRole();
  const canManage = role !== 'VIEWER';

  const currencyOptions = useMemo(() => {
    const codes = Array.from(new Set([workspace?.baseCurrency, ...(workspace?.preferredCurrencies ?? [])].filter(Boolean) as string[]));
    return CURRENCIES.filter((c) => codes.includes(c.code)).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  }, [workspace?.baseCurrency, workspace?.preferredCurrencies]);

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  const [currency, setCurrency] = useState(workspace?.baseCurrency ?? 'USD');
  const [initialBalance, setInitialBalance] = useState('0');
  const [addColor, setAddColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<AccountView | null>(null);

  const load = useCallback(() => {
    if (!workspace) return;
    setLoading(true);
    setLoadError(false);
    api.dashboard
      .listAccounts(workspace.id)
      .then(setAccounts)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  function upsert(acc: AccountView) {
    setAccounts((prev) => (prev.some((a) => a.id === acc.id) ? prev.map((a) => (a.id === acc.id ? acc : a)) : [...prev, acc]));
  }

  async function addAccount() {
    if (!workspace || !name.trim()) return;
    setBusy(true);
    try {
      const acc = await api.accounts.createAccount(workspace.id, {
        name: name.trim(), accountType: type, currency,
        initialBalance: initialBalance.trim() || '0', ...(addColor ? { color: addColor } : {}),
      });
      upsert(acc);
      setAdding(false);
      setName(''); setType('BANK'); setInitialBalance('0'); setAddColor(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(acc: AccountView) {
    setBusy(true);
    try {
      const updated = await api.accounts.updateAccount(workspace!.id, acc.id, { isArchived: !acc.isArchived });
      upsert(updated);
      setArchiveTarget(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setBusy(false);
    }
  }

  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Accounts" />
      <ScrollView contentContainerClassName="gap-4 p-6">
        {loading ? (
          <SectionLoading />
        ) : loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <>
            {!canManage ? (
              <Text className="text-sm text-muted">Only owners and co-managers can add or edit accounts.</Text>
            ) : null}

            {[...active, ...archived].map((acc) => (
              <View key={acc.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-1 flex-row items-center gap-2.5 pr-2">
                  {acc.color ? <View style={{ backgroundColor: acc.color }} className="h-3 w-3 rounded-full" /> : null}
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-base text-ink">
                      {acc.name}{acc.isArchived ? ' (archived)' : ''}
                    </Text>
                    <Text className="text-xs text-faint">{ACCOUNT_TYPE_LABELS[acc.accountType as AccountType] ?? acc.accountType}</Text>
                  </View>
                </View>
                <View className="items-end gap-1">
                  <Text className="text-sm text-ink">{money(acc.balance, acc.currency)}</Text>
                  {canManage ? (
                    <Text onPress={() => setArchiveTarget(acc)} accessibilityRole="button" className="text-xs font-medium text-accent">
                      {acc.isArchived ? 'Unarchive' : 'Archive'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}

            {canManage ? (
              <Button variant="ghost" onPress={() => setAdding(true)}>Add account</Button>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Add account">
        <View className="gap-4">
          <Field label="Name"><Input value={name} onChangeText={setName} placeholder="e.g. BDO Savings" accessibilityLabel="Account name" /></Field>
          <Field label="Type"><Dropdown value={type} options={TYPE_OPTIONS} accessibilityLabel="Account type" onSelect={setType} /></Field>
          <Field label="Currency"><Dropdown value={currency} options={currencyOptions} accessibilityLabel="Account currency" onSelect={setCurrency} /></Field>
          <Field label="Opening balance"><Input value={initialBalance} onChangeText={setInitialBalance} keyboardType="decimal-pad" accessibilityLabel="Opening balance" /></Field>
          <Field label="Color"><ColorPicker value={addColor} onChange={setAddColor} /></Field>
          <Button disabled={!name.trim()} loading={busy} onPress={() => void addAccount()}>Add</Button>
        </View>
      </BottomSheet>

      <ConfirmSheet
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        busy={busy}
        title={archiveTarget?.isArchived ? 'Unarchive account' : 'Archive account'}
        message={archiveTarget?.isArchived
          ? `Restore ${archiveTarget?.name} to your active accounts?`
          : `Archive ${archiveTarget?.name}? It stays in your history but is hidden from active lists.`}
        confirmLabel={archiveTarget?.isArchived ? 'Unarchive' : 'Archive'}
        onConfirm={() => archiveTarget && void toggleArchive(archiveTarget)}
      />
    </SafeAreaView>
  );
}
```

> Inline name/color editing (the web "Edit" mode) is folded into a follow-up if the file approaches 500 lines; the archive/add/list flows above are the deliverable. If adding inline edit, reuse the same `BottomSheet` + `ColorPicker` with `updateAccount({ name, color })`.

```tsx
// apps/mobile/app/(app)/settings/accounts.tsx
export { AccountsScreen as default } from '../../../src/screens/settings/accounts-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/accounts-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/accounts-screen.tsx apps/mobile/src/screens/settings/accounts-screen.test.tsx apps/mobile/app/(app)/settings/accounts.tsx
git commit -m "feat(mobile): accounts settings screen"
```

---

## Task 13: Family members screen

Members list, role changes, remove, invite, pending invites (resend/cancel), leave-family. FAMILY tier only.

**Files:**
- Create: `apps/mobile/src/screens/settings/members-screen.tsx`
- Create: `apps/mobile/app/(app)/settings/members.tsx`
- Test: `apps/mobile/src/screens/settings/members-screen.test.tsx`

**Interfaces:**
- Consumes: `api.members.*`, `useAuthStore.workspace`, `SettingsHeader`, `Field`, `Input`, `Dropdown`, `Button`, `ConfirmSheet`, `SectionLoading`, `SectionError`.
- Produces: `MembersScreen`. OWNER-ness derived from the members list (`members.find((m) => m.isSelf)?.role === 'OWNER'`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/settings/members-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1', tier: 'FAMILY' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {} }));
jest.mock('../../lib/runtime.native', () => ({ api: { members: {
  listMembers: jest.fn(), listInvites: jest.fn(), inviteMember: jest.fn(),
  cancelInvite: jest.fn(), resendInvite: jest.fn(), changeMemberRole: jest.fn(), removeMember: jest.fn(), leaveWorkspace: jest.fn(),
} } }));
import { MembersScreen } from './members-screen';
import { api } from '../../lib/runtime.native';
const members = api.members as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  members.listMembers.mockReset().mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Owner', email: 'o@e.co', role: 'OWNER', joinedAt: '', isSelf: true },
    { id: 'm2', userId: 'u2', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: false },
  ]);
  members.listInvites.mockReset().mockResolvedValue([]);
  members.inviteMember.mockReset().mockResolvedValue({ id: 'i1', email: 'new@e.co', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: '', createdAt: '' });
});

it('lists members and sends an invite as owner', async () => {
  render(<MembersScreen />);
  await waitFor(() => expect(screen.getByText('Kid')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Invite email'), 'new@e.co');
  fireEvent.press(screen.getByText('Send invite'));
  await waitFor(() => expect(members.inviteMember).toHaveBeenCalledWith('w1', 'new@e.co', 'VIEWER'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/screens/settings/members-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/screens/settings/members-screen.tsx
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InviteView, MemberView, WorkspaceMemberRole } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { SectionLoading, SectionError } from '../../components/dashboard/section-card';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'CO_MANAGER', label: 'Co-manager' },
] as const;

export function MembersScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'VIEWER' | 'CO_MANAGER'>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberView | null>(null);

  const isOwner = members.find((m) => m.isSelf)?.role === 'OWNER';

  const load = useCallback(() => {
    if (!workspace) return;
    setLoading(true);
    setLoadError(false);
    api.members
      .listMembers(workspace.id)
      .then(async (ms) => {
        setMembers(ms);
        if (ms.find((m) => m.isSelf)?.role === 'OWNER') {
          setInvites(await api.members.listInvites(workspace.id).catch(() => []));
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!workspace || !email.trim()) return;
    setBusy(true);
    try {
      const inv = await api.members.inviteMember(workspace.id, email.trim(), inviteRole);
      setInvites((prev) => [inv, ...prev]);
      setEmail('');
    } catch (e) { if (!(e instanceof ApiError)) throw e; } finally { setBusy(false); }
  }

  async function changeRole(m: MemberView, role: WorkspaceMemberRole) {
    const updated = await api.members.changeMemberRole(workspace!.id, m.id, role).catch(() => null);
    if (updated) setMembers((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
  }

  async function remove(m: MemberView) {
    setBusy(true);
    try {
      await api.members.removeMember(workspace!.id, m.id);
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      setRemoveTarget(null);
    } catch (e) { if (!(e instanceof ApiError)) throw e; } finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true);
    try { await api.members.leaveWorkspace(workspace!.id); } finally { setBusy(false); setLeaving(false); }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Family members" />
      <ScrollView contentContainerClassName="gap-4 p-6">
        {loading ? (
          <SectionLoading />
        ) : loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <>
            {members.map((m) => (
              <View key={m.id} className="gap-2 rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-base text-ink">{m.displayName}{m.isSelf ? ' (you)' : ''}</Text>
                    <Text className="text-xs text-faint">{m.email}</Text>
                  </View>
                  {isOwner && m.role !== 'OWNER' ? (
                    <Text onPress={() => setRemoveTarget(m)} accessibilityRole="button" className="text-xs font-medium text-danger">Remove</Text>
                  ) : (
                    <Text className="text-xs text-muted">{m.role === 'OWNER' ? 'Owner' : m.role === 'CO_MANAGER' ? 'Co-manager' : 'Viewer'}</Text>
                  )}
                </View>
                {isOwner && m.role !== 'OWNER' ? (
                  <Dropdown value={m.role === 'CO_MANAGER' ? 'CO_MANAGER' : 'VIEWER'} options={ROLE_OPTIONS as never}
                    accessibilityLabel={`Role for ${m.displayName}`} onSelect={(r) => void changeRole(m, r as WorkspaceMemberRole)} />
                ) : null}
              </View>
            ))}

            {isOwner ? (
              <View className="gap-3 rounded-xl border border-line bg-surface px-4 py-4">
                <Text className="text-sm font-semibold text-ink">Invite a member</Text>
                <Field label="Email"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@email.com" accessibilityLabel="Invite email" /></Field>
                <Field label="Role"><Dropdown value={inviteRole} options={ROLE_OPTIONS as never} accessibilityLabel="Invite role" onSelect={(r) => setInviteRole(r as 'VIEWER' | 'CO_MANAGER')} /></Field>
                <Button disabled={!email.trim()} loading={busy} onPress={() => void invite()}>Send invite</Button>
              </View>
            ) : null}

            {isOwner && invites.length > 0 ? (
              <View className="gap-2">
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Pending invites</Text>
                {invites.map((inv) => (
                  <View key={inv.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                    <Text className="flex-1 pr-2 text-sm text-ink">{inv.email}</Text>
                    <View className="flex-row gap-3">
                      <Text onPress={() => void api.members.resendInvite(workspace!.id, inv.id)} accessibilityRole="button" className="text-xs font-medium text-accent">Resend</Text>
                      <Text onPress={() => { void api.members.cancelInvite(workspace!.id, inv.id); setInvites((p) => p.filter((x) => x.id !== inv.id)); }} accessibilityRole="button" className="text-xs font-medium text-danger">Cancel</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {!isOwner ? (
              <Button variant="ghost" onPress={() => setLeaving(true)}>Leave this family</Button>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmSheet open={removeTarget !== null} onClose={() => setRemoveTarget(null)} busy={busy} danger
        title="Remove member" message={`Remove ${removeTarget?.displayName} from this family?`} confirmLabel="Remove"
        onConfirm={() => removeTarget && void remove(removeTarget)} />
      <ConfirmSheet open={leaving} onClose={() => setLeaving(false)} busy={busy} danger
        title="Leave family" message="You'll lose access to this family's shared data." confirmLabel="Leave"
        onConfirm={() => void leave()} />
    </SafeAreaView>
  );
}
```

> Leave-family note: the web version, after `leaveWorkspace`, refreshes the workspace list and switches the active workspace. The mobile store does not yet track multiple workspaces; for this plan, `leave()` calls the endpoint and closes the sheet. Switching the active workspace after leaving is a follow-up tied to adding a workspace list to the mobile store — call it out in the PR description.

```tsx
// apps/mobile/app/(app)/settings/members.tsx
export { MembersScreen as default } from '../../../src/screens/settings/members-screen';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/screens/settings/members-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/members-screen.tsx apps/mobile/src/screens/settings/members-screen.test.tsx apps/mobile/app/(app)/settings/members.tsx
git commit -m "feat(mobile): family members settings screen"
```

---

## Task 14: Full gate — typecheck, lint, tests

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. Fix any `as never` casts that the real generics reject (e.g. `Dropdown` option arrays typed to the exact union).

- [ ] **Step 2: Lint**

Run: `cd apps/mobile && npm run lint`
Expected: clean (fix unused imports / className ordering).

- [ ] **Step 3: Full test suite**

Run: `cd apps/mobile && npm run test`
Expected: vitest + jest all pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A apps/mobile
git commit -m "chore(mobile): typecheck/lint/test fixes for settings build-out"
```

---

## Self-Review

**Spec coverage:**
- Profile → Task 5 ✓
- Preferences (display dropdowns) → Task 6 ✓ (push/daily reminder explicitly deferred, per spec)
- Currencies (base + preferred, combined, PRO-gated) → Tasks 9–10 ✓
- Accounts CRUD (list/add/archive, role-gated, ColorPicker) → Tasks 11–12 ✓ (inline edit flagged as optional follow-up within Task 12)
- Family members (list/invite/roles/remove/pending/leave, FAMILY-only) → Task 13 + hub gating in Task 4 ✓
- Feedback → Task 7 ✓
- Support → Task 8 ✓
- Refer & Earn (coming soon) + About/Privacy → Task 4 (hub rows) ✓
- Hub + sub-screen architecture, files < 500 lines → Task 4 + per-screen files ✓
- Auth-store setters for currency/profile persistence → Task 1 ✓
- `UpgradeGate` mobile primitive → Task 9 ✓
- `ConfirmSheet` for base-change/archive/remove/leave → Task 3, used in 10/12/13 ✓
- Testing per screen + primitives → each task ✓
- Base-currency FX dependency risk → noted in Task 10 (endpoint exists; ships if backend has it) and the spec ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — each step carries concrete code. Two explicit, intentional scope-outs are flagged inline (inline account edit in Task 12; active-workspace switch after leaving in Task 13), each with the exact follow-up. These are deferrals, not placeholders.

**Type consistency:** `setUser`/`setWorkspace` (Task 1) are consumed with the same signatures in Tasks 5/6/10. `useWorkspaceRole` (Task 11) returns `WorkspaceMemberRole` and is consumed in Task 12. `ConfirmSheet` prop names (`open/onClose/title/message/confirmLabel/danger/busy/onConfirm`) match every call site. `api.dashboard.listAccounts` (not `api.accounts.list`) used for reads; `api.accounts.createAccount/updateAccount` for writes — matches core.

**Known implementation caveats to watch during execution (not plan gaps):**
- `Dropdown` is generically typed `<T extends string>`; the `as const`/`as never` casts in the plan may need to become properly-typed option arrays to satisfy `tsc` (Task 14 Step 1 covers this).
- NativeWind opacity classes like `bg-accent/15` must exist in the Tailwind config; if not, use inline `style={{ backgroundColor: 'rgba(29,110,245,0.15)' }}` as the tokens file does.
- Confirm `expo-clipboard` is installed (`npx expo install expo-clipboard`) before Task 5.
