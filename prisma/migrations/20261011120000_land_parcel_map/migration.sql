-- CreateTable
CREATE TABLE "parcel_datasets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceReference" TEXT,
    "license" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "stateName" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "sourceCrs" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcel_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_imports" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "featuresRead" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "parcel_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "tehsilName" TEXT,
    "villageName" TEXT,
    "villageCode" TEXT,
    "parcelNumber" TEXT,
    "parcelNumberKey" TEXT,
    "ulpin" TEXT,
    "recordedArea" DOUBLE PRECISION,
    "recordedAreaUnit" TEXT,
    "computedAreaSqm" DOUBLE PRECISION NOT NULL,
    "landClass" TEXT,
    "geometry" JSONB NOT NULL,
    "displayGeometry" JSONB NOT NULL,
    "minLng" DOUBLE PRECISION NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLng" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "centroidLng" DOUBLE PRECISION NOT NULL,
    "centroidLat" DOUBLE PRECISION NOT NULL,
    "cellX" INTEGER NOT NULL,
    "cellY" INTEGER NOT NULL,
    "sourceAttributes" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "qualityStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "importId" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parcel_datasets_key_key" ON "parcel_datasets"("key");

-- CreateIndex
CREATE INDEX "parcel_imports_datasetId_startedAt_idx" ON "parcel_imports"("datasetId", "startedAt");

-- CreateIndex
CREATE INDEX "parcels_cellX_cellY_idx" ON "parcels"("cellX", "cellY");

-- CreateIndex
CREATE INDEX "parcels_villageName_parcelNumberKey_idx" ON "parcels"("villageName", "parcelNumberKey");

-- CreateIndex
CREATE INDEX "parcels_parcelNumberKey_idx" ON "parcels"("parcelNumberKey");

-- CreateIndex
CREATE INDEX "parcels_ulpin_idx" ON "parcels"("ulpin");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_datasetId_sourceRecordId_key" ON "parcels"("datasetId", "sourceRecordId");

-- AddForeignKey
ALTER TABLE "parcel_imports" ADD CONSTRAINT "parcel_imports_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "parcel_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "parcel_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_importId_fkey" FOREIGN KEY ("importId") REFERENCES "parcel_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parcels" ADD CONSTRAINT "parcels_importId_fkey" FOREIGN KEY ("importId") REFERENCES "parcel_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Status values the app relies on.
ALTER TABLE "parcel_imports" ADD CONSTRAINT "parcel_imports_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED'));
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_quality_status_check" CHECK ("qualityStatus" IN ('UNVERIFIED', 'VERIFIED', 'FLAGGED'));
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_bbox_check" CHECK ("minLng" <= "maxLng" AND "minLat" <= "maxLat");

-- Same as every other table: no access through Supabase's public API; the app connects as the owner.
ALTER TABLE "parcel_datasets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parcel_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parcels" ENABLE ROW LEVEL SECURITY;
