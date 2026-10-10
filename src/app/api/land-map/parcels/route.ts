import { badRequest, failed, gate, ok } from "@/server/land-map/http";
import { parcelsInView, viewportSchema } from "@/server/land-map/parcels";

/** GET ?west&south&east&north&zoom → parcels overlapping the view (GeoJSON), or "zoom in". */
export async function GET(req: Request) {
  const blocked = await gate("landMapViewPerIp");
  if (blocked) return blocked;
  const parsed = viewportSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid viewport");
  try {
    return ok(await parcelsInView(parsed.data), 60);
  } catch (err) {
    return failed("land_map.viewport_failed", err);
  }
}
