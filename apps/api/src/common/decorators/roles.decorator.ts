import { SetMetadata } from '@nestjs/common';
import type { WorkspaceMemberRole } from '@budgy/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed workspace roles (enforced by RolesGuard). */
export const Roles = (...roles: WorkspaceMemberRole[]) => SetMetadata(ROLES_KEY, roles);
