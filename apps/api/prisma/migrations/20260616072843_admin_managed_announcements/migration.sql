-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AnnouncementMode" AS ENUM ('SIMPLE', 'STEPS');

-- CreateEnum
CREATE TYPE "AnnouncementPrimaryKind" AS ENUM ('DISMISS', 'ENABLE_PUSH');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "AnnouncementMode" NOT NULL DEFAULT 'SIMPLE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "emoji" TEXT,
    "imageUrl" TEXT,
    "lottieKey" TEXT,
    "hashtag" TEXT,
    "confetti" BOOLEAN NOT NULL DEFAULT false,
    "steps" JSONB,
    "primaryLabel" TEXT NOT NULL,
    "primaryKind" "AnnouncementPrimaryKind" NOT NULL DEFAULT 'DISMISS',
    "targetTier" "SubscriptionTier",
    "order" INTEGER NOT NULL DEFAULT 0,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementInteraction" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_key_key" ON "Announcement"("key");

-- CreateIndex
CREATE INDEX "Announcement_status_order_idx" ON "Announcement"("status", "order");

-- CreateIndex
CREATE INDEX "AnnouncementInteraction_announcementId_idx" ON "AnnouncementInteraction"("announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementInteraction_announcementId_userId_key" ON "AnnouncementInteraction"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "AnnouncementInteraction" ADD CONSTRAINT "AnnouncementInteraction_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementInteraction" ADD CONSTRAINT "AnnouncementInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
