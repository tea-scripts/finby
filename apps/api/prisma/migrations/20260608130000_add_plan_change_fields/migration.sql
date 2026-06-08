-- AlterTable: pending plan-downgrade scheduled for period end
ALTER TABLE "subscriptions" ADD COLUMN "pendingTier" "SubscriptionTier";
ALTER TABLE "subscriptions" ADD COLUMN "pendingTierEffectiveAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "stripeScheduleId" TEXT;
