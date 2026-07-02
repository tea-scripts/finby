export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Minimal slice of expo-notifications/expo-device this app uses — injected so
 *  the logic is testable with a fake (real binding in notifications.native.ts). */
export interface NotificationsLike {
  isDevice: boolean;
  platformOS: 'ios' | 'android' | string;
  getPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(opts: { projectId?: string }): Promise<{ data: string }>;
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(cb: (resp: unknown) => void): { remove(): void };
  getLastNotificationResponseAsync(): Promise<unknown>;
}

export interface Notifications {
  isPhysicalDevice: boolean;
  getPermissionStatus(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  /** Expo push token, or null if unavailable (simulator / no permission / error). */
  getExpoPushToken(projectId?: string): Promise<string | null>;
  ensureAndroidChannel(): Promise<void>;
  setForegroundHandler(): void;
  /** Subscribe to notification taps; the callback gets the payload `url` (or null). Returns an unsubscribe. */
  addResponseListener(cb: (url: string | null) => void): () => void;
  /** The url of the notification that cold-started the app (or null). */
  getInitialUrl(): Promise<string | null>;
}

function normalizeStatus(status: string): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

function urlFromResponse(resp: unknown): string | null {
  const data = (resp as { notification?: { request?: { content?: { data?: { url?: unknown } } } } })
    ?.notification?.request?.content?.data;
  return typeof data?.url === 'string' ? data.url : null;
}

export function createNotifications(deps: NotificationsLike): Notifications {
  return {
    isPhysicalDevice: deps.isDevice,

    async getPermissionStatus() {
      return normalizeStatus((await deps.getPermissionsAsync()).status);
    },

    async requestPermission() {
      return normalizeStatus((await deps.requestPermissionsAsync()).status);
    },

    async getExpoPushToken(projectId) {
      if (!deps.isDevice) return null;
      try {
        const { data } = await deps.getExpoPushTokenAsync({ projectId });
        return data ?? null;
      } catch {
        return null;
      }
    },

    async ensureAndroidChannel() {
      if (deps.platformOS !== 'android') return;
      await deps.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: 4, // AndroidImportance.HIGH
      });
    },

    setForegroundHandler() {
      deps.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    },

    addResponseListener(cb) {
      const sub = deps.addNotificationResponseReceivedListener((resp) => cb(urlFromResponse(resp)));
      return () => sub.remove();
    },

    async getInitialUrl() {
      return urlFromResponse(await deps.getLastNotificationResponseAsync());
    },
  };
}

/** A no-op `NotificationsLike` for environments without native push — notably
 *  Expo Go on Android, where expo-notifications remote push was removed in SDK
 *  53 and importing it errors. Pure (no expo imports), so wiring this in Expo
 *  Go lets the app run without ever loading expo-notifications. Push shows as
 *  'unsupported' there; it works in dev/EAS builds via the real binding. */
export const noopNotificationsBinding: NotificationsLike = {
  isDevice: false,
  platformOS: 'unsupported',
  getPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: false }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  setNotificationChannelAsync: async () => undefined,
  setNotificationHandler: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  getLastNotificationResponseAsync: async () => null,
};
