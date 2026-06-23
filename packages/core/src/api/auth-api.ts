import type { ApiFetch, AuthedFetch } from './contract';
import type { AuthResult, RegisterInput } from '@finby/shared';

export interface AuthApi {
  verifyEmail(token: string): Promise<{ message: string }>;
  forgotPassword(email: string): Promise<{ message: string }>;
  resetPassword(token: string, newPassword: string): Promise<{ message: string }>;
  resendVerification(): Promise<{ message: string }>;
  login(email: string, password: string): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  logout(refreshToken: string | null): Promise<void>;
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
    login(email, password) {
      return apiFetch<AuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    register(input) {
      return apiFetch<AuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async logout(refreshToken) {
      if (!refreshToken) return;
      // Best-effort server-side revocation; never block sign-out on it.
      try {
        await apiFetch<void>('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        /* ignore — clearing local state is what matters */
      }
    },
  };
}
