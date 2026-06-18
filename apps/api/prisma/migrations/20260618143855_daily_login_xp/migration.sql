-- AlterEnum
ALTER TYPE "XpEvent" ADD VALUE 'DAILY_LOGIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastDailyXpDate" TEXT;
