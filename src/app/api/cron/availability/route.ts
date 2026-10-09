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
  const ok = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runAvailabilityChecks();
  const pruned = await pruneExpiredData().catch((err) => {
    log("error", "maintenance.prune_failed", { err });
    return null;
  });
  log("info", "cron.availability_done", { ...result, pruned });
  return Response.json({ ok: true, ...result, pruned });
}
