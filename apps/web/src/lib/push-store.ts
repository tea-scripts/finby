import { create } from 'zustand';
import type { PushState } from './push';

/**
 * Shared push-notification state. There are multiple `NotifToggle` instances
 * mounted at once (the app header bell and the Settings push toggle), plus the
 * Settings daily-reminder switch derives from it. Each must reflect the same
 * device subscription state, so the "on/off" lives here instead of in local
 * component state — toggling one place updates them all immediately.
 *
 * `busy` is shared too, so every toggle disables while a subscribe/unsubscribe
 * is in flight (prevents double-clicks racing across instances).
 */
interface PushStore {
  state: PushState;
  busy: boolean;
  setState: (s: PushState) => void;
  setBusy: (b: boolean) => void;
}

export const usePushStore = create<PushStore>((set) => ({
  state: 'off',
  busy: false,
  setState: (s) => set({ state: s }),
  setBusy: (b) => set({ busy: b }),
}));
