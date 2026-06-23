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

describe('createAuthApi auth flow', () => {
  it('login POSTs credentials and returns the AuthResult', async () => {
    const authed = vi.fn();
    const apiFetch = vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1' } }) as never);
    const api = createAuthApi({ authed, apiFetch });
    const res = await api.login('e@x.com', 'pw');
    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'e@x.com', password: 'pw' }),
    });
    expect(res).toMatchObject({ accessToken: 'a', user: { id: 'u1' } });
    expect(authed).not.toHaveBeenCalled();
  });

  it('register POSTs the input and returns the AuthResult', async () => {
    const apiFetch = vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1' } }) as never);
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    const input = { displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC' };
    await api.register(input);
    expect(apiFetch).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: JSON.stringify(input) });
  });

  it('logout POSTs the refreshToken and swallows network errors', async () => {
    const apiFetch = vi.fn(async () => { throw new Error('network'); });
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    await expect(api.logout('r1')).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: 'r1' }) });
  });

  it('logout with no refresh token does nothing', async () => {
    const apiFetch = vi.fn();
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    await api.logout(null);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
