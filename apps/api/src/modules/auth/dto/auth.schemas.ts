import { z } from 'zod';

/** Zod DTO schemas for the auth module (no class-validator). */

export const registerSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(200),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  timezone: z.string().trim().min(1).default('UTC'),
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
