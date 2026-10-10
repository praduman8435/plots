import { timingSafeEqual } from "node:crypto";
import { log } from "@/lib/log";
import { runAvailabilityChecks } from "@/server/listings/service";
import { pruneExpiredData } from "@/server/maintenance";

/**
 * Daily job (e.g. Vercel Cron, or any scheduler): asks sellers of plots not
 * confirmed in 30 days whether they're still available, and hides plots
 * whose check went unanswered for 7 days. Never marks anything sold.
 * Also prunes expired sessions, old login codes and rate-limit counters.
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/availability
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  // Compare byte lengths (not string lengths): a multi-byte header must be a clean 401, not a 500.
  const a = Buffer.from(given);
  const b = Buffer.from(secret ?? "");
  const ok = Boolean(secret) && a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runAvailabilityChecks();
  const pruned = await pruneExpiredData().catch((err) => {
    log("error", "maintenance.prune_failed", { err });
    return null;
  });
  log("info", "cron.availability_done", { ...result, pruned });
  return Response.json({ ok: true, ...result, pruned });
}
