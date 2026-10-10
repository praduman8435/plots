/**
 * Builds src/data/land-map/gbn-places.json — the place search index for the
 * parcel map (district, tehsils, Noida sectors, villages, localities) — from
 * OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0).
 *
 *   pnpm tsx scripts/land-map/build-places.ts
 *
 * Run by hand when the index should be refreshed; the output is committed.
 * Uses a handful of requests (Overpass for ids/places, Nominatim /lookup for
 * assembled boundaries), spaced to respect both services' usage policies.
 * These are place names and administrative outlines, NOT cadastral parcels.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { bboxOf, pointInGeometry, roundGeometry, simplifyGeometry, type AreaGeometry, type Position } from "../../src/lib/land-map/geo";

const UA = "InstaPlots land-map place index builder (https://plots-red.vercel.app)";
const OUT = join(process.cwd(), "src/data/land-map/gbn-places.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string, attempt = 1): Promise<Awaited<ReturnType<typeof overpassOnce>>> {
  try {
    return await overpassOnce(query);
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(15_000 * attempt); // a busy public server: back off, don't hammer it
    return overpass(query, attempt + 1);
  }
}

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let call = 0;

async function overpassOnce(query: string) {
  const res = await fetch(ENDPOINTS[call++ % ENDPOINTS.length], {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return (await res.json()) as { elements: { type: string; id: number; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[] };
}

async function boundary(relationId: number): Promise<AreaGeometry> {
  await sleep(1100); // Nominatim: max 1 request per second
  const res = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=R${relationId}&polygon_geojson=1&format=json`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = (await res.json()) as { geojson?: AreaGeometry }[];
  if (!hit?.geojson || (hit.geojson.type !== "Polygon" && hit.geojson.type !== "MultiPolygon")) throw new Error(`No polygon for relation ${relationId}`);
  return hit.geojson;
}

type Kind = "district" | "tehsil" | "city" | "sector" | "village" | "locality";

async function main() {
  // Gautam Buddha Nagar district (admin_level 5 in OSM India) and its tehsils (admin_level 6).
  const adminRaw = await overpass(`[out:json][timeout:60];relation["boundary"="administrative"]["admin_level"~"^(5|6|8)$"](28.18,77.28,28.65,77.75);out ids tags;`);
  const admin = {
    elements: adminRaw.elements.filter((e) =>
      e.tags?.admin_level === "5" ? e.tags.name === "Gautam Buddha Nagar" : e.tags?.admin_level === "6" ? ["Dadri", "Jewar", "Gautam Buddha Nagar"].includes(e.tags.name ?? "") : e.tags?.name === "Noida",
    ),
  };
  const district = admin.elements.find((e) => e.tags?.admin_level === "5");
  if (!district) throw new Error("District relation not found");
  const districtGeom = await boundary(district.id);

  const tehsils: { id: string; name: string; geometry: AreaGeometry }[] = [];
  for (const t of admin.elements.filter((e) => e.tags?.admin_level === "6")) {
    const g = await boundary(t.id);
    // Same-named district/tehsil: keep the tehsil only if it is a part of the district.
    const c = bboxOf(g);
    if (!pointInGeometry([(c.west + c.east) / 2, (c.south + c.north) / 2], districtGeom)) continue;
    tehsils.push({ id: `osm:relation/${t.id}`, name: t.tags?.name ?? "", geometry: g });
  }
  const noida = admin.elements.find((e) => e.tags?.admin_level === "8");
  const noidaGeom = noida ? await boundary(noida.id) : null;

  await sleep(1500);
  const raw = await overpass(`[out:json][timeout:90];
(node["place"~"^(village|hamlet|suburb|neighbourhood|quarter|town)$"](28.18,77.28,28.65,77.75);
 way["place"~"^(suburb|neighbourhood|quarter)$"](28.18,77.28,28.65,77.75);
 way["name"~"^(YEIDA )?Sector[ -]?[0-9]+[A-Z]?$",i]["landuse"](28.18,77.28,28.65,77.75);
 relation["name"~"^(YEIDA )?Sector[ -]?[0-9]+[A-Z]?$",i]["landuse"](28.18,77.28,28.65,77.75););
out tags center;`);

  const places: { id: string; name: string; nameHi?: string; kind: Kind; lat: number; lng: number; tehsil?: string }[] = [];
  const seen = new Set<string>();
  for (const e of raw.elements) {
    const name = e.tags?.["name:en"] || e.tags?.name;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!name || lat == null || lng == null) continue;
    const p: Position = [lng, lat];
    if (!pointInGeometry(p, districtGeom)) continue; // only inside Gautam Buddha Nagar
    const place = e.tags?.place ?? "";
    const kind: Kind = /\bsector\b/i.test(name) ? "sector" : place === "village" || place === "hamlet" ? "village" : "locality";
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `osm:${e.type}/${e.id}`,
      name,
      ...(e.tags?.["name:hi"] ? { nameHi: e.tags["name:hi"] } : {}),
      kind,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      tehsil: tehsils.find((t) => pointInGeometry(p, t.geometry))?.name,
    });
  }
  places.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "en", { numeric: true }));

  const outline = (g: AreaGeometry) => roundGeometry(simplifyGeometry(g, 0.0008), 5); // ≈ 80 m: an outline, not a boundary of record
  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      name: "OpenStreetMap",
      license: "ODbL 1.0",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      attribution: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      note: "Place names and approximate administrative outlines for search and navigation only. Not cadastral boundaries.",
    },
    district: { id: `osm:relation/${district.id}`, name: "Gautam Buddha Nagar", state: "Uttar Pradesh", bbox: bboxOf(districtGeom), outline: outline(districtGeom) },
    tehsils: tehsils.map((t) => ({ id: t.id, name: t.name, bbox: bboxOf(t.geometry), outline: outline(t.geometry) })),
    city: noidaGeom && noida ? { id: `osm:relation/${noida.id}`, name: "Noida", bbox: bboxOf(noidaGeom) } : null,
    places,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const counts = places.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
  console.log(`Wrote ${OUT}: ${tehsils.length} tehsils, ${places.length} places`, counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
