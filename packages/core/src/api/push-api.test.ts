import { describe, it, expect, vi } from 'vitest';
import { createPushApi } from './push-api';

describe('push-api', () => {
  it('registers an expo device', async () => {
    const authed = vi.fn().mockResolvedValue(undefined);
    const api = createPushApi(authed as never);
    await api.registerExpoDevice('w1', 'ExponentPushToken[a]', 'ios');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/push/expo/register', {
      method: 'POST',
      body: JSON.stringify({ token: 'ExponentPushToken[a]', platform: 'ios' }),
    });
  });

  it('unregisters an expo device', async () => {
    const authed = vi.fn().mockResolvedValue(undefined);
    const api = createPushApi(authed as never);
    await api.unregisterExpoDevice('w1', 'ExponentPushToken[a]');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/push/expo/unregister', {
      method: 'POST',
      body: JSON.stringify({ token: 'ExponentPushToken[a]' }),
    });
  });
});
