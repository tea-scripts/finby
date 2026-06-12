import { Injectable } from '@nestjs/common';
import type { AdminUserRow, AdminUsersPage } from '@finby/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsersQuery } from './dto/admin.schemas';

const PAGE_SIZE = 50;

/**
 * Paginated user directory for the admin dashboard. Deliberately uncached:
 * page/search parameterization would explode cache keys, volume is tiny
 * (admin-only, throttled), and a user-admin view should reflect live state.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: UsersQuery): Promise<AdminUsersPage> {
    const where: Prisma.UserWhereInput | undefined = q.search
      ? {
          OR: [
            { displayName: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          displayName: true,
          email: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          workspaceMemberships: {
            where: { role: 'OWNER' },
            select: {
              workspace: {
                select: {
                  tier: true,
                  subscription: { select: { tier: true, status: true, createdAt: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      users: users.map((u): AdminUserRow => {
        // Prefer a paid owned workspace; fall back to the first owned one.
        const owned = u.workspaceMemberships.map((m) => m.workspace);
        const paid = owned.find((w) => w.tier !== 'FREE' && w.subscription) ?? owned[0];
        const sub = paid?.subscription;
        return {
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          emailVerified: u.emailVerified,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          subscription:
            sub && paid && paid.tier !== 'FREE'
              ? { tier: sub.tier, status: sub.status, startedAt: sub.createdAt.toISOString() }
              : null,
        };
      }),
      total,
      page: q.page,
      pageSize: PAGE_SIZE,
    };
  }
}
