import { Injectable } from '@nestjs/common';
import { AchievementCategory, AchievementTier } from '@prisma/client';
import type { AchievementDef, UserAchievement } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type UnlockedAchievement = UserAchievement & { achievementDef: AchievementDef };

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
  renderBadgeSvg(_slug: string, tier: AchievementTier, category: AchievementCategory): string {
    const tierStyles: Record<AchievementTier, { fill: string; stroke: string }> = {
      [AchievementTier.BRONZE]: { fill: '#CD7F32', stroke: '#A0522D' },
      [AchievementTier.SILVER]: { fill: '#C0C0C0', stroke: '#808080' },
      [AchievementTier.GOLD]: { fill: '#FFD700', stroke: '#B8860B' },
    };

    const { fill, stroke } = tierStyles[tier];

    const categoryIcons: Record<AchievementCategory, string> = {
      [AchievementCategory.STREAK]: `<path d="M100 72 C90 86 80 96 85 110 C88 119 95 124 100 124 C105 124 112 119 115 110 C120 96 110 86 100 72Z" fill="#ffffff"/>
      <path d="M100 94 C97 102 96 110 100 116 C104 110 103 102 100 94Z" fill="${fill}"/>`,

      [AchievementCategory.TRANSACTIONS]: `<rect x="82" y="106" width="9" height="18" rx="2" fill="#ffffff"/>
      <rect x="96" y="95"  width="9" height="29" rx="2" fill="#ffffff"/>
      <rect x="110" y="84" width="9" height="40" rx="2" fill="#ffffff"/>`,

      [AchievementCategory.GOALS]: `<circle cx="100" cy="100" r="22" fill="none" stroke="#ffffff" stroke-width="3"/>
      <circle cx="100" cy="100" r="13" fill="none" stroke="#ffffff" stroke-width="2"/>
      <circle cx="100" cy="100" r="5"  fill="#ffffff"/>`,
    };

    const icon = categoryIcons[category];

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect x="8" y="8" width="184" height="184" rx="28" fill="#12122a"/>
  <rect x="65" y="65" width="70" height="70" rx="8"
        transform="rotate(45 100 100)"
        fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
  ${icon}
</svg>`;
  }
}
