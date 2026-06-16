import { Injectable } from '@nestjs/common';
import type { SubscriptionTier, AnnouncementView } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toAnnouncementView } from './announcement.types';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective tier = tier of the workspace this user OWNs (FREE if none). */
  private async resolveTier(userId: string): Promise<SubscriptionTier> {
    const m = await this.prisma.workspaceMember.findFirst({
      where: { userId, role: 'OWNER' },
      select: { workspace: { select: { tier: true } } },
    });
    return m?.workspace.tier ?? 'FREE';
  }

  /** The single next announcement for this user, or null. Server decides:
   *  published, within publish/expiry window, tier-matched, not yet dismissed. */
  async getActive(userId: string): Promise<AnnouncementView | null> {
    const tier = await this.resolveTier(userId);
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ targetTier: null }, { targetTier: tier }],
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
        interactions: { none: { userId, dismissedAt: { not: null } } },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      take: 1,
    });
    return rows[0] ? toAnnouncementView(rows[0]) : null;
  }

  /** Record an impression (idempotent: seenAt is set once, on create). */
  async markSeen(announcementId: string, userId: string): Promise<void> {
    await this.prisma.announcementInteraction.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });
  }

  /** Record a dismissal (idempotent). Replaces the old preferences write. */
  async markDismissed(announcementId: string, userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.announcementInteraction.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId, dismissedAt: now },
      update: { dismissedAt: now },
    });
  }
}
