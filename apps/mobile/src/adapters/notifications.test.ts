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

  it('addResponseListener delivers the payload url when present', () => {
    let handler: ((resp: unknown) => void) | undefined;
    const n = createNotifications(
      fake({
        addNotificationResponseReceivedListener: vi.fn((cb: (resp: unknown) => void) => {
          handler = cb;
          return { remove: vi.fn() };
        }),
      }),
    );
    const seen: (string | null)[] = [];
    n.addResponseListener((url) => seen.push(url));
    handler?.({ notification: { request: { content: { data: { url: '/chat' } } } } });
    expect(seen).toEqual(['/chat']);
  });

  it('getInitialUrl returns the cold-start url when present', async () => {
    const n = createNotifications(
      fake({
        getLastNotificationResponseAsync: vi
          .fn()
          .mockResolvedValue({ notification: { request: { content: { data: { url: '/budgets' } } } } }),
      }),
    );
    expect(await n.getInitialUrl()).toBe('/budgets');
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
