-- Admin two-step sign-in (authenticator app / TOTP). Additive only.
ALTER TABLE "admin_users" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaSecret" TEXT;

-- Shared fixed-window rate-limit counters (one row per key per window).
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","windowStart")
);

CREATE INDEX "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

-- Same rule as every other table: the app connects as the owner (bypasses RLS);
-- Supabase's anon/authenticated API roles get no access at all.
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
