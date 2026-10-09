-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('LISTING', 'PROFILE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('PROPERTY_SOLD', 'DUPLICATE_LISTING', 'FRAUD', 'INCORRECT_INFO', 'WRONG_LOCATION', 'FAKE_PROFILE', 'DUPLICATE_PROFILE', 'MISLEADING_LISTINGS', 'ABUSIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportOutcome" AS ENUM ('NO_ACTION', 'LISTING_MARKED_SOLD', 'LISTING_HIDDEN', 'LISTING_REJECTED', 'SELLER_CONTACTED', 'SELLER_SUSPENDED', 'DETAILS_CORRECTED', 'OTHER');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "target" "ReportTarget" NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "propertyId" TEXT,
    "sellerId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "reporterSellerId" TEXT,
    "reporterKey" TEXT NOT NULL,
    "reporterIpHash" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "ReportOutcome",
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "assignedAdminId" TEXT,
    "resolutionNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reportId" TEXT,
    "propertyId" TEXT,
    "sellerId" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_code_key" ON "reports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reports_dedupeKey_key" ON "reports"("dedupeKey");

-- CreateIndex
CREATE INDEX "reports_status_priority_createdAt_idx" ON "reports"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "reports_target_reason_createdAt_idx" ON "reports"("target", "reason", "createdAt");

-- CreateIndex
CREATE INDEX "reports_propertyId_createdAt_idx" ON "reports"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_sellerId_createdAt_idx" ON "reports"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_reporterKey_createdAt_idx" ON "reports"("reporterKey", "createdAt");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_reportId_createdAt_idx" ON "audit_logs"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_propertyId_createdAt_idx" ON "audit_logs"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_sellerId_createdAt_idx" ON "audit_logs"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterSellerId_fkey" FOREIGN KEY ("reporterSellerId") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity the app also enforces, kept in the database too.
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches" CHECK (("target" = 'LISTING') = ("propertyId" IS NOT NULL));
ALTER TABLE "reports" ADD CONSTRAINT "reports_other_needs_description" CHECK ("reason" <> 'OTHER' OR length(btrim(coalesce("description", ''))) >= 10);
ALTER TABLE "reports" ADD CONSTRAINT "reports_description_length" CHECK ("description" IS NULL OR length("description") <= 1000);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_note_length" CHECK ("note" IS NULL OR length("note") <= 2000);

-- Same rule as every table: the app connects as the owner; Supabase's public API roles get nothing.
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
