import { describe, it, expect, vi } from 'vitest';
import { createNotifications, type NotificationsLike } from './notifications';

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
