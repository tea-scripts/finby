# Mobile Polish & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll up mobile UI-primitive polish (Button `danger`/`link` variants, Preferences "Saved" auto-dismiss), close targeted test gaps, and fix two backend push correctness/perf issues (`expoUnregister` ownership scoping + a `MobilePushDevice` `userId` index).

**Architecture:** Small, independent changes. Mobile changes are pure component/screen edits with co-located tests (vitest for `.test.ts`, jest for `.test.tsx`). Backend changes touch the push service/controller and the Prisma schema (+ one migration). No new features, no cross-cutting refactors.

**Tech Stack:** Expo/React Native + NativeWind (mobile); NestJS + Prisma/Postgres (api); Vitest + Jest + React Native Testing Library v14.

## Global Constraints

- **UI hard rule:** custom components from `apps/mobile/src/components/ui`; never native controls in feature code.
- **Styling:** NativeWind/Tailwind classes with semantic color tokens (`bg-danger`, `text-accent`, `text-white`, `text-ink`).
- **Test-runner split:** `*.test.ts` → vitest; `*.test.tsx` → jest. Mobile combined run: `cd apps/mobile && pnpm run test`. Single file: `pnpm exec vitest run <f>` / `pnpm exec jest <f>`.
- **RNTL v14:** `await` `render()` and `fireEvent()`; jest-hoisted mock vars must be named `mock*`.
- **Prisma migrate:** from `apps/api`: `pnpm exec dotenv -e ../../.env -- prisma migrate dev --name <name>`. Dev Postgres must be up (`docker ps | grep 5434`, container `finby-postgres`).
- **API tests:** `cd apps/api && pnpm test -- push` (jest).
- **Commit hygiene:** atomic commits; NO AI-attribution trailers / "Generated with" lines; stage files explicitly (never `git add -A` in the shared tree).
- A mobile combined-run flake ("N failed", timeout) clears on re-run — re-run before treating a failure as real.

---

### Task 1: Button `danger` + `link` variants

**Files:**
- Modify: `apps/mobile/src/components/ui/button.tsx`
- Test: `apps/mobile/src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Button` `variant` prop widened to `'primary' | 'ghost' | 'danger' | 'link'`. `danger` = `bg-danger` bg + white text + white spinner. `link` = text-only, `text-accent`, no `min-h-12`, reduced padding. Consumed by Task 2 (ConfirmSheet).

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/components/ui/button.test.tsx` (inside the existing `describe('Button', ...)` block, before its closing `});`):

```tsx
  it('danger variant renders its label and a white spinner when loading', async () => {
    const onPress = jest.fn();
    await render(<Button variant="danger" onPress={onPress} loading testID="del">Delete</Button>);
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    expect(screen.getByTestId('del').props.accessibilityState.busy).toBe(true);
  });

  it('link variant renders text-only and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button variant="link" onPress={onPress}>Copy</Button>);
    fireEvent.press(screen.getByText('Copy'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/ui/button.test.tsx`
Expected: the two new tests FAIL (TypeScript/runtime error on `variant="danger"`/`variant="link"` not in the union, or wrong rendering).

- [ ] **Step 3: Implement the variants**

Replace the `variant` prop type and the `VARIANT`/`TEXT_VARIANT` maps, and make the container className variant-aware, in `apps/mobile/src/components/ui/button.tsx`:

Change the prop type (line 5):

```tsx
  variant?: 'primary' | 'ghost' | 'danger' | 'link';
```

Replace the two maps (lines 12–20):

```tsx
const VARIANT = {
  primary: 'bg-accent',
  ghost: 'border border-line bg-surface',
  danger: 'bg-danger',
  link: '',
} as const;

const TEXT_VARIANT = {
  primary: 'text-white',
  ghost: 'text-ink',
  danger: 'text-white',
  link: 'text-accent',
} as const;
```

Replace the `Pressable` `className` (line 40) so `link` drops the min-height/padding chrome:

```tsx
      className={`relative flex-row items-center justify-center gap-2 ${
        variant === 'link' ? 'px-1 py-1' : 'min-h-12 rounded-xl px-4 py-3'
      } ${VARIANT[variant]} ${isDisabled ? 'opacity-60' : ''}`}
```

Update the spinner color so only `link` uses the accent tint and every filled variant stays white (line 44):

```tsx
          <ActivityIndicator color={variant === 'ghost' || variant === 'link' ? '#e8eef7' : '#fff'} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/ui/button.test.tsx`
Expected: PASS (all Button tests, including the original three).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/button.tsx apps/mobile/src/components/ui/button.test.tsx
git commit -m "feat(mobile): add Button danger and link variants"
```

---

### Task 2: ConfirmSheet uses `Button variant="danger"`

**Files:**
- Modify: `apps/mobile/src/components/settings/confirm-sheet.tsx`
- Test: `apps/mobile/src/components/settings/confirm-sheet.test.tsx`

**Interfaces:**
- Consumes: `Button` `danger` variant from Task 1.
- Produces: no API change to `ConfirmSheet` (same props). The confirm button now renders `variant={danger ? 'danger' : 'primary'}` with a plain string label.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/components/settings/confirm-sheet.test.tsx` (inside `describe('ConfirmSheet', ...)`, before its closing `});`):

```tsx
  it('renders a danger-styled confirm button when danger is set', async () => {
    const onConfirm = jest.fn();
    await render(
      <ConfirmSheet open onClose={jest.fn()} title="Remove member"
        message="Remove them from this family?" confirmLabel="Remove" danger onConfirm={onConfirm} />,
    );
    const label = screen.getByText('Remove');
    fireEvent.press(label);
    expect(onConfirm).toHaveBeenCalled();
    // The confirm label is plain white text on the danger button (no text-danger hack).
    expect(label.props.className).toContain('text-white');
    expect(label.props.className).not.toContain('text-danger');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/settings/confirm-sheet.test.tsx`
Expected: FAIL — current confirm label is a nested `<Text className="... text-danger">`, so `text-white` is absent / `text-danger` present.

- [ ] **Step 3: Implement**

Replace the confirm `Button` block in `apps/mobile/src/components/settings/confirm-sheet.tsx` (lines 24–26) with a plain-string-label button that switches variant:

```tsx
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onPress={onConfirm}>
            {confirmLabel}
          </Button>
```

Remove the now-unused `Text` import if it is no longer referenced elsewhere in the file (it is still used for the `message`, so keep the `import { Text, View }` line as-is).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/settings/confirm-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/settings/confirm-sheet.tsx apps/mobile/src/components/settings/confirm-sheet.test.tsx
git commit -m "refactor(mobile): ConfirmSheet destructive action uses Button danger variant"
```

---

### Task 3: Preferences "Saved" auto-dismiss

**Files:**
- Modify: `apps/mobile/src/screens/settings/preferences-screen.tsx`
- Test: `apps/mobile/src/screens/settings/preferences-screen.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: after a successful save, `status` reverts `'saved' → 'idle'` after 2000ms; timer cleared on new save + unmount. `'saving'`/`'error'` are not auto-dismissed.

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/src/screens/settings/preferences-screen.test.tsx`, add fake-timer lifecycle to the existing `beforeEach` region and two tests. First, add after the existing `beforeEach(() => { ... })` block (around line 41):

```tsx
afterEach(() => {
  jest.useRealTimers();
});
```

Then append inside `describe('PreferencesScreen', ...)` (before its closing `});`):

```tsx
  it('saves a number format change (non-date dropdown)', async () => {
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Number format'));
    await fireEvent.press(screen.getByText('1234.50'));                 // PLAIN option label
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ preferences: { numberFormat: 'PLAIN' } }));
  });

  it('the "Saved" status auto-dismisses after 2 seconds', async () => {
    jest.useFakeTimers();
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Date format'));
    await fireEvent.press(screen.getByText('2026-06-07'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });
```

Add `act` to the RNTL import at the top of the file:

```tsx
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/preferences-screen.test.tsx`
Expected: the number-format test may PASS already (it exercises existing behavior — that's fine, it's coverage); the auto-dismiss test FAILS because "Saved" never clears.

- [ ] **Step 3: Implement the auto-dismiss**

In `apps/mobile/src/screens/settings/preferences-screen.tsx`:

Add `useRef` to the React import (line 1):

```tsx
import { useEffect, useRef, useState } from 'react';
```

Add a timer ref just after the `status` state (after line 35):

```tsx
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add an unmount cleanup effect just after the existing mount effect (after line 43):

```tsx
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);
```

In `savePref`, replace `setStatus('saved');` (line 54) with a scheduled auto-dismiss:

```tsx
      setStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000);
```

And at the top of `savePref`, when a new save starts, cancel any pending dismiss so a rapid second save doesn't clear the fresh "Saving…" — replace `setStatus('saving');` (line 50) with:

```tsx
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setStatus('saving');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/preferences-screen.test.tsx`
Expected: PASS (all Preferences tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/settings/preferences-screen.tsx apps/mobile/src/screens/settings/preferences-screen.test.tsx
git commit -m "feat(mobile): auto-dismiss the Preferences 'Saved' status after 2s"
```

---

### Task 4: notifications + auth-store coverage (vitest)

**Files:**
- Test: `apps/mobile/src/adapters/notifications.test.ts`
- Test: `apps/mobile/src/lib/auth-store.test.ts`

**Interfaces:**
- Consumes: existing `createNotifications`/`noopNotificationsBinding` and `createAuthStore` APIs (unchanged). Pure test additions — no source changes.

- [ ] **Step 1: Write the notifications tests**

Append to `apps/mobile/src/adapters/notifications.test.ts` inside `describe('createNotifications', ...)` (before its closing `});`):

```ts
  it('addResponseListener delivers the payload url when present', () => {
    let handler: ((resp: unknown) => void) | undefined;
    const n = createNotifications(
      fake({
        addNotificationResponseReceivedListener: vi.fn((cb: (resp: unknown) => void) => {
          handler = cb;
          return { remove: vi.fn() };
        }),
      }),
    );
    const seen: (string | null)[] = [];
    n.addResponseListener((url) => seen.push(url));
    handler?.({ notification: { request: { content: { data: { url: '/chat' } } } } });
    expect(seen).toEqual(['/chat']);
  });

  it('getInitialUrl returns the cold-start url when present', async () => {
    const n = createNotifications(
      fake({
        getLastNotificationResponseAsync: vi
          .fn()
          .mockResolvedValue({ notification: { request: { content: { data: { url: '/budgets' } } } } }),
      }),
    );
    expect(await n.getInitialUrl()).toBe('/budgets');
  });
```

- [ ] **Step 2: Run the notifications tests to verify they pass**

Run: `cd apps/mobile && pnpm exec vitest run src/adapters/notifications.test.ts`
Expected: PASS (these assert the non-null `urlFromResponse` branch, previously uncovered).

- [ ] **Step 3: Strengthen the auth-store no-op test**

In `apps/mobile/src/lib/auth-store.test.ts`, replace the existing `setActiveWorkspace is a no-op for an unknown id` test (currently ~lines 347–352) with a version that also asserts `identityStore.save` was not called:

```ts
  it('setActiveWorkspace is a no-op for an unknown id (no persist)', () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    store.setState({ user: { id: 'u1' } as never, workspace: { id: 'w1' } as never, workspaces: [] as never });
    store.getState().setActiveWorkspace('nope');
    expect(store.getState().workspace).toEqual({ id: 'w1' });
    expect(identityStore.save).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run the auth-store tests to verify they pass**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/auth-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/adapters/notifications.test.ts apps/mobile/src/lib/auth-store.test.ts
git commit -m "test(mobile): cover notifications url branch and auth-store no-op persistence"
```

---

### Task 5: `expoUnregister` ownership scoping (backend)

**Files:**
- Modify: `apps/api/src/modules/push/push.service.ts:76-78`
- Modify: `apps/api/src/modules/push/push.controller.ts:68-74`
- Test: `apps/api/src/modules/push/push.service.spec.ts`
- Test: `apps/api/src/modules/push/push.controller.spec.ts`

**Interfaces:**
- Consumes: existing `WorkspaceMemberGuard`, `@Workspace()`, `@CurrentUser()` decorators (already used by sibling endpoints).
- Produces: `unregisterExpoDevice(userId: string, token: string): Promise<void>` — deletes only the caller's own device: `deleteMany({ where: { expoPushToken: token, userId } })`. Controller `expoUnregister` now takes `@CurrentUser() user` and passes `user.userId`.

- [ ] **Step 1: Write the failing service test**

In `apps/api/src/modules/push/push.service.spec.ts`, add inside `describe('PushService (configured)', ...)` (before its closing `});`):

```ts
  it('unregisterExpoDevice deletes only the caller-owned device (scoped by userId)', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { mobilePushDevice: { deleteMany } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
    await service.unregisterExpoDevice('u1', 'ExponentPushToken[abc]');
    expect(deleteMany).toHaveBeenCalledWith({ where: { expoPushToken: 'ExponentPushToken[abc]', userId: 'u1' } });
  });
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `cd apps/api && pnpm test -- push.service`
Expected: FAIL — current signature is `unregisterExpoDevice(token)` and the query lacks `userId` (TS arity error and/or wrong `deleteMany` args).

- [ ] **Step 3: Update the service**

Replace `unregisterExpoDevice` in `apps/api/src/modules/push/push.service.ts` (lines 76–78):

```ts
  async unregisterExpoDevice(userId: string, token: string): Promise<void> {
    await this.prisma.mobilePushDevice.deleteMany({ where: { expoPushToken: token, userId } });
  }
```

- [ ] **Step 4: Update the controller**

Replace `expoUnregister` in `apps/api/src/modules/push/push.controller.ts` (lines 68–74):

```ts
  @Post('expo/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async expoUnregister(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(expoUnregisterSchema)) body: ExpoUnregisterInput,
  ): Promise<void> {
    await this.push.unregisterExpoDevice(user.userId, body.token);
  }
```

- [ ] **Step 5: Update the controller test**

In `apps/api/src/modules/push/push.controller.spec.ts`, replace the `unregisters an expo device by token` test (lines 40–44):

```ts
  it('unregisters an expo device scoped to the current user', async () => {
    const { push, controller } = make();
    await controller.expoUnregister(user, { token: 'ExponentPushToken[a]' });
    expect(push.unregisterExpoDevice).toHaveBeenCalledWith('u1', 'ExponentPushToken[a]');
  });
```

- [ ] **Step 6: Run the push tests to verify they pass**

Run: `cd apps/api && pnpm test -- push`
Expected: PASS (both push specs).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/push/push.service.ts apps/api/src/modules/push/push.controller.ts apps/api/src/modules/push/push.service.spec.ts apps/api/src/modules/push/push.controller.spec.ts
git commit -m "fix(api): scope expo device unregister to the current user"
```

---

### Task 6: `MobilePushDevice` `@@index([userId])` + migration (backend)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:831-843` (the `MobilePushDevice` model)
- Create: `apps/api/prisma/migrations/<timestamp>_mobile_push_device_user_index/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: a standalone `@@index([userId])` supporting the daily-reminder `mobilePushDevice.findMany({ where: { userId } })` (the compound `@@index([workspaceId, userId])` cannot serve a `userId`-only lookup). Both indexes coexist.

- [ ] **Step 1: Confirm dev Postgres is up**

Run: `docker ps | grep 5434`
Expected: a line for container `finby-postgres` (`Up ...`). If absent: `docker compose up -d` from the repo root, then re-check.

- [ ] **Step 2: Add the index to the schema**

In `apps/api/prisma/schema.prisma`, in the `MobilePushDevice` model, add a second index line directly below the existing `@@index([workspaceId, userId])` (line 842):

```prisma
  @@index([workspaceId, userId])
  @@index([userId])
```

- [ ] **Step 3: Generate + apply the migration**

Run from `apps/api` (a `.env` symlink must exist in the worktree — see Environment):

```bash
cd apps/api && pnpm exec dotenv -e ../../.env -- prisma migrate dev --name mobile_push_device_user_index
```

Expected: Prisma creates `prisma/migrations/<timestamp>_mobile_push_device_user_index/migration.sql`, applies it, and regenerates the client. The SQL should be a single `CREATE INDEX "MobilePushDevice_userId_idx" ON "MobilePushDevice"("userId");` (exact quoting/name may vary).

- [ ] **Step 4: Verify the migration SQL**

Run: `cat apps/api/prisma/migrations/*mobile_push_device_user_index*/migration.sql`
Expected: a `CREATE INDEX` on `("userId")` only (NOT dropping or altering the compound index).

- [ ] **Step 5: Run the push tests to confirm nothing broke**

Run: `cd apps/api && pnpm test -- push`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "perf(api): add MobilePushDevice userId index for the daily-reminder fan-out"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Mobile full suite**

Run: `cd apps/mobile && pnpm run test`
Expected: all suites pass (235 baseline + the new tests). A combined-run timeout flake clears on re-run — re-run once before treating a failure as real.

- [ ] **Step 2: API full suite**

Run: `cd apps/api && pnpm test`
Expected: all pass.

- [ ] **Step 3: Lint**

Run: `pnpm -w run lint`
Expected: clean.

- [ ] **Step 4: No commit** — this task only verifies. If anything fails, fix under the owning task and re-run.

---

## Deferred / Open (NOT in this plan)

- **Convert the 6 inline text-links (Profile "Copy"; Accounts "Edit"/"Archive"; Members "Remove"/"Resend"/"Cancel") to `<Button variant="link">`.** Blocked on a user decision: 3 are intentionally `text-danger` (Members "Remove"/"Cancel"; Accounts archive is accent), and the approved `link` variant is `text-accent` only. Converting would regress their color or require a `link`-danger tone. Decide: add a danger-toned `link` (or `tone` prop) and convert all call sites, or leave the inline links as-is.
- Multi-workspace `sendToUser` last-registered-workspace parity issue.
- Live on-device push verification (EAS/FCM/APNs) — user-owned.
