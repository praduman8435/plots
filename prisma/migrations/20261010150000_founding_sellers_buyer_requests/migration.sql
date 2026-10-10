-- CreateEnum
CREATE TYPE "BuyerRequestStatus" AS ENUM ('OPEN', 'CONTACTED', 'CLOSED');

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "foundingNumber" INTEGER,
ADD COLUMN     "isFounding" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "buyer_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL,
    "area" TEXT,
    "cityId" TEXT,
    "landType" "LandType",
    "budgetMax" BIGINT,
    "status" "BuyerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "buyer_requests_status_updatedAt_idx" ON "buyer_requests"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "buyer_requests_placeKey_status_idx" ON "buyer_requests"("placeKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_requests_phone_placeKey_key" ON "buyer_requests"("phone", "placeKey");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_foundingNumber_key" ON "sellers"("foundingNumber");

-- AddForeignKey
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Supabase exposes "public" through its API: like every other table, no access without a policy.
ALTER TABLE "buyer_requests" ENABLE ROW LEVEL SECURITY;

-- Guards the app already enforces, so bad data can't get in by any other path.
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_founding_number_check" CHECK ("foundingNumber" IS NULL OR "foundingNumber" >= 1);
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_founding_flag_check" CHECK ("isFounding" = ("foundingNumber" IS NOT NULL));
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_lengths_check" CHECK (
  char_length("name") BETWEEN 2 AND 60 AND char_length("place") BETWEEN 2 AND 60 AND char_length("placeKey") BETWEEN 2 AND 60
  AND ("area" IS NULL OR char_length("area") <= 80)
);
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_budget_check" CHECK ("budgetMax" IS NULL OR "budgetMax" > 0);
