import "server-only";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { placeName } from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import type { OutgoingMessage } from "./client";
import { getOrCreateConversation, isServiceWindowOpen, sendAndRecord } from "./messaging";
import { isWhatsAppConfigured } from "./config";

/**
 * Every message we send sellers outside a chat with the assistant.
 * Short and human — not a bank SMS.
 *
 * Delivery: WhatsApp allows free-form messages only within 24h of the
 * seller's last message. Outside that window we use an approved template
 * named by env WHATSAPP_TEMPLATE_<KEY> (body params listed per message
 * below). No template → recorded as "not delivered", and callers that
 * start timers (availability) know it wasn't received.
 */
type Delivery = { message: OutgoingMessage; templateKey: string; templateParams: string[] };

async function deliver(phone: string, d: Delivery): Promise<boolean> {
  const conversation = await getOrCreateConversation(phone);
  const template = process.env[`WHATSAPP_TEMPLATE_${d.templateKey}`]?.trim();
  if (isWhatsAppConfigured() && !isServiceWindowOpen(conversation.lastInboundAt) && template) {
    return sendAndRecord(
      phone,
      { type: "template", templateName: template, language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en", bodyParameters: d.templateParams },
      "system",
    );
  }
  return sendAndRecord(phone, d.message, "system");
}

const first = (name: string) => name.split(" ")[0];
const link = (slug: string) => `${site.url}/property/${slug}`;

// ─── Account messages ───

export async function notifyRegistrationComplete(sellerId: string): Promise<boolean> {
  const s = await db.seller.findUnique({ where: { id: sellerId } });
  if (!s) return false;
  return safe(() =>
    deliver(s.phone, {
      templateKey: "REGISTRATION_COMPLETE",
      templateParams: [first(s.name), s.code],
      message: {
        type: "text",
        text: `Namaste ${first(s.name)} 🙏 Your seller account is ready.\n\nSeller ID: *${s.code}*\n\nUse this Seller ID to add and manage your properties: ${site.url}/seller\n\nTo list land from WhatsApp anytime, just send *SELL*.`,
      },
    }),
  );
}

export async function notifyVerifyIdentity(sellerId: string): Promise<boolean> {
  const s = await db.seller.findUnique({ where: { id: sellerId } });
  if (!s || s.identityStatus === "VERIFIED") return false;
  return safe(() =>
    deliver(s.phone, {
      templateKey: "VERIFY_IDENTITY",
      templateParams: [first(s.name)],
      message: {
        type: "text",
        previewUrl: false,
        text: `One small step, ${first(s.name)}: verify your identity so buyers see *✓ Identity verified* on your listings.\n\nIt takes 2 minutes with DigiLocker. We never show your Aadhaar to anyone.\n\n${site.url}/seller/verify`,
      },
    }),
  );
}

// ─── Property messages ───

export type SellerNotification =
  | "LISTING_RECEIVED"
  | "LISTING_LIVE"
  | "LISTING_REJECTED"
  | "AVAILABILITY_CHECK"
  | "LISTING_UNAVAILABLE"
  | "LISTING_HIDDEN_AVAILABILITY" // old name, same as LISTING_UNAVAILABLE
  | "MARKED_SOLD"
  | "LISTING_REACTIVATED";

/** Tells a seller what happened to one of their plots. Never throws; returns whether it was delivered. */
export async function notifySeller(propertyId: string, event: SellerNotification): Promise<boolean> {
  const p = await db.property.findUnique({ where: { id: propertyId }, include: { seller: true, city: true } });
  if (!p) return false;
  if (event === "AVAILABILITY_CHECK") return sendAvailabilityCheck(p.sellerId, [p.id]);

  const where = `${placeName(p)}, ${p.city.name}`;
  const price = formatPrice(p.price);
  const plot = `${p.title}\n${where} · ${price}`;

  const deliveries: Record<Exclude<SellerNotification, "AVAILABILITY_CHECK">, Delivery> = {
    LISTING_RECEIVED: {
      templateKey: "LISTING_RECEIVED",
      templateParams: [p.title, p.seller.code],
      message: {
        type: "text",
        text: `✅ Your land has been submitted.\n\n${plot}\n\nWe'll review it and message you when it's live — usually within a few hours.\n\nSeller ID: *${p.seller.code}*`,
      },
    },
    LISTING_LIVE: {
      templateKey: "LISTING_LIVE",
      templateParams: [p.seller.code, p.title, where, price, link(p.slug)],
      message: {
        type: "text",
        previewUrl: true,
        text: `🎉 Your land listing is now live.\n\nSeller ID: *${p.seller.code}*\n\nProperty: ${p.title}\nLocation: ${where}\nPrice: ${price}\n\n${link(p.slug)}\n\nBuyers can now contact you. Share this link in your WhatsApp groups for more enquiries.`,
      },
    },
    LISTING_REJECTED: {
      templateKey: "LISTING_REJECTED",
      templateParams: [p.title, p.rejectionReason ?? "Details need correction"],
      message: {
        type: "text",
        text: `We couldn't publish your listing: ${p.title}.${p.rejectionReason ? `\n\nReason: ${p.rejectionReason}` : ""}\n\nReply here and we'll help you fix it.`,
      },
    },
    LISTING_UNAVAILABLE: unavailable(),
    LISTING_HIDDEN_AVAILABILITY: unavailable(),
    MARKED_SOLD: {
      templateKey: "MARKED_SOLD",
      templateParams: [p.title],
      message: { type: "text", text: `Got it. We've marked your property as sold.\n\n${p.title}\n\nCongratulations! 🎉 Send *SELL* anytime to list another property.` },
    },
    LISTING_REACTIVATED: {
      templateKey: "LISTING_REACTIVATED",
      templateParams: [p.title, link(p.slug)],
      message: { type: "text", text: `👍 Your property is live again.\n\n${plot}\n${link(p.slug)}` },
    },
  };

  function unavailable(): Delivery {
    return {
      templateKey: "LISTING_UNAVAILABLE",
      templateParams: [p!.title],
      message: {
        type: "text",
        text: `We didn't hear back, so we've hidden your property from buyers for now.\n\n${plot}\n\nStill available? Reply *YES* and it goes live again.`,
      },
    };
  }

  return safe(() => deliver(p.seller.phone, deliveries[event]));
}

/** "New buyer enquiry" — so sellers get the buyer's number even when the buyer calls. */
export async function notifyEnquiry(enquiryId: string): Promise<boolean> {
  const e = await db.enquiry.findUnique({ where: { id: enquiryId }, include: { property: { include: { seller: true } } } });
  if (!e) return false;
  const how = e.channel === "CALL" ? "is calling you" : "is messaging you on WhatsApp";
  return safe(() =>
    deliver(e.property.seller.phone, {
      templateKey: "ENQUIRY_RECEIVED",
      templateParams: [e.buyerName, formatPhone(e.buyerPhone), e.property.title, e.property.code],
      message: {
        type: "text",
        text: `📩 New buyer enquiry\n\n${e.buyerName} · +91 ${formatPhone(e.buyerPhone)} ${how}.\nInterested in: ${e.property.title} (${e.property.code})\n\nReply quickly — fast replies close deals. See all enquiries: ${site.url}/seller`,
      },
    }),
  );
}

/**
 * The weekly "still available?" message. One message per seller even when a
 * broker has many plots due. Returns true only if WhatsApp accepted it.
 */
export async function sendAvailabilityCheck(sellerId: string, propertyIds: string[]): Promise<boolean> {
  const seller = await db.seller.findUnique({ where: { id: sellerId } });
  if (!seller || propertyIds.length === 0) return false;
  const plots = await db.property.findMany({
    where: { id: { in: propertyIds }, sellerId },
    include: { city: true },
    orderBy: { createdAt: "asc" },
  });
  if (plots.length === 0) return false;

  return safe(() => deliver(seller.phone, buildAvailabilityCheckMessage(plots)));
}

/** A plot as the weekly check describes it. */
export type AvailabilityCheckPlot = { title: string; locality: string; village?: string | null; price: bigint | number; city: { name: string } };

/**
 * The weekly check's content (free-form message + template fallback), pure —
 * also used by the admin simulator to record the same message without
 * sending it. Plots must be in the order we number them (oldest first,
 * like plotsAwaitingAvailability).
 */
export function buildAvailabilityCheckMessage(plots: AvailabilityCheckPlot[]): Delivery {
  const line = (p: AvailabilityCheckPlot) => `${p.title}\n${placeName(p)}, ${p.city.name} · ${formatPrice(p.price)}`;

  if (plots.length === 1) {
    const p = plots[0];
    return {
      templateKey: "AVAILABILITY_CHECK",
      templateParams: [p.title, `${placeName(p)}, ${p.city.name}`, formatPrice(p.price)],
      message: {
        type: "buttons",
        body: `Is your property still available?\n\n${line(p)}\n\nReply *YES* – still available\nReply *NO* – sold`,
        buttons: [
          { id: "avail:yes", title: "YES, available" },
          { id: "avail:no", title: "NO, it's sold" },
        ],
        footer: "No reply in 24 hours hides it from buyers",
      },
    };
  }

  const list = plots.map((p, i) => `${i + 1}. ${p.title} — ${formatPrice(p.price)}`).join("\n");
  return {
    templateKey: "AVAILABILITY_CHECK_MULTI",
    templateParams: [String(plots.length), list.replace(/\n/g, " · ")],
    message: {
      type: "buttons",
      body: `Are your properties still available?\n\n${list}\n\nReply *YES* if all are still available.\nIf one is sold, reply *NO* and its number — e.g. *NO 2*.`,
      buttons: [
        { id: "avail:yes", title: "YES, all available" },
        { id: "avail:no", title: "One is sold" },
      ],
      footer: "No reply in 24 hours hides them from buyers",
    },
  };
}

async function safe(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch (err) {
    console.error("notify failed", err instanceof Error ? err.message : err);
    return false;
  }
}
