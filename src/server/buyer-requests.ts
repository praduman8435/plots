import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { LandType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** Requests count as "still looking" for this long after the buyer last asked. */
const ACTIVE_FOR_DAYS = 90;
/** Below this, /sell shows no demand numbers at all (one or two looks like an empty shop). */
export const DEMAND_MIN_TO_SHOW = 3;

// Letters (any script), spaces and the punctuation real names and places use. No digits in names,
// no links or symbols anywhere: nothing here can carry a phishing link to our team's inbox.
const NAME = /^[\p{L}\p{M} .'-]+$/u;
const PLACE = /^[\p{L}\p{M}\p{N} .,'()/-]+$/u;

const oneLine = (max: number, min = 0) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min).max(max));

export const buyerRequestSchema = z.object({
  name: oneLine(60, 2).pipe(z.string().regex(NAME)),
  phone: z.string().min(10).max(16),
  place: oneLine(60, 2).pipe(z.string().regex(PLACE)),
  area: oneLine(80)
    .pipe(z.string().regex(PLACE).or(z.literal("")))
    .optional(),
  landType: z.enum(LandType).optional(),
  // Whole rupees, ₹10,000 to ₹10,000 Cr: anything else is a typo or a probe.
  budgetMax: z.number().int().min(10_000).max(100_000_000_000).optional(),
});
export type BuyerRequestInput = z.infer<typeof buyerRequestSchema>;

/** "  New  Chandigarh " → "new chandigarh": one key per place, however it was typed. */
export function placeKeyOf(place: string): string {
  return place.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Saves a request. The same number asking about the same place again updates
 * that request (and counts once), so repeat taps can't inflate demand.
 */
export async function saveBuyerRequest(input: BuyerRequestInput & { phone: string }) {
  const placeKey = placeKeyOf(input.place);
  // Link to one of our cities when the buyer typed its name, slug or district (never create one).
  const city = await db.city.findFirst({
    where: {
      OR: [
        { slug: slugify(input.place) },
        { name: { equals: input.place, mode: "insensitive" } },
        { district: { equals: input.place, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  const data = {
    name: input.name,
    place: input.place,
    area: input.area || null,
    cityId: city?.id ?? null,
    landType: input.landType ?? null,
    budgetMax: input.budgetMax !== undefined ? BigInt(input.budgetMax) : null,
  };
  await db.buyerRequest.upsert({
    where: { phone_placeKey: { phone: input.phone, placeKey } },
    create: { ...data, phone: input.phone, placeKey },
    // Asking again re-opens a closed request: they're still looking.
    update: { ...data, status: "OPEN", contactedAt: null },
  });
}

export type BuyerDemand = { buyers: number; places: { name: string; buyers: number }[] };

/**
 * Real demand for /sell: distinct buyer numbers still looking, and the places
 * most asked about. Counts only, never who asked. Places are shown only when
 * they match one of our cities: free text typed by the public never reaches
 * a public page (it could carry spam); the team sees it at /admin/buyers.
 */
export async function getBuyerDemand(): Promise<BuyerDemand> {
  const since = new Date(Date.now() - ACTIVE_FOR_DAYS * 86_400_000);
  const [[totals], places] = await Promise.all([
    db.$queryRaw<{ buyers: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "phone") AS buyers FROM "buyer_requests"
      WHERE "status" <> 'CLOSED' AND "updatedAt" >= ${since}`),
    db.$queryRaw<{ name: string; buyers: bigint }[]>(Prisma.sql`
      SELECT c."name" AS name, COUNT(DISTINCT r."phone") AS buyers
      FROM "buyer_requests" r JOIN "cities" c ON c."id" = r."cityId"
      WHERE r."status" <> 'CLOSED' AND r."updatedAt" >= ${since}
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 6`),
  ]);
  return {
    buyers: Number(totals?.buyers ?? 0),
    places: places.map((p) => ({ name: p.name, buyers: Number(p.buyers) })).filter((p) => p.buyers >= 2),
  };
}

/** Our city names, for the place field's suggestions. */
export async function getPlaceSuggestions(): Promise<string[]> {
  const cities = await db.city.findMany({ select: { name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 200 });
  return cities.map((c) => c.name);
}
