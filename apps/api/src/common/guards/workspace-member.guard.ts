import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../context';

/**
 * Verifies the authenticated user is a member of the :workspaceId in the route,
 * and attaches the workspace + membership context to the request.
 * A non-member is treated as 404 (hides workspace existence across tenants).
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    const workspaceId = request.params.workspaceId;

    if (!userId) {
      throw new NotFoundException('Workspace not found.');
    }
    if (!workspaceId) {
      throw new BadRequestException('Missing workspaceId.');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: true },
    });

    if (!membership) {
      throw new NotFoundException('Workspace not found.');
    }

    request.workspace = {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      tier: membership.workspace.tier,
      baseCurrency: membership.workspace.baseCurrency,
    };
    request.membership = { id: membership.id, role: membership.role };

    return true;
  }
}
