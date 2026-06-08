-- AlterTable: track when renewal-expiry reminder emails were sent (cleared on renewal)
ALTER TABLE "subscriptions" ADD COLUMN "renewalReminder7SentAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "renewalReminder3SentAt" TIMESTAMP(3);
