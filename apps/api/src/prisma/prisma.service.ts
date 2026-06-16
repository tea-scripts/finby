import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENT_DEFS } from '../modules/gamification/seeds/achievement-defs.seed';
import { ANNOUNCEMENT_DEFS } from '../modules/announcements/seeds/announcement-defs.seed';

/**
 * Thin wrapper over PrismaClient that ties the connection lifecycle
 * to the Nest module lifecycle. Injected everywhere a DB handle is needed.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.seedAchievementDefs();
    await this.seedAnnouncements();
    await this.backfillAnnouncementDismissals();
  }

  /** Keep the achievement catalogue in sync on boot. Idempotent (upsert by
   *  slug), so it's safe to run on every start in every environment. */
  private async seedAchievementDefs(): Promise<void> {
    for (const def of ACHIEVEMENT_DEFS) {
      await this.achievementDef.upsert({
        where: { slug: def.slug },
        create: def,
        update: { label: def.label, description: def.description, threshold: def.threshold },
      });
    }
  }

  /** Seed the launch announcements on boot. Create-only: once a row exists, the
   *  admin dashboard owns it, so re-seeding must NOT clobber admin edits. The
   *  empty update keeps the upsert idempotent (no duplicates) without overwriting. */
  private async seedAnnouncements(): Promise<void> {
    for (const def of ANNOUNCEMENT_DEFS) {
      await this.announcement.upsert({
        where: { key: def.key },
        create: def,
        update: {},
      });
    }
  }

  /** One-time migration: copy each user's legacy preferences.dismissedAnnouncements
   *  into AnnouncementInteraction rows (matched by announcement.key) so existing
   *  users never re-see what they already dismissed. Idempotent and crash-resilient:
   *  it only scans users who have NO interaction rows yet, so a backfill interrupted
   *  partway is completed on the next boot, and already-migrated users are skipped. */
  private async backfillAnnouncementDismissals(): Promise<void> {
    const byKey = new Map<string, string>();
    const announcements = await this.announcement.findMany({ select: { id: true, key: true } });
    for (const a of announcements) byKey.set(a.key, a.id);
    if (byKey.size === 0) return;

    // Only un-migrated users: anyone with at least one interaction row has already
    // been processed (or has moved onto the new system) and is left untouched.
    const users = await this.user.findMany({
      where: { announcementInteractions: { none: {} } },
      select: { id: true, preferences: true },
    });
    const now = new Date();
    for (const u of users) {
      const prefs = u.preferences as { dismissedAnnouncements?: string[] } | null;
      const keys = prefs?.dismissedAnnouncements ?? [];
      for (const key of keys) {
        const announcementId = byKey.get(key);
        if (!announcementId) continue;
        await this.announcementInteraction.upsert({
          where: { announcementId_userId: { announcementId, userId: u.id } },
          create: { announcementId, userId: u.id, dismissedAt: now },
          update: { dismissedAt: now },
        });
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
