"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ListingFormPayload, ListingFormResult } from "@/components/listing/types";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { listingInputSchema, sellerInputSchema } from "@/lib/validation/listing";
import { changeListingStatus, createListing, findOrCreateSeller, runAvailabilityChecks, updateListing } from "@/server/listings/service";
import { trackEvent } from "@/server/analytics";
import { isWhatsAppConfigured } from "@/server/whatsapp/config";
import { isServiceWindowOpen } from "@/server/whatsapp/messaging";
import { sendAvailabilityCheck } from "@/server/whatsapp/notify";

export type AdminActionResult = { ok: true; message?: string } | { ok: false; message: string };

const idSchema = z.string().min(1).max(64);

/** Uploaded (/media/…) or bundled demo (/demo/…) images only — never arbitrary URLs. */
const imagesSchema = z
  .array(
    z.object({
      url: z
        .string()
        .max(300)
        .regex(/^\/(media|demo)\/[\w./-]+$/, "Invalid image")
        .refine((u) => !u.includes(".."), "Invalid image"),
      width: z.number().int().min(0).max(20_000),
      height: z.number().int().min(0).max(20_000),
    }),
  )
  .max(10, "Up to 10 photos");

const titleSchema = z.string().trim().max(140, "Keep the title under 140 characters").optional();

/** Refreshes the admin (incl. nav counts) and every public page a listing appears on. */
async function revalidateListing(propertyId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/search");
  const p = await db.property.findUnique({ where: { id: propertyId }, select: { slug: true, city: { select: { slug: true } } } });
  if (p) {
    revalidatePath(`/property/${p.slug}`);
    revalidatePath(`/${p.city.slug}`);
  }
}

function zodFieldErrors(error: z.ZodError, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = prefix + (issue.path.join(".") || "form");
    out[key] ??= issue.message;
  }
  return out;
}

// ───────────────────────────── Status changes ─────────────────────────────

const statusActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("APPROVE") }),
  z.object({ type: z.literal("REJECT"), reason: z.string().trim().min(3, "Tell the seller why (a few words)").max(500) }),
  z.object({ type: z.literal("HIDE") }),
  z.object({ type: z.literal("UNHIDE") }),
  z.object({ type: z.literal("MARK_SOLD") }),
  z.object({ type: z.literal("CONFIRM_AVAILABLE") }),
]);
export type AdminStatusAction = z.input<typeof statusActionSchema>;

const STATUS_MESSAGES: Record<AdminStatusAction["type"], string> = {
  APPROVE: "Approved — the plot is live and the seller is being told on WhatsApp.",
  REJECT: "Rejected — the seller is being sent the reason on WhatsApp.",
  HIDE: "Hidden from buyers.",
  UNHIDE: "Visible to buyers again.",
  MARK_SOLD: "Marked as sold.",
  CONFIRM_AVAILABLE: "Marked available — confirmed today.",
};

export async function changeListingStatusAction(propertyId: string, action: AdminStatusAction): Promise<AdminActionResult> {
  await requireAdmin();
  const id = idSchema.safeParse(propertyId);
  const parsed = statusActionSchema.safeParse(action);
  if (!id.success) return { ok: false, message: "Unknown listing." };
  if (!parsed.success) {
    const reasonIssue = parsed.error.issues.find((i) => i.path[0] === "reason");
    return { ok: false, message: reasonIssue?.message ?? "Invalid action." };
  }

  const p = await db.property.findUnique({
    where: { id: id.data },
    select: { id: true, status: true, hiddenReason: true, publishedAt: true },
  });
  if (!p) return { ok: false, message: "This listing no longer exists." };

  const a = parsed.data;
  const allowed: Record<AdminStatusAction["type"], readonly string[]> = {
    APPROVE: ["PENDING", "REJECTED", "SOLD"],
    REJECT: ["PENDING", "ACTIVE", "HIDDEN"],
    HIDE: ["ACTIVE"],
    UNHIDE: ["HIDDEN"],
    MARK_SOLD: ["ACTIVE", "HIDDEN"],
    CONFIRM_AVAILABLE: ["ACTIVE", "HIDDEN"],
  };
  if (!allowed[a.type].includes(p.status)) {
    return { ok: false, message: "That action isn't available for this listing any more. Refresh the page." };
  }
  if (a.type === "CONFIRM_AVAILABLE" && p.status === "HIDDEN" && p.hiddenReason === "BY_ADMIN") {
    return { ok: false, message: "This plot was hidden by an admin — use Unhide instead." };
  }

  await changeListingStatus(
    p.id,
    a.type === "REJECT" ? { type: "REJECT", reason: a.reason } : a.type === "HIDE" ? { type: "HIDE", by: "ADMIN" } : { type: a.type },
    { via: "admin" },
  );
  await revalidateListing(p.id);

  let message = STATUS_MESSAGES[a.type];
  if (a.type === "APPROVE" && p.status === "SOLD") message = "Relisted — the plot is live again.";
  else if (a.type === "APPROVE" && p.status === "PENDING" && p.publishedAt) message = "Approved — the seller's changes are live.";
  else if (a.type === "CONFIRM_AVAILABLE" && p.status === "HIDDEN") message = "Marked available — the plot is live again and the seller is being told.";
  return { ok: true, message };
}

/**
 * "Is your plot still available?" on WhatsApp, right now, for one plot.
 * Always records the attempt; the 24h reply timer starts ONLY if WhatsApp
 * accepted the message (same rule as the weekly job).
 */
export async function sendAvailabilityCheckAction(propertyId: string): Promise<AdminActionResult> {
  await requireAdmin();
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return { ok: false, message: "Unknown listing." };
  const p = await db.property.findUnique({
    where: { id: id.data },
    select: { id: true, status: true, hiddenReason: true, sellerId: true, seller: { select: { phone: true, isBlocked: true } } },
  });
  if (!p) return { ok: false, message: "This listing no longer exists." };
  const unavailable = p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED";
  if (p.status !== "ACTIVE" && !unavailable) {
    return { ok: false, message: "Availability checks are only for live plots, or plots hidden for no reply." };
  }
  if (p.seller.isBlocked) return { ok: false, message: "This seller is blocked. Unblock them first." };

  const now = new Date();
  await db.property.update({ where: { id: p.id }, data: { lastAvailabilityCheckAt: now } });
  const delivered = await sendAvailabilityCheck(p.sellerId, [p.id]);
  revalidatePath("/admin", "layout");

  if (!delivered) {
    const conversation = await db.whatsAppConversation.findUnique({ where: { phone: p.seller.phone }, select: { lastInboundAt: true } });
    const windowClosed = isWhatsAppConfigured() && !isServiceWindowOpen(conversation?.lastInboundAt);
    const hasTemplate = Boolean(process.env.WHATSAPP_TEMPLATE_AVAILABILITY_CHECK?.trim());
    return {
      ok: false,
      message:
        windowClosed && !hasTemplate
          ? "Not delivered — the seller hasn't messaged us in the last 24 hours and no WhatsApp template is set up for availability checks. Call or WhatsApp them yourself, then mark it."
          : "Not delivered — WhatsApp didn't accept the message. Try again later, or call the seller.",
    };
  }

  if (p.status === "ACTIVE") {
    await db.property.updateMany({ where: { id: p.id, status: "ACTIVE" }, data: { availabilityCheckSentAt: now } });
  }
  await trackEvent("availability_check_sent", { sellerId: p.sellerId, propertyId: p.id, props: { via: "admin" } });
  return {
    ok: true,
    message:
      p.status === "ACTIVE"
        ? "Check sent on WhatsApp. No reply in 24 hours hides the plot from buyers."
        : "Check sent on WhatsApp. If the seller replies YES, the plot goes live again.",
  };
}

export type RunChecksResult = { ok: true; message: string; counts: { checksSent: number; undelivered: number; hiddenNoReply: number } };

/** "Run weekly check now" — the same job the scheduler runs. */
export async function runAvailabilityChecksAction(): Promise<RunChecksResult | { ok: false; message: string }> {
  await requireAdmin();
  const counts = await runAvailabilityChecks();
  revalidatePath("/admin", "layout");
  if (counts.hiddenNoReply > 0) {
    // Many public pages may have changed: revalidate everything.
    revalidatePath("/", "layout");
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    `${plural(counts.checksSent, "plot", "plots")} sent a check`,
    `${plural(counts.undelivered, "plot", "plots")} couldn't be reached`,
    `${plural(counts.hiddenNoReply, "plot", "plots")} hidden for no reply`,
  ];
  return { ok: true, counts, message: `Weekly check done — ${parts.join(", ")}.` };
}

// ───────────────────────────── Create / edit ─────────────────────────────

function parseListingPayload(payload: ListingFormPayload) {
  const listing = listingInputSchema.safeParse(payload?.listing);
  const images = imagesSchema.safeParse(payload?.images ?? []);
  const title = titleSchema.safeParse(payload?.title ?? undefined);
  const fieldErrors: Record<string, string> = {
    ...(listing.success ? {} : zodFieldErrors(listing.error)),
    ...(images.success ? {} : { images: images.error.issues[0]?.message ?? "Invalid photos" }),
    ...(title.success ? {} : { title: title.error.issues[0]?.message ?? "Invalid title" }),
  };
  if (!listing.success || !images.success || !title.success) {
    return { ok: false as const, result: { ok: false as const, message: "Please fix the highlighted fields.", fieldErrors } };
  }
  return { ok: true as const, listing: listing.data, images: images.data, title: title.data || undefined };
}

export async function updateListingAction(propertyId: string, payload: ListingFormPayload): Promise<ListingFormResult> {
  await requireAdmin();
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return { ok: false, message: "Unknown listing." };
  const parsed = parseListingPayload(payload);
  if (!parsed.ok) return parsed.result;

  const existing = await db.property.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!existing) return { ok: false, message: "This listing no longer exists." };
  const city = await db.city.findUnique({ where: { id: parsed.listing.cityId }, select: { id: true } });
  if (!city) return { ok: false, fieldErrors: { cityId: "Choose a city" } };

  await updateListing(existing.id, { ...parsed.listing, title: parsed.title });
  // Photos: the form sends the full, ordered list (first = cover).
  await db.$transaction([
    db.propertyImage.deleteMany({ where: { propertyId: existing.id } }),
    db.propertyImage.createMany({
      data: parsed.images.map((img, position) => ({
        propertyId: existing.id,
        url: img.url,
        width: img.width || null,
        height: img.height || null,
        position,
      })),
    }),
  ]);

  await revalidateListing(existing.id);
  return { ok: true, redirectTo: `/admin/listings/${existing.id}?saved=1` };
}

export type AdminSellerLookup =
  | { found: false }
  | { found: true; name: string; code: string; sellerType: "OWNER" | "BROKER"; isBlocked: boolean; verified: boolean };

/** Used by the "Add plot" form to recognise an existing seller from their mobile number. */
export async function lookupSellerByPhone(rawPhone: string): Promise<AdminSellerLookup> {
  await requireAdmin();
  const phone = normalizePhoneNumber(String(rawPhone ?? ""));
  if (!phone.valid) return { found: false };
  const s = await db.seller.findUnique({ where: { phone: phone.normalized } });
  if (!s) return { found: false };
  return { found: true, name: s.name, code: s.code, sellerType: s.sellerType, isBlocked: s.isBlocked, verified: Boolean(s.phoneVerifiedAt) };
}

export type AdminCreateListingInput = ListingFormPayload & {
  seller: { phone: string; name?: string; sellerType?: "OWNER" | "BROKER" };
  publishNow: boolean;
};

/** Concierge listing: an admin lists a plot on a seller's behalf (usually from a WhatsApp chat). */
export async function createListingForSellerAction(input: AdminCreateListingInput): Promise<ListingFormResult> {
  await requireAdmin();
  const parsed = parseListingPayload(input);
  const phone = normalizePhoneNumber(String(input?.seller?.phone ?? ""));
  const sellerErrors: Record<string, string> = {};
  if (!phone.valid) sellerErrors["seller.phone"] = "Enter a valid 10-digit mobile number";

  const existing = phone.valid ? await db.seller.findUnique({ where: { phone: phone.normalized } }) : null;
  let newSeller: z.infer<typeof sellerInputSchema> | null = null;
  if (phone.valid && !existing) {
    const s = sellerInputSchema.safeParse({ ...input.seller, phone: phone.normalized });
    if (s.success) newSeller = s.data;
    else Object.assign(sellerErrors, zodFieldErrors(s.error, "seller."));
  }
  if (existing?.isBlocked) sellerErrors["seller.phone"] = "This seller is blocked. Unblock them first.";

  if (!parsed.ok || Object.keys(sellerErrors).length > 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { ...(parsed.ok ? {} : parsed.result.fieldErrors), ...sellerErrors },
    };
  }
  const city = await db.city.findUnique({ where: { id: parsed.listing.cityId }, select: { id: true } });
  if (!city) return { ok: false, fieldErrors: { cityId: "Choose a city" } };

  const seller =
    existing ??
    (await findOrCreateSeller({
      phone: phone.valid ? phone.normalized : "",
      name: newSeller!.name,
      sellerType: newSeller!.sellerType,
      phoneVerified: false,
    }));

  const publishNow = input.publishNow === true;
  const property = await createListing({
    sellerId: seller.id,
    source: "ADMIN",
    input: parsed.listing,
    images: parsed.images,
    publishNow,
  });
  if (parsed.title && parsed.title !== property.title) {
    await db.property.update({ where: { id: property.id }, data: { title: parsed.title } });
  }
  if (publishNow) {
    // Same rule as approving: a published plot verifies the seller's phone.
    await db.seller.updateMany({ where: { id: seller.id, phoneVerifiedAt: null }, data: { phoneVerifiedAt: new Date() } });
  }

  await revalidateListing(property.id);
  return { ok: true, redirectTo: `/admin/listings/${property.id}?created=1` };
}
