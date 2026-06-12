-- CreateTable
CREATE TABLE "admin_totp_secrets" (
    "email" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_totp_secrets_pkey" PRIMARY KEY ("email")
);
