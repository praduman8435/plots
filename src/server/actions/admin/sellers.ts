"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import type { AdminActionResult } from "./listings";

const schema = z.object({ sellerId: z.string().min(1).max(64), blocked: z.boolean() });

/**
 * Blocking signs the seller out of the portal (getSellerSession refuses
 * blocked sellers) and hides their live plots from buyers. Unblocking
 * does NOT auto-republish — an admin reviews and unhides plots one by one.
 */
export async function setSellerBlockedAction(sellerId: string, blocked: boolean): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse({ sellerId, blocked });
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const seller = await db.seller.findUnique({ where: { id: parsed.data.sellerId }, select: { id: true } });
  if (!seller) return { ok: false, message: "This seller no longer exists." };

  let hidden = 0;
  await db.$transaction(async (tx) => {
    await tx.seller.update({ where: { id: seller.id }, data: { isBlocked: parsed.data.blocked } });
    if (parsed.data.blocked) {
      await tx.sellerSession.deleteMany({ where: { sellerId: seller.id } });
      const r = await tx.property.updateMany({
        where: { sellerId: seller.id, status: "ACTIVE" },
        // Clear any running 24h reply timer so an unhide later doesn't instantly expire.
        data: { status: "HIDDEN", hiddenReason: "BY_ADMIN", availabilityCheckSentAt: null },
      });
      hidden = r.count;
    }
  });

  revalidatePath("/admin", "layout");
  if (hidden > 0) {
    // Many public pages may have changed: revalidate everything.
    revalidatePath("/", "layout");
  }
  return {
    ok: true,
    message: parsed.data.blocked
      ? `Seller blocked.${hidden ? ` ${hidden} live plot${hidden === 1 ? " was" : "s were"} hidden.` : ""}`
      : "Seller unblocked. Unhide their plots individually if they should go live again.",
  };
}
