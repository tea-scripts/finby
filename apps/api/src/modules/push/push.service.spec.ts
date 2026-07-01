import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

jest.mock('expo-server-sdk', () => {
  const sendPushNotificationsAsync = jest.fn();
  class Expo {
    static isExpoPushToken = (t: string) => typeof t === 'string' && t.startsWith('ExponentPushToken');
    chunkPushNotifications = (m: unknown[]) => [m];
    sendPushNotificationsAsync = sendPushNotificationsAsync;
  }
  return { Expo, __sendPushNotificationsAsync: sendPushNotificationsAsync };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const expoSend = require('expo-server-sdk').__sendPushNotificationsAsync as jest.Mock;

const sendNotification = webpush.sendNotification as jest.Mock;

function makeConfig(values: Record<string, string | undefined>): ConfigService<Env, true> {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
}

const CONFIGURED = {
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:test@finby.app',
};

beforeEach(() => jest.clearAllMocks());

describe('PushService (unconfigured)', () => {
  it('reports no public key and skips sending', async () => {
    const findMany = jest.fn();
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany }, mobilePushDevice: { findMany: devFind } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig({}));

    expect(service.getPublicKey()).toBeNull();
    await service.sendToUser('w1', 'u1', { title: 'x', body: 'y' });
    expect(findMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('PushService (configured)', () => {
  it('exposes the public key and upserts a subscription by endpoint', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { pushSubscription: { upsert } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));

    expect(service.getPublicKey()).toBe('pub');
    await service.subscribe('w1', 'u1', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'k1', auth: 'k2' },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example/abc' },
        create: expect.objectContaining({ workspaceId: 'w1', userId: 'u1', p256dh: 'k1', auth: 'k2' }),
      }),
    );
  });

  it('sends to every device and prunes a 410-gone subscription', async () => {
    const subs = [
      { endpoint: 'https://push.example/live', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push.example/dead', p256dh: 'c', auth: 'd' },
    ];
    const findMany = jest.fn().mockResolvedValue(subs);
    const del = jest.fn().mockResolvedValue({});
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany, delete: del }, mobilePushDevice: { findMany: devFind } };

    sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
    await service.sendToUser('w1', 'u1', { title: 'Budget', body: 'over', url: '/chat' });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith({ where: { endpoint: 'https://push.example/dead' } });
  });

  it('sendToUserDevices addresses every device for a user (no workspace filter)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { endpoint: 'https://push.example/d1', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push.example/d2', p256dh: 'c', auth: 'd' },
    ]);
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany }, mobilePushDevice: { findMany: devFind } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));

    await service.sendToUserDevices('u1', { title: 'Finby', body: 'hi', url: '/chat' });

    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('sendToUserDevices prunes a 410-gone subscription', async () => {
    const subs = [
      { endpoint: 'https://push.example/live', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push.example/dead', p256dh: 'c', auth: 'd' },
    ];
    const findMany = jest.fn().mockResolvedValue(subs);
    const del = jest.fn().mockResolvedValue({});
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany, delete: del }, mobilePushDevice: { findMany: devFind } };

    sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
    await service.sendToUserDevices('u1', { title: 'Daily', body: 'Check in', url: '/chat' });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith({ where: { endpoint: 'https://push.example/dead' } });
  });

  it('sendToUserDevices no-ops sends when the user has no subscriptions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany }, mobilePushDevice: { findMany: devFind } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));

    await service.sendToUserDevices('u1', { title: 'Daily', body: 'Check in' });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('registerExpoDevice upserts by token', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { mobilePushDevice: { upsert } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
    await service.registerExpoDevice('w1', 'u1', 'ExponentPushToken[abc]', 'ios');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expoPushToken: 'ExponentPushToken[abc]' },
        create: expect.objectContaining({ workspaceId: 'w1', userId: 'u1', platform: 'ios' }),
      }),
    );
  });

  it('sendToUser delivers to Expo devices and prunes DeviceNotRegistered', async () => {
    const subFind = jest.fn().mockResolvedValue([]); // no web-push subs
    const devFind = jest.fn().mockResolvedValue([
      { expoPushToken: 'ExponentPushToken[live]', platform: 'ios' },
      { expoPushToken: 'ExponentPushToken[dead]', platform: 'android' },
    ]);
    const devDelete = jest.fn().mockResolvedValue({});
    const prisma = {
      pushSubscription: { findMany: subFind },
      mobilePushDevice: { findMany: devFind, deleteMany: devDelete },
    };
    expoSend.mockResolvedValueOnce([
      { status: 'ok', id: 'x' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
    await service.sendToUser('w1', 'u1', { title: 'Budget', body: 'over', url: '/budgets' });
    expect(expoSend).toHaveBeenCalledTimes(1);
    expect(devDelete).toHaveBeenCalledWith({ where: { expoPushToken: 'ExponentPushToken[dead]' } });
  });
});

describe('PushService (sendToUserDevices unconfigured)', () => {
  it('sendToUserDevices no-ops when unconfigured', async () => {
    const findMany = jest.fn();
    const devFind = jest.fn().mockResolvedValue([]);
    const prisma = { pushSubscription: { findMany }, mobilePushDevice: { findMany: devFind } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig({}));
    await service.sendToUserDevices('u1', { title: 'x', body: 'y' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('delivers to Expo even when VAPID is unconfigured', async () => {
    const devFind = jest.fn().mockResolvedValue([{ expoPushToken: 'ExponentPushToken[a]', platform: 'ios' }]);
    const prisma = {
      pushSubscription: { findMany: jest.fn() },
      mobilePushDevice: { findMany: devFind, deleteMany: jest.fn() },
    };
    expoSend.mockResolvedValueOnce([{ status: 'ok', id: 'x' }]);
    const service = new PushService(prisma as unknown as PrismaService, makeConfig({})); // no VAPID
    await service.sendToUserDevices('u1', { title: 'Daily', body: 'Check in' });
    expect(devFind).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(expoSend).toHaveBeenCalledTimes(1);
  });
});
