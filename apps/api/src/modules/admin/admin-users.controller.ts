import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AdminUsersPage } from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminUsersService } from './admin-users.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { usersQuerySchema, type UsersQuery } from './dto/admin.schemas';

// Same security model as the metrics controller: @Public() bypasses the global
// user JwtAuthGuard; AdminJwtGuard re-secures with admin-scoped tokens.
@Throttle({ global: { limit: 60, ttl: 60_000 } })
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(usersQuerySchema)) q: UsersQuery): Promise<AdminUsersPage> {
    return this.users.list(q);
  }
}
