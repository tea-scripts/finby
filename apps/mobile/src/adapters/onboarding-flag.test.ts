import { describe, expect, it } from 'vitest';
import { createOnboardingFlag } from './onboarding-flag';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe('createOnboardingFlag', () => {
  it('wasSeen is false before markSeen', async () => {
    expect(await createOnboardingFlag(fakeStore()).wasSeen()).toBe(false);
  });

  it('wasSeen is true after markSeen', async () => {
    const flag = createOnboardingFlag(fakeStore());
    await flag.markSeen();
    expect(await flag.wasSeen()).toBe(true);
  });

  it('reset clears the seen flag', async () => {
    const flag = createOnboardingFlag(fakeStore());
    await flag.markSeen();
    await flag.reset();
    expect(await flag.wasSeen()).toBe(false);
  });
});
