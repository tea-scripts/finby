import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { AuthResult, AuthUser, AuthUserView, RefreshUser, TokenPair, WorkspaceMembershipView } from './auth.types';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type VerifyEmailInput,
} from './dto/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput): Promise<AuthResult> {
    return this.auth.register(body);
  }

  // Brute-force protection: 10 attempts / 15 min per IP.
  @Throttle({ global: { limit: 10, ttl: 900_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<AuthResult> {
    return this.auth.login(body);
  }

  // Token-rotation abuse protection: 20 attempts / min per IP.
  @Throttle({ global: { limit: 20, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  refresh(
    @Req() req: Request & { user: RefreshUser },
    @Body(new ZodValidationPipe(refreshSchema)) _body: RefreshInput,
  ): Promise<TokenPair> {
    return this.auth.rotateRefreshToken(req.user.userId, req.user.refreshTokenId);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  // Mail-bomb protection: 5 attempts / 60 min per IP.
  @Throttle({ global: { limit: 5, ttl: 3_600_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(body.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // Token-stuffing protection: 10 attempts / 15 min per IP.
  @Throttle({ global: { limit: 10, ttl: 900_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<{ message: string }> {
    await this.auth.resetPassword(body.token, body.newPassword);
    return { message: 'Password updated successfully.' };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<{ message: string }> {
    await this.auth.verifyEmail(body.token);
    return { message: 'Email verified.' };
  }

  // Mail-bomb protection: 5 attempts / 60 min per IP.
  @Throttle({ global: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Req() req: Request & { user: AuthUser }): Promise<{ message: string }> {
    await this.auth.resendVerification(req.user.userId);
    return { message: 'Verification email sent.' };
  }

  @Get('me')
  async me(@Req() req: Request & { user: AuthUser }): Promise<{ user: AuthUserView }> {
    return { user: await this.auth.getMe(req.user.userId) };
  }

  @Get('workspaces')
  listWorkspaces(@CurrentUser() user: AuthUser): Promise<WorkspaceMembershipView[]> {
    return this.auth.listWorkspaces(user.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<AuthUserView> {
    return this.auth.updateProfile(user.userId, body);
  }
}
