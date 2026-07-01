import { describe, it, expect, vi } from 'vitest';
import { createPush } from './push';
import { createPushStore } from './push-store';

function fakeStorage(initialToken: string | null = null) {
  let token = initialToken;
  return {
    getToken: vi.fn(async () => token),
    setToken: vi.fn(async (t: string) => {
      token = t;
    }),
    clear: vi.fn(async () => {
      token = null;
    }),
  };
}

function deps(over: Record<string, unknown> = {}) {
  const store = createPushStore();
  const notifications = {
    isPhysicalDevice: true,
    getPermissionStatus: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getExpoPushToken: vi.fn().mockResolvedValue('ExponentPushToken[a]'),
    ensureAndroidChannel: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const api = { registerExpoDevice: vi.fn().mockResolvedValue(undefined), unregisterExpoDevice: vi.fn().mockResolvedValue(undefined) };
  const storage = fakeStorage();
  const push = createPush({ notifications: notifications as never, api: api as never, store, storage: storage as never, projectId: 'proj', platform: 'ios' });
  return { store, notifications, api, storage, push };
}

describe('createPush', () => {
  it('enablePush requests permission, gets a token, registers, and sets on', async () => {
    const { store, api, storage, push } = deps();
    const result = await push.enablePush('w1');
    expect(result).toBe('on');
    expect(api.registerExpoDevice).toHaveBeenCalledWith('w1', 'ExponentPushToken[a]', 'ios');
    expect(store.getState().state).toBe('on');
    expect(store.getState().token).toBe('ExponentPushToken[a]');
    expect(storage.setToken).toHaveBeenCalledWith('ExponentPushToken[a]');
  });

  it('enablePush returns denied when permission is refused', async () => {
    const { api, push } = deps({ requestPermission: vi.fn().mockResolvedValue('denied') });
    expect(await push.enablePush('w1')).toBe('denied');
    expect(api.registerExpoDevice).not.toHaveBeenCalled();
  });

  it('enablePush returns unsupported when no token is available', async () => {
    const { push } = deps({ getExpoPushToken: vi.fn().mockResolvedValue(null) });
    expect(await push.enablePush('w1')).toBe('unsupported');
  });

  it('disablePush unregisters the stored token and sets off', async () => {
    const { store, api, push } = deps();
    store.getState().setToken('ExponentPushToken[a]');
    expect(await push.disablePush('w1')).toBe('off');
    expect(api.unregisterExpoDevice).toHaveBeenCalledWith('w1', 'ExponentPushToken[a]');
    expect(store.getState().state).toBe('off');
  });

  it('getPushState reconciles to on after a restart, using the persisted token', async () => {
    // Simulate an app restart: fresh in-memory store (no token), but the
    // secure-store adapter still has the token from before, and OS
    // permission is granted.
    const store = createPushStore();
    const notifications = {
      isPhysicalDevice: true,
      getPermissionStatus: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getExpoPushToken: vi.fn().mockResolvedValue('ExponentPushToken[a]'),
      ensureAndroidChannel: vi.fn().mockResolvedValue(undefined),
    };
    const api = { registerExpoDevice: vi.fn().mockResolvedValue(undefined), unregisterExpoDevice: vi.fn().mockResolvedValue(undefined) };
    const storage = fakeStorage('ExponentPushToken[a]');
    const push = createPush({ notifications: notifications as never, api: api as never, store, storage: storage as never, projectId: 'proj', platform: 'ios' });

    expect(store.getState().token).toBeNull();
    const result = await push.getPushState();
    expect(result).toBe('on');
    expect(store.getState().state).toBe('on');
    expect(store.getState().token).toBe('ExponentPushToken[a]');
  });
});
