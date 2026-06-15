import type { PrismaService } from '../../prisma/prisma.service';
import { StreaksService } from './streaks.service';

// Fixed "now" passed in so the window is deterministic without mocking time.
const NOON_UTC = new Date('2026-06-15T12:00:00Z');

function setupCalendar(opts: {
  timezone?: string;
  lastStreakRepairDate?: string | null;
  txnCreatedAt?: Date[];
}) {
  const findUnique = jest.fn().mockResolvedValue({
    timezone: opts.timezone ?? 'UTC',
    lastStreakRepairDate: opts.lastStreakRepairDate ?? null,
  });
  const txnFindMany = jest
    .fn()
    .mockResolvedValue((opts.txnCreatedAt ?? []).map((createdAt) => ({ createdAt })));
  const prisma = {
    user: { findUnique },
    transaction: { findMany: txnFindMany },
  } as unknown as PrismaService;
  return { service: new StreaksService(prisma), txnFindMany };
}

describe('StreaksService.getCalendar', () => {
  it('returns active days bucketed from transaction createdAt within the window', async () => {
    const { service } = setupCalendar({
      txnCreatedAt: [new Date('2026-06-10T09:00:00Z'), new Date('2026-06-14T09:00:00Z')],
    });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.from).toBe('2025-12-15');
    expect(cal.to).toBe('2026-06-15');
    expect(cal.activeDays).toEqual(['2026-06-10', '2026-06-14']);
    expect(cal.repairedDays).toEqual([]);
  });

  it('includes the latest repair when it falls inside the window', async () => {
    const { service } = setupCalendar({ lastStreakRepairDate: '2026-06-13' });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.repairedDays).toEqual(['2026-06-13']);
  });

  it('excludes a repair that predates the ~6-month window', async () => {
    const { service } = setupCalendar({ lastStreakRepairDate: '2024-01-01' });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.repairedDays).toEqual([]);
  });

  it('aligns the DB cutoff to local midnight of the window start (DST-safe)', async () => {
    const { service, txnFindMany } = setupCalendar({ timezone: 'America/New_York' });

    const cal = await service.getCalendar('u1', NOON_UTC);

    // Jun 15 2026 is EDT (UTC-4); 183 days back lands in EST (UTC-5).
    expect(cal.from).toBe('2025-12-14');
    // The query lower bound must be local midnight of `from` (EST = 05:00 UTC),
    // not the raw subtracted epoch (04:00 UTC) — otherwise Dec 14 logs are dropped.
    expect(txnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loggedByUserId: 'u1',
          createdAt: { gte: new Date('2025-12-14T05:00:00.000Z') },
        }),
      }),
    );
  });
});
