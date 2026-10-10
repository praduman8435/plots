import "server-only";
import { z } from "zod";
import data from "@/data/land-map/gbn-villages.json";
import { bboxIntersects, type AreaGeometry, type BBox } from "@/lib/land-map/geo";

/**
 * Official revenue-village boundaries of Gautam Buddha Nagar (Survey of
 * India, via the National Water Data Portal — scripts/land-map/build-villages.ts).
 * Village extents only: they say nothing about plots or ownership.
 * Kept in memory on the server; the browser gets the villages in view.
 */
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
const index = data as unknown as { source: { name: string; url: string; attribution: string; terms: string; sourceUpdatedAt: string; note: string }; villages: Village[] };

export const villageSource = index.source;
export const VILLAGES: readonly Village[] = index.villages;
export const MIN_VILLAGE_ZOOM = 11;

export const villageViewSchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    zoom: z.coerce.number().int().min(0).max(22),
  })
  .refine((b) => b.west < b.east && b.south < b.north, "Invalid bounding box")
  .refine((b) => b.east - b.west <= 0.8 && b.north - b.south <= 0.8, "Bounding box too large — zoom in");

export type VillageProps = Omit<Village, "geometry" | "bbox" | "center"> & { synthetic: false };

/** Villages overlapping the view, as GeoJSON (≤ 400 — the whole district is 333). */
export function villagesInView(v: BBox & { zoom: number }) {
  if (v.zoom < MIN_VILLAGE_ZOOM) return { mode: "zoom-in" as const, minZoom: MIN_VILLAGE_ZOOM };
  const features = VILLAGES.filter((x) => bboxIntersects(x.bbox, v))
    .slice(0, 400)
    .map((x) => ({
      type: "Feature" as const,
      id: x.id,
      geometry: x.geometry,
      properties: { id: x.id, name: x.name, center: x.center, bbox: x.bbox, code: x.code, tehsil: x.tehsil, tehsilCode: x.tehsilCode, block: x.block, kind: x.kind, censusAreaHa: x.censusAreaHa, areaHa: x.areaHa },
    }));
  return { mode: "villages" as const, type: "FeatureCollection" as const, features };
}
