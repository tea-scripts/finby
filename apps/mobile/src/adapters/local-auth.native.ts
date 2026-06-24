import * as LocalAuthentication from 'expo-local-authentication';
import type { LocalAuthLike } from './biometric';

/** expo-local-authentication binding. Verified on device (no Vitest coverage —
 *  pure pass-through to the native module). */
export const localAuth: LocalAuthLike = {
  hasHardwareAsync: () => LocalAuthentication.hasHardwareAsync(),
  isEnrolledAsync: () => LocalAuthentication.isEnrolledAsync(),
  authenticateAsync: (options) => LocalAuthentication.authenticateAsync(options),
};
