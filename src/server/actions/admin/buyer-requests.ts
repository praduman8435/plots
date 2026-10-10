"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";

const schema = z.object({ id: z.string().min(1).max(64), status: z.enum(["OPEN", "CONTACTED", "CLOSED"]) });

/** Admin: mark a buyer's request contacted, closed, or open again. A plain form post, so it works without JavaScript. */
export async function setBuyerRequestStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;
  const { id, status } = parsed.data;

  const r = await db.buyerRequest.updateMany({
    where: { id },
    data: { status, contactedAt: status === "CONTACTED" ? new Date() : status === "OPEN" ? null : undefined },
  });
  if (r.count === 0) return;
  await recordAudit(admin, { action: `buyer_request.${status.toLowerCase()}`, targetType: "buyer_request", targetId: id });
  revalidatePath("/admin/buyers");
}
