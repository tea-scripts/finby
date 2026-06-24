-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acceptedTermsAt" TIMESTAMP(3),
ADD COLUMN     "acceptedTermsVersion" TEXT;

-- Backfill existing users: stamp acceptance to their signup date with a marker
-- version (we don't have the exact ToS version they originally accepted under
-- the prior client-side gate).
UPDATE "users"
SET "acceptedTermsAt" = "createdAt",
    "acceptedTermsVersion" = 'pre-2026-06'
WHERE "acceptedTermsAt" IS NULL;
