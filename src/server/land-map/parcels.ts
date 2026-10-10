import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isSyntheticParcelDataAllowed } from "@/lib/land-map/flag";
import { GBN_BOUNDS, cellRange, type AreaGeometry, type BBox } from "@/lib/land-map/geo";
import { normalizeParcelNumber, normalizeUlpin } from "./import";

/**
 * Read side of the parcel map. Every query is bounded (bbox size, zoom,
 * row limits) and only returns public parcel attributes — never the stored
 * source attributes, never anything from the marketplace.
 */

/** Below this zoom only coverage outlines are shown; parcels are too small to read. */
export const MIN_PARCEL_ZOOM = 15;
export const MAX_FEATURES = 1500;
/** ≈ 5.5 km across — a little more than a phone screen at zoom 15. */
export const MAX_BBOX_SPAN_DEG = 0.05;

const datasetVisible = (): Prisma.ParcelDatasetWhereInput => (isSyntheticParcelDataAllowed() ? {} : { isSynthetic: false });

export const viewportSchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    zoom: z.coerce.number().int().min(0).max(22),
  })
  .refine((b) => b.west < b.east && b.south < b.north, "Invalid bounding box")
  .refine((b) => b.east - b.west <= MAX_BBOX_SPAN_DEG && b.north - b.south <= MAX_BBOX_SPAN_DEG, "Bounding box too large — zoom in");

export type ParcelFeature = {
  type: "Feature";
  id: string;
  geometry: AreaGeometry;
  properties: { id: string; parcelNumber: string | null; villageName: string | null; synthetic: boolean };
};

export type ViewportResult =
  | { mode: "parcels"; type: "FeatureCollection"; features: ParcelFeature[]; truncated: boolean }
  | { mode: "zoom-in"; minZoom: number };

/** Parcels whose bounding box overlaps the view: grid cells narrow it via the index, the exact box test finishes it. */
export async function parcelsInView(v: BBox & { zoom: number }): Promise<ViewportResult> {
  if (v.zoom < MIN_PARCEL_ZOOM) return { mode: "zoom-in", minZoom: MIN_PARCEL_ZOOM };
  // Outside the supported region there is nothing to look up.
  if (v.east < GBN_BOUNDS.west || v.west > GBN_BOUNDS.east || v.north < GBN_BOUNDS.south || v.south > GBN_BOUNDS.north) {
    return { mode: "parcels", type: "FeatureCollection", features: [], truncated: false };
  }
  const cells = cellRange(v);
  const rows = await db.parcel.findMany({
    where: {
      cellX: { gte: cells.x0, lte: cells.x1 },
      cellY: { gte: cells.y0, lte: cells.y1 },
      minLng: { lte: v.east },
      maxLng: { gte: v.west },
      minLat: { lte: v.north },
      maxLat: { gte: v.south },
      dataset: datasetVisible(),
    },
    select: { id: true, parcelNumber: true, villageName: true, displayGeometry: true, dataset: { select: { isSynthetic: true } } },
    take: MAX_FEATURES + 1,
  });
  const truncated = rows.length > MAX_FEATURES;
  return {
    mode: "parcels",
    type: "FeatureCollection",
    truncated,
    features: rows.slice(0, MAX_FEATURES).map((r) => ({
      type: "Feature",
      id: r.id,
      geometry: r.displayGeometry as unknown as AreaGeometry,
      properties: { id: r.id, parcelNumber: r.parcelNumber, villageName: r.villageName, synthetic: r.dataset.isSynthetic },
    })),
  };
}

export type CoverageArea = { datasetId: string; name: string; attribution: string; synthetic: boolean; parcels: number; villages: string[]; bbox: BBox };

/** Where parcel data exists: one box per dataset (cheap aggregate, shown at low zoom). */
export async function parcelCoverage(): Promise<CoverageArea[]> {
  const datasets = await db.parcelDataset.findMany({ where: datasetVisible(), select: { id: true, name: true, attribution: true, isSynthetic: true }, orderBy: { name: "asc" } });
  if (datasets.length === 0) return [];
  const [boxes, villages] = await Promise.all([
    db.parcel.groupBy({ by: ["datasetId"], where: { datasetId: { in: datasets.map((d) => d.id) } }, _count: { _all: true }, _min: { minLng: true, minLat: true }, _max: { maxLng: true, maxLat: true } }),
    db.parcel.groupBy({ by: ["datasetId", "villageName"], where: { datasetId: { in: datasets.map((d) => d.id) }, villageName: { not: null } } }),
  ]);
  return datasets.flatMap((d) => {
    const b = boxes.find((x) => x.datasetId === d.id);
    if (!b || b._count._all === 0 || b._min.minLng == null || b._min.minLat == null || b._max.maxLng == null || b._max.maxLat == null) return [];
    return [
      {
        datasetId: d.id,
        name: d.name,
        attribution: d.attribution,
        synthetic: d.isSynthetic,
        parcels: b._count._all,
        villages: villages.filter((v) => v.datasetId === d.id && v.villageName).map((v) => v.villageName as string).sort(),
        bbox: { west: b._min.minLng, south: b._min.minLat, east: b._max.maxLng, north: b._max.maxLat },
      },
    ];
  });
}

export type ParcelDetail = {
  id: string;
  synthetic: boolean;
  parcelNumber: string | null;
  ulpin: string | null;
  villageName: string | null;
  villageCode: string | null;
  tehsilName: string | null;
  districtName: string;
  stateName: string;
  recordedArea: number | null;
  recordedAreaUnit: string | null;
  computedAreaSqm: number;
  landClass: string | null;
  qualityStatus: string;
  centroid: [number, number];
  bbox: BBox;
  geometry: AreaGeometry;
  source: {
    datasetName: string;
    sourceName: string;
    sourceUrl: string | null;
    sourceReference: string | null;
    license: string;
    attribution: string;
    sourceRecordId: string;
    sourceUpdatedAt: string | null;
    acquiredAt: string;
    importedAt: string;
  };
};

export async function parcelDetail(id: string): Promise<ParcelDetail | null> {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const p = await db.parcel.findFirst({
    where: { id, dataset: datasetVisible() },
    select: {
      id: true,
      parcelNumber: true,
      ulpin: true,
      villageName: true,
      villageCode: true,
      tehsilName: true,
      districtName: true,
      stateName: true,
      recordedArea: true,
      recordedAreaUnit: true,
      computedAreaSqm: true,
      landClass: true,
      qualityStatus: true,
      centroidLng: true,
      centroidLat: true,
      minLng: true,
      minLat: true,
      maxLng: true,
      maxLat: true,
      displayGeometry: true,
      sourceRecordId: true,
      sourceUpdatedAt: true,
      dataset: { select: { name: true, sourceName: true, sourceUrl: true, sourceReference: true, license: true, attribution: true, isSynthetic: true, acquiredAt: true, sourceUpdatedAt: true } },
      lastImport: { select: { finishedAt: true, startedAt: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    synthetic: p.dataset.isSynthetic,
    parcelNumber: p.parcelNumber,
    ulpin: p.ulpin,
    villageName: p.villageName,
    villageCode: p.villageCode,
    tehsilName: p.tehsilName,
    districtName: p.districtName,
    stateName: p.stateName,
    recordedArea: p.recordedArea,
    recordedAreaUnit: p.recordedAreaUnit,
    computedAreaSqm: p.computedAreaSqm,
    landClass: p.landClass,
    qualityStatus: p.qualityStatus,
    centroid: [p.centroidLng, p.centroidLat],
    bbox: { west: p.minLng, south: p.minLat, east: p.maxLng, north: p.maxLat },
    geometry: p.displayGeometry as unknown as AreaGeometry,
    source: {
      datasetName: p.dataset.name,
      sourceName: p.dataset.sourceName,
      sourceUrl: p.dataset.sourceUrl,
      sourceReference: p.dataset.sourceReference,
      license: p.dataset.license,
      attribution: p.dataset.attribution,
      sourceRecordId: p.sourceRecordId,
      sourceUpdatedAt: (p.sourceUpdatedAt ?? p.dataset.sourceUpdatedAt)?.toISOString() ?? null,
      acquiredAt: p.dataset.acquiredAt.toISOString(),
      importedAt: (p.lastImport.finishedAt ?? p.lastImport.startedAt).toISOString(),
    },
  };
}

export const lookupSchema = z.object({
  number: z.string().trim().min(1).max(40).optional(),
  ulpin: z.string().trim().min(1).max(20).optional(),
  village: z.string().trim().min(2).max(120).optional(),
});

export type ParcelMatch = { id: string; parcelNumber: string | null; villageName: string | null; tehsilName: string | null; synthetic: boolean; centroid: [number, number]; bbox: BBox };

/**
 * Cadastral lookup. A Gata number repeats in every village, so all matches
 * come back (with their village) and the user picks — never a silent guess.
 */
export async function lookupParcels(input: z.infer<typeof lookupSchema>): Promise<ParcelMatch[]> {
  const where: Prisma.ParcelWhereInput = { dataset: datasetVisible() };
  const ulpin = input.ulpin ? normalizeUlpin(input.ulpin) : null;
  if (input.ulpin && !ulpin) return [];
  if (ulpin) where.ulpin = ulpin;
  else if (input.number) where.parcelNumberKey = normalizeParcelNumber(input.number);
  else return [];
  if (input.village) where.villageName = { equals: input.village, mode: "insensitive" };
  const rows = await db.parcel.findMany({
    where,
    select: { id: true, parcelNumber: true, villageName: true, tehsilName: true, centroidLng: true, centroidLat: true, minLng: true, minLat: true, maxLng: true, maxLat: true, dataset: { select: { isSynthetic: true } } },
    orderBy: [{ villageName: "asc" }, { parcelNumber: "asc" }],
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    parcelNumber: r.parcelNumber,
    villageName: r.villageName,
    tehsilName: r.tehsilName,
    synthetic: r.dataset.isSynthetic,
    centroid: [r.centroidLng, r.centroidLat],
    bbox: { west: r.minLng, south: r.minLat, east: r.maxLng, north: r.maxLat },
  }));
}
