import { describe, expect, it } from 'vitest';
import { createIdentityStore, type Identity } from './identity-store';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

const IDENTITY: Identity = {
  user: { id: 'u1', displayName: 'Tee', email: 'e@x.com', emailVerified: true, timezone: 'UTC', accountNumber: null, preferences: {} as never, currentStreak: 0, longestStreak: 0 },
  workspace: { id: 'w1', name: 'Home', slug: 'home', tier: 'FREE' as never, baseCurrency: 'USD', preferredCurrencies: ['USD'] },
};

describe('createIdentityStore', () => {
  it('round-trips save → load', async () => {
    const store = createIdentityStore(fakeStore());
    await store.save(IDENTITY);
    expect(await store.load()).toEqual(IDENTITY);
  });

  it('load returns null when nothing is stored', async () => {
    expect(await createIdentityStore(fakeStore()).load()).toBeNull();
  });

  it('load returns null on corrupt JSON', async () => {
    const fs = fakeStore();
    fs.map.set('finby.identity', '{not json');
    expect(await createIdentityStore(fs).load()).toBeNull();
  });

  it('load returns null when shape is incomplete', async () => {
    const fs = fakeStore();
    fs.map.set('finby.identity', JSON.stringify({ user: IDENTITY.user }));
    expect(await createIdentityStore(fs).load()).toBeNull();
  });

  it('clear removes the stored identity', async () => {
    const fs = fakeStore();
    const store = createIdentityStore(fs);
    await store.save(IDENTITY);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
