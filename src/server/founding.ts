import "server-only";
import { db } from "@/lib/db";

/**
 * Founding Sellers: the first sellers to get a listing approved get a
 * permanent badge, and their land comes first in "Recommended" search.
 *
 * A spot is earned by an approved listing, not by signing up, so empty
 * accounts can't use the spots up.
 */
export const FOUNDING_SPOTS = 100;

/**
 * Gives the seller the next Founding Seller number if they don't have one and
 * spots are left. Returns their number (new or existing), or null.
 *
 * Claims run one at a time under a transaction-scoped advisory lock, so two
 * approvals at the same moment can never share a number or go past the cap
 * (the unique index on foundingNumber backs this up). Numbers continue from
 * the highest one given out, so a deleted seller's number is never reused.
 */
export async function claimFoundingSpot(sellerId: string): Promise<number | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4810017)`;
    const seller = await tx.seller.findUnique({ where: { id: sellerId }, select: { foundingNumber: true, isBlocked: true } });
    if (!seller || seller.isBlocked) return null;
    if (seller.foundingNumber) return seller.foundingNumber;

    const { _max } = await tx.seller.aggregate({ _max: { foundingNumber: true } });
    const next = (_max.foundingNumber ?? 0) + 1;
    if (next > FOUNDING_SPOTS) return null;
    await tx.seller.update({ where: { id: sellerId }, data: { foundingNumber: next, isFounding: true } });
    return next;
  });
}

/** Spots given out and left, for the home and /sell pages (both cached, so this runs rarely). */
export async function getFoundingSpots(): Promise<{ taken: number; left: number; total: number }> {
  const { _max } = await db.seller.aggregate({ _max: { foundingNumber: true } });
  const taken = Math.min(_max.foundingNumber ?? 0, FOUNDING_SPOTS);
  return { taken, left: FOUNDING_SPOTS - taken, total: FOUNDING_SPOTS };
}
