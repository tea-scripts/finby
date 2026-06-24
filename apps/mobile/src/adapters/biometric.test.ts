import { describe, expect, it, vi } from 'vitest';
import { createBiometric, type LocalAuthLike } from './biometric';

function fakeLocalAuth(over: Partial<LocalAuthLike> = {}): LocalAuthLike {
  return {
    hasHardwareAsync: vi.fn(async () => true),
    isEnrolledAsync: vi.fn(async () => true),
    authenticateAsync: vi.fn(async () => ({ success: true })),
    ...over,
  };
}

describe('createBiometric', () => {
  it('isAvailable is true only when hardware AND enrolled', async () => {
    expect(await createBiometric(fakeLocalAuth()).isAvailable()).toBe(true);
    expect(
      await createBiometric(fakeLocalAuth({ hasHardwareAsync: vi.fn(async () => false) })).isAvailable(),
    ).toBe(false);
    expect(
      await createBiometric(fakeLocalAuth({ isEnrolledAsync: vi.fn(async () => false) })).isAvailable(),
    ).toBe(false);
  });

  it('authenticate returns true on success', async () => {
    expect(await createBiometric(fakeLocalAuth()).authenticate()).toBe(true);
  });

  it('authenticate returns false on cancel/failure', async () => {
    const bio = createBiometric(fakeLocalAuth({ authenticateAsync: vi.fn(async () => ({ success: false })) }));
    expect(await bio.authenticate()).toBe(false);
  });

  it('passes a prompt message to the OS dialog', async () => {
    const authenticateAsync = vi.fn(async () => ({ success: true }));
    await createBiometric(fakeLocalAuth({ authenticateAsync })).authenticate();
    expect(authenticateAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock Finby' });
  });
});
