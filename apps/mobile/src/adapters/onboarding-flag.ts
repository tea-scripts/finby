import type { SecureStoreLike } from './token-store';

const ONBOARDED_KEY = 'finby.onboarded';

export interface OnboardingFlag {
  wasSeen(): Promise<boolean>;
  markSeen(): Promise<void>;
  /** Clear the flag so the first-launch carousel shows again (dev/replay). */
  reset(): Promise<void>;
}

/** Tracks whether the first-launch onboarding carousel has been shown.
 *  Persists across logout (intentionally not cleared by sign-out). */
export function createOnboardingFlag(secureStore: SecureStoreLike): OnboardingFlag {
  return {
    async wasSeen() {
      return (await secureStore.getItemAsync(ONBOARDED_KEY)) === '1';
    },
    async markSeen() {
      await secureStore.setItemAsync(ONBOARDED_KEY, '1');
    },
    async reset() {
      await secureStore.deleteItemAsync(ONBOARDED_KEY);
    },
  };
}
