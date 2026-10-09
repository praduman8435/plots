import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { AreaUnit, LandType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { toSqft } from "@/lib/units";

/** Everything a property card needs. */
export const cardSelect = {
  id: true,
  code: true,
  slug: true,
  title: true,
  landType: true,
  locality: true,
  village: true,
  area: true,
  areaUnit: true,
  areaSqft: true,
  price: true,
  priceNegotiable: true,
  features: true,
  publishedAt: true,
  lastConfirmedAt: true,
  createdAt: true,
  status: true,
  description: true,
  city: { select: { name: true, slug: true } },
  seller: { select: { name: true, sellerType: true, phone: true, phoneVerifiedAt: true } },
  images: { select: { url: true, width: true, height: true }, orderBy: { position: "asc" }, take: 1 },
} satisfies Prisma.PropertySelect;

export type PropertyCardData = Prisma.PropertyGetPayload<{ select: typeof cardSelect }>;

export const SORTS = {
  // Recently confirmed / recently published first — the most usable inventory on top.
  recommended: { label: "Recommended", orderBy: [{ freshnessAt: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }] },
  newest: { label: "Newest first", orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] },
  price_asc: { label: "Price: low to high", orderBy: [{ price: "asc" }] },
  price_desc: { label: "Price: high to low", orderBy: [{ price: "desc" }] },
} as const satisfies Record<string, { label: string; orderBy: Prisma.PropertyOrderByWithRelationInput[] }>;

export type SortKey = keyof typeof SORTS;

export type SearchFilters = {
  city?: string; // slug
  q?: string; // locality / village / title / plot code
  type?: LandType;
  minPrice?: number; // rupees
  maxPrice?: number;
  minArea?: number; // in `areaUnit`
  maxArea?: number;
  areaUnit: AreaUnit;
  sort: SortKey;
  page: number;
};

export const PAGE_SIZE = 12;

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
/** Positive number, capped well inside Postgres bigint so a "?minPrice=1e30" can't overflow the query. */
const num = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e15) : undefined;
};

/** URL search params → validated filters. Unknown values are dropped, never trusted. */
export function parseSearchParams(sp: RawParams): SearchFilters {
  const type = one(sp.type);
  const unit = one(sp.unit);
  const sort = one(sp.sort);
  return {
    city: one(sp.city),
    q: one(sp.q)?.slice(0, 80),
    type: type && Object.hasOwn(LandType, type) ? (type as LandType) : undefined,
    minPrice: num(sp.minPrice),
    maxPrice: num(sp.maxPrice),
    minArea: num(sp.minArea),
    maxArea: num(sp.maxArea),
    areaUnit: unit && Object.hasOwn(AreaUnit, unit) ? (unit as AreaUnit) : "SQFT",
    sort: sort && Object.hasOwn(SORTS, sort) ? (sort as SortKey) : "recommended",
    // Bounded: a huge ?page= would make Postgres walk past millions of rows (OFFSET).
    page: Math.min(500, Math.max(1, Math.floor(num(sp.page) ?? 1))),
  };
}

export async function searchListings(f: SearchFilters) {
  const city = f.city ? await db.city.findUnique({ where: { slug: f.city } }) : null;
  const bigha = city?.bighaInSqft ?? 27_225;
  const marla = city?.marlaInSqft ?? 272.25;

  const where: Prisma.PropertyWhereInput = {
    status: "ACTIVE",
    ...(city ? { cityId: city.id } : {}),
    ...(f.type ? { landType: f.type } : {}),
    ...(f.minPrice || f.maxPrice
      ? { price: { ...(f.minPrice ? { gte: BigInt(Math.round(f.minPrice)) } : {}), ...(f.maxPrice ? { lte: BigInt(Math.round(f.maxPrice)) } : {}) } }
      : {}),
    ...(f.minArea || f.maxArea
      ? {
          areaSqft: {
            ...(f.minArea ? { gte: toSqft(f.minArea, f.areaUnit, bigha, marla) * 0.999 } : {}),
            ...(f.maxArea ? { lte: toSqft(f.maxArea, f.areaUnit, bigha, marla) * 1.001 } : {}),
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { locality: { contains: f.q, mode: "insensitive" } },
            { city: { name: { contains: f.q, mode: "insensitive" } } },
            { village: { contains: f.q, mode: "insensitive" } },
            { title: { contains: f.q, mode: "insensitive" } },
            { code: { equals: f.q.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    db.property.count({ where }),
    db.property.findMany({
      where,
      select: cardSelect,
      orderBy: [...SORTS[f.sort].orderBy, { id: "asc" }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, items, city, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Every city/town that exists (for suggestions and filters), busiest first. */
export async function getLiveCities() {
  return db.city.findMany({ where: { isLive: true }, orderBy: [{ properties: { _count: "desc" } }, { name: "asc" }], take: 400 });
}

export async function getLatestListings(take = 8, cityId?: string, landType?: LandType) {
  return db.property.findMany({
    where: { status: "ACTIVE", ...(cityId ? { cityId } : {}), ...(landType ? { landType } : {}) },
    select: cardSelect,
    orderBy: [...SORTS.recommended.orderBy, { id: "asc" }],
    take,
  });
}

/** Cities that have live land right now, busiest first — for "Popular locations", filters and the cities page. */
export async function getCitiesWithCounts(limit = 60) {
  const counts = await db.property.groupBy({ by: ["cityId"], where: { status: "ACTIVE" }, _count: { _all: true }, orderBy: { _count: { cityId: "desc" } }, take: limit });
  if (counts.length === 0) return [];
  const cities = await db.city.findMany({ where: { id: { in: counts.map((c) => c.cityId) } } });
  const byId = new Map(cities.map((c) => [c.id, c]));
  return counts.flatMap((c) => {
    const city = byId.get(c.cityId);
    return city ? [{ ...city, live: c._count._all }] : [];
  });
}

/** Counts per land type and a few headline numbers for landing pages. */
export async function getMarketStats(cityId?: string) {
  const where = { status: "ACTIVE" as const, ...(cityId ? { cityId } : {}) };
  const [byType, live, sellers, localities] = await Promise.all([
    db.property.groupBy({ by: ["landType"], where, _count: { _all: true } }),
    db.property.count({ where }),
    db.seller.count({ where: { properties: { some: where } } }),
    db.property.groupBy({ by: ["locality"], where, _count: { _all: true }, orderBy: { _count: { locality: "desc" } }, take: 40 }),
  ]);
  const typeCounts = Object.fromEntries(byType.map((t) => [t.landType, t._count._all])) as Partial<Record<LandType, number>>;
  // Short, clean locality names for quick-search chips ("Sidhari, on Azamgarh–Varanasi road" → "Sidhari").
  const areaNames = [...new Set(localities.map((l) => l.locality.split(/[,(]| near | behind | on /i)[0].trim()))].filter(Boolean).slice(0, 10);
  return { typeCounts, live, sellers, areaNames };
}

export async function getListingBySlug(slug: string) {
  return db.property.findUnique({
    where: { slug },
    include: {
      city: true,
      seller: {
        select: {
          id: true, name: true, sellerType: true, phone: true, phoneVerifiedAt: true, identityStatus: true, createdAt: true, profileSlug: true, isBlocked: true,
          _count: { select: { properties: { where: { status: "ACTIVE" } } } },
        },
      },
      images: { orderBy: { position: "asc" } },
      _count: { select: { enquiries: true } },
    },
  });
}

export async function getSimilarListings(p: { id: string; cityId: string; landType: LandType; price: bigint }, take = 4) {
  const similar = await db.property.findMany({
    where: { status: "ACTIVE", cityId: p.cityId, landType: p.landType, id: { not: p.id } },
    select: cardSelect,
    take: 24,
  });
  // Closest in price first.
  return similar
    .sort((a, b) => Math.abs(Number(a.price - p.price)) - Math.abs(Number(b.price - p.price)))
    .slice(0, take);
}
