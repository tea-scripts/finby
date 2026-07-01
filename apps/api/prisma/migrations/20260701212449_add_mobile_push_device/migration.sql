-- CreateTable
CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushDevice_expoPushToken_key" ON "MobilePushDevice"("expoPushToken");

-- CreateIndex
CREATE INDEX "MobilePushDevice_workspaceId_userId_idx" ON "MobilePushDevice"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
