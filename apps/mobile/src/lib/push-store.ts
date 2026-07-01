import { createStore, type StoreApi } from 'zustand/vanilla';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export interface PushStoreState {
  state: PushState;
  busy: boolean;
  token: string | null;
  setState(s: PushState): void;
  setBusy(b: boolean): void;
  setToken(t: string | null): void;
}

/** Shared push state so the Preferences push toggle and the daily-reminder
 *  toggle (which derives from it) reflect the same device state. */
export function createPushStore(): StoreApi<PushStoreState> {
  return createStore<PushStoreState>((set) => ({
    state: 'off',
    busy: false,
    token: null,
    setState: (s) => set({ state: s }),
    setBusy: (b) => set({ busy: b }),
    setToken: (t) => set({ token: t }),
  }));
}

export const pushStore = createPushStore();
