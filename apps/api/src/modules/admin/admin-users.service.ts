import { Injectable } from '@nestjs/common';
import type { AdminUserRow, AdminUsersPage } from '@finby/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsersQuery } from './dto/admin.schemas';

const PAGE_SIZE = 50;

/**
 * Plan filter over the workspace the user OWNS (mirrors the table's plan
 * column, which is derived from owned workspaces).
 *
 * `free` deliberately means "no owned paid workspace": it matches users who
 * own only FREE workspaces AND users who own no workspace at all — both
 * render as "Free" in the users table, so the filter matches what the
 * column displays.
 */
function planWhere(plan: UsersQuery['plan']): Prisma.UserWhereInput | undefined {
  if (!plan) return undefined;
  if (plan === 'free') {
    return {
      NOT: {
        workspaceMemberships: {
          some: { role: 'OWNER', workspace: { tier: { not: 'FREE' } } },
        },
      },
    };
  }
  return {
    workspaceMemberships: {
      some: { role: 'OWNER', workspace: { tier: plan === 'paid' ? { not: 'FREE' } : plan } },
    },
  };
}

/**
 * Paginated user directory for the admin dashboard. Deliberately uncached:
 * page/search parameterization would explode cache keys, volume is tiny
 * (admin-only, throttled), and a user-admin view should reflect live state.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: UsersQuery): Promise<AdminUsersPage> {
    const searchWhere: Prisma.UserWhereInput | undefined = q.search
      ? {
          OR: [
            { displayName: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : undefined;

    // Both filters must apply when both params are present.
    const conditions = [searchWhere, planWhere(q.plan)].filter(
      (c): c is Prisma.UserWhereInput => c !== undefined,
    );
    const where: Prisma.UserWhereInput | undefined =
      conditions.length > 1 ? { AND: conditions } : conditions[0];

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        // Tolerates a missing sort (treated as newest) so pre-parse callers stay valid.
        orderBy: { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' },
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
