// Global jest mock for the ESM-only `expo-server-sdk`.
//
// `PushService` imports `expo-server-sdk`, whose published entrypoint is native
// ESM. Under ts-jest (CommonJS) any suite that *transitively* imports
// `PushService` — e.g. reminders/chat/insights via optional injection — fails to
// load with "Cannot use import statement outside a module". The push specs work
// around this with their own `jest.mock('expo-server-sdk', …)`; this setup file
// registers an equivalent default mock for every OTHER suite so they can load.
// A suite that needs to assert Expo behavior still defines its own in-file
// `jest.mock('expo-server-sdk')`, which takes precedence over this one.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken(token: string): boolean {
      return typeof token === 'string' && token.startsWith('ExponentPushToken');
    }
    chunkPushNotifications(messages: unknown[]): unknown[][] {
      return messages.length ? [messages] : [];
    }
    sendPushNotificationsAsync = jest.fn().mockResolvedValue([]);
  },
}));
