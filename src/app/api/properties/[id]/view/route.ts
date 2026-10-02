import { db } from "@/lib/db";

/** Counts a plot page view (sent by the browser, so cached pages still count). */
export async function POST(_req: Request, ctx: RouteContext<"/api/properties/[id]/view">) {
  const { id } = await ctx.params;
  await db.property.updateMany({ where: { id, status: "ACTIVE" }, data: { viewCount: { increment: 1 } } });
  return new Response(null, { status: 204 });
}
