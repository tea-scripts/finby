import { describe, expect, it } from 'vitest';
import { createTokenStore, type SecureStoreLike } from './token-store';

function fakeSecureStore(): SecureStoreLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getItemAsync(k) { return map.get(k) ?? null; },
    async setItemAsync(k, v) { map.set(k, v); },
    async deleteItemAsync(k) { map.delete(k); },
  };
}

describe('createTokenStore', () => {
  it('save then load round-trips the token pair', async () => {
    const ss = fakeSecureStore();
    const store = createTokenStore(ss);
    await store.save({ accessToken: 'a', refreshToken: 'r' });
    expect(ss.map.get('finby.tokens')).toBe(JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    await expect(store.load()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
  it('load returns null when nothing is stored', async () => {
    await expect(createTokenStore(fakeSecureStore()).load()).resolves.toBeNull();
  });
  it('load returns null on malformed JSON', async () => {
    const ss = fakeSecureStore();
    ss.map.set('finby.tokens', 'not json');
    await expect(createTokenStore(ss).load()).resolves.toBeNull();
  });
  it('clear removes the stored pair', async () => {
    const ss = fakeSecureStore();
    const store = createTokenStore(ss);
    await store.save({ accessToken: 'a', refreshToken: 'r' });
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });
});
