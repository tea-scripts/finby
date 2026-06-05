-- AlterEnum
ALTER TYPE "BillingProvider" ADD VALUE 'LEMONSQUEEZY';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "lemonSqueezyCustomerId" TEXT,
ADD COLUMN     "lemonSqueezySubscriptionId" TEXT;
