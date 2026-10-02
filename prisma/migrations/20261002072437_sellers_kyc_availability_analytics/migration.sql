-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

-- AlterEnum
ALTER TYPE "LandType" ADD VALUE 'OTHER';

-- Rename (not drop): attempts are now keyed "ip:<ip>" / "email:<email>"
DROP INDEX "admin_login_attempts_ip_createdAt_idx";
ALTER TABLE "admin_login_attempts" RENAME COLUMN "ip" TO "key";
UPDATE "admin_login_attempts" SET "key" = 'ip:' || "key";

-- AlterTable
ALTER TABLE "otp_challenges" ADD COLUMN     "ip" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "availabilityResponseAt" TIMESTAMP(3),
ADD COLUMN     "freshnessAt" TIMESTAMP(3),
ADD COLUMN     "lastAvailabilityCheckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "identityMasked" TEXT,
ADD COLUMN     "identityProvider" TEXT,
ADD COLUMN     "identityReference" TEXT,
ADD COLUMN     "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "kyc_attempts" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "masked" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "kyc_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visitorId" TEXT,
    "sellerId" TEXT,
    "propertyId" TEXT,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_attempts_sellerId_createdAt_idx" ON "kyc_attempts"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_name_createdAt_idx" ON "analytics_events"("name", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");

-- CreateIndex
CREATE INDEX "admin_login_attempts_key_createdAt_idx" ON "admin_login_attempts"("key", "createdAt");

-- CreateIndex
CREATE INDEX "otp_challenges_createdAt_idx" ON "otp_challenges"("createdAt");

-- CreateIndex
CREATE INDEX "otp_challenges_ip_createdAt_idx" ON "otp_challenges"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "properties_status_freshnessAt_idx" ON "properties"("status", "freshnessAt");

-- CreateIndex
CREATE INDEX "properties_status_availabilityCheckSentAt_idx" ON "properties"("status", "availabilityCheckSentAt");

-- AddForeignKey
ALTER TABLE "kyc_attempts" ADD CONSTRAINT "kyc_attempts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Data backfill (hand-written) ───
-- Seller IDs move from PLT-XXXXXX to SLR-XXXXXX (same random suffix, so nothing is guessable).
UPDATE "sellers" SET "code" = 'SLR-' || substring("code" from 5) WHERE "code" LIKE 'PLT-%';
-- Sellers that already exist are fully registered.
UPDATE "sellers" SET "onboardedAt" = "createdAt" WHERE "onboardedAt" IS NULL;
-- Freshness = latest of publish / seller confirmation.
UPDATE "properties" SET "freshnessAt" = GREATEST("publishedAt", "lastConfirmedAt") WHERE "publishedAt" IS NOT NULL OR "lastConfirmedAt" IS NOT NULL;
