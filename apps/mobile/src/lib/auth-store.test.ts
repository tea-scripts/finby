import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from './auth-store';
import type { MobileSession } from './session';

function fakeSession(overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    authed: vi.fn(),
    authedStream: vi.fn(),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => null,
    login: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1', tier: 'FREE' } }) as never),
    register: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u2' }, workspace: { id: 'w2', tier: 'FREE' } }) as never),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('createAuthStore', () => {
  it('starts idle with no user', () => {
    const store = createAuthStore(fakeSession());
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
  });

  it('login sets user/workspace and status authed', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().login('e@x.com', 'pw');
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
    expect(store.getState().workspace).toMatchObject({ id: 'w1' });
  });

  it('register sets user/workspace and status authed', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().register({ displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC' });
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u2' });
  });

  it('logout clears user/workspace and sets status idle', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().login('e@x.com', 'pw');
    await store.getState().logout();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
    expect(store.getState().workspace).toBeNull();
  });
});
