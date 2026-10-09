import type { AreaUnit, LandType, SellerType } from "@/generated/prisma/enums";
import { FEATURE_OPTIONS } from "@/lib/land";

/**
 * Pure parsers for the WhatsApp listing assistant. No I/O, no server-only
 * imports, so they can be checked with `pnpm exec tsx scripts/check-whatsapp-parse.ts`.
 *
 * Sellers type the way they speak: "2 bigha", "18 lac", "1.2 cr", "200 gaj",
 * Hindi words and Devanagari digits. Everything here is forgiving on input
 * and strict on output (null when unsure, so the bot asks again).
 */

// ───────────────────────────── Normalisation ─────────────────────────────

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯";

/** Lowercase, Devanagari/Gurmukhi digits → ASCII, Indian/Western digit grouping removed, whitespace collapsed. */
export function normalizeInput(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[੦-੯]/g, (d) => String(GURMUKHI_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1") // 18,00,000 → 1800000 ; 1,500 → 1500
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
/** End of a latin word (Devanagari words are matched by prefix). */
const END = String.raw`(?![a-z])`;

/** First plain number in the text ("about 2.5" → 2.5). Null if none. */
export function parseNumber(text: string): number | null {
  const m = normalizeInput(text).match(new RegExp(NUMBER));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────────── Area ─────────────────────────────

/** Unit spellings → AreaUnit. Order matters: longer / more specific first. */
const UNIT_PATTERNS: [RegExp, AreaUnit][] = [
  // Square feet
  [new RegExp(String.raw`^(?:square|sq\.?|sqr|sqre)\s*(?:feet|foot|fts?\.?)${END}`), "SQFT"],
  [new RegExp(String.raw`^(?:sqft|sq\.ft\.?|sft|ft2|ft²|feet|foot|ft${END}\.?)${END}`), "SQFT"],
  [/^(?:वर्ग\s*फ़?फ?ुट|वर्ग\s*फीट|स्क्वायर\s*फ़?फ?ीट|स्क्वेयर\s*फ़?फ?ीट|फीट|फ़ीट|फुट)/, "SQFT"],
  // Square yards / gaj
  [new RegExp(String.raw`^(?:square|sq\.?)\s*(?:yards?|yds?\.?)${END}`), "SQYD"],
  [new RegExp(String.raw`^(?:sqyds?|sq\.yd\.?|yards?|yds?|gaj|gaz|guz|gaaj|gajj)${END}`), "SQYD"],
  [/^(?:गज|वर्ग\s*गज)/, "SQYD"],
  // Square metres
  [new RegExp(String.raw`^(?:square|sq\.?)\s*(?:metres?|meters?|mtrs?\.?|mts?\.?|m)${END}`), "SQM"],
  [new RegExp(String.raw`^(?:sqm|sq\.m\.?|sqmt|sqmtr|m2|m²)${END}`), "SQM"],
  [/^(?:वर्ग\s*मीटर|स्क्वायर\s*मीटर)/, "SQM"],
  // Acre ("killa" in Punjab = 1 acre)
  [new RegExp(String.raw`^(?:acres?|acers?|akars?|ekads?|ekars?|ac|killas?|kille|kilas?|qillas?)${END}\.?`), "ACRE"],
  [/^(?:एकड़|एकड|एकर|किल्ला|किल्ले|ਏਕੜ|ਕਿੱਲਾ|ਕਿੱਲੇ|ਕਿਲਾ)/, "ACRE"],
  // Hectare
  [new RegExp(String.raw`^(?:hectares?|hectors?|hactares?|hect|hec|ha)${END}`), "HECTARE"],
  [/^(?:हेक्टेयर|हेक्टर)/, "HECTARE"],
  // Bigha (eastern UP spellings)
  [new RegExp(String.raw`^(?:bighas?|bigahs?|bigha|beeghas?|beegahs?|bigas?|beegas?|bigaha)${END}`), "BIGHA"],
  [/^(?:बीघा|बिघा|बीगा|बिगहा|बीघे)/, "BIGHA"],
  // Biswa
  [new RegExp(String.raw`^(?:biswas?|bisvas?|beeswas?|biswa)${END}`), "BISWA"],
  [/^(?:बिस्वा|बिसवा|विस्वा)/, "BISWA"],
  // Marla / Kanal (Punjab, Haryana, Chandigarh tricity; 1 Kanal = 20 Marla)
  [new RegExp(String.raw`^(?:marlas?|marle|marley|marala|marlay|mrla)${END}`), "MARLA"],
  [/^(?:मरला|मरले|ਮਰਲਾ|ਮਰਲੇ|ਮਰਲਿਆਂ)/, "MARLA"],
  [new RegExp(String.raw`^(?:kanals?|kanaal|kanaals?|knal)${END}`), "KANAL"],
  [/^(?:कनाल|ਕਨਾਲ)/, "KANAL"],
];

/** "bigha", "sq ft", "गज" → AreaUnit (the whole message must be just a unit). */
export function parseUnit(text: string): AreaUnit | null {
  const t = normalizeInput(text).replace(/^in\s+/, "").replace(/[.!?]+$/, "");
  for (const [re, unit] of UNIT_PATTERNS) {
    const m = t.match(re);
    if (m && t.slice(m[0].length).trim() === "") return unit;
  }
  // Labels we show in the unit list ("Gaj (sq yd)", "Square feet").
  const label = t.replace(/\(.*\)/, "").trim();
  for (const [re, unit] of UNIT_PATTERNS) {
    const m = label.match(re);
    if (m && label.slice(m[0].length).trim() === "") return unit;
  }
  return null;
}

/** Matches a unit at the very start of `rest`. Returns the unit and how much text it used. */
function unitAtStart(rest: string): { unit: AreaUnit; length: number } | null {
  const trimmed = rest.replace(/^[\s-]+/, "");
  const offset = rest.length - trimmed.length;
  for (const [re, unit] of UNIT_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { unit, length: offset + m[0].length };
  }
  return null;
}

const MAX_AREA = 10_000_000;

/**
 * "2 bigha", "2bigha", "1.5 acre", "1500 sq ft", "200 gaj", "15 biswa",
 * "2 bigha 5 biswa" (→ 2.25 bigha), "10 marla", "1 kanal", "2 kanal 5 marla"
 * (→ 45 marla), "2 killa" (→ 2 acre), "बीघा 2", "२ बीघा". A bare number → null
 * (the bot then asks for the unit).
 */
export function parseArea(text: string): { area: number; unit: AreaUnit } | null {
  const t = normalizeInput(text);
  const numberRe = new RegExp(NUMBER, "g");
  const matches = [...t.matchAll(numberRe)];
  if (matches.length === 0) return null;

  // Preferred: "<number> <unit>", optionally followed by "<number> biswa".
  for (const m of matches) {
    const n = Number(m[1]);
    const after = t.slice(m.index! + m[0].length);
    const u = unitAtStart(after);
    if (!u || !(n > 0)) continue;
    let area = n;
    let unit = u.unit;
    if (u.unit === "BIGHA" || u.unit === "KANAL") {
      // "2 bigha 5 biswa" → 2.25 bigha ; "2 kanal 5 marla" → 45 marla (both 1:20).
      const tail = after.slice(u.length);
      const part = tail.match(new RegExp(String.raw`^\s*(?:and|&|aur|और|ate|ਅਤੇ|,)?\s*${NUMBER}\s*`));
      if (part) {
        const pu = unitAtStart(tail.slice(part[0].length));
        if (u.unit === "BIGHA" && pu?.unit === "BISWA") area = n + Number(part[1]) / 20;
        if (u.unit === "KANAL" && pu?.unit === "MARLA") {
          area = n * 20 + Number(part[1]);
          unit = "MARLA";
        }
      }
    }
    return area <= MAX_AREA ? { area: round(area, 4), unit } : null;
  }

  // Fallback: unit written before the number ("bigha 2", "area: 2 (bigha)") — only when unambiguous.
  if (matches.length === 1) {
    const n = Number(matches[0][1]);
    const withoutNumber = (t.slice(0, matches[0].index) + " " + t.slice(matches[0].index! + matches[0][0].length)).trim();
    const words = withoutNumber.split(/[\s:()=,-]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      // Try two-word units ("sq ft") before one-word ones.
      for (const span of [3, 2, 1]) {
        const candidate = words.slice(i, i + span).join(" ");
        const unit = parseUnit(candidate);
        if (unit && n > 0 && n <= MAX_AREA) return { area: round(n, 4), unit };
      }
    }
  }
  return null;
}

// ───────────────────────────── Price ─────────────────────────────

const MULTIPLIERS: [RegExp, number][] = [
  [new RegExp(String.raw`^(?:crores?|crs?|karod|karor|crore)${END}\.?`), 1_00_00_000],
  [/^(?:करोड़|करोड)/, 1_00_00_000],
  [new RegExp(String.raw`^(?:lakhs?|lacs?|laks?|lakh|lkh|lk|l)${END}\.?`), 1_00_000],
  [/^(?:लाख)/, 1_00_000],
  [new RegExp(String.raw`^(?:thousands?|hazaa?r|hajaa?r|k)${END}`), 1_000],
  [/^(?:हज़ार|हजार)/, 1_000],
];

function multiplierAtStart(rest: string): { factor: number; length: number } | null {
  const trimmed = rest.replace(/^\s+/, "");
  const offset = rest.length - trimmed.length;
  for (const [re, factor] of MULTIPLIERS) {
    const m = trimmed.match(re);
    if (m) return { factor, length: offset + m[0].length };
  }
  return null;
}

export const MIN_PRICE = 10_000;
export const MAX_PRICE = 10_000_000_000;

/**
 * "18 lakh", "18 lac", "18L", "18.5 lakh", "1.2 cr", "1 करोड़", "18,00,000",
 * "₹ 18 lakh", "1 crore 20 lakh" → rupees (integer). Null when unclear or
 * below ₹10,000 (sellers mean the TOTAL price).
 */
export function parsePrice(text: string): number | null {
  const t = normalizeInput(text)
    .replace(/₹|\binr\b|\brs\.?|\brupees?\b|\brupaye\b|रुपये|रुपए|\/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = [...t.matchAll(new RegExp(NUMBER, "g"))];
  if (matches.length === 0) return null;

  // Sum consecutive "<number> <multiplier>" parts: "1 crore 20 lakh".
  let total = 0;
  let usedMultiplier = false;
  let cursor = -1;
  for (const m of matches) {
    const start = m.index!;
    const after = t.slice(start + m[0].length);
    const mult = multiplierAtStart(after);
    if (!mult) {
      if (usedMultiplier) break; // "18 lakh for 2 bigha" — stop at the area
      continue;
    }
    if (usedMultiplier && t.slice(cursor, start).replace(/\s|and|aur|और|&|,|\+/g, "") !== "") break;
    total += Number(m[1]) * mult.factor;
    usedMultiplier = true;
    cursor = start + m[0].length + mult.length;
  }

  if (!usedMultiplier) {
    // Plain rupees: only when there's exactly one number ("1800000", "18,00,000").
    if (matches.length !== 1) return null;
    total = Number(matches[0][1]);
  }

  const rupees = Math.round(total);
  if (!Number.isFinite(rupees) || rupees < MIN_PRICE || rupees > MAX_PRICE) return null;
  return rupees;
}

/** "5 lakh per bigha", "₹2000/sqft", "prati bigha" — we need the TOTAL price. */
export function looksLikePerUnitPrice(text: string): boolean {
  const t = normalizeInput(text);
  return /\bper\b|\bprati\b|प्रति|\/\s*(?:bigha|biswa|acre|sq|gaj|gaz|ft|feet|yard|m)|\bpsf\b|\bevery\b|\bek bigha\b/.test(t);
}

// ───────────────────────────── Commands ─────────────────────────────

export type BotCommand =
  | "START"
  | "STATUS"
  | "ID"
  | "YES"
  /** "no", "nahi", "bik gaya", "NO 2" — the answer to the weekly "still available?" check. */
  | "NO"
  /** The explicit "mark a plot as sold" flow. */
  | "SOLD"
  | "HELP"
  | "CANCEL"
  | "HUMAN"
  | "MENU"
  /** "hi", "hello", "namaste" — shows the welcome menu when idle, resumes when mid-listing, never leaves HUMAN. */
  | "GREETING";

/** Lowercase, Devanagari digits normalised, punctuation and emoji stripped. */
function commandKey(text: string): string {
  return normalizeInput(text)
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASES: Record<Exclude<BotCommand, "START">, string[]> = {
  GREETING: [
    "hi", "hii", "hiii", "hello", "helo", "hello there", "hey", "hey there", "namaste", "namaskar", "namaskaar",
    "namastey", "ram ram", "jai shri ram", "salaam", "salam", "assalamualaikum", "good morning", "good afternoon",
    "good evening", "hi there", "hello plots", "hi plots", "नमस्ते", "नमस्कार", "राम राम", "हेलो", "हाय",
  ],
  MENU: ["menu", "main menu", "options", "bot", "assistant", "back to menu", "go back", "मेनू"],
  HELP: ["help", "madad", "sahayata", "how", "how does it work", "what can you do", "मदद", "सहायता", "help please"],
  STATUS: [
    "status", "my plots", "my plot", "my listings", "my listing", "my land", "my lands", "plots", "listings",
    "check status", "listing status", "mere plot", "mera plot", "my properties", "my property", "स्टेटस",
  ],
  ID: ["id", "my id", "seller id", "sellerid", "my seller id", "seller code", "my code", "mera id", "meri id", "आईडी"],
  YES: [
    "yes", "y", "yes available", "yes it is available", "yes still available", "still available", "available",
    "haan", "han", "ha", "haa", "haan ji", "han ji", "ha ji", "ji", "ji haan", "ji han", "yes ji", "yess", "yeah",
    "yep", "ok yes", "abhi available hai", "available hai", "हाँ", "हां", "हा", "जी", "जी हाँ", "जी हां", "हाँ जी",
    // Button titles of the weekly check (template quick replies arrive as their text).
    "yes all available", "yes all", "all available", "all are available", "yes all are available", "sab available",
    "sab available hai", "haan sab available", "yes available hai", "still available yes",
  ],
  NO: [
    "no", "n", "nope", "nah", "na", "naa", "nahi", "nahin", "nai", "nhi", "nahi hai", "no sir", "नहीं", "नही", "ना",
    "not available", "no longer available", "no not available", "nahi available", "available nahi hai",
    "sold out", "it is sold", "its sold", "it s sold", "already sold", "plot sold", "land sold", "property sold",
    "no sold", "no it s sold", "no its sold", "no it is sold", "no it s sold out", "one is sold", "another is sold",
    "bik gaya", "bik gayi", "bik gya", "bik gai", "bik chuka", "bik chuka hai", "bik gaya hai", "bech diya",
    "bech diye", "बिक गया", "बिक गई", "बिक गयी", "बेच दिया", "बिक चुका",
  ],
  SOLD: ["sold", "mark sold", "mark as sold", "mark plot sold", "sold plot"],
  CANCEL: ["cancel", "stop", "exit", "quit", "end", "band karo", "ruko", "cancel listing", "रद्द", "बंद करो", "रुको"],
  HUMAN: [
    "talk", "talk to us", "talk to someone", "talk to a person", "talk to person", "talk to human", "agent", "human",
    "person", "real person", "call me", "call", "call back", "callback", "please call", "please call me",
    "speak to someone", "support", "customer care", "customer support", "help me person", "contact", "contact us",
    "baat karni hai", "baat karo", "call karo", "call kijiye", "बात करनी है", "कॉल करें",
  ],
};

const START_PHRASES = new Set([
  "sell", "list", "new", "start", "register", "sell land", "sell my land", "sell plot", "sell my plot",
  "list my land", "list land", "list plot", "list my plot", "new listing", "new plot", "add plot", "add land",
  "add my plot", "post plot", "post land", "zameen bechni hai", "plot bechna hai", "bechna hai", "बेचना है",
  "जमीन बेचनी है", "ज़मीन बेचनी है",
]);

const PHRASE_LOOKUP = new Map<string, BotCommand>();
for (const [command, phrases] of Object.entries(PHRASES) as [BotCommand, string[]][]) {
  for (const p of phrases) PHRASE_LOOKUP.set(p, command);
}

/**
 * Detects a global command. Deliberately strict — the whole message must be
 * the command — so a description like "New colony near station" is never
 * mistaken for one. The one exception is a message that STARTS with "sell"
 * (our wa.me link pre-fills "SELL — Hi, I want to list my land on InstaPlots.").
 */
export function detectCommand(text: string | null | undefined): BotCommand | null {
  if (!text) return null;
  const key = commandKey(text);
  if (!key) return null;
  if (START_PHRASES.has(key)) return "START";
  const exact = PHRASE_LOOKUP.get(key);
  if (exact) return exact;

  // Polite padding: "hi, status please", "status pls", "ok cancel".
  const stripped = key
    .replace(/^(?:hi|hello|hey|namaste|ok|okay|pls|please|sir|bhai|ji)\s+/, "")
    .replace(/\s+(?:please|pls|plz|sir|ji|bhai|now)$/, "")
    .trim();
  if (stripped !== key) {
    if (START_PHRASES.has(stripped)) return "START";
    const padded = PHRASE_LOOKUP.get(stripped);
    if (padded && padded !== "GREETING") return padded;
  }

  if (parseAvailabilityReply(text)?.answer === "NO") return "NO";
  if (/^sell(?:\s|$)/.test(key)) return "START";
  if (/^i (?:want|wish|would like) to (?:sell|list)\b/.test(key)) return "START";
  return null;
}

// ───────────────────────────── Weekly availability replies ─────────────────────────────

export type AvailabilityReply =
  | { answer: "YES" }
  /** `plain`: just "no" / "nahi" with nothing else — inside a listing that is usually an answer to our question instead. */
  | { answer: "NO"; number: number | null; plain: boolean };

const PLAIN_NO = new Set(["no", "n", "nope", "nah", "na", "naa", "nahi", "nahin", "nai", "nhi", "nahi hai", "no sir", "नहीं", "नही", "ना"]);

const NO_WORD = String.raw`(?:no|nahi|nahin|nhi|na|नहीं|नही)`;
const SOLD_WORDS = String.raw`(?:sold(?: out)?|bik gaya|bik gayi|bik gya|bik gai|bik chuka(?: hai)?|bech diya|बिक गया|बिक गई|बिक गयी|बिक चुका)`;
const NUM = String.raw`(?:(?:no|number|num|plot|property|#)\s*)?(\d{1,2})`;

/**
 * Answers to the weekly "still available?" message. YES → all still
 * available; NO → one is sold, optionally with its number from our list:
 * "NO 2", "no. 2", "nahi 2", "2 sold", "sold 2", "2 bik gaya", "NO, 2 is sold".
 * A bare number is NOT an answer here (see parseListNumber).
 */
export function parseAvailabilityReply(text: string | null | undefined): AvailabilityReply | null {
  if (!text) return null;
  const key = commandKey(text);
  if (!key) return null;
  const exact = PHRASE_LOOKUP.get(key);
  if (exact === "YES") return { answer: "YES" };
  if (exact === "NO") return { answer: "NO", number: null, plain: PLAIN_NO.has(key) };
  const patterns = [
    new RegExp(String.raw`^${NO_WORD}\s+${NUM}(?:\s+(?:is|hai|wala|wali|vala))?(?:\s+${SOLD_WORDS})?(?:\s+(?:hai|ho gaya))?$`, "u"),
    new RegExp(String.raw`^${NUM}\s+(?:is\s+|wala\s+|wali\s+|vala\s+)?${SOLD_WORDS}(?:\s+(?:hai|ho gaya))?$`, "u"),
    new RegExp(String.raw`^${SOLD_WORDS}\s+${NUM}$`, "u"),
    new RegExp(String.raw`^${NO_WORD}\s+${SOLD_WORDS}\s+${NUM}$`, "u"),
  ];
  for (const re of patterns) {
    const m = key.match(re);
    if (m) {
      const n = Number(m[1]);
      return n >= 1 ? { answer: "NO", number: n, plain: false } : null;
    }
  }
  return null;
}

/** A bare list number ("2", "#2", "no. 2" is NOT bare) → 2. Used after "Which property is sold?". */
export function parseListNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = normalizeInput(text).match(/^(?:#|number\s*|num\s*)?(\d{1,2})[.)]?$/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// ───────────────────────────── Other answers ─────────────────────────────

/** Owner / broker from free text ("I'm the owner", "malik", "property dealer"). */
export function parseSellerType(text: string): SellerType | null {
  const t = commandKey(text);
  if (/\b(?:broker|agent|dealer|dalal|property dealer|consultant|middleman|ब्रोकर|दलाल|एजेंट|डीलर)\b/u.test(t) || /दलाल|ब्रोकर|एजेंट|डीलर/.test(t)) {
    return "BROKER";
  }
  if (/\b(?:owner|malik|maalik|khud|self|myself|my own|own land|landowner|मालिक|खुद)\b/u.test(t) || /मालिक|खुद/.test(t)) {
    return "OWNER";
  }
  if (t === "1") return "OWNER";
  if (t === "2") return "BROKER";
  return null;
}

/** The order land types are offered in (most common first in eastern UP). */
export const LAND_TYPE_ORDER: LandType[] = ["AGRICULTURAL", "RESIDENTIAL_PLOT", "COMMERCIAL", "INDUSTRIAL", "OTHER"];

/** "agricultural", "khet", "house plot", "2" (position in our list) → LandType. */
export function parseLandType(text: string): LandType | null {
  const t = commandKey(text);
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= LAND_TYPE_ORDER.length) return LAND_TYPE_ORDER[n - 1];
  if (/agri|\bkhet|\bfarm|kheti|\bkrishi|orchard|\bbagh|खेत|कृषि|खेती/.test(t)) return "AGRICULTURAL";
  if (/industr|factory|warehouse|godown|\bplant\b|फैक्ट्री|गोदाम|औद्योगिक/.test(t)) return "INDUSTRIAL";
  if (/commerc|\bshop|dukan|dukaan|market|showroom|office|\bcomplex|व्यावसायिक|दुकान|कमर्शियल/.test(t)) return "COMMERCIAL";
  if (/resid|\bhouse|\bghar|makan|makaan|colony|\bplot\b|\bhome|आवासीय|मकान|घर|प्लॉट/.test(t)) return "RESIDENTIAL_PLOT";
  if (/^(?:other|others|other land|anya|any other|kuch aur|अन्य)$/.test(t)) return "OTHER";
  return null;
}

/** Coordinates from a typed pair or a maps link ("26.07, 83.18", ".../@26.07,83.18,15z", "?q=26.07,83.18"). */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) return null;
  return { latitude, longitude };
}

const FEATURE_PATTERNS: [RegExp, (typeof FEATURE_OPTIONS)[number]][] = [
  [/road\s*facing|on (?:the )?(?:main )?road|road side|roadside|sadak|सड़क|रोड/, "Road facing"],
  [/highway|\bnh\s*\d*|\bsh\s*\d+|हाईवे|राजमार्ग/, "Near highway"],
  [/boundary|chahardiwari|chardiwari|charदीवारी|bounded|बाउंड्री|चारदीवारी/, "Boundary wall"],
  [/electric|bijli|\bpower\b|light connection|बिजली/, "Electricity"],
  [/water|tube\s*well|tubewell|boring|\bhand\s*pump|\bnahar|canal|\bkuan|पानी|ट्यूबवेल|बोरिंग|नहर/, "Water source"],
  [/corner|कॉर्नर|कोने/, "Corner plot"],
  [/gated|गेटेड/, "Gated colony"],
  [/clear title|papers? (?:clear|ready)|documents? (?:clear|ready)|khatauni|registry ready|dakhil kharij|clear papers/, "Clear title (as per seller)"],
];

/** Feature chips mentioned in a free-text description. */
export function detectFeatures(text: string): (typeof FEATURE_OPTIONS)[number][] {
  const t = normalizeInput(text);
  const found = new Set<(typeof FEATURE_OPTIONS)[number]>();
  for (const [re, feature] of FEATURE_PATTERNS) if (re.test(t)) found.add(feature);
  return FEATURE_OPTIONS.filter((f) => found.has(f));
}

/** "my name is ramesh yadav" → "Ramesh Yadav". Null if it doesn't look like a name. */
export function parseName(text: string): string | null {
  let t = text
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:hi|hello|namaste)[,!.\s]+/i, "")
    .replace(/^(?:my name is|my name's|name is|name|i am|i'm|im|this is|me|mera naam|naam|मेरा नाम)\s*[:\-]?\s*/i, "")
    .replace(/\s+(?:hai|he|है)$/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (t.length < 2 || t.length > 60) return null;
  if (!/\p{L}/u.test(t)) return null;
  if (/\d{3,}/.test(t)) return null;
  if (t.split(" ").length > 6) return null;
  if (t === t.toLowerCase() || t === t.toUpperCase()) {
    t = t.replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return t;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
