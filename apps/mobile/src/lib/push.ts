import type { StoreApi } from 'zustand/vanilla';
import type { Notifications } from '../adapters/notifications';
import type { PushApi } from '@finby/core';
import type { PushState, PushStoreState } from './push-store';

export interface Push {
  getPushState(): Promise<PushState>;
  enablePush(workspaceId: string): Promise<PushState>;
  disablePush(workspaceId: string): Promise<PushState>;
}

export function createPush(deps: {
  notifications: Notifications;
  api: PushApi;
  store: StoreApi<PushStoreState>;
  projectId?: string;
  platform: 'ios' | 'android';
}): Push {
  const { notifications, api, store, projectId, platform } = deps;

  async function reconcile(): Promise<PushState> {
    if (!notifications.isPhysicalDevice) return 'unsupported';
    const perm = await notifications.getPermissionStatus();
    if (perm === 'denied') return 'denied';
    return store.getState().token ? 'on' : 'off';
  }

  return {
    async getPushState() {
      const s = await reconcile();
      store.getState().setState(s);
      return s;
    },

    async enablePush(workspaceId) {
      if (!notifications.isPhysicalDevice) {
        store.getState().setState('unsupported');
        return 'unsupported';
      }
      const perm = await notifications.requestPermission();
      if (perm !== 'granted') {
        const s: PushState = perm === 'denied' ? 'denied' : 'off';
        store.getState().setState(s);
        return s;
      }
      await notifications.ensureAndroidChannel();
      const token = await notifications.getExpoPushToken(projectId);
      if (!token) {
        store.getState().setState('unsupported');
        return 'unsupported';
      }
      await api.registerExpoDevice(workspaceId, token, platform);
      store.getState().setToken(token);
      store.getState().setState('on');
      return 'on';
    },

    async disablePush(workspaceId) {
      const token = store.getState().token;
      if (token) {
        await api.unregisterExpoDevice(workspaceId, token).catch(() => undefined);
        store.getState().setToken(null);
      }
      store.getState().setState('off');
      return 'off';
    },
  };
}
