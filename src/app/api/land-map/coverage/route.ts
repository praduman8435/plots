import { failed, gate, ok } from "@/server/land-map/http";
import { parcelCoverage } from "@/server/land-map/parcels";

/** GET → where parcel data exists (one box per dataset). */
export async function GET() {
  const blocked = await gate("landMapViewPerIp");
  if (blocked) return blocked;
  try {
    return ok({ coverage: await parcelCoverage() }, 300);
  } catch (err) {
    return failed("land_map.coverage_failed", err);
  }
}
