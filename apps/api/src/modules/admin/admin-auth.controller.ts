import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuthService, type AdminEnrollResult, type AdminLoginResult } from './admin-auth.service';
import {
  adminEnrollSchema,
  adminLoginSchema,
  type AdminEnrollInput,
  type AdminLoginInput,
} from './dto/admin.schemas';

// @Public() bypasses the global user JwtAuthGuard. Brute-force throttled hard:
// 5 attempts / 15 min per IP (matches the sensitivity of an admin login).
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body(new ZodValidationPipe(adminLoginSchema)) body: AdminLoginInput): Promise<AdminLoginResult> {
    return this.auth.login(body);
  }

  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('totp/enroll')
  enroll(@Body(new ZodValidationPipe(adminEnrollSchema)) body: AdminEnrollInput): Promise<AdminEnrollResult> {
    return this.auth.enroll(body);
  }
}
