import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENT_DEFS } from '../modules/gamification/seeds/achievement-defs.seed';

/**
 * Thin wrapper over PrismaClient that ties the connection lifecycle
 * to the Nest module lifecycle. Injected everywhere a DB handle is needed.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.seedAchievementDefs();
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

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
