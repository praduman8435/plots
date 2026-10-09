import "server-only";
import { z } from "zod";
import { hitRateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { complete } from "./client";
import { getAiConfig, type AiConfig } from "./config";

/**
 * What the WhatsApp assistant may ask an AI for — and nothing else:
 *  1. extract listing details from a free-form message ("2 बीघा खेत, सथियांव, 18 लाख");
 *  2. a short, kind reply when the fixed flow didn't understand the seller.
 * The AI never takes actions: extracted fields are validated by the bot like
 * typed answers, every listing is still reviewed by our team, and replies
 * are plain text. Any failure → null → the bot's normal fixed reply.
 */

export type AiLang = "en" | "hi";

const LAND_TYPES = ["AGRICULTURAL", "RESIDENTIAL_PLOT", "COMMERCIAL", "INDUSTRIAL", "OTHER"] as const;
const UNITS = ["BIGHA", "BISWA", "MARLA", "KANAL", "ACRE", "SQFT", "SQYD", "SQM", "HECTARE"] as const;

const extractedSchema = z
  .object({
    landType: z.enum(LAND_TYPES).optional().catch(undefined),
    area: z.number().positive().max(10_000_000).optional().catch(undefined),
    unit: z.enum(UNITS).optional().catch(undefined),
    priceRupees: z.number().int().min(10_000).max(10_000_000_000).optional().catch(undefined),
    state: z.string().trim().min(2).max(40).optional().catch(undefined),
    city: z.string().trim().min(2).max(60).optional().catch(undefined),
    locality: z.string().trim().min(2).max(120).optional().catch(undefined),
    name: z.string().trim().min(2).max(60).optional().catch(undefined),
  })
  .strip();
export type ExtractedListing = z.infer<typeof extractedSchema>;

/** Phone numbers and Aadhaar-like numbers never leave our server. */
export function redact(text: string): string {
  return text
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[number]")
    .replace(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone]")
    .slice(0, 1200);
}

async function allowed(cfg: AiConfig, chatKey: string): Promise<boolean> {
  const [chat, global] = await Promise.all([
    hitRateLimit("aiPerChat", chatKey, Date.now(), { limit: cfg.maxPerChatPerDay }),
    hitRateLimit("aiGlobal", "all", Date.now(), { limit: cfg.maxPerDay }),
  ]);
  return chat.ok && global.ok;
}

/** First {...} block in a model reply (some providers wrap JSON in prose or code fences). */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const EXTRACT_SYSTEM = `You extract land-listing details from a message written by an Indian land seller (English, Hindi or Hinglish).
Return ONLY a JSON object. Include a key only when the message clearly states it; never guess.
Keys:
- landType: one of ${LAND_TYPES.join(", ")} (khet/kheti/farm = AGRICULTURAL; ghar/makan/colony plot = RESIDENTIAL_PLOT; dukan/shop/market = COMMERCIAL; factory/godown = INDUSTRIAL)
- area: number, and unit: one of ${UNITS.join(", ")} (killa = ACRE; gaj/gaz = SQYD; "2 bigha 5 biswa" = area 2.25 unit BIGHA)
- priceRupees: the TOTAL asking price as an integer in rupees (1 lakh = 100000, 1 crore = 10000000). Omit if only a per-unit rate is given.
- state: Indian state, in English (e.g. "Uttar Pradesh")
- city: city or district, in English spelling (e.g. "Azamgarh")
- locality: village / area / landmark, as the seller wrote it
- name: the person's own name, only if they say it ("mera naam Ramesh hai")`;

/** Listing fields found in a free-form message (validated shapes only), or null. */
export async function extractListing(text: string, chatKey: string, fetchImpl?: typeof fetch): Promise<ExtractedListing | null> {
  const cfg = getAiConfig();
  if (!cfg || !text.trim() || !(await allowed(cfg, chatKey))) return null;
  const raw = await complete(cfg, { system: EXTRACT_SYSTEM, messages: [{ role: "user", content: redact(text) }], maxTokens: 200, json: true }, fetchImpl);
  if (!raw) return null;
  const parsed = extractedSchema.safeParse(firstJsonObject(raw));
  if (!parsed.success) return null;
  const out = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as ExtractedListing;
  // Area without a unit (or vice versa) is unusable.
  if ((out.area === undefined) !== (out.unit === undefined)) {
    delete out.area;
    delete out.unit;
  }
  return Object.keys(out).length ? out : null;
}

function replySystem(lang: AiLang, question: string | null): string {
  return `You are the WhatsApp assistant of ${site.name} (${site.url}), an Indian marketplace that connects people looking for land with the sellers who have it.
How it works: sellers list land free, right here on WhatsApp or on the website, in a few simple steps; our team checks every listing before it goes live; buyers call or WhatsApp the seller directly; buyers only see the approximate area, never the exact location pin; every seller gets a permanent Seller ID; each week we ask sellers if their land is still available.
Write ${lang === "hi" ? "in simple, everyday Hindi (Devanagari script); common words like प्लॉट, फ़ोटो, लाख are fine" : "in simple English"}.
Tone: respectful (use "ji"), warm, grounded, never pushy. At most 3 short sentences (under 60 words).
Never: promise a sale, a buyer, a price or a timeline; ask for Aadhaar, OTP, bank details or money; give legal or tax advice (suggest checking papers like khatauni and registry with a lawyer); invent listings, numbers or policies; share links other than ${site.url}.
If the message is unrelated to land, kindly say you help people list and sell land.
${question ? `The seller is in the middle of a listing. The bot will ask this question again right after your reply, so do NOT repeat it: "${question}". Gently help them answer it.` : "If they seem to want to sell land, encourage them to tap \"List my land\"."}`;
}

/** A short reply for a message the fixed flow couldn't handle, or null. */
export async function replyToSeller(
  input: { lang: AiLang; text: string; question: string | null; chatKey: string },
  fetchImpl?: typeof fetch,
): Promise<string | null> {
  const cfg = getAiConfig();
  if (!cfg || !input.text.trim() || !(await allowed(cfg, input.chatKey))) return null;
  const raw = await complete(cfg, { system: replySystem(input.lang, input.question), messages: [{ role: "user", content: redact(input.text) }], maxTokens: 220 }, fetchImpl);
  if (!raw) return null;
  // Plain text only; drop any link that isn't ours.
  const cleaned = raw
    .replace(/https?:\/\/\S+/g, (u) => (u.startsWith(site.url) ? u : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 600);
  return cleaned.length >= 2 ? cleaned : null;
}
