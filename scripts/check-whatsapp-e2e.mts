/**
 * End to end on WhatsApp, against a local production build (never production):
 * listing by chat (numbered state, photo, pin) → approval → STATUS → the daily
 * availability job: check sent, "Yes" keeps it live, no reply pauses it, a late
 * "haan" brings it back, "No, sold" marks it sold. Cleans up after itself.
 *
 *   CRON_SECRET=… pnpm build && CRON_SECRET=… pnpm start -p 3100
 *   E2E_CRON_SECRET=… pnpm check:whatsapp-e2e
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
const { processInbound } = await import("../src/server/whatsapp/inbound");
const { changeListingStatus } = await import("../src/server/listings/service");
const { db } = await import("../src/lib/db");
let passed = 0, failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => { if (ok) { passed++; console.log(`✓ ${n}`); } else { failed++; console.log(`✗ ${n}`, d ?? ""); } };
const phone = `+9192${String(Date.now()).slice(-8)}`;
type Reply = { message: { text?: string; body?: string } };
const flat = (r: { replies?: Reply[] }) => (r.replies ?? []).map((m) => m.message.text ?? m.message.body ?? "").join("\n---\n");
type Inbound = Parameters<typeof processInbound>[0];
const send = async (m: Partial<Inbound>) => flat((await processInbound({ from: phone, profileName: "Gurdeep Singh", kind: "text", ...m } as Inbound, { simulate: true })) as { replies?: Reply[] });
const text = (t: string) => send({ kind: "text", text: t });
const tap = (id: string, title = id) => send({ kind: "interactive", replyId: id, replyTitle: title });
const conv = async () => db.whatsAppConversation.findUnique({ where: { phone } });
try {
  let r = await text("hi");
  check("new chat asks language", /Which language/.test(r));
  r = await tap("lang:en", "English");
  r = await tap("menu:list", "List my land");
  check("listing starts with name", (await conv())?.step === "ASK_NAME", r.slice(0, 120));
  r = await tap("name:profile", "Use Gurdeep");
  check("profile name used", (await conv())?.step === "ASK_LAND_TYPE", r.slice(0, 120));
  r = await tap("type:AGRICULTURAL", "Agricultural land");
  check("state list shows all 36", (await conv())?.step === "ASK_STATE" && /36\. Lakshadweep/.test(r), r.slice(0, 200));
  r = await text("3");
  check("state by number (3 = Punjab)", (await conv())?.step === "ASK_CITY" && /Punjab/.test(r), r.slice(0, 160));
  r = await text("Ludhiana");
  check("city typed", (await conv())?.step === "ASK_LOCALITY", r.slice(0, 160));
  r = await text("Near Sidhwan canal");
  check("locality", (await conv())?.step === "ASK_AREA", r.slice(0, 160));
  r = await text("5 bigha");
  check("area with unit", (await conv())?.step === "ASK_PRICE", r.slice(0, 160));
  r = await text("30 lakh");
  check("price", (await conv())?.step === "ASK_PHOTOS", r.slice(0, 160));
  r = await send({ kind: "image", imageBytes: readFileSync("public/demo/land-066.webp") });
  check("photo received", /1|photo/i.test(r) && (await conv())?.step === "ASK_PHOTOS", r.slice(0, 160));
  r = await tap("photos:done", "Done");
  check("photos done → location", (await conv())?.step === "ASK_LOCATION", r.slice(0, 160));
  r = await send({ kind: "location", latitude: 30.9, longitude: 75.85 });
  check("location pin → description", (await conv())?.step === "ASK_DESCRIPTION", r.slice(0, 160));
  r = await text("Flat land, tube-well, 200 m from the canal road, clear papers.");
  check("description → summary", (await conv())?.step === "CONFIRM" && /5 Bigha|30 Lakh/i.test(r), r.slice(0, 300));
  r = await tap("confirm:submit", "Submit ✅");
  const seller = await db.seller.findUnique({ where: { phone }, include: { properties: true } });
  const plot = seller?.properties[0];
  check("submitted: seller + pending listing created", plot?.status === "PENDING" && /SLR-/.test(r), r.slice(0, 300));
  check("listing has the photo and pin", Boolean(plot && (await db.propertyImage.count({ where: { propertyId: plot.id } })) === 1 && plot.latitude));

  check("approve", (await changeListingStatus(plot!.id, { type: "APPROVE" })) === "applied");
  r = await text("status");
  check("STATUS shows it live", /Live|live/.test(r), r.slice(0, 200));

  // ── Availability: due → check sent → "yes" keeps it live
  const CRON = process.env.E2E_CRON_SECRET!;
  const old = new Date(Date.now() - 40 * 86_400_000);
  await db.property.update({ where: { id: plot!.id }, data: { lastConfirmedAt: old, publishedAt: old, lastAvailabilityCheckAt: null, availabilityCheckSentAt: null } });
  const cron = async () => (await fetch("http://localhost:3100/api/cron/availability", { headers: { authorization: `Bearer ${CRON}` } })).json();
  let c = await cron();
  let p = await db.property.findUniqueOrThrow({ where: { id: plot!.id } });
  check("cron sends the availability check", c.checksSent >= 1 && Boolean(p.availabilityCheckSentAt), c);
  const last = await db.whatsAppMessage.findFirst({ where: { conversationId: (await conv())!.id, direction: "OUTBOUND" }, orderBy: { createdAt: "desc" } });
  check("seller got the still-available question with buttons", /available/i.test(last?.body ?? ""), last?.body?.slice(0, 200));
  r = await tap("avail:yes", "Yes, available");
  p = await db.property.findUniqueOrThrow({ where: { id: plot!.id } });
  check("'Yes' confirms: stays live, timer cleared, confirmed now", p.status === "ACTIVE" && !p.availabilityCheckSentAt && Date.now() - (p.lastConfirmedAt?.getTime() ?? 0) < 60_000, { status: p.status, sent: p.availabilityCheckSentAt });

  // ── No reply → hidden; a late "haan" brings it back
  await db.property.update({ where: { id: plot!.id }, data: { availabilityCheckSentAt: new Date(Date.now() - 8 * 86_400_000) } });
  c = await cron();
  p = await db.property.findUniqueOrThrow({ where: { id: plot!.id } });
  check("no reply in time → hidden from buyers", p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED", { c, status: p.status, reason: p.hiddenReason });
  const pub = await fetch(`http://localhost:3100/property/${p.slug}`);
  check("hidden listing not public", pub.status === 404 || !(await pub.text()).includes("Call"), pub.status);
  r = await text("haan available hai");
  p = await db.property.findUniqueOrThrow({ where: { id: plot!.id } });
  check("late 'haan' → live again", p.status === "ACTIVE", { status: p.status, reply: r.slice(0, 160) });

  // ── "No, sold"
  await db.property.update({ where: { id: plot!.id }, data: { lastConfirmedAt: old, publishedAt: old, lastAvailabilityCheckAt: null, availabilityCheckSentAt: null } });
  await cron();
  r = await tap("avail:no", "No, sold");
  if (/as sold\?/.test(r)) r = await tap(`sold:yes:${plot!.id}`, "Yes, sold");
  p = await db.property.findUniqueOrThrow({ where: { id: plot!.id } });
  check("'No, sold' marks it sold", p.status === "SOLD", { status: p.status, reply: r.slice(0, 160) });
  r = await text("SOLD");
  check("SOLD with nothing live answers sensibly", r.length > 0, r.slice(0, 120));
} finally {
  const s = await db.seller.findUnique({ where: { phone } });
  if (s) {
    await db.enquiry.deleteMany({ where: { property: { sellerId: s.id } } });
    await db.propertyImage.deleteMany({ where: { property: { sellerId: s.id } } });
    await db.auditLog.deleteMany({ where: { sellerId: s.id } });
    await db.property.deleteMany({ where: { sellerId: s.id } });
    await db.whatsAppConversation.deleteMany({ where: { phone } });
    await db.sellerSession.deleteMany({ where: { sellerId: s.id } });
    await db.seller.delete({ where: { id: s.id } });
  } else await db.whatsAppConversation.deleteMany({ where: { phone } });
  console.log(`${passed} passed, ${failed} failed`);
  await db.$disconnect();
}
