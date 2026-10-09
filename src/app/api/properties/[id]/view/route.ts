import { db } from "@/lib/db";
import { hitIpRateLimit } from "@/lib/rate-limit";

/**
 * Counts a plot page view (sent by the browser, so cached pages still count).
 * At most one counted view per visitor IP per plot per 30 minutes, so reloads
 * and scripts can't inflate the number. Always 204 — nothing to tell the client.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/properties/[id]/view">) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return new Response(null, { status: 204 });
  const [overall, perPlot] = await Promise.all([hitIpRateLimit("viewsPerIp"), hitIpRateLimit("viewPerIpProperty", id)]);
  if (overall.ok && perPlot.ok) {
    await db.property.updateMany({ where: { id, status: "ACTIVE" }, data: { viewCount: { increment: 1 } } });
  }
  return new Response(null, { status: 204 });
}
