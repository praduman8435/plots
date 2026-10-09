-- Index for the default "Recommended" order used by search, the home page and city pages:
--   WHERE status = 'ACTIVE' ORDER BY "freshnessAt" DESC NULLS LAST, "publishedAt" DESC, id
-- The old (status, freshnessAt ASC) index couldn't serve that order, so Postgres scanned and
-- sorted every live plot (measured: seq scan + sort at 35k live rows). NULLS LAST must match
-- the query exactly. Prisma's schema can't express NULLS LAST; it doesn't diff on it either.
-- (Small table today. On a large table, build it manually with CREATE INDEX CONCURRENTLY first.)
DROP INDEX "properties_status_freshnessAt_idx";

CREATE INDEX "properties_status_freshnessAt_publishedAt_id_idx" ON "properties"("status", "freshnessAt" DESC NULLS LAST, "publishedAt" DESC, "id");
