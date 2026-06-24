/** Minimal slice of expo-local-authentication this app uses — injected so the
 *  logic is testable with a fake (the real binding lives in
 *  `local-auth.native.ts`). */
export interface LocalAuthLike {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: { promptMessage?: string }): Promise<{ success: boolean }>;
}

export interface Biometric {
  /** True when the device has biometric hardware AND an enrolled biometric. */
  isAvailable(): Promise<boolean>;
  /** Prompt the user; resolves true on success, false on cancel/failure. */
  authenticate(): Promise<boolean>;
}

/** App-lock biometrics behind a decoupled adapter. The OS passcode fallback is
 *  left enabled (we do not pass `disableDeviceFallback`), so a user without a
 *  usable biometric can still unlock with their device passcode. */
export function createBiometric(localAuth: LocalAuthLike): Biometric {
  return {
    async isAvailable() {
      return (await localAuth.hasHardwareAsync()) && (await localAuth.isEnrolledAsync());
    },
    async authenticate() {
      const result = await localAuth.authenticateAsync({ promptMessage: 'Unlock Finby' });
      return result.success;
    },
  };
}
