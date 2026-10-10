import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { buyerToSellerLink } from "@/lib/whatsapp-links";
import { hitIpRateLimit, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { notifyEnquiry } from "@/server/whatsapp/notify";

const schema = z.object({
  propertyId: z.string().min(1).max(40),
  // Relayed to the seller over WhatsApp from our number: a name, nothing else (no links, digits or symbols).
  name: z.string().trim().min(2).max(60).regex(/^[\p{L}\p{M} .'-]+$/u),
  phone: z.string().min(10).max(16),
  channel: z.enum(["WHATSAPP", "CALL"]),
  source: z.enum(["detail", "card"]).optional(),
});

/** Records a buyer's contact tap. Always fast; duplicates within 30 minutes are ignored. */
export async function POST(req: Request) {
  const byIp = await hitIpRateLimit("enquiryPerIp");
  if (!byIp.ok) return tooManyRequests(byIp, { ok: false });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!phone.valid) return Response.json({ ok: false }, { status: 400 });

  const property = await db.property.findFirst({
    where: { id: parsed.data.propertyId, status: "ACTIVE", removedAt: null, seller: { isBlocked: false } },
    select: { id: true, title: true, code: true, slug: true, seller: { select: { phone: true } } },
  });
  if (!property) return Response.json({ ok: false }, { status: 404 });

  // Per plot, whatever the IP: one seller can't be flooded with fake buyer pings.
  const byProperty = await hitRateLimit("enquiryPerProperty", property.id);
  if (!byProperty.ok) return tooManyRequests(byProperty, { ok: false });

  const recent = await db.enquiry.findFirst({
    where: {
      propertyId: property.id,
      buyerPhone: phone.normalized,
      channel: parsed.data.channel,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    select: { id: true },
  });
  // Throttle: one enquiry per buyer + plot + channel per 30 minutes (no repeat
  // pings to the seller), and at most 20 enquiries per buyer number per day.
  const today = await db.enquiry.count({ where: { buyerPhone: phone.normalized, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  if (!recent && today < 20) {
    const enquiry = await db.enquiry.create({
      data: {
        propertyId: property.id,
        buyerName: parsed.data.name,
        buyerPhone: phone.normalized,
        channel: parsed.data.channel,
        source: parsed.data.source,
      },
    });
    // "New buyer enquiry" on WhatsApp, so the seller has the buyer's number even if they only called.
    // Sent after the response: the buyer's tap never waits on WhatsApp.
    after(() => notifyEnquiry(enquiry.id));
  }
  // The seller's number is only handed out here — after the buyer said who they are and the
  // limits above passed — never in page HTML, where it could be scraped in bulk.
  const sellerPhone = property.seller.phone;
  return Response.json(
    { ok: true, whatsapp: buyerToSellerLink(sellerPhone, property, parsed.data.name), call: `tel:${sellerPhone}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
