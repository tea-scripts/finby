import { Platform } from 'react-native';
import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { NotificationsLike } from './notifications';

/** expo-notifications + expo-device binding. Verified on device (no unit
 *  coverage — pure pass-through to the native modules).
 *
 *  NOTE: do NOT rename this to `notifications.native.ts`. Metro's platform
 *  resolution would then make `import … from '../adapters/notifications'`
 *  resolve to THIS file (the binding) instead of `notifications.ts` (the
 *  factory), so `createNotifications` would be undefined at runtime. Keep a
 *  distinct base name (like `local-auth.native.ts` does for biometric). */
export const notificationsBinding: NotificationsLike = {
  isDevice: Device.isDevice,
  platformOS: Platform.OS,
  getPermissionsAsync: () => ExpoNotifications.getPermissionsAsync(),
  requestPermissionsAsync: () => ExpoNotifications.requestPermissionsAsync(),
  getExpoPushTokenAsync: (opts) => ExpoNotifications.getExpoPushTokenAsync(opts),
  setNotificationChannelAsync: (id, channel) =>
    ExpoNotifications.setNotificationChannelAsync(id, channel as never),
  setNotificationHandler: (handler) => ExpoNotifications.setNotificationHandler(handler as never),
  addNotificationResponseReceivedListener: (cb) =>
    ExpoNotifications.addNotificationResponseReceivedListener(cb as never),
  getLastNotificationResponseAsync: () => ExpoNotifications.getLastNotificationResponseAsync(),
};
