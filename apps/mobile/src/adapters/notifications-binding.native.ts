import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { NotificationsLike } from './notifications';

/** expo-notifications + expo-device binding for dev/EAS builds.
 *
 *  expo-notifications is lazily `require`d (NOT a top-level import) so that
 *  merely importing this module — which happens at app startup via
 *  runtime.native — does not eagerly load expo-notifications. That matters for
 *  Expo Go on Android, where SDK 53 removed remote push and importing
 *  expo-notifications errors at load. In Expo Go the app wires the no-op
 *  binding (see runtime.native), so these methods are never called; in a dev
 *  build they load expo-notifications on first use. expo-device is safe in
 *  Expo Go, so it stays a normal import.
 *
 *  NOTE: do NOT rename this to `notifications.native.ts`. Metro's platform
 *  resolution would then make `import … from '../adapters/notifications'`
 *  resolve to THIS file (the binding) instead of `notifications.ts` (the
 *  factory), so `createNotifications` would be undefined at runtime. Keep a
 *  distinct base name (like `local-auth.native.ts` does for biometric). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
function enotif(): typeof import('expo-notifications') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

export const notificationsBinding: NotificationsLike = {
  isDevice: Device.isDevice,
  platformOS: Platform.OS,
  getPermissionsAsync: () => enotif().getPermissionsAsync(),
  requestPermissionsAsync: () => enotif().requestPermissionsAsync(),
  getExpoPushTokenAsync: (opts) => enotif().getExpoPushTokenAsync(opts),
  setNotificationChannelAsync: (id, channel) => enotif().setNotificationChannelAsync(id, channel as never),
  setNotificationHandler: (handler) => enotif().setNotificationHandler(handler as never),
  addNotificationResponseReceivedListener: (cb) => enotif().addNotificationResponseReceivedListener(cb as never),
  getLastNotificationResponseAsync: () => enotif().getLastNotificationResponseAsync(),
};
