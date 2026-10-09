import "server-only";
import { db } from "@/lib/db";
import { isValidProfileSlug, sellerProfileSlug } from "@/lib/seller-profile";
import { cardSelect } from "@/server/listings/queries";

export const PROFILE_PAGE_SIZE = 12;

/** Returns the seller's permanent profile slug, creating it once if an older account doesn't have one yet. */
export async function ensureProfileSlug(seller: { id: string; name: string; code: string; profileSlug: string | null }): Promise<string> {
  if (seller.profileSlug) return seller.profileSlug;
  const slug = sellerProfileSlug(seller.name, seller.code);
  // Only fills an empty slug — never overwrites one that is already public.
  await db.seller.updateMany({ where: { id: seller.id, profileSlug: null }, data: { profileSlug: slug } });
  const fresh = await db.seller.findUnique({ where: { id: seller.id }, select: { profileSlug: true } });
  return fresh?.profileSlug ?? slug;
}

/**
 * Everything the public profile shows — and nothing else. Explicit selects
 * only: no phone/identity details beyond the public trust badges, no internal
 * ids in the output, and only listings buyers can already see (status ACTIVE:
 * approved, live, availability not lapsed, not sold).
 */
export async function getPublicSellerProfile(slugInput: string, pageInput = 1) {
  const slug = slugInput.toLowerCase();
  if (!isValidProfileSlug(slug)) return null;

  const seller = await db.seller.findUnique({
    where: { profileSlug: slug },
    select: { id: true, name: true, sellerType: true, phoneVerifiedAt: true, identityStatus: true, createdAt: true, isBlocked: true, profileSlug: true },
  });
  if (!seller || seller.isBlocked || !seller.profileSlug) return null;

  const where = { sellerId: seller.id, status: "ACTIVE" as const };
  const total = await db.property.count({ where });
  const pages = Math.max(1, Math.ceil(total / PROFILE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(pageInput) || 1), pages);

  const [listings, byCity] = await Promise.all([
    db.property.findMany({
      where,
      select: cardSelect,
      orderBy: [{ freshnessAt: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PROFILE_PAGE_SIZE,
      take: PROFILE_PAGE_SIZE,
    }),
    db.property.groupBy({ by: ["cityId"], where, _count: { _all: true }, orderBy: { _count: { cityId: "desc" } }, take: 5 }),
  ]);
  const cities = byCity.length
    ? await db.city.findMany({ where: { id: { in: byCity.map((c) => c.cityId) } }, select: { id: true, name: true, slug: true } })
    : [];
  const cityOrder = new Map(byCity.map((c, i) => [c.cityId, i]));

  return {
    slug: seller.profileSlug,
    name: seller.name,
    sellerType: seller.sellerType,
    phoneVerified: Boolean(seller.phoneVerifiedAt),
    identityVerified: seller.identityStatus === "VERIFIED",
    memberSince: seller.createdAt,
    total,
    page,
    pages,
    listings,
    cities: cities.sort((a, b) => (cityOrder.get(a.id) ?? 0) - (cityOrder.get(b.id) ?? 0)).map((c) => ({ name: c.name, slug: c.slug })),
  };
}

export type PublicSellerProfile = NonNullable<Awaited<ReturnType<typeof getPublicSellerProfile>>>;
