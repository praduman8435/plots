import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { notifyEnquiry } from "@/server/whatsapp/notify";

const schema = z.object({
  propertyId: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(10).max(16),
  channel: z.enum(["WHATSAPP", "CALL"]),
  source: z.enum(["detail", "card"]).optional(),
});

/** Records a buyer's contact tap. Always fast; duplicates within 30 minutes are ignored. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!phone.valid) return Response.json({ ok: false }, { status: 400 });

  const property = await db.property.findFirst({
    where: { id: parsed.data.propertyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!property) return Response.json({ ok: false }, { status: 404 });

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
    await notifyEnquiry(enquiry.id);
  }
  return Response.json({ ok: true });
}
