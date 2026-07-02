import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from './auth-store';
import type { MobileSession } from './session';
import type { Identity, IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';
import type { LockPref } from '../adapters/lock-pref';
import type { LockCode } from '../adapters/lock-code';

const USER = { id: 'u1' } as never;
const WORKSPACE = { id: 'w1', tier: 'FREE' } as never;
const AUTH_RESULT = { accessToken: 'a', refreshToken: 'r', user: USER, workspace: WORKSPACE } as never;

function fakeSession(overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    authed: vi.fn(),
    authedStream: vi.fn(),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => null,
    login: vi.fn(async () => AUTH_RESULT),
    register: vi.fn(async () => AUTH_RESULT),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeIdentityStore(initial: Identity | null = null): IdentityStore {
  let current = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (i: Identity) => void (current = i)),
    clear: vi.fn(async () => void (current = null)),
  };
}

function fakeOnboardingFlag(seen = false): OnboardingFlag {
  let s = seen;
  return {
    wasSeen: vi.fn(async () => s),
    markSeen: vi.fn(async () => void (s = true)),
    reset: vi.fn(async () => void (s = false)),
  };
}

function fakeLockPref(enabled = true): LockPref {
  let e = enabled;
  return {
    isEnabled: vi.fn(async () => e),
    setEnabled: vi.fn(async (next: boolean) => void (e = next)),
  };
}

function fakeLockCode(set = false): LockCode {
  let s = set;
  return {
    isSet: vi.fn(async () => s),
    set: vi.fn(async () => void (s = true)),
    verify: vi.fn(async (pin: string) => pin === '1234'),
    clear: vi.fn(async () => void (s = false)),
  };
}

function makeStore(
  over: {
    session?: MobileSession;
    identityStore?: IdentityStore;
    onboardingFlag?: OnboardingFlag;
    lockPref?: LockPref;
    lockCode?: LockCode;
  } = {},
) {
  return createAuthStore({
    session: over.session ?? fakeSession(),
    identityStore: over.identityStore ?? fakeIdentityStore(),
    onboardingFlag: over.onboardingFlag ?? fakeOnboardingFlag(),
    lockPref: over.lockPref ?? fakeLockPref(),
    lockCode: over.lockCode ?? fakeLockCode(),
  });
}

describe('createAuthStore', () => {
  it('starts in loading status with no user', () => {
    const store = makeStore();
    expect(store.getState().status).toBe('loading');
    expect(store.getState().user).toBeNull();
  });

  it('login persists identity and sets status authed', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
    expect(identityStore.save).toHaveBeenCalledWith({ user: USER, workspace: WORKSPACE });
  });

  it('register persists identity and sets status authed', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().register({ displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC', acceptedTermsVersion: 'June 9, 2026' });
    expect(store.getState().status).toBe('authed');
    expect(identityStore.save).toHaveBeenCalledTimes(1);
  });

  it('logout clears identity and sets status idle', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');
    await store.getState().logout();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
    expect(identityStore.clear).toHaveBeenCalledTimes(1);
  });

  it('hydrate with no tokens → idle, reads onboarded flag', async () => {
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => false) }),
      onboardingFlag: fakeOnboardingFlag(true),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().onboarded).toBe(true);
  });

  it('hydrate with tokens + cached identity → authed', async () => {
    const identity = { user: USER, workspace: WORKSPACE } as Identity;
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore(identity),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
  });

  it('hydrate with tokens but no cached identity → clears session, idle', async () => {
    const clearSession = vi.fn(async () => {});
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true), clearSession }),
      identityStore: fakeIdentityStore(null),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('idle');
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('completeOnboarding marks the flag and sets onboarded', async () => {
    const onboardingFlag = fakeOnboardingFlag(false);
    const store = makeStore({ onboardingFlag });
    await store.getState().completeOnboarding();
    expect(store.getState().onboarded).toBe(true);
    expect(onboardingFlag.markSeen).toHaveBeenCalledTimes(1);
  });

  it('resetOnboarding clears the flag and sets onboarded false', async () => {
    const onboardingFlag = fakeOnboardingFlag(false);
    const store = makeStore({ onboardingFlag });
    await store.getState().completeOnboarding();
    await store.getState().resetOnboarding();
    expect(store.getState().onboarded).toBe(false);
    expect(onboardingFlag.reset).toHaveBeenCalledTimes(1);
  });

  it('hydrate restores an authed session locked when the lock is enabled', async () => {
    const identity = { user: USER, workspace: WORKSPACE } as Identity;
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore(identity),
      lockPref: fakeLockPref(true),
      lockCode: fakeLockCode(true),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('authed');
    expect(store.getState().lockEnabled).toBe(true);
    expect(store.getState().locked).toBe(true);
  });

  it('hydrate restores an authed session unlocked when the lock is disabled', async () => {
    const identity = { user: USER, workspace: WORKSPACE } as Identity;
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore(identity),
      lockPref: fakeLockPref(false),
    });
    await store.getState().hydrate();
    expect(store.getState().lockEnabled).toBe(false);
    expect(store.getState().locked).toBe(false);
  });

  it('login starts unlocked even with the lock enabled (just authenticated)', async () => {
    const store = makeStore({ lockPref: fakeLockPref(true) });
    await store.getState().login('e@x.com', 'pw');
    expect(store.getState().lockEnabled).toBe(true);
    expect(store.getState().locked).toBe(false);
  });

  it('lockNow locks only when the lock is enabled', async () => {
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore({ user: USER, workspace: WORKSPACE } as Identity),
      lockPref: fakeLockPref(true),
      lockCode: fakeLockCode(true),
    });
    await store.getState().hydrate();
    store.getState().unlock();
    expect(store.getState().locked).toBe(false);
    store.getState().lockNow();
    expect(store.getState().locked).toBe(true);
  });

  it('unlock clears the locked state', async () => {
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore({ user: USER, workspace: WORKSPACE } as Identity),
      lockPref: fakeLockPref(true),
      lockCode: fakeLockCode(true),
    });
    await store.getState().hydrate();
    expect(store.getState().locked).toBe(true);
    store.getState().unlock();
    expect(store.getState().locked).toBe(false);
  });

  it('setLockEnabled(false) persists the pref and unlocks', async () => {
    const lockPref = fakeLockPref(true);
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore({ user: USER, workspace: WORKSPACE } as Identity),
      lockPref,
      lockCode: fakeLockCode(true),
    });
    await store.getState().hydrate();
    await store.getState().setLockEnabled(false);
    expect(lockPref.setEnabled).toHaveBeenCalledWith(false);
    expect(store.getState().lockEnabled).toBe(false);
    expect(store.getState().locked).toBe(false);
  });

  it('hydrate with lock enabled but no PIN does not lock (gate sends to PIN setup)', async () => {
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore({ user: USER, workspace: WORKSPACE } as Identity),
      lockPref: fakeLockPref(true),
      lockCode: fakeLockCode(false),
    });
    await store.getState().hydrate();
    expect(store.getState().lockEnabled).toBe(true);
    expect(store.getState().hasPin).toBe(false);
    expect(store.getState().locked).toBe(false);
  });

  it('setPin stores the PIN and sets hasPin', async () => {
    const lockCode = fakeLockCode(false);
    const store = makeStore({ lockCode });
    await store.getState().setPin('1234');
    expect(lockCode.set).toHaveBeenCalledWith('1234');
    expect(store.getState().hasPin).toBe(true);
  });

  it('verifyPin delegates to the lock code', async () => {
    const store = makeStore({ lockCode: fakeLockCode(true) });
    expect(await store.getState().verifyPin('1234')).toBe(true);
    expect(await store.getState().verifyPin('0000')).toBe(false);
  });

  it('setStreak updates the cached user streak counters', async () => {
    const store = makeStore();
    await store.getState().login('e@x.com', 'pw');
    store.getState().setStreak(12, 30);
    expect(store.getState().user).toMatchObject({ currentStreak: 12, longestStreak: 30 });
  });

  it('setStreak is a no-op when there is no user', () => {
    const store = makeStore();
    store.getState().setStreak(5, 5);
    expect(store.getState().user).toBeNull();
  });

  it('setUser merges a patch and persists identity', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');

    store.getState().setUser({ displayName: 'New' } as never);

    expect(store.getState().user).toMatchObject({ id: 'u1', displayName: 'New' });
    expect(identityStore.save).toHaveBeenLastCalledWith({
      user: expect.objectContaining({ displayName: 'New' }),
      workspace: expect.objectContaining({ id: 'w1' }),
    });
  });

  it('setUser is a no-op when there is no user', () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    store.getState().setUser({ displayName: 'New' } as never);
    expect(store.getState().user).toBeNull();
    expect(identityStore.save).not.toHaveBeenCalled();
  });

  it('setWorkspace merges a patch (base + preferred currencies) and persists identity', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');

    store.getState().setWorkspace({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] } as never);

    expect(store.getState().workspace).toMatchObject({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] });
    expect(identityStore.save).toHaveBeenLastCalledWith({
      user: expect.objectContaining({ id: 'u1' }),
      workspace: expect.objectContaining({ baseCurrency: 'EUR' }),
    });
  });

  it('setWorkspace is a no-op when there is no workspace', () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    store.getState().setWorkspace({ baseCurrency: 'EUR' } as never);
    expect(store.getState().workspace).toBeNull();
    expect(identityStore.save).not.toHaveBeenCalled();
  });

  it('setActiveWorkspace replaces the workspace from the summary list and persists', () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
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
    expect(identityStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: expect.objectContaining({ id: 'w2', preferredCurrencies: ['EUR', 'USD'] }) }),
    );
  });

  it('setActiveWorkspace is a no-op for an unknown id (no persist)', () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    store.setState({ user: { id: 'u1' } as never, workspace: { id: 'w1' } as never, workspaces: [] as never });
    store.getState().setActiveWorkspace('nope');
    expect(store.getState().workspace).toEqual({ id: 'w1' });
    expect(identityStore.save).not.toHaveBeenCalled();
  });
});
