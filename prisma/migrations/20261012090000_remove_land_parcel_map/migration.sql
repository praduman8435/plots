-- The land parcel map feature was removed. Its tables are dropped — but only
-- if they hold no data: any row stops this migration (and the deploy) so
-- nothing real is ever deleted by accident.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "parcels") OR EXISTS (SELECT 1 FROM "parcel_imports") OR EXISTS (SELECT 1 FROM "parcel_datasets") THEN
    RAISE EXCEPTION 'Land parcel map tables are not empty — refusing to drop them';
  END IF;
END $$;

DROP TABLE "parcels";
DROP TABLE "parcel_imports";
DROP TABLE "parcel_datasets";
