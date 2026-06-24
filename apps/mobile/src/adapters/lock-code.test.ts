import { describe, expect, it } from 'vitest';
import { createLockCode, type PinHasher } from './lock-code';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

// Deterministic fake hasher: salt is fixed, digest is a reversible marker.
const fakeHasher: PinHasher = {
  digest: async (data) => `h(${data})`,
  randomSalt: async () => 'SALT',
};

describe('createLockCode', () => {
  it('isSet is false before a PIN is set, true after', async () => {
    const lc = createLockCode(fakeStore(), fakeHasher);
    expect(await lc.isSet()).toBe(false);
    await lc.set('1234');
    expect(await lc.isSet()).toBe(true);
  });

  it('stores a salt + a hash derived from salt+pin (not the bare pin)', async () => {
    const store = fakeStore();
    await createLockCode(store, fakeHasher).set('1234');
    const parsed = JSON.parse((await store.getItemAsync('finby.lockcode'))!);
    expect(parsed.salt).toBe('SALT');
    // The stored hash is digest(salt + pin) — with the real SHA-256 hasher this
    // is irreversible; here we assert it's derived, not the plaintext pin.
    expect(parsed.hash).toBe(await fakeHasher.digest('SALT' + '1234'));
  });

  it('verify returns true for the correct PIN, false for a wrong one', async () => {
    const lc = createLockCode(fakeStore(), fakeHasher);
    await lc.set('1234');
    expect(await lc.verify('1234')).toBe(true);
    expect(await lc.verify('0000')).toBe(false);
  });

  it('verify returns false when no PIN is set', async () => {
    expect(await createLockCode(fakeStore(), fakeHasher).verify('1234')).toBe(false);
  });

  it('clear removes the stored PIN', async () => {
    const lc = createLockCode(fakeStore(), fakeHasher);
    await lc.set('1234');
    await lc.clear();
    expect(await lc.isSet()).toBe(false);
    expect(await lc.verify('1234')).toBe(false);
  });
});
