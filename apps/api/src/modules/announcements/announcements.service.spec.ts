import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementsService } from './announcements.service';

function buildPrisma() {
  return {
    workspaceMember: { findFirst: jest.fn() },
    announcement: { findMany: jest.fn() },
    announcementInteraction: { upsert: jest.fn() },
  };
}

const row = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks are here', body: 'Log daily', emoji: '🔥', imageUrl: null,
  lottieKey: 'streak-flame', hashtag: 'New', confetti: true, steps: null,
  primaryLabel: 'Got it', primaryKind: 'DISMISS', targetTier: null, order: 0,
  publishAt: null, expiresAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('AnnouncementsService.getActive', () => {
  it('resolves the owner tier and returns the first matching announcement as a view', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.findFirst.mockResolvedValue({ workspace: { tier: 'PRO' } });
    prisma.announcement.findMany.mockResolvedValue([row]);
    const service = new AnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.getActive('u1');

    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', role: 'OWNER' },
      select: { workspace: { select: { tier: true } } },
    });
    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          OR: [{ targetTier: null }, { targetTier: 'PRO' }],
          interactions: { none: { userId: 'u1', dismissedAt: { not: null } } },
        }),
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 1,
      }),
    );
    expect(result).toMatchObject({ id: 'an1', lottieKey: 'streak-flame', primaryKind: 'DISMISS' });
  });

  it('defaults to FREE tier when the user owns no workspace, and returns null when none match', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.findFirst.mockResolvedValue(null);
    prisma.announcement.findMany.mockResolvedValue([]);
    const service = new AnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.getActive('u1');

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ targetTier: null }, { targetTier: 'FREE' }] }),
      }),
    );
    expect(result).toBeNull();
  });
});

describe('AnnouncementsService interactions', () => {
  it('markSeen upserts without overwriting an existing seenAt', async () => {
    const prisma = buildPrisma();
    const service = new AnnouncementsService(prisma as unknown as PrismaService);
    await service.markSeen('an1', 'u1');
    expect(prisma.announcementInteraction.upsert).toHaveBeenCalledWith({
      where: { announcementId_userId: { announcementId: 'an1', userId: 'u1' } },
      create: { announcementId: 'an1', userId: 'u1' },
      update: {},
    });
  });

  it('markDismissed stamps dismissedAt on create and update', async () => {
    const prisma = buildPrisma();
    const service = new AnnouncementsService(prisma as unknown as PrismaService);
    await service.markDismissed('an1', 'u1');
    const call = prisma.announcementInteraction.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ announcementId_userId: { announcementId: 'an1', userId: 'u1' } });
    expect(call.create.dismissedAt).toBeInstanceOf(Date);
    expect(call.update.dismissedAt).toBeInstanceOf(Date);
  });
});
