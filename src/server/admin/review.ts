import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { findPossibleDuplicates } from "@/server/listings/duplicates";

/** Everything a review card shows — one query per page plus a duplicate check per plot. */
export const reviewInclude = {
  city: { select: { name: true } },
  seller: { select: { id: true, name: true, code: true, sellerType: true, phoneVerifiedAt: true, identityStatus: true } },
  images: { orderBy: { position: "asc" }, take: 8, select: { id: true, url: true } },
  _count: { select: { images: true } },
} satisfies Prisma.PropertyInclude;

/** Pending plots, oldest first (nobody waits forever), each with possible duplicates. */
export async function loadReviewQueue({ where, skip = 0, take }: { where?: Prisma.PropertyWhereInput; skip?: number; take: number }) {
  const rows = await db.property.findMany({
    where: { ...where, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    skip,
    take,
    include: reviewInclude,
  });
  const duplicates = await Promise.all(rows.map((p) => findPossibleDuplicates(p.id)));
  return rows.map((p, i) => ({ ...p, duplicates: duplicates[i] }));
}

export type ReviewQueueItem = Awaited<ReturnType<typeof loadReviewQueue>>[number];
