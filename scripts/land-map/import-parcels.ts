/**
 * Imports an authorized parcel dataset (GeoJSON) described by a manifest.
 *
 *   pnpm land-map:import path/to/manifest.json            # validate + write
 *   pnpm land-map:import path/to/manifest.json --dry-run  # validate only
 *   pnpm land-map:import path/to/manifest.json --allow-synthetic
 *
 * Shapefile / GeoPackage: convert first with GDAL, keeping the source CRS or
 * reprojecting:  ogr2ogr -f GeoJSON -t_srs EPSG:4326 parcels.geojson input.shp
 *
 * Uses DATABASE_URL (DIRECT_URL if set). Runs outside the web app on purpose:
 * large imports never happen inside a user-facing request.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { IMPORT_LIMITS, manifestSchema, prepareParcels, writeImport } from "../../src/server/land-map/import";

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const allowSynthetic = args.includes("--allow-synthetic");
  if (!manifestPath) throw new Error("Usage: land-map:import <manifest.json> [--dry-run] [--allow-synthetic]");

  const manifestFile = realpathSync(resolve(manifestPath));
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestFile, "utf8")));
  if (manifest.dataset.isSynthetic && !allowSynthetic) throw new Error("This dataset is synthetic. Pass --allow-synthetic (development databases only).");
  if (manifest.dataset.isSynthetic && process.env.VERCEL_ENV === "production") throw new Error("Synthetic data is never imported in production.");

  // The data file must sit inside the manifest's folder (no ../ or absolute paths, no symlinks out).
  const baseDir = dirname(manifestFile);
  const dataPath = realpathSync(resolve(baseDir, manifest.file));
  if (!dataPath.startsWith(baseDir + sep)) throw new Error("The data file must be inside the manifest's folder");
  if (!/\.(geo)?json$/i.test(dataPath)) throw new Error("Only .geojson / .json files are read — convert other formats with ogr2ogr first");
  const size = statSync(dataPath).size;
  if (size > IMPORT_LIMITS.maxFileBytes) throw new Error(`File is ${Math.round(size / 1024 / 1024)} MB; the limit is ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB`);

  const raw = readFileSync(dataPath, "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const prepared = prepareParcels(raw, manifest);

  console.log(`${basename(dataPath)} · ${prepared.crs} · ${prepared.featuresRead} features → ${prepared.parcels.length} valid, ${prepared.rejected.length} rejected, ${prepared.warnings.length} warnings`);
  if (prepared.droppedFields.length) console.log(`Personal fields not stored: ${prepared.droppedFields.join(", ")}`);
  for (const p of prepared.rejected.slice(0, 20)) console.log(`  rejected #${p.index} ${p.recordId ?? "(no id)"}: ${p.reason}`);
  for (const p of prepared.warnings.slice(0, 20)) console.log(`  warning  #${p.index} ${p.recordId ?? "(no id)"}: ${p.reason}`);
  if (dryRun) return;
  if (prepared.parcels.length === 0) throw new Error("Nothing valid to import");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }) });
  try {
    const r = await writeImport(db, manifest, prepared, { name: basename(dataPath), sha256 });
    console.log(`Import ${r.importId}: ${r.inserted} new, ${r.updated} updated, ${r.unchanged} unchanged, ${r.rejected} rejected${r.notInFile ? `, ${r.notInFile} existing parcels not in this file (kept)` : ""}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
