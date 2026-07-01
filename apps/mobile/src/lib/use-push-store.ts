import { useStore } from 'zustand';
import { pushStore } from './push-store';
import type { PushStoreState } from './push-store';

export function usePushStore<T>(selector: (s: PushStoreState) => T): T {
  return useStore(pushStore, selector);
}
