import { Injectable } from '@nestjs/common';
import { AchievementCategory, AchievementTier } from '@prisma/client';
import type { AchievementDef, UserAchievement } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type UnlockedAchievement = UserAchievement & { achievementDef: AchievementDef };

const TIER_STYLE: Record<AchievementTier, { fill: string; stroke: string }> = {
  BRONZE: { fill: '#CD7F32', stroke: '#A0522D' },
  SILVER: { fill: '#C0C0C0', stroke: '#808080' },
  GOLD: { fill: '#FFD700', stroke: '#B8860B' },
};

/** Achievements unlock once when a tracked metric crosses a fixed threshold and
 *  are immutable afterwards. Badge art is generated on the fly (no asset files). */
@Injectable()
export class AchievementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unlock every not-yet-earned definition in `category` whose threshold the
   *  current value has reached. Idempotent: already-unlocked defs are skipped. */
  async checkAndUnlock(
    userId: string,
    category: AchievementCategory,
    currentValue: number,
  ): Promise<UnlockedAchievement[]> {
    const eligible = await this.prisma.achievementDef.findMany({
      where: { category, threshold: { lte: currentValue } },
    });
    if (eligible.length === 0) return [];

    const existing = await this.prisma.userAchievement.findMany({
      where: { userId, achievementDefId: { in: eligible.map((d) => d.id) } },
      select: { achievementDefId: true },
    });
    const owned = new Set(existing.map((e) => e.achievementDefId));
    const toUnlock = eligible.filter((d) => !owned.has(d.id));
    if (toUnlock.length === 0) return [];

    return this.prisma.$transaction(
      toUnlock.map((d) =>
        this.prisma.userAchievement.create({
          data: { userId, achievementDefId: d.id },
          include: { achievementDef: true },
        }),
      ),
    );
  }

  /** Split all definitions into the user's unlocked records and the remaining
   *  locked definitions. */
  async getUserAchievements(
    userId: string,
  ): Promise<{ unlocked: UnlockedAchievement[]; locked: AchievementDef[] }> {
    const [defs, unlocked] = await Promise.all([
      this.prisma.achievementDef.findMany(),
      this.prisma.userAchievement.findMany({
        where: { userId },
        include: { achievementDef: true },
      }),
    ]);
    const unlockedIds = new Set(unlocked.map((u) => u.achievementDefId));
    const locked = defs.filter((d) => !unlockedIds.has(d.id));
    return { unlocked, locked };
  }

  /** Render a self-contained badge SVG: a tier-coloured diamond over a dark
   *  card, with a category glyph. Pure — no DB access. */
  renderBadgeSvg(slug: string, tier: AchievementTier, category: AchievementCategory): string {
    const style = TIER_STYLE[tier];
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"` +
      ` role="img" aria-label="${slug}" data-slug="${slug}">` +
      `<rect x="0" y="0" width="200" height="200" rx="24" fill="#1a1a2e"/>` +
      `<rect x="65" y="65" width="70" height="70" rx="8" transform="rotate(45 100 100)"` +
      ` fill="${style.fill}" stroke="${style.stroke}" stroke-width="4"/>` +
      this.categoryIcon(category) +
      `</svg>`
    );
  }

  private categoryIcon(category: AchievementCategory): string {
    switch (category) {
      case AchievementCategory.STREAK:
        return (
          `<path d="M100 76 C92 88 84 96 88 108 C90 116 96 120 100 120 C104 120 110 116 112 108` +
          ` C116 96 108 88 100 76Z M100 95 C97 101 96 107 100 112 C104 107 103 101 100 95Z" fill="#ffffff"/>`
        );
      case AchievementCategory.TRANSACTIONS:
        return (
          `<rect x="82" y="104" width="8" height="16" rx="2" fill="#ffffff"/>` +
          `<rect x="96" y="94" width="8" height="26" rx="2" fill="#ffffff"/>` +
          `<rect x="110" y="84" width="8" height="36" rx="2" fill="#ffffff"/>`
        );
      case AchievementCategory.GOALS:
        return (
          `<circle cx="100" cy="100" r="20" fill="none" stroke="#ffffff" stroke-width="3"/>` +
          `<circle cx="100" cy="100" r="12" fill="none" stroke="#ffffff" stroke-width="2"/>` +
          `<circle cx="100" cy="100" r="4" fill="#ffffff"/>`
        );
    }
  }
}
