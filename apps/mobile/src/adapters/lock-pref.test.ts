import { describe, expect, it } from 'vitest';
import { createLockPref } from './lock-pref';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe('createLockPref', () => {
  it('defaults to enabled (ON) when nothing is stored', async () => {
    expect(await createLockPref(fakeStore()).isEnabled()).toBe(true);
  });

  it('persists disabled and reads it back', async () => {
    const pref = createLockPref(fakeStore());
    await pref.setEnabled(false);
    expect(await pref.isEnabled()).toBe(false);
  });

  it('persists re-enabled and reads it back', async () => {
    const pref = createLockPref(fakeStore());
    await pref.setEnabled(false);
    await pref.setEnabled(true);
    expect(await pref.isEnabled()).toBe(true);
  });
});
