import { PushController } from './push.controller';
import type { PushService } from './push.service';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';

// PushController transitively imports PushService, which imports the ESM-only
// expo-server-sdk package; jest can't parse that at import time, so it's
// mocked out here (mirroring push.service.spec.ts) even though this suite
// never exercises the real Expo client.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken(t: string): boolean {
      return typeof t === 'string' && t.startsWith('ExponentPushToken');
    }
    chunkPushNotifications(m: unknown[]): unknown[][] {
      return [m];
    }
    sendPushNotificationsAsync = jest.fn();
  },
}));

const ws = { id: 'w1' } as WorkspaceContext;
const user = { userId: 'u1' } as AuthUser;

function make() {
  const push = {
    registerExpoDevice: jest.fn().mockResolvedValue(undefined),
    unregisterExpoDevice: jest.fn().mockResolvedValue(undefined),
  };
  return { push, controller: new PushController(push as unknown as PushService) };
}

describe('PushController expo endpoints', () => {
  it('registers an expo device for the current user + workspace', async () => {
    const { push, controller } = make();
    await controller.expoRegister(ws, user, { token: 'ExponentPushToken[a]', platform: 'ios' });
    expect(push.registerExpoDevice).toHaveBeenCalledWith('w1', 'u1', 'ExponentPushToken[a]', 'ios');
  });

  it('unregisters an expo device scoped to the current user', async () => {
    const { push, controller } = make();
    await controller.expoUnregister(user, { token: 'ExponentPushToken[a]' });
    expect(push.unregisterExpoDevice).toHaveBeenCalledWith('u1', 'ExponentPushToken[a]');
  });
});
