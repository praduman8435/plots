import "server-only";
import { db } from "@/lib/db";
import { countAvailabilityAttention } from "@/server/admin/availability";

export const DAY_MS = 86_400_000;

/** Badge counts for the admin navigation. */
export async function getAdminNavCounts() {
  const [pending, unreadChats, availability, openReports] = await Promise.all([
    db.property.count({ where: { status: "PENDING" } }),
    db.whatsAppConversation.count({ where: { unreadCount: { gt: 0 } } }),
    countAvailabilityAttention(),
    db.report.count({ where: { status: "PENDING" } }),
  ]);
  return { pending, unreadChats, needsAttention: availability.total, openReports };
}

/** A point in time `days` ago (kept out of components so render stays pure for the linter). */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** The current time, for server components (keeps render pure for the linter). */
export function now(): Date {
  return new Date();
}
