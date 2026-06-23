import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from './auth-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAuthApi', () => {
  it('verifyEmail POSTs the token via UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ message: 'ok' });
    await createAuthApi({ authed, apiFetch }).verifyEmail('tok');
    expect(apiFetch).toHaveBeenCalledWith('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
    });
    expect(authed).not.toHaveBeenCalled();
  });
  it('resendVerification uses authed', async () => {
    const authed = ok({ message: 'ok' });
    const apiFetch = ok({});
    await createAuthApi({ authed, apiFetch }).resendVerification();
    expect(authed).toHaveBeenCalledWith('/auth/resend-verification', { method: 'POST' });
  });
});
