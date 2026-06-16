import { Injectable } from '@nestjs/common';
import type { Announcement } from '@prisma/client';
import type { AdminAnnouncement } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from './dto/admin.schemas';
import { toAnnouncementView } from '../announcements/announcement.types';

@Injectable()
export class AdminAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  private toAdmin(a: Announcement, seen: number, dismissed: number): AdminAnnouncement {
    return {
      ...toAnnouncementView(a),
      key: a.key,
      status: a.status,
      targetTier: a.targetTier,
      order: a.order,
      publishAt: a.publishAt ? a.publishAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      seenCount: seen,
      dismissedCount: dismissed,
    };
  }

  async list(): Promise<AdminAnnouncement[]> {
    const [rows, seenGroups, dismissedGroups] = await Promise.all([
      this.prisma.announcement.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.announcementInteraction.groupBy({ by: ['announcementId'], _count: { _all: true } }),
      this.prisma.announcementInteraction.groupBy({
        by: ['announcementId'], where: { dismissedAt: { not: null } }, _count: { _all: true },
      }),
    ]);
    const seen = new Map(seenGroups.map((g) => [g.announcementId, g._count._all]));
    const dismissed = new Map(dismissedGroups.map((g) => [g.announcementId, g._count._all]));
    return rows.map((a) => this.toAdmin(a, seen.get(a.id) ?? 0, dismissed.get(a.id) ?? 0));
  }

  async create(input: CreateAnnouncementInput): Promise<AdminAnnouncement> {
    const a = await this.prisma.announcement.create({ data: input as never });
    return this.toAdmin(a, 0, 0);
  }

  /** Seen + dismissed counts for a single announcement. */
  private async countsFor(announcementId: string): Promise<{ seen: number; dismissed: number }> {
    const [seen, dismissed] = await Promise.all([
      this.prisma.announcementInteraction.count({ where: { announcementId } }),
      this.prisma.announcementInteraction.count({ where: { announcementId, dismissedAt: { not: null } } }),
    ]);
    return { seen, dismissed };
  }

  async update(id: string, input: UpdateAnnouncementInput): Promise<AdminAnnouncement> {
    const a = await this.prisma.announcement.update({ where: { id }, data: input as never });
    const { seen, dismissed } = await this.countsFor(a.id);
    return this.toAdmin(a, seen, dismissed);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.announcement.delete({ where: { id } });
  }
}
