import { apiFetch } from './api-client';
import { useAuth } from './store';

export function verifyEmail(token: string): Promise<{ message: string }> {
  return apiFetch('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}
export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}
export function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}
export function resendVerification(): Promise<{ message: string }> {
  return useAuth.getState().authed('/auth/resend-verification', { method: 'POST' });
}
