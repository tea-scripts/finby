import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Validates the refresh token (signature + DB record) for the refresh route. */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
