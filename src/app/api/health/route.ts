import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database reachability for uptime monitors. Says only "ok" or
 * "degraded" — no versions, hostnames, error messages or timings that would
 * help an attacker. Cheap: one `SELECT 1` with a 3 s cap.
 */
export async function GET() {
  const dbOk = await Promise.race([
    db.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
  ]);
  return Response.json({ status: dbOk ? "ok" : "degraded" }, { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
