import { describe, expect, it, vi } from 'vitest';
import { createBillingApi } from './billing-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createBillingApi', () => {
  it('getSubscription GETs the subscription via authed', async () => {
    const authed = ok({ tier: 'FREE' });
    const apiFetch = ok({});
    await createBillingApi({ authed, apiFetch }).getSubscription('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/subscription');
  });
  it('getPlans uses the UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ plans: [] });
    await createBillingApi({ authed, apiFetch }).getPlans();
    expect(apiFetch).toHaveBeenCalledWith('/billing/plans');
    expect(authed).not.toHaveBeenCalled();
  });
  it('startCheckout POSTs the tier', async () => {
    const authed = ok({ url: 'https://x' });
    const apiFetch = ok({});
    await createBillingApi({ authed, apiFetch }).startCheckout('ws1', 'PRO');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PRO' }),
    });
  });
});
