import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  EngagementMetrics,
  GrowthMetrics,
  TimeSeriesPoint,
} from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Env } from '../../config/env.schema';
import type { MetricRangeQuery } from './dto/admin.schemas';

const CACHE_TTL_SECONDS = 600; // 10 min

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Resolve a range to concrete [from, to]; defaults to last 30 days. */
  private resolveRange(q: MetricRangeQuery): { from: Date; to: Date } {
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
    return { from, to };
  }

  /** Read-through Redis cache keyed by metric name + range. */
  private async cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = await this.redis.client.get(key);
    if (hit) return JSON.parse(hit) as T;
    const fresh = await compute();
    await this.redis.client.set(key, JSON.stringify(fresh), 'EX', CACHE_TTL_SECONDS);
    return fresh;
  }

  private rangeKey(name: string, from: Date, to: Date): string {
    return `admin:metrics:${name}:${from.toISOString()}:${to.toISOString()}`;
  }

  /** Daily-bucketed count time series via raw SQL (date_trunc). */
  private async dailySeries(
    table: 'users' | 'transactions',
    // Literal-typed (not `string`) so a column name can never be threaded into
    // Prisma.raw from a variable — keeps the raw SQL injection-safe by construction.
    dateColumn: 'createdAt',
    from: Date,
    to: Date,
  ): Promise<TimeSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<{ date: string; value: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${Prisma.raw(`"${dateColumn}"`)}), 'YYYY-MM-DD') AS date,
             count(*)::bigint AS value
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE ${Prisma.raw(`"${dateColumn}"`)} >= ${from} AND ${Prisma.raw(`"${dateColumn}"`)} <= ${to}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
  }

  /** Distinct count of users active (login OR logged a transaction) since cutoff. */
  private async activeUserCount(cutoff: Date): Promise<number> {
    const [loginUsers, txnUsers] = await Promise.all([
      this.prisma.user.findMany({ where: { lastLoginAt: { gte: cutoff } }, select: { id: true } }),
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: cutoff } },
        distinct: ['loggedByUserId'],
        select: { loggedByUserId: true },
      }),
    ]);
    const set = new Set<string>();
    for (const u of loginUsers) set.add(u.id);
    for (const t of txnUsers) set.add(t.loggedByUserId);
    return set.size;
  }

  async growth(q: MetricRangeQuery): Promise<GrowthMetrics> {
    const { from, to } = this.resolveRange(q);
    return this.cached(this.rangeKey('growth', from, to), async () => {
      const now = new Date();
      const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
      // dau/wau/mau use 1/7/30-day cutoffs; the 7- and 30-day active counts are
      // reused for activeLast{7,30}Pct (same window by definition — compute once).
      const [totalUsers, totalWorkspaces, paidWorkspaces, signups, dau, wau, mau] =
        await Promise.all([
          this.prisma.user.count(),
          this.prisma.workspace.count(),
          this.prisma.workspace.count({ where: { tier: { not: 'FREE' } } }),
          this.dailySeries('users', 'createdAt', from, to),
          this.activeUserCount(day(1)),
          this.activeUserCount(day(7)),
          this.activeUserCount(day(30)),
        ]);
      const pct = (n: number) => (totalUsers === 0 ? 0 : Math.round((n / totalUsers) * 1000) / 10);
      return {
        totalUsers,
        totalWorkspaces,
        signups,
        dau,
        wau,
        mau,
        activeLast7Pct: pct(wau),
        activeLast30Pct: pct(mau),
        tierSplit: { free: totalWorkspaces - paidWorkspaces, paid: paidWorkspaces },
      };
    });
  }

  private bucketStreak(streak: number): '0' | '1-6' | '7-29' | '30+' {
    if (streak <= 0) return '0';
    if (streak < 7) return '1-6';
    if (streak < 30) return '7-29';
    return '30+';
  }

  /** Count distinct workspaceIds that have ≥1 row in a feature table. */
  private async distinctWorkspaces(
    rows: Promise<{ workspaceId: string }[]>,
  ): Promise<number> {
    const set = new Set((await rows).map((r) => r.workspaceId));
    return set.size;
  }

  async engagement(q: MetricRangeQuery): Promise<EngagementMetrics> {
    const { from, to } = this.resolveRange(q);
    return this.cached(this.rangeKey('engagement', from, to), async () => {
      const now = new Date();
      const [totalTransactions, transactionsPerDay, conversations, chatMessages, users, budgets, portfolio, alerts, mau] =
        await Promise.all([
          this.prisma.transaction.count(),
          this.dailySeries('transactions', 'createdAt', from, to),
          this.prisma.conversation.count(),
          this.prisma.conversationMessage.count(),
          this.prisma.user.findMany({ select: { currentStreak: true } }),
          this.distinctWorkspaces(
            this.prisma.budget.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.distinctWorkspaces(
            this.prisma.portfolioHolding.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.distinctWorkspaces(
            this.prisma.alert.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.activeUserCount(new Date(now.getTime() - 30 * 86_400_000)),
        ]);

      const buckets: Record<'0' | '1-6' | '7-29' | '30+', number> = { '0': 0, '1-6': 0, '7-29': 0, '30+': 0 };
      for (const u of users) buckets[this.bucketStreak(u.currentStreak)] += 1;

      return {
        totalTransactions,
        transactionsPerDay,
        avgTransactionsPerActiveUser: mau === 0 ? 0 : Math.round((totalTransactions / mau) * 10) / 10,
        conversations,
        chatMessages,
        streakDistribution: (['0', '1-6', '7-29', '30+'] as const).map((b) => ({ bucket: b, users: buckets[b] })),
        featureAdoption: { budgets, portfolio, alerts },
      };
    });
  }
}
