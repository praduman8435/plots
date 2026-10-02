import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AVAILABILITY } from "@/server/listings/service";

/**
 * The four availability groups the admin works through. Each live plot is in
 * at most one of them (mirrors runAvailabilityChecks in listings/service.ts):
 *
 *   waiting       check delivered, 24h reply timer running
 *   unreachable   the latest check attempt wasn't delivered (no timer)
 *   unavailable   hidden because a delivered check got no reply in 24h
 *   due           not confirmed/published in 7+ days, no attempt in the last 24h
 */
export function availabilityWhere(now = new Date()) {
  const weekAgo = new Date(now.getTime() - AVAILABILITY.checkEveryMs);
  const retryBefore = new Date(now.getTime() - AVAILABILITY.retryUndeliveredAfterMs);

  const waiting: Prisma.PropertyWhereInput = { status: "ACTIVE", availabilityCheckSentAt: { not: null } };

  // Attempted after the plot was last confirmed/(re)published, but never delivered.
  const unreachable: Prisma.PropertyWhereInput = {
    status: "ACTIVE",
    availabilityCheckSentAt: null,
    lastAvailabilityCheckAt: { not: null },
    OR: [{ freshnessAt: null }, { freshnessAt: { lte: db.property.fields.lastAvailabilityCheckAt } }],
  };

  const unavailable: Prisma.PropertyWhereInput = { status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED" };

  const due: Prisma.PropertyWhereInput = {
    status: "ACTIVE",
    availabilityCheckSentAt: null,
    OR: [{ lastConfirmedAt: { lt: weekAgo } }, { lastConfirmedAt: null, publishedAt: { lt: weekAgo } }],
    AND: [{ OR: [{ lastAvailabilityCheckAt: null }, { lastAvailabilityCheckAt: { lt: retryBefore } }] }, { NOT: unreachable }],
  };

  return { waiting, unreachable, unavailable, due };
}

/** Plots that need a person: awaiting a reply + couldn't reach the seller + hidden for no reply. */
export async function countAvailabilityAttention(now = new Date()) {
  const w = availabilityWhere(now);
  const [waiting, unreachable, unavailable] = await Promise.all([
    db.property.count({ where: w.waiting }),
    db.property.count({ where: w.unreachable }),
    db.property.count({ where: w.unavailable }),
  ]);
  return { waiting, unreachable, unavailable, total: waiting + unreachable + unavailable };
}
