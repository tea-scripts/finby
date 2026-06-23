import type { ApiFetch, AuthedFetch } from './contract';

export interface AuthApi {
  verifyEmail(token: string): Promise<{ message: string }>;
  forgotPassword(email: string): Promise<{ message: string }>;
  resetPassword(token: string, newPassword: string): Promise<{ message: string }>;
  resendVerification(): Promise<{ message: string }>;
}

export function createAuthApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): AuthApi {
  const { authed, apiFetch } = deps;
  return {
    verifyEmail(token) {
      return apiFetch<{ message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
    forgotPassword(email) {
      return apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },
    resetPassword(token, newPassword) {
      return apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
    },
    resendVerification() {
      return authed<{ message: string }>('/auth/resend-verification', { method: 'POST' });
    },
  };
}
