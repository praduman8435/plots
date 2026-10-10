import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  areaSqm,
  bboxOf,
  cellOf,
  centroidOf,
  normalizeCrs,
  roundGeometry,
  simplifyGeometry,
  transformGeometry,
  validateAreaGeometry,
  type AreaGeometry,
  type SupportedCrs,
} from "@/lib/land-map/geo";

/**
 * Parcel import (docs/LAND_MAP.md §Import). Two stages:
 *  1. prepareParcels — pure: parse a GeoJSON FeatureCollection, transform the
 *     CRS, validate every geometry, map the source's fields, drop personal
 *     fields, detect duplicates. Nothing is written.
 *  2. writeImport — one database transaction: the whole file lands or nothing
 *     does. Re-importing the same file changes nothing (content hashes);
 *     parcels missing from a newer file are reported, never deleted.
 */

export const IMPORT_LIMITS = {
  maxFileBytes: 100 * 1024 * 1024,
  maxFeatures: 200_000,
  /** Report at most this many rejections in full. */
  maxReportedProblems: 200,
};

/** Display copy tolerance ≈ 0.2 m: removes noise vertices, keeps the plot shape. */
const DISPLAY_TOLERANCE_DEG = 0.000002;

/** Property names that hold personal data in Indian land records. Never stored. */
const PERSONAL_FIELD = /owner|khatedar|khata_?dar|kisan|farmer|father|husband|pita|pati|malik|naam|name_of|holder|mobile|phone|aadhaar|aadhar|पिता|पति|मालिक|खातेदार|नाम|मोबाइल|आधार/i;

const fieldName = z.string().trim().min(1).max(64);

export const manifestSchema = z.object({
  dataset: z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/, "lower-case letters, digits and dashes"),
    name: z.string().trim().min(3).max(160),
    sourceName: z.string().trim().min(2).max(160),
    sourceUrl: z.string().url().max(500).optional(),
    sourceReference: z.string().trim().max(300).optional(),
    license: z.string().trim().min(2).max(300),
    attribution: z.string().trim().min(2).max(300),
    isSynthetic: z.boolean().default(false),
    stateName: z.string().trim().min(2).max(80),
    districtName: z.string().trim().min(2).max(80),
    acquiredAt: z.coerce.date(),
    sourceUpdatedAt: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  /** The GeoJSON file, relative to the manifest. */
  file: z.string().trim().min(1).max(260),
  /** CRS of the file when it doesn't say (e.g. "EPSG:32643"). */
  crs: z.string().trim().max(80).optional(),
  /** Which source property holds each value. Only recordId is required. */
  fields: z.object({
    recordId: fieldName,
    parcelNumber: fieldName.optional(),
    villageName: fieldName.optional(),
    villageCode: fieldName.optional(),
    tehsilName: fieldName.optional(),
    ulpin: fieldName.optional(),
    recordedArea: fieldName.optional(),
    recordedAreaUnit: fieldName.optional(),
    landClass: fieldName.optional(),
    sourceUpdatedAt: fieldName.optional(),
  }),
  /** Fixed values for the whole file (e.g. the village when the source omits it per feature). */
  defaults: z
    .object({
      villageName: z.string().trim().max(120).optional(),
      villageCode: z.string().trim().max(40).optional(),
      tehsilName: z.string().trim().max(120).optional(),
      recordedAreaUnit: z.string().trim().max(40).optional(),
    })
    .default({}),
});
export type ImportManifest = z.infer<typeof manifestSchema>;

export type PreparedParcel = {
  sourceRecordId: string;
  tehsilName: string | null;
  villageName: string | null;
  villageCode: string | null;
  parcelNumber: string | null;
  parcelNumberKey: string | null;
  ulpin: string | null;
  recordedArea: number | null;
  recordedAreaUnit: string | null;
  landClass: string | null;
  sourceUpdatedAt: Date | null;
  computedAreaSqm: number;
  geometry: AreaGeometry;
  displayGeometry: AreaGeometry;
  bbox: { west: number; south: number; east: number; north: number };
  centroid: [number, number];
  sourceAttributes: Record<string, unknown>;
  contentHash: string;
};

export type Problem = { recordId: string | null; index: number; reason: string };

export type Prepared = {
  crs: SupportedCrs;
  featuresRead: number;
  parcels: PreparedParcel[];
  rejected: Problem[];
  warnings: Problem[];
  droppedFields: string[];
};

const text = (v: unknown, max = 120): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** "12 / 3" → "12/3", "१२" → "12", "0012" stays "0012" (leading zeros can be meaningful in source ids). */
export function normalizeParcelNumber(v: string): string {
  return v
    .normalize("NFKC")
    .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, 60);
}

/** 14 alphanumerics (DoLR format). Anything else isn't stored as a ULPIN. */
export function normalizeUlpin(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{14}$/.test(s) ? s : null;
}

/** Parses and validates a GeoJSON FeatureCollection against the manifest. Pure. */
export function prepareParcels(raw: string, manifest: ImportManifest): Prepared {
  if (Buffer.byteLength(raw) > IMPORT_LIMITS.maxFileBytes) throw new Error(`File is larger than ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB`);
  let fc: { type?: unknown; crs?: { properties?: { name?: string } }; features?: unknown };
  try {
    fc = JSON.parse(raw);
  } catch {
    throw new Error("Not valid JSON");
  }
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error("Not a GeoJSON FeatureCollection");
  if (fc.features.length > IMPORT_LIMITS.maxFeatures) throw new Error(`More than ${IMPORT_LIMITS.maxFeatures} features — split the file`);

  const fileCrs = fc.crs?.properties?.name;
  const crs = normalizeCrs(manifest.crs ?? fileCrs);
  if (!crs) throw new Error(`Unsupported CRS "${manifest.crs ?? fileCrs}". Convert first, e.g. ogr2ogr -t_srs EPSG:4326 out.geojson in.shp`);
  if (manifest.crs && fileCrs && normalizeCrs(fileCrs) !== crs) throw new Error(`The manifest says ${manifest.crs} but the file says ${fileCrs}`);

  const f = manifest.fields;
  const d = manifest.defaults;
  const parcels: PreparedParcel[] = [];
  const rejected: Problem[] = [];
  const warnings: Problem[] = [];
  const dropped = new Set<string>();
  const seenIds = new Set<string>();
  const seenShapes = new Map<string, string>();

  fc.features.forEach((feature: unknown, index: number) => {
    const ft = feature as { type?: unknown; properties?: Record<string, unknown> | null; geometry?: unknown } | null;
    const props = ft?.properties && typeof ft.properties === "object" ? ft.properties : {};
    const recordId = text(props[f.recordId], 120);
    const reject = (reason: string) => rejected.push({ recordId, index, reason });
    if (ft?.type !== "Feature") return reject("not a Feature");
    if (!recordId) return reject(`missing ${f.recordId}`);
    if (seenIds.has(recordId)) return reject("duplicate record id in this file");

    const src = ft.geometry as AreaGeometry | null;
    if (!src || (src.type !== "Polygon" && src.type !== "MultiPolygon")) return reject("geometry is not a Polygon or MultiPolygon");
    let transformed: AreaGeometry;
    try {
      transformed = transformGeometry(src, crs);
    } catch {
      return reject("coordinates could not be transformed");
    }
    const check = validateAreaGeometry(transformed);
    if (!check.ok) return reject(check.reason);
    seenIds.add(recordId);

    const geometry = roundGeometry(check.geometry, 8);
    const parcelNumber = f.parcelNumber ? text(props[f.parcelNumber], 60) : null;
    const rawUlpin = f.ulpin ? text(props[f.ulpin], 40) : null;
    const ulpin = normalizeUlpin(rawUlpin);
    if (rawUlpin && !ulpin) warnings.push({ recordId, index, reason: `ULPIN "${rawUlpin}" is not 14 characters — not stored` });
    const areaRaw = f.recordedArea ? props[f.recordedArea] : null;
    const recordedArea = areaRaw === null || areaRaw === undefined || areaRaw === "" ? null : Number(areaRaw);
    if (recordedArea !== null && (!Number.isFinite(recordedArea) || recordedArea < 0)) warnings.push({ recordId, index, reason: "recorded area is not a number — not stored" });
    const updatedRaw = f.sourceUpdatedAt ? text(props[f.sourceUpdatedAt], 40) : null;
    const sourceUpdatedAt = updatedRaw && !Number.isNaN(Date.parse(updatedRaw)) ? new Date(updatedRaw) : null;

    const sourceAttributes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (PERSONAL_FIELD.test(k)) {
        dropped.add(k);
        continue;
      }
      sourceAttributes[k.slice(0, 64)] = typeof v === "string" ? v.slice(0, 500) : v;
    }

    const shapeHash = createHash("sha256").update(JSON.stringify(geometry.coordinates)).digest("hex");
    const twin = seenShapes.get(shapeHash);
    if (twin) warnings.push({ recordId, index, reason: `same geometry as record ${twin}` });
    else seenShapes.set(shapeHash, recordId);

    const mapped = {
      tehsilName: (f.tehsilName ? text(props[f.tehsilName]) : null) ?? d.tehsilName ?? null,
      villageName: (f.villageName ? text(props[f.villageName]) : null) ?? d.villageName ?? null,
      villageCode: (f.villageCode ? text(props[f.villageCode], 40) : null) ?? d.villageCode ?? null,
      parcelNumber,
      parcelNumberKey: parcelNumber ? normalizeParcelNumber(parcelNumber) : null,
      ulpin,
      recordedArea: recordedArea !== null && Number.isFinite(recordedArea) && recordedArea >= 0 ? recordedArea : null,
      recordedAreaUnit: (f.recordedAreaUnit ? text(props[f.recordedAreaUnit], 40) : null) ?? d.recordedAreaUnit ?? null,
      landClass: f.landClass ? text(props[f.landClass]) : null,
      sourceUpdatedAt,
    };
    parcels.push({
      sourceRecordId: recordId,
      ...mapped,
      computedAreaSqm: Math.round(areaSqm(geometry) * 100) / 100,
      geometry,
      displayGeometry: roundGeometry(simplifyGeometry(geometry, DISPLAY_TOLERANCE_DEG), 7),
      bbox: bboxOf(geometry),
      centroid: centroidOf(geometry),
      sourceAttributes,
      contentHash: createHash("sha256").update(JSON.stringify({ g: geometry.coordinates, m: mapped, a: sourceAttributes })).digest("hex"),
    });
  });

  return { crs, featuresRead: fc.features.length, parcels, rejected, warnings, droppedFields: [...dropped].sort() };
}

export type ImportResult = { importId: string; datasetId: string; inserted: number; updated: number; unchanged: number; rejected: number; notInFile: number };

/**
 * Writes a prepared file in one transaction (all or nothing) and records the
 * run in parcel_imports. Safe to repeat: unchanged parcels are left alone.
 */
export async function writeImport(
  db: PrismaClient,
  manifest: ImportManifest,
  prepared: Prepared,
  file: { name: string; sha256: string },
): Promise<ImportResult> {
  const m = manifest.dataset;
  const datasetData = {
    name: m.name,
    sourceName: m.sourceName,
    sourceUrl: m.sourceUrl ?? null,
    sourceReference: m.sourceReference ?? null,
    license: m.license,
    attribution: m.attribution,
    isSynthetic: m.isSynthetic,
    stateName: m.stateName,
    districtName: m.districtName,
    sourceCrs: prepared.crs,
    acquiredAt: m.acquiredAt,
    sourceUpdatedAt: m.sourceUpdatedAt ?? null,
    notes: m.notes ?? null,
  };
  const existingDataset = await db.parcelDataset.findUnique({ where: { key: m.key }, select: { id: true, isSynthetic: true } });
  if (existingDataset && existingDataset.isSynthetic !== m.isSynthetic) throw new Error("A dataset can't switch between synthetic and real — use a new key");
  const dataset = await db.parcelDataset.upsert({ where: { key: m.key }, create: { key: m.key, ...datasetData }, update: datasetData });
  const report = {
    rejected: prepared.rejected.slice(0, IMPORT_LIMITS.maxReportedProblems),
    warnings: prepared.warnings.slice(0, IMPORT_LIMITS.maxReportedProblems),
    droppedFields: prepared.droppedFields,
  } as unknown as Prisma.InputJsonValue;
  const run = await db.parcelImport.create({
    data: { datasetId: dataset.id, fileName: file.name.slice(0, 260), fileSha256: file.sha256, status: "RUNNING", featuresRead: prepared.featuresRead, rejected: prepared.rejected.length, report },
  });

  try {
    const counts = await db.$transaction(
      async (tx) => {
        const existing = new Map(
          (await tx.parcel.findMany({ where: { datasetId: dataset.id }, select: { id: true, sourceRecordId: true, contentHash: true } })).map((p) => [p.sourceRecordId, p]),
        );
        let inserted = 0;
        let updated = 0;
        let unchanged = 0;
        const toCreate: Prisma.ParcelCreateManyInput[] = [];
        for (const p of prepared.parcels) {
          const data = {
            stateName: m.stateName,
            districtName: m.districtName,
            tehsilName: p.tehsilName,
            villageName: p.villageName,
            villageCode: p.villageCode,
            parcelNumber: p.parcelNumber,
            parcelNumberKey: p.parcelNumberKey,
            ulpin: p.ulpin,
            recordedArea: p.recordedArea,
            recordedAreaUnit: p.recordedAreaUnit,
            computedAreaSqm: p.computedAreaSqm,
            landClass: p.landClass,
            geometry: p.geometry as unknown as Prisma.InputJsonValue,
            displayGeometry: p.displayGeometry as unknown as Prisma.InputJsonValue,
            minLng: p.bbox.west,
            minLat: p.bbox.south,
            maxLng: p.bbox.east,
            maxLat: p.bbox.north,
            centroidLng: p.centroid[0],
            centroidLat: p.centroid[1],
            cellX: cellOf(p.bbox.west),
            cellY: cellOf(p.bbox.south),
            sourceAttributes: p.sourceAttributes as Prisma.InputJsonValue,
            contentHash: p.contentHash,
            sourceUpdatedAt: p.sourceUpdatedAt ?? m.sourceUpdatedAt ?? null,
            importId: run.id,
          };
          const prev = existing.get(p.sourceRecordId);
          if (!prev) {
            toCreate.push({ datasetId: dataset.id, sourceRecordId: p.sourceRecordId, ...data });
            inserted++;
          } else if (prev.contentHash === p.contentHash) {
            unchanged++;
          } else {
            await tx.parcel.update({ where: { id: prev.id }, data });
            updated++;
          }
        }
        for (let i = 0; i < toCreate.length; i += 500) await tx.parcel.createMany({ data: toCreate.slice(i, i + 500) });
        const inFile = new Set(prepared.parcels.map((p) => p.sourceRecordId));
        const notInFile = [...existing.keys()].filter((id) => !inFile.has(id)).length;
        return { inserted, updated, unchanged, notInFile };
      },
      { timeout: 300_000, maxWait: 20_000 },
    );
    await db.parcelImport.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", inserted: counts.inserted, updated: counts.updated, unchanged: counts.unchanged, finishedAt: new Date() },
    });
    return { importId: run.id, datasetId: dataset.id, rejected: prepared.rejected.length, ...counts };
  } catch (err) {
    await db.parcelImport.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date() } }).catch(() => {});
    throw err;
  }
}
