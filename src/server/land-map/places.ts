import "server-only";
import index from "@/data/land-map/gbn-places.json";
import { VILLAGES } from "./villages";
import type { AreaGeometry, BBox } from "@/lib/land-map/geo";

/**
 * Place search for the parcel map: Gautam Buddha Nagar district, its tehsils,
 * Noida, sectors and localities from a committed OpenStreetMap extract
 * (scripts/land-map/build-places.ts, © OpenStreetMap contributors, ODbL),
 * plus the official revenue villages (Survey of India, villages.ts).
 * Names and outlines for navigation only — never plot (cadastral) data.
 * Searched in memory on the server; the browser only gets the matches.
 */

export type PlaceKind = "district" | "tehsil" | "city" | "sector" | "village" | "locality";
export type PlaceHit = { id: string; name: string; nameHi?: string; kind: PlaceKind; context: string; center: [number, number]; bbox?: BBox };

type Index = {
  source: { name: string; license: string; licenseUrl: string; attribution: string; url: string; note: string };
  district: { id: string; name: string; state: string; bbox: BBox; outline: AreaGeometry };
  tehsils: { id: string; name: string; bbox: BBox; outline: AreaGeometry }[];
  city: { id: string; name: string; bbox: BBox } | null;
  places: { id: string; name: string; nameHi?: string; kind: PlaceKind; lat: number; lng: number; tehsil?: string }[];
};
const data = index as unknown as Index;

export const placeSource = data.source;

/** Outlines drawn on the map (district + tehsils) and the default view. */
export function regionOutlines() {
  return {
    district: { name: data.district.name, state: data.district.state, bbox: data.district.bbox, outline: data.district.outline },
    tehsils: data.tehsils.map((t) => ({ name: t.name, bbox: t.bbox, outline: t.outline })),
    city: data.city ? { name: data.city.name, bbox: data.city.bbox } : null,
  };
}

const center = (b: BBox): [number, number] => [(b.west + b.east) / 2, (b.south + b.north) / 2];
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

type Entry = PlaceHit & { key: string; keyHi?: string; rank: number };

const OFFICIAL_NAMES = new Set(VILLAGES.map((v) => norm(v.name)));

const BASE: (PlaceHit & { rank: number })[] = [
  { id: data.district.id, name: data.district.name, kind: "district", context: `District, ${data.district.state}`, center: center(data.district.bbox), bbox: data.district.bbox, rank: 0 },
  ...(data.city ? [{ id: data.city.id, name: data.city.name, kind: "city" as const, context: `City, ${data.district.name}`, center: center(data.city.bbox), bbox: data.city.bbox, rank: 1 }] : []),
  ...data.tehsils.map((t) => ({ id: t.id, name: `${t.name} tehsil`, kind: "tehsil" as const, context: data.district.name, center: center(t.bbox), bbox: t.bbox, rank: 2 })),
  // Official village boundaries (Survey of India) — searchable and zoomable to their extent.
  ...VILLAGES.map((v) => ({
    id: v.id,
    name: v.name,
    kind: "village" as const,
    context: ["Village (official boundary)", v.tehsil ? `${v.tehsil} tehsil` : data.district.name].join(" · "),
    center: v.center,
    bbox: v.bbox,
    rank: 3,
  })),
  // OSM places, minus villages the official list already has.
  ...data.places.filter((p) => !(p.kind === "village" && OFFICIAL_NAMES.has(norm(p.name)))).map((p) => ({
    id: p.id,
    name: p.name,
    nameHi: p.nameHi,
    kind: p.kind,
    context: [p.kind === "sector" ? "Sector" : p.kind === "village" ? "Village" : "Locality", p.tehsil ? `${p.tehsil} tehsil` : data.district.name].join(" · "),
    center: [p.lng, p.lat] as [number, number],
    rank: p.kind === "sector" ? 3 : p.kind === "village" ? 4 : 5,
  })),
];
const ENTRIES: Entry[] = BASE.map((e) => ({ ...e, key: norm(e.name), keyHi: e.nameHi ? norm(e.nameHi) : undefined }));

// "Noida" also finds the district ("Noida" is what most people call Gautam Buddha Nagar).
const ALIASES: Record<string, string> = { gbn: "gautam buddha nagar", "greater noida": "gautam buddha nagar", "gautam budh nagar": "gautam buddha nagar" };

/** Up to `limit` places matching the query: exact, then prefix, then word prefix, then contains. */
export function searchPlaces(q: string, limit = 8): PlaceHit[] {
  let query = norm(q).slice(0, 60);
  if (!query) return [];
  query = ALIASES[query] ?? query;
  // "sector62" / "sec 62" → "sector 62"
  query = query.replace(/^sec(?:tor)?\s*(\d)/, "sector $1");
  const score = (e: Entry) => {
    for (const k of [e.key, e.keyHi]) {
      if (!k) continue;
      if (k === query) return 0;
      if (k.startsWith(query)) return 1;
      if (k.split(" ").some((w) => w.startsWith(query))) return 2;
      if (k.includes(query)) return 3;
    }
    return -1;
  };
  return ENTRIES.map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.rank - b.e.rank || a.e.name.localeCompare(b.e.name, "en", { numeric: true }))
    .slice(0, limit)
    .map(({ e }) => ({ id: e.id, name: e.name, ...(e.nameHi ? { nameHi: e.nameHi } : {}), kind: e.kind, context: e.context, center: e.center, ...(e.bbox ? { bbox: e.bbox } : {}) }));
}
