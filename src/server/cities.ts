import "server-only";
import type { City } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { INDIAN_STATES, matchState, titleCase } from "@/lib/india";
import { RESERVED_SLUGS } from "@/lib/site";
import { slugify } from "@/lib/slug";

/** Centre of India — only a fallback when we can't place a new city. */
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };

export const CITY_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'()-]{1,58}$/u;

/** Best-effort place lookup (OpenStreetMap Nominatim). Never throws; null if unknown or slow. */
export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({ format: "jsonv2", countrycodes: "in", limit: "1", q: query });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "Plots land marketplace (contact via site)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

export type CityRef = { cityId?: string | null; cityName?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null };

/**
 * Anyone can list land in any city or town. This finds the City row for what the
 * seller chose or typed, and creates it the first time that place is used:
 * its own page (/mohali), search filter and map centre appear automatically.
 * Returns null if the reference is unusable.
 */
export async function resolveCity(ref: CityRef): Promise<City | null> {
  if (ref.cityId) return db.city.findUnique({ where: { id: ref.cityId } });

  const rawName = (ref.cityName ?? "").trim();
  if (!CITY_NAME_PATTERN.test(rawName)) return null;
  const name = titleCase(rawName);
  const state = ref.state ? matchState(ref.state) : null;

  // Same name (any case); if the state is known, prefer that state's city.
  const sameName = await db.city.findMany({ where: { name: { equals: name, mode: "insensitive" } } });
  const existing = (state && sameName.find((c) => c.state === state)) ?? (!state ? sameName[0] : undefined);
  if (existing) return existing;
  if (!state) return null; // unknown city with no state: the caller must ask for it

  // Slug: /mohali, or /mohali-punjab if another "Mohali" already exists, never a reserved word.
  let base = slugify(name) || "city";
  if (RESERVED_SLUGS.has(base)) base = `${base}-land`;
  const candidates = [base, `${base}-${slugify(state)}`];
  const taken = await db.city.findMany({ where: { slug: { in: candidates } }, select: { slug: true } });
  const takenSet = new Set(taken.map((t) => t.slug));
  let slug = candidates.find((s) => !takenSet.has(s));
  if (!slug) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const hasPin = typeof ref.latitude === "number" && typeof ref.longitude === "number";
  const place = hasPin ? { lat: ref.latitude as number, lng: ref.longitude as number } : (await geocodePlace(`${name}, ${state}, India`)) ?? INDIA_CENTER;

  try {
    return await db.city.create({
      data: {
        slug,
        name,
        district: name,
        state,
        latitude: place.lat,
        longitude: place.lng,
        bighaInSqft: state === "Punjab" || state === "Haryana" || state === "Chandigarh" ? 9_070 : 27_225,
        marlaInSqft: 272.25,
        isLive: true,
        sortOrder: 100,
      },
    });
  } catch {
    // Two sellers created the same city at once — use the one that won.
    return db.city.findFirst({ where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" }, state }] } });
  }
}

export { INDIAN_STATES };
