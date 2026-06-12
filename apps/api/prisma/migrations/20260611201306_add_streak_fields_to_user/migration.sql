-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastStreakDate" TEXT,
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0;
