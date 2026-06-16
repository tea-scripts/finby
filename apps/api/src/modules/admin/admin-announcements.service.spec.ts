import { PrismaService } from '../../prisma/prisma.service';
import { AdminAnnouncementsService } from './admin-announcements.service';

function buildPrisma() {
  return {
    announcement: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    announcementInteraction: { groupBy: jest.fn(), count: jest.fn() },
  };
}

const row = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks', body: 'b', emoji: '🔥', imageUrl: null, lottieKey: 'streak-flame',
  hashtag: 'New', confetti: true, steps: null, primaryLabel: 'Got it', primaryKind: 'DISMISS',
  targetTier: null, order: 0, publishAt: null, expiresAt: null,
  createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-02'),
};

describe('AdminAnnouncementsService.list', () => {
  it('returns announcements with derived seen/dismissed counts', async () => {
    const prisma = buildPrisma();
    prisma.announcement.findMany.mockResolvedValue([row]);
    prisma.announcementInteraction.groupBy
      .mockResolvedValueOnce([{ announcementId: 'an1', _count: { _all: 10 } }])  // seen
      .mockResolvedValueOnce([{ announcementId: 'an1', _count: { _all: 4 } }]);  // dismissed
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.list();

    expect(result[0]).toMatchObject({ id: 'an1', key: 'streaks-2026-06', seenCount: 10, dismissedCount: 4 });
  });
});

describe('AdminAnnouncementsService mutations', () => {
  it('create passes the input straight to prisma', async () => {
    const prisma = buildPrisma();
    prisma.announcement.create.mockResolvedValue(row);
    prisma.announcementInteraction.groupBy.mockResolvedValue([]);
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);

    await service.create({
      key: 'x', status: 'DRAFT', mode: 'SIMPLE', title: 't', body: 'b',
      confetti: false, primaryLabel: 'Got it', primaryKind: 'DISMISS', order: 0,
    } as never);

    expect(prisma.announcement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'x' }) });
  });

  it('update returns the announcement with its real interaction counts', async () => {
    const prisma = buildPrisma();
    prisma.announcement.update.mockResolvedValue(row);
    prisma.announcementInteraction.count
      .mockResolvedValueOnce(12)  // seen
      .mockResolvedValueOnce(5);  // dismissed
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.update('an1', { title: 'New title' } as never);

    expect(prisma.announcement.update).toHaveBeenCalledWith({
      where: { id: 'an1' },
      data: expect.objectContaining({ title: 'New title' }),
    });
    expect(result).toMatchObject({ id: 'an1', seenCount: 12, dismissedCount: 5 });
  });

  it('delete removes by id', async () => {
    const prisma = buildPrisma();
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);
    await service.delete('an1');
    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'an1' } });
  });
});
