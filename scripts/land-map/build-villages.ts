/**
 * Builds src/data/land-map/gbn-villages.json — official village boundaries of
 * Gautam Buddha Nagar — from the Survey of India "Village Boundary" dataset
 * published on the National Water Data Portal (NWIC):
 *   https://nwdp.nwic.gov.in/dataset/village-boundary  (Uttar Pradesh, GeoJSON)
 *
 *   pnpm land-map:villages /path/to/vb_soi_up.GeoJSON
 *
 * The portal's copyright policy allows reproduction free of charge in any
 * format without specific permission, if reproduced accurately, not in a
 * misleading context, and with the source prominently acknowledged
 * (https://nwdp.nwic.gov.in/footer/copyrightPolicy). These are VILLAGE
 * boundaries, not plots (Gata).
 *
 * The file is ~600 MB with one feature per line, so it is streamed. Source
 * CRS is EPSG:7755 (WGS 84 / India NSF LCC), transformed to EPSG:4326 here.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { areaSqm, bboxOf, centroidOf, GBN_BOUNDS, normalizeCrs, pointInGeometry, roundGeometry, simplifyGeometry, transformGeometry, type AreaGeometry, type BBox } from "../../src/lib/land-map/geo";

const OUT = join(process.cwd(), "src/data/land-map/gbn-villages.json");
const DISTRICT = "Gautam Buddha Nagar";
const MAX_LINE = 20 * 1024 * 1024; // one feature per line; anything bigger is not a village

type Village = {
  id: string;
  name: string;
  code: string | null;
  tehsil: string | null;
  tehsilCode: string | null;
  block: string | null;
  kind: string | null;
  censusAreaHa: number | null;
  areaHa: number;
  bbox: BBox;
  center: [number, number];
  geometry: AreaGeometry;
};

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.trim(), typeof v === "string" ? v.trim() : v]));
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: land-map:villages <vb_soi_up.GeoJSON>");

  let crs = null as ReturnType<typeof normalizeCrs>;
  const villages: Village[] = [];
  const rejected: string[] = [];
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!crs && raw.includes('"crs"')) {
      const name = /"name":\s*"([^"]+)"/.exec(raw)?.[1];
      crs = normalizeCrs(name);
      if (!crs) throw new Error(`Unsupported CRS ${name}`);
      continue;
    }
    if (!raw.includes(`"district": "${DISTRICT}"`)) continue;
    if (raw.length > MAX_LINE) {
      rejected.push("oversized line");
      continue;
    }
    const f = JSON.parse(raw.trim().replace(/,$/, "")) as { properties: Record<string, unknown>; geometry: AreaGeometry };
    const p = clean(f.properties);
    if (p.district !== DISTRICT) continue;
    if (!crs) throw new Error("CRS not declared before the features");
    const geometry = transformGeometry(f.geometry, crs);
    const b = bboxOf(geometry);
    const name = str(p.village) ?? "(unnamed)";
    if (!(b.west >= GBN_BOUNDS.west && b.east <= GBN_BOUNDS.east && b.south >= GBN_BOUNDS.south && b.north <= GBN_BOUNDS.north)) {
      rejected.push(`${name}: outside the district bounds`);
      continue;
    }
    const display = roundGeometry(simplifyGeometry(geometry, 0.00002), 6); // ≈ 2 m
    const census = Number(p.total_geographical_area);
    villages.push({
      id: `soi:${str(p.vlcode) ?? str(p.id) ?? name}`,
      name,
      code: str(p.vlcode),
      tehsil: str(p.subdistric),
      tehsilCode: str(p.sdcode),
      block: str(p.block),
      kind: str(p.total_urban_rural),
      censusAreaHa: Number.isFinite(census) && census > 0 ? census : null,
      areaHa: Math.round(areaSqm(geometry) / 100) / 100,
      bbox: bboxOf(display),
      center: centroidOf(geometry).map((v) => Math.round(v * 1e6) / 1e6) as [number, number],
      geometry: display,
    });
  }
  if (villages.length === 0) throw new Error(`No ${DISTRICT} features found`);
  villages.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  // Sanity checks against independent data.
  const ratios = villages.filter((v) => v.censusAreaHa).map((v) => v.areaHa / (v.censusAreaHa as number)).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  const places = (JSON.parse(readFileSync(join(process.cwd(), "src/data/land-map/gbn-places.json"), "utf8")) as { places: { name: string; kind: string; lat: number; lng: number }[] }).places.filter((p) => p.kind === "village");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  let named = 0;
  let inside = 0;
  for (const p of places) {
    const v = villages.find((x) => norm(x.name) === norm(p.name));
    if (!v) continue;
    named++;
    if (pointInGeometry([p.lng, p.lat], v.geometry)) inside++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      name: "Survey of India — Village Boundary (via National Water Data Portal, NWIC)",
      url: "https://nwdp.nwic.gov.in/dataset/village-boundary",
      attribution: "Village boundaries: Survey of India, via National Water Data Portal (NWIC)",
      terms: "Reproduced under the portal's copyright policy (free reproduction with acknowledgement; https://nwdp.nwic.gov.in/footer/copyrightPolicy).",
      sourceUpdatedAt: "2025-05-02",
      sourceCrs: crs,
      note: "Revenue village boundaries, not plot (Gata) boundaries. Simplified to ≈2 m for display.",
    },
    checks: { villages: villages.length, rejected, medianAreaRatioVsCensus: median, osmVillagesMatchedByName: named, osmPointsInsideTheirVillage: inside },
    villages,
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`Wrote ${OUT}`, out.checks, `${Math.round(JSON.stringify(out).length / 1024)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
