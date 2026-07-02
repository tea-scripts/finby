import { describe, it, expect, vi } from 'vitest';
import { createNotifications, noopNotificationsBinding, type NotificationsLike } from './notifications';

function fake(over: Partial<NotificationsLike> = {}): NotificationsLike {
  return {
    isDevice: true,
    getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
    requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
    getExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: 'ExponentPushToken[abc]' }),
    setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
    setNotificationHandler: vi.fn(),
    addNotificationResponseReceivedListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    getLastNotificationResponseAsync: vi.fn().mockResolvedValue(null),
    platformOS: 'ios',
    ...over,
  };
}

describe('createNotifications', () => {
  it('maps permission status through', async () => {
    const n = createNotifications(fake());
    expect(await n.getPermissionStatus()).toBe('granted');
  });

  it('returns the expo token string', async () => {
    const n = createNotifications(fake());
    expect(await n.getExpoPushToken('proj')).toBe('ExponentPushToken[abc]');
  });

  it('returns null token on a non-physical device', async () => {
    const n = createNotifications(fake({ isDevice: false }));
    expect(await n.getExpoPushToken('proj')).toBeNull();
  });
});

describe('noopNotificationsBinding (Expo Go / unsupported)', () => {
  it('reports non-physical device and no token', async () => {
    const n = createNotifications(noopNotificationsBinding);
    expect(n.isPhysicalDevice).toBe(false);
    expect(await n.getExpoPushToken('proj')).toBeNull();
  });

  it('response listener is a no-op returning a callable unsubscribe', () => {
    const n = createNotifications(noopNotificationsBinding);
    const unsub = n.addResponseListener(() => undefined);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('setForegroundHandler + getInitialUrl are safe no-ops', async () => {
    const n = createNotifications(noopNotificationsBinding);
    expect(() => n.setForegroundHandler()).not.toThrow();
    expect(await n.getInitialUrl()).toBeNull();
  });
});
