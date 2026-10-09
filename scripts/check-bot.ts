/**
 * End-to-end checks for the WhatsApp assistant (simulation mode: replies are
 * recorded, nothing reaches Meta). Needs the local dev database (pnpm db:up).
 *
 *   pnpm check:bot
 *
 * Language picker, a full Hindi listing, an English listing, older chats
 * carrying on in English, language switching mid-listing, Hindi weekly-check
 * replies, and the optional AI (mocked provider): extraction that skips
 * questions, a helpful reply, provider failure → fixed reply, redaction.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { InboundMessage } from "../src/server/whatsapp/inbound";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name}`, detail ?? "");
  }
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const phones: string[] = [];
const stamp = String(Date.now()).slice(-6);
let seq = 0;
const newPhone = () => {
  const p = `+9193${stamp}${String(++seq).padStart(2, "0")}`;
  phones.push(p);
  return p;
};

type Out = { body: string; ids: string[]; titles: string[] };
function flatten(replies: { message: { type: string; text?: string; body?: string; buttons?: { id: string; title: string }[]; rows?: { id: string; title: string }[] } }[]): Out {
  const body = replies.map((r) => r.message.text ?? r.message.body ?? "").join("\n---\n");
  const opts = replies.flatMap((r) => [...(r.message.buttons ?? []), ...(r.message.rows ?? [])]);
  return { body, ids: opts.map((o) => o.id), titles: opts.map((o) => o.title) };
}

async function main() {
  const { processInbound } = await import("../src/server/whatsapp/inbound");
  const send = async (from: string, m: Partial<InboundMessage>) => {
    const r = await processInbound({ from, kind: "text", ...m } as InboundMessage, { simulate: true });
    return flatten(r.replies as never);
  };
  const text = (from: string, t: string) => send(from, { kind: "text", text: t });
  const tap = (from: string, id: string, title = id) => send(from, { kind: "interactive", replyId: id, replyTitle: title });
  const step = async (phone: string) => (await db.whatsAppConversation.findUnique({ where: { phone } }))?.step;
  const city = await db.city.findFirstOrThrow({ where: { isLive: true }, orderBy: { name: "asc" } });

  // ── New chat: language first ──
  const hi = newPhone();
  let r = await text(hi, "hi");
  check("new chat → language picker", r.ids.includes("lang:en") && r.ids.includes("lang:hi") && /भाषा/.test(r.body) && /language/i.test(r.body), r);
  r = await tap(hi, "lang:hi", "हिंदी");
  check("Hindi chosen → Hindi welcome menu", /नमस्ते/.test(r.body) && r.titles.includes("ज़मीन लिस्ट करें"), r.body.slice(0, 200));
  check("language stored", (await db.whatsAppConversation.findUnique({ where: { phone: hi } }))?.language === "hi");

  // ── Full listing in Hindi ──
  r = await text(hi, "बेचना");
  check("Hindi: listing starts in Hindi", /नाम/.test(r.body) && (await step(hi)) === "ASK_NAME", r.body.slice(0, 200));
  check("Hindi: no owner/broker question", !/broker|owner|ब्रोकर|मालिक/i.test(r.body));
  r = await text(hi, "रमेश यादव");
  check("Hindi: name accepted → land type list", (await step(hi)) === "ASK_LAND_TYPE" && r.titles.includes("खेती की ज़मीन"), r.titles);
  r = await text(hi, "खेत");
  check("Hindi: 'खेत' → agricultural → state", (await step(hi)) === "ASK_STATE" && /राज्य/.test(r.body));
  r = await text(hi, city.state === "Uttar Pradesh" ? "उत्तर प्रदेश" : city.state);
  check("Hindi: state typed (Devanagari ok) → city", (await step(hi)) === "ASK_CITY", { step: await step(hi), body: r.body.slice(0, 120) });
  r = await tap(hi, `city:${city.id}`, city.name);
  check("Hindi: city picked → locality", (await step(hi)) === "ASK_LOCALITY" && /गाँव/.test(r.body));
  r = await text(hi, "रामपुर, पंचायत भवन के पास");
  check("Hindi: locality → area", (await step(hi)) === "ASK_AREA");
  r = await text(hi, "२ बीघा");
  check("Hindi: '२ बीघा' → 2 bigha → price", (await step(hi)) === "ASK_PRICE" && /2 बीघा/.test(r.body), r.body.slice(0, 120));
  r = await text(hi, "18 लाख");
  check("Hindi: '18 लाख' → photos, price shown in Hindi", (await step(hi)) === "ASK_PHOTOS" && /₹18 लाख/.test(r.body), r.body.slice(0, 160));
  r = await text(hi, "फ़ोटो बाद में");
  check("Hindi: skip photos in Hindi → location", (await step(hi)) === "ASK_LOCATION");
  r = await tap(hi, "loc:skip");
  r = await tap(hi, "desc:skip");
  check("Hindi: summary in Hindi with Hindi buttons", (await step(hi)) === "CONFIRM" && /जाँच/.test(r.body) && r.titles.includes("भेजें ✅"), r.body.slice(0, 200));
  r = await tap(hi, "confirm:submit");
  const hiSeller = await db.seller.findUnique({ where: { phone: hi }, include: { properties: true } });
  check("Hindi: listing submitted (pending review)", hiSeller?.properties.length === 1 && hiSeller.properties[0].status === "PENDING");
  check("Hindi: thank-you in Hindi", /धन्यवाद/.test(r.body), r.body.slice(0, 200));
  check("everyone is a seller (default type, no question)", hiSeller?.sellerType === "OWNER");

  // ── English path ──
  const en = newPhone();
  r = await text(en, "SELL");
  check("SELL on a new chat → picker first", r.ids.includes("lang:en"));
  r = await tap(en, "lang:en", "English");
  check("English chosen → listing starts right away", /name/i.test(r.body) && (await step(en)) === "ASK_NAME", r.body.slice(0, 200));
  r = await text(en, "language");
  check("LANGUAGE mid-listing → picker", r.ids.includes("lang:hi"));
  r = await tap(en, "lang:hi");
  check("switching to Hindi repeats the same question in Hindi", (await step(en)) === "ASK_NAME" && /नाम/.test(r.body), r.body.slice(0, 160));
  r = await text(en, "english");
  check("typing 'english' switches back", /name/i.test(r.body) && (await db.whatsAppConversation.findUnique({ where: { phone: en } }))?.language === "en");

  // ── Older chats carry on in English ──
  const old = newPhone();
  await db.whatsAppConversation.create({ data: { phone: old, step: "ASK_PRICE", draft: { name: "Old Chat", landType: "AGRICULTURAL" } } });
  r = await text(old, "18 lakh");
  check("legacy mid-listing chat continues (no picker)", !r.ids.includes("lang:en") && (await step(old)) === "ASK_PHOTOS", r.body.slice(0, 100));
  check("legacy chat set to English", (await db.whatsAppConversation.findUnique({ where: { phone: old } }))?.language === "en");
  const legacySeller = newPhone();
  await db.whatsAppConversation.create({ data: { phone: legacySeller, step: "ASK_SELLER_TYPE", draft: { name: "Legacy" } } });
  r = await text(legacySeller, "owner");
  check("chat paused on the removed owner/broker question moves on", (await step(legacySeller)) === "ASK_LAND_TYPE", await step(legacySeller));

  // ── Weekly check answered in Hindi by an existing seller ──
  if (hiSeller) {
    await db.property.update({ where: { id: hiSeller.properties[0].id }, data: { status: "ACTIVE", publishedAt: new Date(), availabilityCheckSentAt: new Date() } });
    r = await text(hi, "हाँ");
    check("'हाँ' confirms availability (Hindi reply)", /लाइव/.test(r.body) && (await db.property.findUniqueOrThrow({ where: { id: hiSeller.properties[0].id } })).availabilityCheckSentAt === null, r.body.slice(0, 160));
    r = await text(hi, "स्टेटस");
    check("'स्टेटस' lists listings in Hindi", /आपकी लिस्टिंग/.test(r.body));
  }

  // ── AI configuration (pure) ──
  const { getAiConfig } = await import("../src/server/ai/config");
  const { complete } = await import("../src/server/ai/client");
  const { firstJsonObject, redact } = await import("../src/server/ai/assistant");
  check("AI off by default", getAiConfig({}) === null);
  check("AI off with a placeholder key", getAiConfig({ AI_ENABLED: "true", AI_API_KEY: "replace-me" }) === null);
  check("AI off for an unknown provider", getAiConfig({ AI_ENABLED: "true", AI_PROVIDER: "evil", AI_API_KEY: "k".repeat(30) }) === null);
  check("AI refuses non-https base URLs", getAiConfig({ AI_ENABLED: "true", AI_PROVIDER: "compatible", AI_BASE_URL: "http://example.com", AI_MODEL: "m", AI_API_KEY: "k".repeat(30) }) === null);
  const claude = getAiConfig({ AI_ENABLED: "true", AI_PROVIDER: "anthropic", AI_API_KEY: "k".repeat(30) });
  check("Claude config with default model", claude?.baseUrl === "https://api.anthropic.com/v1" && Boolean(claude?.model));
  const viaDefault = getAiConfig({ AI_ENABLED: "true", AI_PROVIDER: "openai", AI_API_KEY: "k".repeat(30), AI_MODEL: "default", AI_BASE_URL: "default" });
  check("'default' model/base URL → provider defaults", viaDefault?.baseUrl === "https://api.openai.com/v1" && viaDefault?.model !== "default");
  let seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const fakeClaude = (async (u: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(u), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Namaste ji" }] }), { status: 200 });
  }) as typeof fetch;
  const out = await complete(claude!, { system: "sys", messages: [{ role: "user", content: "hi" }] }, fakeClaude);
  const req = seen as unknown as { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null;
  check("Claude: Messages API shape, key in x-api-key, text returned", out === "Namaste ji" && req?.url.endsWith("/messages") === true && req?.headers["x-api-key"] === "k".repeat(30) && req?.body.system === "sys");
  check("AI: HTTP error → null", (await complete(claude!, { system: "s", messages: [{ role: "user", content: "x" }] }, (async () => new Response("no", { status: 500 })) as typeof fetch)) === null);
  check("AI: JSON found inside prose/code fences", JSON.stringify(firstJsonObject('Sure! ```json\n{"area": 2}\n```')) === '{"area":2}');
  check("AI: Aadhaar-like and phone numbers redacted", !/1234|98765/.test(redact("aadhaar 1234 5678 9012, phone +91 98765 43210")));

  // ── Optional AI (mocked provider) ──
  const realFetch = globalThis.fetch;
  const sent: string[] = [];
  let mode: "extract" | "reply" | "fail" = "extract";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://ai.test/")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}"));
    sent.push(JSON.stringify(body));
    if (mode === "fail") throw new TypeError("network down");
    const system = String(body.messages?.[0]?.content ?? "");
    const isExtract = system.startsWith("You extract");
    const content = isExtract
      ? mode === "extract"
        ? JSON.stringify({ landType: "AGRICULTURAL", area: 2, unit: "BIGHA", priceRupees: 1800000, city: city.name, state: city.state, locality: "Sathiyaon" })
        : "{}"
      : "Ji, aap total keemat likhiye — jaise 18 lakh.";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  Object.assign(process.env, { AI_ENABLED: "true", AI_PROVIDER: "compatible", AI_BASE_URL: "https://ai.test/v1", AI_MODEL: "test-model", AI_API_KEY: "test-key-0123456789abcdefghij" });
  try {
    const ai = newPhone();
    await tap(ai, "lang:en");
    r = await text(ai, "I have 2 bigha khet in Sathiyaon, call me on 9876543210, price 18 lakh");
    check("AI: free-text listing starts a pre-filled listing", /Noted/.test(r.body) && (await step(ai)) === "ASK_NAME", { step: await step(ai), body: r.body.slice(0, 200) });
    check("AI: phone number redacted before leaving the server", sent.length > 0 && sent.every((s) => !s.includes("9876543210")), sent[0]?.slice(0, 200));
    r = await text(ai, "Suresh Kumar");
    check("AI: answered questions are skipped → straight to photos", (await step(ai)) === "ASK_PHOTOS", { step: await step(ai), body: r.body.slice(0, 160) });
    const draft = (await db.whatsAppConversation.findUnique({ where: { phone: ai } }))?.draft as Record<string, unknown>;
    check("AI: extracted values validated into the draft", draft?.landType === "AGRICULTURAL" && draft?.area === 2 && draft?.price === 1800000 && draft?.cityId === city.id, draft);

    mode = "reply";
    const ai2 = newPhone();
    await tap(ai2, "lang:en");
    await text(ai2, "SELL");
    await text(ai2, "Asha Devi");
    await tap(ai2, "type:AGRICULTURAL");
    await tap(ai2, `state:${city.state}`);
    await tap(ai2, `city:${city.id}`);
    await text(ai2, "Rampur");
    await text(ai2, "2 bigha");
    r = await text(ai2, "how much should I ask?");
    check("AI: unclear answer gets a helpful reply, then the question again", /total keemat/.test(r.body) && /asking price/i.test(r.body) && (await step(ai2)) === "ASK_PRICE", r.body.slice(0, 200));

    mode = "fail";
    r = await text(ai2, "what do you think?");
    check("AI: provider failure → normal fixed reply", /didn't get the price/i.test(r.body) && (await step(ai2)) === "ASK_PRICE", r.body.slice(0, 160));

    process.env.AI_ENABLED = "false";
    sent.length = 0;
    r = await text(ai2, "hmm not sure");
    check("AI off → no provider call, fixed reply", sent.length === 0 && /didn't get the price/i.test(r.body));
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["AI_ENABLED", "AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY"]) delete process.env[k];
  }
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    const sellers = await db.seller.findMany({ where: { phone: { in: phones } }, select: { id: true } });
    const ids = sellers.map((s) => s.id);
    await db.analyticsEvent.deleteMany({ where: { sellerId: { in: ids } } });
    await db.propertyImage.deleteMany({ where: { property: { sellerId: { in: ids } } } });
    await db.property.deleteMany({ where: { sellerId: { in: ids } } });
    await db.whatsAppMessage.deleteMany({ where: { conversation: { phone: { in: phones } } } });
    await db.whatsAppConversation.deleteMany({ where: { phone: { in: phones } } });
    await db.sellerSession.deleteMany({ where: { sellerId: { in: ids } } });
    await db.seller.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "ai" } } });
    await db.$disconnect();
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
