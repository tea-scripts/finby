import type { AuthedFetch } from './contract';

export interface PushApi {
  registerExpoDevice(workspaceId: string, token: string, platform: 'ios' | 'android'): Promise<void>;
  unregisterExpoDevice(workspaceId: string, token: string): Promise<void>;
}

export function createPushApi(authed: AuthedFetch): PushApi {
  return {
    registerExpoDevice(workspaceId, token, platform) {
      return authed<void>(`/workspaces/${workspaceId}/push/expo/register`, {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      });
    },
    unregisterExpoDevice(workspaceId, token) {
      return authed<void>(`/workspaces/${workspaceId}/push/expo/unregister`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
  };
}
