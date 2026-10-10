import "server-only";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingSource, SellerType } from "@/generated/prisma/enums";
import { createWithUniqueCode, generatePropertyCode, generateSellerCode } from "@/lib/codes";
import { db } from "@/lib/db";
import { buildTitle } from "@/lib/land";
import { sellerProfileSlug } from "@/lib/seller-profile";
import { slugify } from "@/lib/slug";
import { resolveCity } from "@/server/cities";
import { toSqft } from "@/lib/units";
import type { ListingInput } from "@/lib/validation/listing";
import { log } from "@/lib/log";
import { trackEvent } from "@/server/analytics";
import { claimFoundingSpot } from "@/server/founding";
import { notifySeller, sendAvailabilityCheck } from "@/server/whatsapp/notify";
import type { StoredImage } from "@/server/storage";

/**
 * Finds a seller by phone, or registers them with a fresh, permanent Seller ID.
 * `onboarded: false` is used by the web sign-up, which finishes onboarding
 * after the identity step; WhatsApp/admin-created sellers are onboarded at once.
 */
export async function findOrCreateSeller(input: {
  phone: string; // E.164
  name: string;
  sellerType: SellerType;
  phoneVerified: boolean;
  onboarded?: boolean;
}) {
  const existing = await db.seller.findUnique({ where: { phone: input.phone } });
  if (existing) {
    if (input.phoneVerified && !existing.phoneVerifiedAt) {
      return db.seller.update({ where: { id: existing.id }, data: { phoneVerifiedAt: new Date() } });
    }
    return existing;
  }
  const seller = await createWithUniqueCode(generateSellerCode, (code) =>
    db.seller.create({
      data: {
        code,
        profileSlug: sellerProfileSlug(input.name, code),
        phone: input.phone,
        name: input.name,
        sellerType: input.sellerType,
        phoneVerifiedAt: input.phoneVerified ? new Date() : null,
        onboardedAt: input.onboarded === false ? null : new Date(),
      },
    }),
  );
  // Link an existing WhatsApp thread to the new seller.
  await db.whatsAppConversation.updateMany({ where: { phone: seller.phone }, data: { sellerId: seller.id } });
  // Web sign-ups count as "registered" when onboarding finishes (see onboarding.ts).
  if (input.onboarded !== false) await trackEvent("seller_registered", { sellerId: seller.id, props: { via: "whatsapp_or_admin" } });
  return seller;
}

/** Creates a listing. Everything starts PENDING unless an admin publishes it directly. */
export async function createListing(params: {
  sellerId: string;
  source: ListingSource;
  input: ListingInput;
  images: StoredImage[];
  publishNow?: boolean;
  notify?: boolean;
}) {
  const { input } = params;
  const city = await resolveCity({ ...input });
  if (!city) throw new Error("Could not determine the city for this listing");
  const title = buildTitle(input);
  const now = new Date();

  const property = await createWithUniqueCode(generatePropertyCode, (code) =>
    db.property.create({
      data: {
        code,
        slug: `${slugify(`${title} ${city.slug}`)}-${code.slice(2).toLowerCase()}`,
        sellerId: params.sellerId,
        cityId: city.id,
        source: params.source,
        title,
        description: input.description,
        landType: input.landType,
        features: input.features,
        locality: input.locality,
        village: input.village,
        latitude: input.latitude,
        longitude: input.longitude,
        area: input.area,
        areaUnit: input.areaUnit,
        areaSqft: toSqft(input.area, input.areaUnit, city.bighaInSqft, city.marlaInSqft),
        price: BigInt(input.price),
        priceNegotiable: input.priceNegotiable,
        status: params.publishNow ? "ACTIVE" : "PENDING",
        publishedAt: params.publishNow ? now : null,
        freshnessAt: params.publishNow ? now : null,
        images: {
          create: params.images.map((img, position) => ({ url: img.url, width: img.width, height: img.height, position })),
        },
      },
    }),
  );

  if (params.publishNow) {
    await db.city.updateMany({ where: { id: city.id, isLive: false }, data: { isLive: true } });
    await giveFoundingSpot(params.sellerId);
  }
  await trackEvent("listing_submitted", { sellerId: params.sellerId, propertyId: property.id, props: { source: params.source } });
  if (params.notify !== false) {
    await notifySeller(property.id, params.publishNow ? "LISTING_LIVE" : "LISTING_RECEIVED");
  }
  return property;
}

/** Admin edit. Recomputes normalised area; keeps the title unless one is given. */
/**
 * Saves an edited listing — fields, photos and (for seller edits) the move
 * back to "Pending approval" — in ONE transaction, so an edit can never go
 * live half-applied or skip re-review. The city is resolved by the caller
 * (it may call a geocoder, which must not run inside a transaction).
 */
export async function updateListing(
  propertyId: string,
  input: ListingInput & { title?: string },
  opts: {
    city: { id: string; bighaInSqft: number; marlaInSqft: number };
    images?: { url: string; width?: number | null; height?: number | null }[];
    backToReview?: boolean;
  },
) {
  const { city } = opts;
  await db.$transaction(async (tx) => {
    await tx.property.update({
      where: { id: propertyId },
      data: {
        cityId: city.id,
        title: input.title?.trim() || buildTitle(input),
        description: input.description,
        landType: input.landType,
        features: input.features,
        locality: input.locality,
        village: input.village ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        area: input.area,
        areaUnit: input.areaUnit,
        areaSqft: toSqft(input.area, input.areaUnit, city.bighaInSqft, city.marlaInSqft),
        price: BigInt(input.price),
        priceNegotiable: input.priceNegotiable,
        ...(opts.backToReview ? { status: "PENDING", hiddenReason: null, rejectionReason: null, availabilityCheckSentAt: null } : {}),
      },
    });
    if (opts.images) {
      await tx.propertyImage.deleteMany({ where: { propertyId } });
      await tx.propertyImage.createMany({
        data: opts.images.map((img, position) => ({ propertyId, url: img.url, width: img.width || null, height: img.height || null, position })),
      });
    }
  });
}

export type StatusAction =
  | { type: "APPROVE" }
  | { type: "REJECT"; reason: string }
  | { type: "HIDE"; by: "ADMIN" | "SELLER" }
  | { type: "HIDE_UNCONFIRMED" }
  | { type: "UNHIDE" }
  | { type: "MARK_SOLD" }
  | { type: "CONFIRM_AVAILABLE" }
  | { type: "REMOVE" };

type StatusOpts = {
  /** false = don't message the seller (e.g. WhatsApp simulator, or the bot replies itself). */
  notify?: boolean;
  /** Where the change came from — recorded on analytics events. */
  via?: "whatsapp" | "dashboard" | "admin" | "cron";
};

/**
 * The listing state machine (docs/PLAN.md §4).
 *   PENDING → (approve) ACTIVE "Live" → (NO / SOLD) SOLD
 *   ACTIVE → (no reply to weekly check in 24h) HIDDEN "Unavailable" → (YES) ACTIVE
 * Nothing is ever deleted; SOLD and HIDDEN plots stay for history and can be relisted.
 * A seller's "Remove listing" (REMOVE) hides the plot for good: removedAt is set and
 * no action changes it again (it stays in the admin for history).
 */
/** What a status change did. "conflict": the plot changed meanwhile, nothing was written. */
export type StatusChangeResult = "applied" | "noop" | "conflict" | "seller_blocked";

export async function changeListingStatus(propertyId: string, action: StatusAction, opts: StatusOpts = {}): Promise<StatusChangeResult> {
  const result = await applyStatusChange(propertyId, action, opts);
  if (result === "applied") await refreshListingPages(propertyId);
  return result;
}

/**
 * Plot pages, the home page and city pages are cached (ISR). Every status
 * change — from the admin, the dashboard, the WhatsApp assistant or the daily
 * job — refreshes them right away, so a sold or hidden plot never lingers.
 * Outside a Next.js request (scripts, tests) there is no cache to refresh.
 */
async function refreshListingPages(propertyId: string) {
  const p = await db.property.findUnique({ where: { id: propertyId }, select: { slug: true, city: { select: { slug: true } } } });
  if (!p) return;
  try {
    revalidatePath(`/property/${p.slug}`);
    revalidatePath(`/${p.city.slug}`, "layout");
    revalidatePath("/");
  } catch {
    // Not inside a request — nothing cached to refresh.
  }
}

/**
 * The one place listing status changes are written. Two rules hold for every
 * caller (admin, seller dashboard, WhatsApp assistant, daily job):
 *  - A write only lands if the plot's status fields are still what we read
 *    (compare-and-set). Two changes racing — e.g. the daily job hiding a plot
 *    for "no reply" while the seller's YES arrives — can't both win, and the
 *    loser sends no notification.
 *  - A suspended seller's plot can never be made live.
 */
async function applyStatusChange(propertyId: string, action: StatusAction, opts: StatusOpts): Promise<StatusChangeResult> {
  const notify = (event: Parameters<typeof notifySeller>[1]) => (opts.notify === false ? Promise.resolve(false) : notifySeller(propertyId, event));
  const p = await db.property.findUniqueOrThrow({ where: { id: propertyId }, include: { seller: { select: { isBlocked: true } } } });
  const now = new Date();
  const ev = { sellerId: p.sellerId, propertyId: p.id, props: { via: opts.via ?? null } };
  const awaitingReply = p.availabilityCheckSentAt !== null;
  const goesLive = action.type === "APPROVE" || action.type === "UNHIDE" || action.type === "CONFIRM_AVAILABLE";
  if (p.removedAt) return "noop";
  if (goesLive && p.seller.isBlocked) return "seller_blocked";

  /** Compare-and-set on the fields the state machine depends on. */
  const write = async (data: Prisma.PropertyUpdateManyMutationInput) => {
    const r = await db.property.updateMany({
      where: { id: p.id, status: p.status, hiddenReason: p.hiddenReason, availabilityCheckSentAt: p.availabilityCheckSentAt },
      data,
    });
    return r.count === 1;
  };

  switch (action.type) {
    case "APPROVE": {
      // Also used by admin "Relist" for SOLD plots.
      const ok = await write({
        status: "ACTIVE",
        hiddenReason: null,
        rejectionReason: null,
        soldAt: null,
        publishedAt: p.publishedAt ?? now,
        freshnessAt: now,
        availabilityCheckSentAt: null,
      });
      if (!ok) return "conflict";
      // The first approved listing in a new city puts that city live (cities.ts creates them hidden).
      await db.city.updateMany({ where: { id: p.cityId, isLive: false }, data: { isLive: true } });
      // Approval also confirms the seller's phone (we've spoken to them / WhatsApp proved it).
      await db.seller.updateMany({ where: { id: p.sellerId, phoneVerifiedAt: null }, data: { phoneVerifiedAt: now } });
      await giveFoundingSpot(p.sellerId);
      await trackEvent("listing_approved", ev);
      await notify("LISTING_LIVE");
      return "applied";
    }
    case "REJECT":
      if (!(await write({ status: "REJECTED", rejectionReason: action.reason }))) return "conflict";
      await trackEvent("listing_rejected", ev);
      await notify("LISTING_REJECTED");
      return "applied";
    case "HIDE":
      if (!(await write({ status: "HIDDEN", hiddenReason: action.by === "ADMIN" ? "BY_ADMIN" : "BY_SELLER", availabilityCheckSentAt: null }))) return "conflict";
      return "applied";
    case "HIDE_UNCONFIRMED":
      // Only a live plot still waiting for its YES/NO can lapse.
      if (p.status !== "ACTIVE" || !awaitingReply) return "noop";
      if (!(await write({ status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED", availabilityCheckSentAt: null }))) return "conflict";
      await trackEvent("availability_no_response", ev);
      await notify("LISTING_UNAVAILABLE");
      return "applied";
    case "UNHIDE":
      if (p.status !== "HIDDEN") return "noop";
      if (!(await write({ status: "ACTIVE", hiddenReason: null, freshnessAt: now }))) return "conflict";
      return "applied";
    case "CONFIRM_AVAILABLE": {
      // "YES, still available" — keeps a live plot live, or brings back a plot that
      // was hidden for no reply / by the seller, or relists a sold one. Never overrides an admin hide.
      const reactivating = p.status === "HIDDEN" || p.status === "SOLD";
      if (p.status !== "ACTIVE" && !reactivating) return "noop";
      if (p.status === "HIDDEN" && p.hiddenReason === "BY_ADMIN") return "noop";
      const ok = await write({
        status: "ACTIVE",
        hiddenReason: null,
        soldAt: null,
        lastConfirmedAt: now,
        freshnessAt: now,
        availabilityCheckSentAt: null,
        ...(awaitingReply || p.hiddenReason === "AVAILABILITY_UNCONFIRMED" ? { availabilityResponseAt: now } : {}),
      });
      if (!ok) return "conflict";
      await trackEvent(reactivating ? "property_reactivated" : "availability_yes", ev);
      if (reactivating && awaitingReply === false && p.hiddenReason === "AVAILABILITY_UNCONFIRMED") await trackEvent("availability_yes", ev);
      if (reactivating) await notify("LISTING_REACTIVATED");
      return "applied";
    }
    case "REMOVE": {
      // Sold plots stay "sold" for history; anything else is hidden by the seller.
      const ok = await write({ removedAt: now, availabilityCheckSentAt: null, ...(p.status === "SOLD" ? {} : { status: "HIDDEN", hiddenReason: "BY_SELLER" }) });
      if (!ok) return "conflict";
      await trackEvent("listing_removed", ev);
      return "applied";
    }
    case "MARK_SOLD": {
      if (p.status === "SOLD") return "noop";
      const ok = await write({
        status: "SOLD",
        soldAt: now,
        hiddenReason: null,
        availabilityCheckSentAt: null,
        ...(awaitingReply ? { availabilityResponseAt: now } : {}),
      });
      if (!ok) return "conflict";
      if (awaitingReply) await trackEvent("availability_no", ev);
      await trackEvent("property_sold", ev);
      await notify("MARKED_SOLD");
      return "applied";
    }
  }
}

/** Live plots of a seller that are waiting for a YES/NO to the weekly check — oldest first (= the numbering in our message). */
export async function plotsAwaitingAvailability(sellerId: string) {
  return db.property.findMany({
    where: { sellerId, status: "ACTIVE", availabilityCheckSentAt: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, title: true, price: true, slug: true },
  });
}

export const AVAILABILITY = {
  /** Ask every week… */
  checkEveryMs: 7 * 24 * 60 * 60 * 1000,
  /** …and hide the plot if there's no reply within 24 hours of a delivered check. */
  replyWithinMs: 24 * 60 * 60 * 1000,
  /** If a check couldn't be delivered, try again after this long (never starts the 24h timer). */
  retryUndeliveredAfterMs: 24 * 60 * 60 * 1000,
};

/**
 * The weekly availability job. Safe to run as often as you like (hourly is
 * ideal): each step claims rows with a conditional update, so overlapping or
 * repeated runs never send duplicate checks.
 *
 * 1. Live plots not confirmed (or published) in the last 7 days get a check —
 *    one WhatsApp message per seller. The 24h timer (availabilityCheckSentAt)
 *    starts ONLY if WhatsApp accepted the message.
 * 2. Plots whose delivered check got no reply within 24h are hidden
 *    ("Unavailable"), never deleted; a later YES brings them back.
 */
export async function runAvailabilityChecks(now = new Date()) {
  const weekAgo = new Date(now.getTime() - AVAILABILITY.checkEveryMs);
  const retryBefore = new Date(now.getTime() - AVAILABILITY.retryUndeliveredAfterMs);
  const replyDeadline = new Date(now.getTime() - AVAILABILITY.replyWithinMs);

  const dueWhere: Prisma.PropertyWhereInput = {
    status: "ACTIVE",
    availabilityCheckSentAt: null,
    seller: { isBlocked: false },
    OR: [{ lastConfirmedAt: { lt: weekAgo } }, { lastConfirmedAt: null, publishedAt: { lt: weekAgo } }],
    AND: [{ OR: [{ lastAvailabilityCheckAt: null }, { lastAvailabilityCheckAt: { lt: retryBefore } }] }],
  };
  const due = await db.property.findMany({ where: dueWhere, select: { id: true, sellerId: true }, take: 500 });

  const bySeller = new Map<string, string[]>();
  for (const p of due) bySeller.set(p.sellerId, [...(bySeller.get(p.sellerId) ?? []), p.id]);

  let sent = 0;
  let undelivered = 0;
  for (const [sellerId, ids] of bySeller) {
    // Claim: only rows still due get stamped, so a parallel run skips them.
    const claimed = await db.property.findMany({ where: { id: { in: ids }, ...dueWhere }, select: { id: true } });
    const claim = await db.property.updateMany({ where: { id: { in: claimed.map((c) => c.id) }, ...dueWhere }, data: { lastAvailabilityCheckAt: now } });
    if (claim.count === 0) continue;
    const claimedIds = claimed.map((c) => c.id);

    const delivered = await sendAvailabilityCheck(sellerId, claimedIds);
    if (delivered) {
      await db.property.updateMany({ where: { id: { in: claimedIds }, status: "ACTIVE" }, data: { availabilityCheckSentAt: now } });
      for (const id of claimedIds) await trackEvent("availability_check_sent", { sellerId, propertyId: id });
      sent += claimedIds.length;
    } else {
      undelivered += claimedIds.length;
    }
  }

  const expired = await db.property.findMany({
    where: { status: "ACTIVE", availabilityCheckSentAt: { lt: replyDeadline } },
    select: { id: true },
    take: 500,
  });
  for (const p of expired) await changeListingStatus(p.id, { type: "HIDE_UNCONFIRMED" }, { via: "cron" });

  return { checksSent: sent, undelivered, hiddenNoReply: expired.length };
}

/** A listing just went live: its seller may earn a Founding Seller spot. Never blocks the approval. */
async function giveFoundingSpot(sellerId: string) {
  try {
    await claimFoundingSpot(sellerId);
  } catch (err) {
    log("error", "founding.claim_failed", { sellerId, err });
  }
}
