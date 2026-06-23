import { describe, expect, it, vi } from 'vitest';
import { createSettingsApi } from './settings-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createSettingsApi', () => {
  it('updateProfile PATCHes /auth/profile with the patch', async () => {
    const authed = ok({ id: 'u1' });
    await createSettingsApi(authed).updateProfile({ displayName: 'Tee' });
    expect(authed).toHaveBeenCalledWith('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Tee' }),
    });
  });
  it('updateBaseCurrency PATCHes the base-currency endpoint', async () => {
    const authed = ok({ baseCurrency: 'USD', preferredCurrencies: [], recomputed: 0 });
    await createSettingsApi(authed).updateBaseCurrency('ws1', 'USD');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/currencies/base', {
      method: 'PATCH',
      body: JSON.stringify({ baseCurrency: 'USD' }),
    });
  });
});
