import { badRequest, gate, ok } from "@/server/land-map/http";
import { villagesInView, villageViewSchema } from "@/server/land-map/villages";

/** GET ?west&south&east&north&zoom → official village boundaries in view (zoom ≥ 11). */
export async function GET(req: Request) {
  const blocked = await gate("landMapViewPerIp");
  if (blocked) return blocked;
  const parsed = villageViewSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid viewport");
  return ok(villagesInView(parsed.data), 300);
}
