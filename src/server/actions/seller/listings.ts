"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import { requireSeller } from "@/lib/seller/require";
import type { ListingFormPayload, ListingFormResult } from "@/components/listing/types";
import { listingInputSchema } from "@/lib/validation/listing";
import { isKycAvailable } from "@/server/kyc/provider";
import { resolveCity } from "@/server/cities";
import { listingImagesSchema } from "@/server/listings/images";
import { changeListingStatus, createListing, updateListing, type StatusAction } from "@/server/listings/service";

type SellerAction = "MARK_SOLD" | "CONFIRM_AVAILABLE" | "HIDE" | "UNHIDE" | "REMOVE";

/** A seller can only act on their own plots, and only through these actions. */
const SELLER_ACTIONS: readonly SellerAction[] = ["MARK_SOLD", "CONFIRM_AVAILABLE", "HIDE", "UNHIDE", "REMOVE"];

export async function sellerListingAction(propertyId: string, action: SellerAction): Promise<{ ok: boolean; message?: string }> {
  const seller = await requireSeller();
  // Server actions take any JSON: only the five known actions and a plain id get through.
  if (!SELLER_ACTIONS.includes(action) || typeof propertyId !== "string" || propertyId.length > 64) return { ok: false, message: "That action isn't available for this plot." };
  const p = await db.property.findFirst({ where: { id: propertyId, sellerId: seller.id }, select: { id: true, slug: true, status: true, hiddenReason: true, removedAt: true } });
  if (!p || p.removedAt) return { ok: false, message: "Plot not found." };

  const allowed: Record<SellerAction, boolean> = {
    MARK_SOLD: p.status === "ACTIVE" || p.status === "HIDDEN",
    // Also "reactivate": a plot hidden for no reply, hidden by the seller, or marked sold by mistake.
    CONFIRM_AVAILABLE: p.status === "ACTIVE" || p.status === "SOLD" || (p.status === "HIDDEN" && p.hiddenReason !== "BY_ADMIN"),
    HIDE: p.status === "ACTIVE",
    UNHIDE: p.status === "HIDDEN" && p.hiddenReason === "BY_SELLER",
    REMOVE: true,
  };
  if (!allowed[action]) return { ok: false, message: "That action isn't available for this plot." };

  const map: Record<SellerAction, StatusAction> = {
    MARK_SOLD: { type: "MARK_SOLD" },
    CONFIRM_AVAILABLE: { type: "CONFIRM_AVAILABLE" },
    HIDE: { type: "HIDE", by: "SELLER" },
    UNHIDE: { type: "UNHIDE" },
    REMOVE: { type: "REMOVE" },
  };
  // The seller is looking at the result on screen, so no WhatsApp echo.
  const result = await changeListingStatus(p.id, map[action], { notify: false, via: "dashboard" });
  if (result === "conflict") return { ok: false, message: "This plot just changed. Refresh the page and try again." };
  if (result === "seller_blocked") return { ok: false, message: "Your account is paused. Please contact us on WhatsApp." };

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
  // Only photos our own storage produced, with sane fields (nothing else reaches the database).
  const photos = listingImagesSchema.safeParse(payload.images ?? []);
  if (!photos.success) return { ok: false, message: "One of the photos couldn't be used. Please upload it again." };

  // Web listings need identity verification once, when a KYC provider is configured.
  if (isKycAvailable() && seller.identityStatus !== "VERIFIED") return { ok: false, message: "Please verify your identity first." };
  if (!seller.onboardedAt) return { ok: false, message: "Please finish setting up your seller account first." };

  // Counted only for a valid submission, so fixing form errors never locks anyone out.
  // Before resolveCity: a new city row (and a geocoder call) only happens for a real, allowed submission.
  const limited = await hitRateLimit("listingCreatePerSeller", seller.id);
  if (!limited.ok) return { ok: false, message: "You've added a lot of plots today. Please try again tomorrow or message us on WhatsApp." };

  const city = await resolveCity({ ...parsed.data });
  if (!city) return { ok: false, fieldErrors: { cityName: "Enter the city or district" } };
  const images = photos.data;

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
  const p = await db.property.findFirst({ where: { id: propertyId, sellerId: seller.id }, select: { id: true, slug: true, status: true, code: true, removedAt: true } });
  if (!p || p.removedAt) return { ok: false, message: "Property not found." };
  if (p.status === "SOLD") return { ok: false, message: "Sold properties can't be edited. Mark it available again first." };

  const parsed = listingInputSchema.safeParse(payload.listing);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const photos = listingImagesSchema.safeParse(payload.images ?? []);
  if (!photos.success) return { ok: false, message: "One of the photos couldn't be used. Please upload it again." };

  const limited = await hitRateLimit("listingUpdatePerSeller", seller.id);
  if (!limited.ok) return { ok: false, message: "Too many edits in a short time. Please try again in a little while." };

  const city = await resolveCity({ ...parsed.data });
  if (!city) return { ok: false, fieldErrors: { cityName: "Enter the city or district" } };
  const images = photos.data;

  // Fields, photos and the move back to review land together (one transaction).
  await updateListing(p.id, parsed.data, { city, images, backToReview: true });

  revalidatePath("/seller/dashboard");
  revalidatePath(`/property/${p.slug}`);
  revalidatePath("/");
  revalidatePath("/admin", "layout");
  return { ok: true, redirectTo: `/seller/plots/submitted?code=${p.code}&edited=1` };
}
