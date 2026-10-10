-- A seller can remove a listing. Nothing is deleted (enquiries and reports keep
-- their history); the row is hidden for good and frozen.
ALTER TABLE "properties" ADD COLUMN "removedAt" TIMESTAMP(3);
