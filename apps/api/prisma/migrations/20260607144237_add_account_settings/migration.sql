-- AlterTable
ALTER TABLE "users" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "preferences" JSONB;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "preferredCurrencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: assign account numbers to existing users (FB- + 9-digit number, first digit 1-9)
UPDATE "users"
SET "accountNumber" = 'FB-' || lpad((floor(random() * 900000000) + 100000000)::bigint::text, 9, '0')
WHERE "accountNumber" IS NULL;

-- Backfill: set preferredCurrencies to [baseCurrency] for existing workspaces
UPDATE "workspaces"
SET "preferredCurrencies" = ARRAY["baseCurrency"]
WHERE "preferredCurrencies" = ARRAY[]::text[];

-- CreateIndex (after backfill so no unique violation on NULL-populated rows)
CREATE UNIQUE INDEX "users_accountNumber_key" ON "users"("accountNumber");
