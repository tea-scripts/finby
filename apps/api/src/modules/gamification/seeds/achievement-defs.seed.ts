import { AchievementCategory, AchievementTier } from '@prisma/client';

/** Canonical achievement catalogue. Upserted on boot so every environment
 *  (including production) always has the full, current set by slug. */
export const ACHIEVEMENT_DEFS = [
  { slug: 'streak-bronze', category: AchievementCategory.STREAK, tier: AchievementTier.BRONZE, threshold: 7, label: 'Week Warrior', description: 'Maintain a 7-day streak' },
  { slug: 'streak-silver', category: AchievementCategory.STREAK, tier: AchievementTier.SILVER, threshold: 30, label: 'Month Master', description: 'Maintain a 30-day streak' },
  { slug: 'streak-gold', category: AchievementCategory.STREAK, tier: AchievementTier.GOLD, threshold: 100, label: 'Century Saver', description: 'Maintain a 100-day streak' },
  { slug: 'txn-bronze', category: AchievementCategory.TRANSACTIONS, tier: AchievementTier.BRONZE, threshold: 10, label: 'First Steps', description: 'Log 10 transactions' },
  { slug: 'txn-silver', category: AchievementCategory.TRANSACTIONS, tier: AchievementTier.SILVER, threshold: 50, label: 'Habit Builder', description: 'Log 50 transactions' },
  { slug: 'txn-gold', category: AchievementCategory.TRANSACTIONS, tier: AchievementTier.GOLD, threshold: 200, label: 'Tracker Pro', description: 'Log 200 transactions' },
  { slug: 'goal-bronze', category: AchievementCategory.GOALS, tier: AchievementTier.BRONZE, threshold: 1, label: 'Goal Getter', description: 'Hit your first budget goal' },
  { slug: 'goal-silver', category: AchievementCategory.GOALS, tier: AchievementTier.SILVER, threshold: 5, label: 'Streak Saver', description: 'Hit 5 budget goals' },
  { slug: 'goal-gold', category: AchievementCategory.GOALS, tier: AchievementTier.GOLD, threshold: 20, label: 'Budget Boss', description: 'Hit 20 budget goals' },
] as const;
