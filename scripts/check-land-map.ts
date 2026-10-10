/**
 * Land parcel map checks (pnpm check:land-map). Needs the local database
 * (docker compose); creates and removes its own test datasets.
 *   1. Feature flag parsing          4. Import into the DB: idempotent, non-destructive
 *   2. Geometry: CRS, area, checks   5. Queries: viewport, limits, lookup, privacy
 *   3. Import preparation (pure)     6. API routes and page with the flag off / on
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { isLandParcelMapEnabled, isSyntheticParcelDataAllowed } from "../src/lib/land-map/flag";
import { areaSqm, normalizeCrs, ringSelfIntersects, toWgs84, validateAreaGeometry, type AreaGeometry, type PolygonGeometry, type Position } from "../src/lib/land-map/geo";
import { manifestSchema, normalizeParcelNumber, normalizeUlpin, prepareParcels, writeImport, type ImportManifest } from "../src/server/land-map/import";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail)?.slice(0, 300));
  }
}

// ── 1. Feature flag ──
check("flag: missing → off", isLandParcelMapEnabled({}) === false);
check("flag: empty → off", isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: "" }) === false);
check("flag: 'false' → off", isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: "false" }) === false);
check("flag: '1' / 'yes' (invalid) → off", !isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: "1" }) && !isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: "yes" }));
check("flag: 'true' / ' TRUE ' → on", isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: "true" }) && isLandParcelMapEnabled({ LAND_PARCEL_MAP_ENABLED: " TRUE " }));
check("synthetic: off by default", isSyntheticParcelDataAllowed({}) === false);
check("synthetic: on only when asked", isSyntheticParcelDataAllowed({ LAND_PARCEL_MAP_SYNTHETIC: "true" }) === true);
check("synthetic: never in Vercel production", isSyntheticParcelDataAllowed({ LAND_PARCEL_MAP_SYNTHETIC: "true", VERCEL_ENV: "production" }) === false);

// ── 2. Geometry ──
// Independent forward UTM (Snyder 1987, eq. 8-9…8-10) to check the importer's inverse by round trip.
function utmForward([lon, lat]: Position, zone: number): Position {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const lam0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lam - lam0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}
const noida: Position = [77.3255, 28.5706]; // Sector 18 area
for (const [zone, crs] of [[43, "EPSG:32643"], [44, "EPSG:32644"]] as const) {
  const back = toWgs84(utmForward(noida, zone), crs);
  const errM = Math.hypot((back[0] - noida[0]) * 97_700, (back[1] - noida[1]) * 111_000);
  check(`CRS: ${crs} round trip within 1 cm`, errM < 0.01, { back, errM });
}
check("CRS: central meridian of zone 43 has easting 500000", Math.abs(utmForward([75, 28.5], 43)[0] - 500000) < 1e-6);
const merc = toWgs84([8607999.9, 3320000.0], "EPSG:3857");
check("CRS: Web Mercator → near Noida", merc[0] > 77.3 && merc[0] < 77.4 && merc[1] > 28.5 && merc[1] < 28.6, merc);
check("CRS: names normalised", normalizeCrs("urn:ogc:def:crs:OGC:1.3:CRS84") === "EPSG:4326" && normalizeCrs("urn:ogc:def:crs:EPSG::32643") === "EPSG:32643" && normalizeCrs(undefined) === "EPSG:4326");
check("CRS: unknown rejected", normalizeCrs("EPSG:24378") === null);

const square = (lng: number, lat: number, d: number): PolygonGeometry => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]],
});
const sq = square(77.5, 28.5, 0.001);
const expected = 0.001 * 111_194.9 * (0.001 * 111_194.9 * Math.cos((28.5005 * Math.PI) / 180));
check("area: 0.001° square at 28.5°N ≈ 10,866 m² (±0.5%)", Math.abs(areaSqm(sq) - expected) / expected < 0.005, { got: areaSqm(sq), expected });
const holed: AreaGeometry = { type: "Polygon", coordinates: [sq.coordinates[0], square(77.5002, 28.5002, 0.0002).coordinates[0]] };
check("area: holes are subtracted", Math.abs(areaSqm(holed) - (areaSqm(sq) - areaSqm(square(77.5002, 28.5002, 0.0002)))) < 0.01);

check("validate: good polygon", validateAreaGeometry(sq).ok);
const open = validateAreaGeometry({ type: "Polygon", coordinates: [[[77.5, 28.5], [77.501, 28.5], [77.501, 28.501], [77.5, 28.501]]] });
check("validate: open ring is closed", open.ok && open.geometry.type === "Polygon" && open.geometry.coordinates[0].length === 5);
const bowtie = [[77.5, 28.5], [77.501, 28.501], [77.501, 28.5], [77.5, 28.501], [77.5, 28.5]] as Position[];
check("validate: self-intersecting (bow-tie) rejected", ringSelfIntersects(bowtie) && !validateAreaGeometry({ type: "Polygon", coordinates: [bowtie] }).ok);
check("validate: outside Gautam Buddha Nagar rejected", !validateAreaGeometry(square(72.8, 19.0, 0.001)).ok);
check("validate: projected metres (wrong CRS) rejected", !validateAreaGeometry(square(727000, 3163000, 10)).ok);
check("validate: too few positions", !validateAreaGeometry({ type: "Polygon", coordinates: [[[77.5, 28.5], [77.501, 28.5], [77.5, 28.5]]] }).ok);
check("validate: points / lines rejected", !validateAreaGeometry({ type: "Point", coordinates: [77.5, 28.5] }).ok && !validateAreaGeometry({ type: "LineString", coordinates: [] }).ok);
check("validate: NaN rejected", !validateAreaGeometry({ type: "Polygon", coordinates: [[[77.5, NaN], [77.501, 28.5], [77.501, 28.501], [77.5, 28.5]]] }).ok);
const huge = Array.from({ length: 6000 }, (_, i) => [77.5 + 0.001 * Math.cos((i / 6000) * 2 * Math.PI), 28.5 + 0.001 * Math.sin((i / 6000) * 2 * Math.PI)] as Position);
check("validate: over-complex polygon rejected", !validateAreaGeometry({ type: "Polygon", coordinates: [[...huge, huge[0]]] }).ok);
check("validate: wider than a parcel (> ~2 km) rejected", !validateAreaGeometry(square(77.5, 28.4, 0.03)).ok);
check("validate: zero area rejected", !validateAreaGeometry({ type: "Polygon", coordinates: [[[77.5, 28.5], [77.501, 28.5], [77.502, 28.5], [77.5, 28.5]]] }).ok);

// ── 3. Import preparation ──
check("parcel number normalised", normalizeParcelNumber(" 12 / 3 ") === "12/3" && normalizeParcelNumber("१२") === "12");
check("ULPIN: 14 alphanumerics only", normalizeUlpin("UP12-3456-7890AB") === "UP1234567890AB" && normalizeUlpin("123") === null);

const stamp = Date.now().toString(36);
const manifest = (over: Partial<ImportManifest["dataset"]> = {}, extra: Partial<ImportManifest> = {}): ImportManifest =>
  manifestSchema.parse({
    dataset: { key: `check-land-map-${stamp}`, name: "Check dataset", sourceName: "scripts/check-land-map.ts", license: "test", attribution: "test", isSynthetic: true, stateName: "Uttar Pradesh", districtName: "Gautam Buddha Nagar", acquiredAt: "2026-10-11", ...over },
    file: "x.geojson",
    fields: { recordId: "ID", parcelNumber: "GATA", villageName: "VILL", ulpin: "ULPIN", recordedArea: "AREA" },
    defaults: { recordedAreaUnit: "hectare" },
    ...extra,
  });
const feature = (id: string | null, geometry: unknown, props: Record<string, unknown> = {}) => ({ type: "Feature", properties: { ...(id ? { ID: id } : {}), ...props }, geometry });
const fc = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

const base = 77.6105;
const good = [
  feature("A1", square(base, 28.3005, 0.0004), { GATA: "5", VILL: "Village One", AREA: 0.15, OWNER_NAME: "Should Not Be Stored", "खातेदार": "x", ULPIN: "UP1234567890AB" }),
  feature("A2", square(base + 0.0005, 28.3005, 0.0004), { GATA: "5", VILL: "Village Two", ULPIN: "bad" }),
  feature("A3", square(base + 0.001, 28.3005, 0.0004), { GATA: "7/2", VILL: "Village One" }),
];
const prepared = prepareParcels(fc(...good, feature("A1", square(base, 28.31, 0.0004)), feature(null, square(base, 28.32, 0.0004)), feature("B1", { type: "Polygon", coordinates: [bowtie] })), manifest());
check("prepare: valid features kept", prepared.parcels.length === 3, prepared.parcels.length);
check("prepare: duplicate id, missing id and bad geometry rejected with reasons", prepared.rejected.length === 3 && prepared.rejected.some((r) => /duplicate/.test(r.reason)) && prepared.rejected.some((r) => /missing ID/.test(r.reason)) && prepared.rejected.some((r) => /self-intersecting/.test(r.reason)), prepared.rejected);
check("prepare: personal fields dropped, listed", prepared.droppedFields.includes("OWNER_NAME") && prepared.droppedFields.includes("खातेदार") && !JSON.stringify(prepared.parcels).includes("Should Not Be Stored"), prepared.droppedFields);
check("prepare: invalid ULPIN not stored, warned", prepared.parcels[1].ulpin === null && prepared.warnings.some((w) => /ULPIN/.test(w.reason)));
check("prepare: recorded vs computed area kept apart", prepared.parcels[0].recordedArea === 0.15 && prepared.parcels[0].recordedAreaUnit === "hectare" && prepared.parcels[0].computedAreaSqm > 1000);
check("prepare: missing attributes stay null (nothing invented)", prepared.parcels[2].recordedArea === null && prepared.parcels[2].ulpin === null && prepared.parcels[2].landClass === null);
const utm = prepareParcels(fc(feature("U1", { type: "Polygon", coordinates: [square(base, 28.3005, 0.0004).coordinates[0].map((p) => utmForward(p, 43))] })), manifest({}, { crs: "EPSG:32643" }));
check("prepare: UTM input transformed to WGS 84", utm.parcels.length === 1 && Math.abs(utm.parcels[0].bbox.west - base) < 1e-6, utm.rejected);
let threw = "";
try {
  prepareParcels(fc(feature("X", sq)), manifest({}, { crs: "EPSG:24378" }));
} catch (e) {
  threw = String(e);
}
check("prepare: unsupported CRS refused with a conversion hint", /ogr2ogr/.test(threw), threw);
threw = "";
try {
  prepareParcels(JSON.stringify({ type: "Feature" }), manifest());
} catch (e) {
  threw = String(e);
}
check("prepare: not a FeatureCollection → refused", /FeatureCollection/.test(threw));
threw = "";
try {
  prepareParcels("{not json", manifest());
} catch (e) {
  threw = String(e);
}
check("prepare: invalid JSON → refused", /JSON/.test(threw));
check("manifest: bad key refused", !manifestSchema.safeParse({ ...JSON.parse(JSON.stringify(manifest())), dataset: { ...manifest().dataset, key: "../etc" } }).success);

// ── 4–6. Database, queries, routes ──
async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const keys = [`check-land-map-${stamp}`, `check-land-map-real-${stamp}`];
  const env = { ...process.env };
  try {
    const m = manifest();
    const r1 = await writeImport(db, m, prepared, { name: "x.geojson", sha256: "1" });
    check("import: new parcels inserted", r1.inserted === 3 && r1.updated === 0, r1);
    const r2 = await writeImport(db, m, prepareParcels(fc(...good), m), { name: "x.geojson", sha256: "1" });
    check("import: same file again → nothing changes", r2.inserted === 0 && r2.updated === 0 && r2.unchanged === 3, r2);
    const changed = [good[0], feature("A2", square(base + 0.0005, 28.3005, 0.00041), { GATA: "5", VILL: "Village Two" })];
    const r3 = await writeImport(db, m, prepareParcels(fc(...changed), m), { name: "x.geojson", sha256: "2" });
    check("import: changed parcel updated; missing one kept and reported", r3.updated === 1 && r3.unchanged === 1 && r3.notInFile === 1, r3);
    const ds = await db.parcelDataset.findUniqueOrThrow({ where: { key: m.dataset.key } });
    check("import: nothing deleted", (await db.parcel.count({ where: { datasetId: ds.id } })) === 3);
    const stored = await db.parcel.findFirstOrThrow({ where: { datasetId: ds.id, sourceRecordId: "A1" } });
    check("import: traceable to the source record, personal fields absent", stored.sourceRecordId === "A1" && !JSON.stringify(stored.sourceAttributes).includes("Should Not Be Stored"));
    const runs = await db.parcelImport.findMany({ where: { datasetId: ds.id } });
    check("import: every run recorded as SUCCEEDED", runs.length === 3 && runs.every((r) => r.status === "SUCCEEDED"));
    threw = "";
    try {
      await writeImport(db, manifest({ isSynthetic: false }), prepareParcels(fc(...good), m), { name: "x", sha256: "3" });
    } catch (e) {
      threw = String(e);
    }
    check("import: a dataset can't switch synthetic ↔ real", /switch/.test(threw), threw);

    // A "real" (non-synthetic) test dataset next to the synthetic one.
    const mr = manifest({ key: keys[1], isSynthetic: false, name: "Check real dataset" });
    await writeImport(db, mr, prepareParcels(fc(feature("R1", square(base + 0.002, 28.3005, 0.0004), { GATA: "5", VILL: "Village Three" })), mr), { name: "r", sha256: "r" });

    const { parcelsInView, lookupParcels, parcelDetail, parcelCoverage, viewportSchema } = await import("../src/server/land-map/parcels");
    const view = { west: base - 0.001, south: 28.3, east: base + 0.004, north: 28.302, zoom: 17 };
    delete process.env.LAND_PARCEL_MAP_SYNTHETIC;
    const realOnly = await parcelsInView(view);
    check("view: synthetic data hidden unless allowed", realOnly.mode === "parcels" && realOnly.features.length >= 1 && realOnly.features.every((f) => !f.properties.synthetic), realOnly);
    process.env.LAND_PARCEL_MAP_SYNTHETIC = "true";
    const all = await parcelsInView(view);
    check("view: synthetic shown when allowed, flagged", all.mode === "parcels" && all.features.some((f) => f.properties.synthetic) && all.features.length >= 4);
    check("view: only parcels overlapping the box", all.mode === "parcels" && all.features.every((f) => JSON.stringify(f.geometry).includes("77.61")));
    const far = await parcelsInView({ west: 77.3, south: 28.55, east: 77.31, north: 28.56, zoom: 17 });
    check("view: empty area → no parcels", far.mode === "parcels" && far.features.filter((f) => f.properties.villageName?.startsWith("Village")).length === 0);
    check("view: low zoom → zoom-in, no query", (await parcelsInView({ ...view, zoom: 12 })).mode === "zoom-in");
    check("view: outside the district → nothing", (await parcelsInView({ west: 72.8, south: 19, east: 72.81, north: 19.01, zoom: 17 })).mode === "parcels");
    check("bbox: too large refused", !viewportSchema.safeParse({ west: 77, south: 28, east: 77.2, north: 28.2, zoom: 16 }).success);
    check("bbox: inverted refused", !viewportSchema.safeParse({ west: 77.5, south: 28.5, east: 77.4, north: 28.6, zoom: 16 }).success);
    check("bbox: out-of-range refused", !viewportSchema.safeParse({ west: 200, south: 28, east: 201, north: 28.01, zoom: 16 }).success);
    check("bbox: zoom bounded", !viewportSchema.safeParse({ west: 77.5, south: 28.5, east: 77.51, north: 28.51, zoom: 40 }).success);
    check("view: responses capped", all.mode === "parcels" && all.features.length <= 1500);

    const fives = (await lookupParcels({ number: "5" })).filter((p) => p.villageName?.startsWith("Village"));
    check("lookup: same Gata no. in several villages → all returned, not guessed", fives.length === 3 && new Set(fives.map((p) => p.villageName)).size === 3, fives);
    const inTwo = await lookupParcels({ number: "5", village: "village two" });
    check("lookup: village context narrows it", inTwo.length === 1 && inTwo[0].villageName === "Village Two");
    check("lookup: ULPIN", (await lookupParcels({ ulpin: "UP1234567890AB" })).some((p) => p.parcelNumber === "5"));
    check("lookup: malformed ULPIN → nothing", (await lookupParcels({ ulpin: "x" })).length === 0);

    const detail = await parcelDetail(stored.id);
    const json = JSON.stringify(detail);
    check("detail: source, record id and dates present", detail?.source.sourceRecordId === "A1" && Boolean(detail?.source.importedAt) && detail?.synthetic === true);
    check("detail: never exposes source attributes or personal data", !/sourceAttributes|OWNER|Should Not Be Stored/.test(json));
    check("detail: missing values are null", detail?.landClass === null);
    check("detail: bad id → null", (await parcelDetail("../../x")) === null);
    const cov = await parcelCoverage();
    check("coverage: per dataset with villages", cov.some((c) => c.villages.includes("Village Two")) && cov.some((c) => c.villages.includes("Village Three")));

    const { searchPlaces } = await import("../src/server/land-map/places");
    check("places: 'sector 62' / 'sec62' find Sector 62", searchPlaces("sector 62")[0]?.name === "Sector 62" && searchPlaces("sec62")[0]?.name === "Sector 62");
    check("places: district and tehsils", searchPlaces("gautam")[0]?.kind === "district" && searchPlaces("dadri").some((p) => p.kind === "tehsil"));
    check("places: Noida", searchPlaces("noida").some((p) => p.name === "Noida"));
    check("places: unknown → none", searchPlaces("zzqqxx").length === 0);
    check("places: limited", searchPlaces("a").length <= 8);

    // Routes and page, flag off then on (TRUSTED_IP_HEADER unset → per-IP limits skipped here; tested below).
    delete process.env.TRUSTED_IP_HEADER;
    const parcelsRoute = await import("../src/app/api/land-map/parcels/route");
    const detailRoute = await import("../src/app/api/land-map/parcels/[id]/route");
    const searchRoute = await import("../src/app/api/land-map/search/route");
    const coverageRoute = await import("../src/app/api/land-map/coverage/route");
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(view).map(([k, v]) => [k, String(v)])));
    const ctx = { params: Promise.resolve({ id: stored.id }) } as never;
    const call = async () => ({
      parcels: await parcelsRoute.GET(new Request(`http://x/api/land-map/parcels?${qs}`)),
      detail: await detailRoute.GET(new Request("http://x"), ctx),
      search: await searchRoute.GET(new Request("http://x/api/land-map/search?q=5")),
      coverage: await coverageRoute.GET(),
    });

    delete process.env.LAND_PARCEL_MAP_ENABLED;
    const off = await call();
    check("disabled: every API answers 404", Object.values(off).every((r) => r.status === 404), Object.fromEntries(Object.entries(off).map(([k, r]) => [k, r.status])));
    check("disabled: no parcel data in the 404 bodies", !(await Promise.all(Object.values(off).map((r) => r.text()))).join("").includes("Village"));
    // The page itself (and these routes over HTTP) are checked disabled in scripts/check-http-security.ts.

    process.env.LAND_PARCEL_MAP_ENABLED = "true";
    const on = await call();
    check("enabled: APIs answer 200", Object.values(on).every((r) => r.status === 200), Object.fromEntries(Object.entries(on).map(([k, r]) => [k, r.status])));
    const onBody = (await on.search.json()) as { parcels: unknown[]; places: unknown[] };
    check("enabled: search keeps places and parcels apart", Array.isArray(onBody.places) && onBody.parcels.length >= 3);
    check("enabled: browser-only caching (nothing shared survives turning it off)", (on.parcels.headers.get("cache-control") ?? "").startsWith("private"));
    check("enabled: bad viewport → 400", (await parcelsRoute.GET(new Request("http://x/api/land-map/parcels?west=1"))).status === 400);
    check("enabled: overlong search → 400", (await searchRoute.GET(new Request(`http://x/api/land-map/search?q=${"a".repeat(80)}`))).status === 400);
    check("enabled: unknown parcel → 404", (await detailRoute.GET(new Request("http://x"), { params: Promise.resolve({ id: "cnotarealid00000000" }) } as never)).status === 404);

    // Rate limit policy (the routes call this per client IP behind a trusted proxy).
    const { hitRateLimit, LIMITS } = await import("../src/lib/rate-limit");
    const ip = `check-${stamp}`;
    let last = { ok: true } as { ok: boolean };
    for (let i = 0; i <= LIMITS.landMapSearchPerIp.limit; i++) last = await hitRateLimit("landMapSearchPerIp", ip);
    check("rate limit: search capped per IP", last.ok === false);
  } finally {
    process.env = env;
    const datasets = await db.parcelDataset.findMany({ where: { key: { in: keys } }, select: { id: true } });
    const ids = datasets.map((d) => d.id);
    await db.parcel.deleteMany({ where: { datasetId: { in: ids } } });
    await db.parcelImport.deleteMany({ where: { datasetId: { in: ids } } });
    await db.parcelDataset.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimitBucket.deleteMany({ where: { key: { contains: `check-${stamp}` } } });
    await db.$disconnect();
  }
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(() => {
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
