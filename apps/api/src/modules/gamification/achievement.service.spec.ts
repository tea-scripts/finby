import { AchievementCategory, AchievementTier } from '@prisma/client';
import type { AchievementDef } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AchievementService } from './achievement.service';

function def(partial: Partial<AchievementDef> & { id: string; slug: string }): AchievementDef {
  return {
    category: AchievementCategory.STREAK,
    tier: AchievementTier.BRONZE,
    threshold: 7,
    label: 'Label',
    description: 'Description',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  } as AchievementDef;
}

function buildPrisma(opts: {
  eligible?: AchievementDef[];
  owned?: { achievementDefId: string }[];
  allDefs?: AchievementDef[];
  userAchievements?: { achievementDefId: string; achievementDef: AchievementDef }[];
}) {
  const defFindMany = jest
    .fn()
    .mockResolvedValueOnce(opts.eligible ?? opts.allDefs ?? []);
  const uaFindMany = jest.fn().mockResolvedValue(opts.owned ?? opts.userAchievements ?? []);
  const uaCreate = jest.fn((args: { data: { userId: string; achievementDefId: string } }) => ({
    id: `ua-${args.data.achievementDefId}`,
    userId: args.data.userId,
    achievementDefId: args.data.achievementDefId,
    unlockedAt: new Date('2026-06-17T00:00:00Z'),
    achievementDef: (opts.eligible ?? []).find((d) => d.id === args.data.achievementDefId),
  }));
  const $transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

  const prisma = {
    achievementDef: { findMany: defFindMany },
    userAchievement: { findMany: uaFindMany, create: uaCreate },
    $transaction,
  } as unknown as PrismaService;

  return { prisma, defFindMany, uaFindMany, uaCreate, $transaction };
}

describe('AchievementService.checkAndUnlock', () => {
  it('returns [] when no threshold is crossed', async () => {
    const { prisma, uaCreate } = buildPrisma({ eligible: [] });
    const service = new AchievementService(prisma);

    const result = await service.checkAndUnlock('u1', AchievementCategory.STREAK, 3);

    expect(result).toEqual([]);
    expect(uaCreate).not.toHaveBeenCalled();
  });

  it('unlocks a BRONZE achievement when the value reaches its threshold', async () => {
    const bronze = def({ id: 'b', slug: 'streak-bronze', threshold: 7 });
    const { prisma, uaCreate } = buildPrisma({ eligible: [bronze], owned: [] });
    const service = new AchievementService(prisma);

    const result = await service.checkAndUnlock('u1', AchievementCategory.STREAK, 7);

    expect(uaCreate).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.achievementDef.slug).toBe('streak-bronze');
  });

  it('is idempotent — does not re-unlock an already-owned achievement', async () => {
    const bronze = def({ id: 'b', slug: 'streak-bronze', threshold: 7 });
    const { prisma, uaCreate } = buildPrisma({ eligible: [bronze], owned: [{ achievementDefId: 'b' }] });
    const service = new AchievementService(prisma);

    const result = await service.checkAndUnlock('u1', AchievementCategory.STREAK, 30);

    expect(result).toEqual([]);
    expect(uaCreate).not.toHaveBeenCalled();
  });

  it('unlocks multiple tiers crossed in a single call', async () => {
    const bronze = def({ id: 'b', slug: 'streak-bronze', threshold: 7, tier: AchievementTier.BRONZE });
    const silver = def({ id: 's', slug: 'streak-silver', threshold: 30, tier: AchievementTier.SILVER });
    const { prisma, uaCreate } = buildPrisma({ eligible: [bronze, silver], owned: [] });
    const service = new AchievementService(prisma);

    const result = await service.checkAndUnlock('u1', AchievementCategory.STREAK, 30);

    expect(uaCreate).toHaveBeenCalledTimes(2);
    expect(result.map((r) => r.achievementDef.slug)).toEqual(['streak-bronze', 'streak-silver']);
  });
});

describe('AchievementService.getUserAchievements', () => {
  it('splits definitions into unlocked and locked', async () => {
    const bronze = def({ id: 'b', slug: 'streak-bronze' });
    const silver = def({ id: 's', slug: 'streak-silver', tier: AchievementTier.SILVER, threshold: 30 });
    const gold = def({ id: 'g', slug: 'streak-gold', tier: AchievementTier.GOLD, threshold: 100 });
    const { prisma } = buildPrisma({
      allDefs: [bronze, silver, gold],
      userAchievements: [{ achievementDefId: 'b', achievementDef: bronze }],
    });
    const service = new AchievementService(prisma);

    const { unlocked, locked } = await service.getUserAchievements('u1');

    expect(unlocked.map((u) => u.achievementDefId)).toEqual(['b']);
    expect(locked.map((d) => d.id)).toEqual(['s', 'g']);
  });
});

describe('AchievementService.renderBadgeSvg', () => {
  const service = new AchievementService({} as unknown as PrismaService);

  it('uses the BRONZE tier colour', () => {
    expect(
      service.renderBadgeSvg('streak-bronze', AchievementTier.BRONZE, AchievementCategory.STREAK),
    ).toContain('fill="#CD7F32"');
  });

  it('uses the SILVER tier colour', () => {
    expect(
      service.renderBadgeSvg('streak-silver', AchievementTier.SILVER, AchievementCategory.STREAK),
    ).toContain('fill="#C0C0C0"');
  });

  it('uses the GOLD tier colour', () => {
    expect(
      service.renderBadgeSvg('streak-gold', AchievementTier.GOLD, AchievementCategory.STREAK),
    ).toContain('fill="#FFD700"');
  });

  it('renders a flame (path) for the STREAK category', () => {
    expect(
      service.renderBadgeSvg('streak-bronze', AchievementTier.BRONZE, AchievementCategory.STREAK),
    ).toContain('<path');
  });

  it('renders bars (rect) for the TRANSACTIONS category', () => {
    expect(
      service.renderBadgeSvg('txn-bronze', AchievementTier.BRONZE, AchievementCategory.TRANSACTIONS),
    ).toContain('<rect');
  });

  it('renders a target (circle) for the GOALS category', () => {
    expect(
      service.renderBadgeSvg('goal-bronze', AchievementTier.BRONZE, AchievementCategory.GOALS),
    ).toContain('<circle');
  });

  it('includes the SVG xmlns and begins with <svg', () => {
    const svg = service.renderBadgeSvg('streak-gold', AchievementTier.GOLD, AchievementCategory.STREAK);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('uses no CSS variables or currentColor (renders standalone)', () => {
    const svg = service.renderBadgeSvg('goal-gold', AchievementTier.GOLD, AchievementCategory.GOALS);
    expect(svg).not.toContain('currentColor');
    expect(svg).not.toContain('var(');
  });
});
