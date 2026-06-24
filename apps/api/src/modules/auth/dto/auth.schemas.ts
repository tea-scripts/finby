import { z } from 'zod';
import { preferencesSchema } from '../preferences.util';

/** Zod DTO schemas for the auth module (no class-validator). */

export const registerSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(200),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  timezone: z.string().trim().min(1).default('UTC'),
  // The Terms of Service version the user accepted (recorded as consent
  // evidence). Required — registration is refused without it.
  acceptedTermsVersion: z.string().trim().min(1).max(64),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  preferences: preferencesSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
