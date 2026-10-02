"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/seller/require";
import type { ListingFormPayload, ListingFormResult } from "@/components/listing/types";
import { listingInputSchema } from "@/lib/validation/listing";
import { isKycAvailable } from "@/server/kyc/provider";
import { resolveCity } from "@/server/cities";
import { isOurImageUrl } from "@/server/storage";
import { changeListingStatus, createListing, updateListing, type StatusAction } from "@/server/listings/service";

type SellerAction = "MARK_SOLD" | "CONFIRM_AVAILABLE" | "HIDE" | "UNHIDE";

/** A seller can only act on their own plots, and only through these four actions. */
export async function sellerListingAction(propertyId: string, action: SellerAction): Promise<{ ok: boolean; message?: string }> {
  const seller = await requireSeller();
  const p = await db.property.findFirst({ where: { id: propertyId, sellerId: seller.id }, select: { id: true, slug: true, status: true, hiddenReason: true } });
  if (!p) return { ok: false, message: "Plot not found." };

  const allowed: Record<SellerAction, boolean> = {
    MARK_SOLD: p.status === "ACTIVE" || p.status === "HIDDEN",
    // Also "reactivate": a plot hidden for no reply, hidden by the seller, or marked sold by mistake.
    CONFIRM_AVAILABLE: p.status === "ACTIVE" || p.status === "SOLD" || (p.status === "HIDDEN" && p.hiddenReason !== "BY_ADMIN"),
    HIDE: p.status === "ACTIVE",
    UNHIDE: p.status === "HIDDEN" && p.hiddenReason === "BY_SELLER",
  };
  if (!allowed[action]) return { ok: false, message: "That action isn't available for this plot." };

  const map: Record<SellerAction, StatusAction> = {
    MARK_SOLD: { type: "MARK_SOLD" },
    CONFIRM_AVAILABLE: { type: "CONFIRM_AVAILABLE" },
    HIDE: { type: "HIDE", by: "SELLER" },
    UNHIDE: { type: "UNHIDE" },
  };
  // The seller is looking at the result on screen, so no WhatsApp echo.
  await changeListingStatus(p.id, map[action], { notify: false, via: "dashboard" });

  revalidatePath("/seller/dashboard");
  revalidatePath(`/property/${p.slug}`);
  revalidatePath("/");
  revalidatePath("/[city]", "page");
  return { ok: true };
}


/** Seller's own "Add plot" (web). Always PENDING — an admin verifies before it goes live. */
export async function createSellerListing(payload: ListingFormPayload): Promise<ListingFormResult> {
  const seller = await requireSeller();
  const parsed = listingInputSchema.safeParse(payload.listing);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const city = await resolveCity({ ...parsed.data });
  if (!city) return { ok: false, fieldErrors: { cityName: "Enter the city or district" } };

  // Only accept images our own upload endpoint produced.
  const images = (payload.images ?? []).filter((i) => isOurImageUrl(i.url)).slice(0, 10);

  // Web listings need identity verification once, when a KYC provider is configured.
  if (isKycAvailable() && seller.identityStatus !== "VERIFIED") return { ok: false, message: "Please verify your identity first." };
  if (!seller.onboardedAt) return { ok: false, message: "Please finish setting up your seller account first." };

  const property = await createListing({ sellerId: seller.id, source: "WEB", input: parsed.data, images });
  revalidatePath("/seller/dashboard");
  revalidatePath("/admin", "layout");
  return { ok: true, redirectTo: `/seller/plots/submitted?code=${property.code}` };
}

/**
 * Seller edits their own plot. Live/hidden/rejected plots go back to
 * "Pending approval" so an admin re-checks the changes; sold plots can't be edited.
 */
export async function updateSellerListing(propertyId: string, payload: ListingFormPayload): Promise<ListingFormResult> {
  const seller = await requireSeller();
  const p = await db.property.findFirst({ where: { id: propertyId, sellerId: seller.id }, select: { id: true, slug: true, status: true, code: true } });
  if (!p) return { ok: false, message: "Property not found." };
  if (p.status === "SOLD") return { ok: false, message: "Sold properties can't be edited. Mark it available again first." };

  const parsed = listingInputSchema.safeParse(payload.listing);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const city = await resolveCity({ ...parsed.data });
  if (!city) return { ok: false, fieldErrors: { cityName: "Enter the city or district" } };
  const images = (payload.images ?? []).filter((i) => isOurImageUrl(i.url)).slice(0, 10);

  await updateListing(p.id, parsed.data);
  await db.$transaction([
    db.propertyImage.deleteMany({ where: { propertyId: p.id } }),
    db.propertyImage.createMany({ data: images.map((img, position) => ({ propertyId: p.id, url: img.url, width: img.width, height: img.height, position })) }),
    db.property.update({ where: { id: p.id }, data: { status: "PENDING", hiddenReason: null, rejectionReason: null, availabilityCheckSentAt: null } }),
  ]);

  revalidatePath("/seller/dashboard");
  revalidatePath(`/property/${p.slug}`);
  revalidatePath("/");
  revalidatePath("/admin", "layout");
  return { ok: true, redirectTo: `/seller/plots/submitted?code=${p.code}&edited=1` };
}
