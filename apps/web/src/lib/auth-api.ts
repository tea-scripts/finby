import { createAuthApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { verifyEmail, forgotPassword, resetPassword, resendVerification } =
  createAuthApi({ authed, apiFetch });
