import { useStore } from 'zustand';
import { authStore } from './runtime.native';
import type { AuthState } from './auth-store';

/** Subscribe a component to the app's auth store. Screens select the slices
 *  they need; the root gate selects `status`/`onboarded`. */
export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  return useStore(authStore, selector);
}

export { authStore };
