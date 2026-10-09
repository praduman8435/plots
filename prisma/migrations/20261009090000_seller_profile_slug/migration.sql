-- DropIndex
DROP INDEX "properties_sellerId_idx";

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "profileSlug" TEXT;

-- CreateIndex
CREATE INDEX "properties_sellerId_status_idx" ON "properties"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_profileSlug_key" ON "sellers"("profileSlug");


-- ─── Backfill (hand-written) ───
-- name → url-safe words, plus the random part of the Seller ID (unique), e.g. "praduman-rp44qh".
-- Names without Latin letters (e.g. Devanagari) fall back to "seller-<suffix>".
UPDATE "sellers"
SET "profileSlug" = COALESCE(
    NULLIF(TRIM(BOTH '-' FROM LEFT(REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g'), 40)), ''),
    'seller'
  ) || '-' || LOWER(SUBSTRING("code" FROM 5))
WHERE "profileSlug" IS NULL;
