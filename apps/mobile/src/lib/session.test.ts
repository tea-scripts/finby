import { describe, expect, it, vi } from 'vitest';
import { createMobileSession } from './session';
import { createTokenStore, type SecureStoreLike } from '../adapters/token-store';

function fakeSecureStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    async getItemAsync(k) { return map.get(k) ?? null; },
    async setItemAsync(k, v) { map.set(k, v); },
    async deleteItemAsync(k) { map.delete(k); },
  };
}

describe('createMobileSession', () => {
  it('setSession persists to the token store and exposes the access token', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    expect(session.getAccessToken()).toBe('a1');
    await expect(tokenStore.load()).resolves.toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('hydrate loads persisted tokens into memory', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    await tokenStore.save({ accessToken: 'a2', refreshToken: 'r2' });
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    expect(session.getAccessToken()).toBeNull();
    await expect(session.hydrate()).resolves.toBe(true);
    expect(session.getAccessToken()).toBe('a2');
  });

  it('clearSession wipes memory and storage', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a', refreshToken: 'r' });
    await session.clearSession();
    expect(session.getAccessToken()).toBeNull();
    await expect(tokenStore.load()).resolves.toBeNull();
  });

  it('authed attaches the bearer token (the non-stream path uses the core http client / global fetch)', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    await expect(session.authed<{ ok: boolean }>('/me')).resolves.toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://api.test/v1/me');
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer a1');
    vi.unstubAllGlobals();
  });

  it('authedStream uses the injected fetchImpl (expo/fetch on device — the streaming path)', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const fetchImpl = vi.fn(async () => new Response('hi', { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    const res = await session.authedStream('/stream', { method: 'POST' });
    expect(await res.text()).toBe('hi');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createMobileSession auth flow', () => {
  it('login calls the API, persists tokens, and returns the AuthResult', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const authResult = { accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1' }, workspace: { id: 'w1' } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(authResult), { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    const res = await session.login('e@x.com', 'pw');
    expect(res).toMatchObject({ user: { id: 'u1' } });
    expect(session.getAccessToken()).toBe('a1');
    await expect(tokenStore.load()).resolves.toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('logout clears the session', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const fetchImpl = vi.fn(async () => new Response('null', { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    await session.logout();
    expect(session.getAccessToken()).toBeNull();
    await expect(tokenStore.load()).resolves.toBeNull();
  });
});
