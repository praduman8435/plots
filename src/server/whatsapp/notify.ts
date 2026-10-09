import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { placeName } from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import type { OutgoingMessage } from "./client";
import { copy, price, toLang, type Lang } from "./copy";
import { getOrCreateConversation, isServiceWindowOpen, sendAndRecord } from "./messaging";
import { isWhatsAppConfigured } from "./config";

/**
 * Every message we send sellers outside a chat with the assistant — in the
 * language they picked (copy.ts). Short and human, not a bank SMS.
 *
 * Delivery: WhatsApp allows free-form messages only within 24h of the
 * seller's last message. Outside that window we use an approved template
 * named by env WHATSAPP_TEMPLATE_<KEY> (body params listed per message
 * below), in the seller's language (WHATSAPP_TEMPLATE_LANGUAGE for English,
 * WHATSAPP_TEMPLATE_LANGUAGE_HI for Hindi; if the Hindi version isn't
 * approved, the English one is tried). No template → "not delivered", and
 * callers that start timers (availability) know it wasn't received.
 */
type Delivery = { message: OutgoingMessage; templateKey: string; templateParams: string[] };

async function deliver(phone: string, build: (lang: Lang) => Delivery): Promise<boolean> {
  const conversation = await getOrCreateConversation(phone);
  const lang = toLang(conversation.language);
  const d = build(lang);
  const template = process.env[`WHATSAPP_TEMPLATE_${d.templateKey}`]?.trim();
  if (isWhatsAppConfigured() && !isServiceWindowOpen(conversation.lastInboundAt) && template) {
    const send = (language: string) => sendAndRecord(phone, { type: "template", templateName: template, language, bodyParameters: d.templateParams }, "system");
    const en = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
    if (lang === "hi") {
      if (await send(process.env.WHATSAPP_TEMPLATE_LANGUAGE_HI || "hi")) return true;
      log("warn", "whatsapp.template_hi_fallback", { template: d.templateKey });
    }
    return send(en);
  }
  return sendAndRecord(phone, d.message, "system");
}

const link = (slug: string) => `${site.url}/property/${slug}`;

// ─── Account messages ───

export async function notifyRegistrationComplete(sellerId: string): Promise<boolean> {
  const s = await db.seller.findUnique({ where: { id: sellerId } });
  if (!s) return false;
  return safe(() =>
    deliver(s.phone, (lang) => ({
      templateKey: "REGISTRATION_COMPLETE",
      templateParams: [s.name.split(" ")[0], s.code],
      message: { type: "text", text: copy(lang).nRegistered({ name: s.name, code: s.code, url: site.url }) },
    })),
  );
}

export async function notifyVerifyIdentity(sellerId: string): Promise<boolean> {
  const s = await db.seller.findUnique({ where: { id: sellerId } });
  if (!s || s.identityStatus === "VERIFIED") return false;
  return safe(() =>
    deliver(s.phone, (lang) => ({
      templateKey: "VERIFY_IDENTITY",
      templateParams: [s.name.split(" ")[0]],
      message: { type: "text", previewUrl: false, text: copy(lang).nVerifyIdentity({ name: s.name, url: site.url }) },
    })),
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

  const build = (lang: Lang): Delivery => {
    const c = copy(lang);
    const amount = price(lang, p.price);
    const plot = `${p.title}\n${where} · ${amount}`;
    const unavailable: Delivery = {
      templateKey: "LISTING_UNAVAILABLE",
      templateParams: [p.title],
      message: { type: "text", text: c.nUnavailable({ plot }) },
    };
    const deliveries: Record<Exclude<SellerNotification, "AVAILABILITY_CHECK">, Delivery> = {
      LISTING_RECEIVED: {
        templateKey: "LISTING_RECEIVED",
        templateParams: [p.title, p.seller.code],
        message: { type: "text", text: c.nReceived({ plot, code: p.seller.code }) },
      },
      LISTING_LIVE: {
        templateKey: "LISTING_LIVE",
        templateParams: [p.seller.code, p.title, where, price("en", p.price), link(p.slug)],
        message: { type: "text", previewUrl: true, text: c.nLive({ title: p.title, where, price: amount, link: link(p.slug), code: p.seller.code }) },
      },
      LISTING_REJECTED: {
        templateKey: "LISTING_REJECTED",
        templateParams: [p.title, p.rejectionReason ?? "Details need correction"],
        message: { type: "text", text: c.nRejected({ title: p.title, reason: p.rejectionReason ?? "" }) },
      },
      LISTING_UNAVAILABLE: unavailable,
      LISTING_HIDDEN_AVAILABILITY: unavailable,
      MARKED_SOLD: { templateKey: "MARKED_SOLD", templateParams: [p.title], message: { type: "text", text: c.nSold({ title: p.title }) } },
      LISTING_REACTIVATED: {
        templateKey: "LISTING_REACTIVATED",
        templateParams: [p.title, link(p.slug)],
        message: { type: "text", text: c.nReactivated({ plot, link: link(p.slug) }) },
      },
    };
    return deliveries[event];
  };

  return safe(() => deliver(p.seller.phone, build));
}

/** "A buyer is interested" — so sellers get the buyer's number even when the buyer calls. */
export async function notifyEnquiry(enquiryId: string): Promise<boolean> {
  const e = await db.enquiry.findUnique({ where: { id: enquiryId }, include: { property: { include: { seller: true } } } });
  if (!e) return false;
  return safe(() =>
    deliver(e.property.seller.phone, (lang) => ({
      templateKey: "ENQUIRY_RECEIVED",
      templateParams: [e.buyerName, formatPhone(e.buyerPhone), e.property.title, e.property.code],
      message: {
        type: "text",
        text: copy(lang).nEnquiry({
          buyer: e.buyerName,
          phone: formatPhone(e.buyerPhone),
          call: e.channel === "CALL" ? "1" : "",
          title: e.property.title,
          code: e.property.code,
          url: site.url,
        }),
      },
    })),
  );
}

/**
 * The weekly "still available?" message. One message per seller even when a
 * seller has many plots due. Returns true only if WhatsApp accepted it.
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

  return safe(() => deliver(seller.phone, (lang) => buildAvailabilityCheckMessage(plots, lang)));
}

/** A plot as the weekly check describes it. */
export type AvailabilityCheckPlot = { title: string; locality: string; village?: string | null; price: bigint | number; city: { name: string } };

/**
 * The weekly check's content (free-form message + template fallback), pure —
 * also used by the admin simulator to record the same message without
 * sending it. Plots must be in the order we number them (oldest first,
 * like plotsAwaitingAvailability).
 */
export function buildAvailabilityCheckMessage(plots: AvailabilityCheckPlot[], lang: Lang = "en"): Delivery {
  const c = copy(lang);
  const line = (p: AvailabilityCheckPlot) => `${p.title}\n${placeName(p)}, ${p.city.name} · ${price(lang, p.price)}`;

  if (plots.length === 1) {
    const p = plots[0];
    return {
      templateKey: "AVAILABILITY_CHECK",
      templateParams: [p.title, `${placeName(p)}, ${p.city.name}`, price("en", p.price)],
      message: {
        type: "buttons",
        body: c.nCheckOne({ line: line(p) }),
        buttons: [
          { id: "avail:yes", title: c.btnYesAvailable },
          { id: "avail:no", title: c.btnNoSold },
        ],
        footer: c.footerOne,
      },
    };
  }

  const list = plots.map((p, i) => `${i + 1}. ${p.title} — ${price(lang, p.price)}`).join("\n");
  return {
    templateKey: "AVAILABILITY_CHECK_MULTI",
    templateParams: [String(plots.length), plots.map((p, i) => `${i + 1}. ${p.title} — ${price("en", p.price)}`).join(" · ")],
    message: {
      type: "buttons",
      body: c.nCheckMany({ list }),
      buttons: [
        { id: "avail:yes", title: c.btnYesAll },
        { id: "avail:no", title: c.btnOneSold },
      ],
      footer: c.footerMany,
    },
  };
}

async function safe(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch (err) {
    log("error", "whatsapp.notify_failed", { err });
    return false;
  }
}
