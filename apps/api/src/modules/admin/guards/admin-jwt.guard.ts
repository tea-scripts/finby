import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Secures admin routes. Apply alongside @Public() so the global user
 *  JwtAuthGuard is bypassed and only admin-scoped tokens are accepted. */
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {}
