import { describe, it, expect } from 'vitest';
import { createPushStore } from './push-store';

describe('push-store', () => {
  it('defaults to off, not busy, no token', () => {
    const s = createPushStore().getState();
    expect(s.state).toBe('off');
    expect(s.busy).toBe(false);
    expect(s.token).toBeNull();
  });

  it('updates state, busy, and token', () => {
    const store = createPushStore();
    store.getState().setState('on');
    store.getState().setBusy(true);
    store.getState().setToken('ExponentPushToken[a]');
    expect(store.getState()).toMatchObject({ state: 'on', busy: true, token: 'ExponentPushToken[a]' });
  });
});
