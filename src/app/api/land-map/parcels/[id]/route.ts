import { failed, gate, notFound, ok } from "@/server/land-map/http";
import { parcelDetail } from "@/server/land-map/parcels";

/** GET → one parcel's public attributes and its source. */
export async function GET(_req: Request, ctx: RouteContext<"/api/land-map/parcels/[id]">) {
  const blocked = await gate("landMapViewPerIp");
  if (blocked) return blocked;
  const { id } = await ctx.params;
  try {
    const parcel = await parcelDetail(id);
    return parcel ? ok({ parcel }, 60) : notFound();
  } catch (err) {
    return failed("land_map.detail_failed", err);
  }
}
