import "server-only";
import { z } from "zod";
import { Prisma, type Seller, type WhatsAppConversation } from "@/generated/prisma/client";
import { AreaUnit, LandType, type ListingStatus, type HiddenReason, type SellerType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { matchState, splitCityAndState } from "@/lib/india";
import { LAND_TYPES, LAND_TYPE_SLUGS, buildTitle, placeName } from "@/lib/land";
import { maskPhoneForLogging } from "@/lib/phone";
import { site } from "@/lib/site";
import { formatArea, formatSqftHint, toSqft } from "@/lib/units";
import { listingInputSchema, type ListingInput } from "@/lib/validation/listing";
import { hitRateLimit } from "@/lib/rate-limit";
import { trackEvent } from "@/server/analytics";
import { understandMessage, type ExtractedListing } from "@/server/ai/assistant";
import { isAiEnabled } from "@/server/ai/config";
import { buyerRequestSchema, saveBuyerRequest } from "@/server/buyer-requests";
import { CITY_NAME_PATTERN, englishPlaceName, isDevanagari, resolveCity } from "@/server/cities";
import { isKycAvailable } from "@/server/kyc/provider";
import { changeListingStatus, createListing, findOrCreateSeller, plotsAwaitingAvailability } from "@/server/listings/service";
import type { StoredImage } from "@/server/storage";
import type { OutgoingMessage } from "./client";
import { recordOutboundOnly, sendAndRecord } from "./messaging";
import { LANGUAGE_PICKER, UNIT_ROWS, area as areaText, copy, daysAgo, landHint, landLabel, price as priceText, statusWord, toLang, type Copy, type Lang } from "./copy";
import { notifyVerifyIdentity } from "./notify";
import {
  LAND_TYPE_ORDER,
  detectCommand,
  detectFeatures,
  looksLikePerUnitPrice,
  normalizeInput,
  parseArea,
  parseAvailabilityReply,
  parseCoordinates,
  parseLandType,
  parseLanguage,
  parseListNumber,
  parseName,
  parseNumber,
  parsePrice,
  parseUnit,
  looksLikeQuestion,
  type BotCommand,
} from "./parse";

/**
 * The WhatsApp listing assistant — a small state machine.
 *
 *   (language) → IDLE ─SELL→ ASK_NAME → ASK_LAND_TYPE → ASK_STATE → ASK_CITY →
 *   ASK_LOCALITY → ASK_AREA (→ ASK_AREA_UNIT) → ASK_PRICE → ASK_PHOTOS →
 *   ASK_LOCATION → ASK_DESCRIPTION → CONFIRM ─Submit→ PENDING listing → IDLE
 *
 * Language: a new chat starts with "English / हिंदी" (stored on the
 * conversation; LANGUAGE / भाषा switches anytime). Every message comes from
 * copy.ts in that language. Chats that existed before default to English.
 * Everyone is simply a "seller" — we don't ask owner vs broker.
 *
 * Steps whose answer is already in the draft are skipped, so a seller who
 * writes "2 bigha khet Azamgarh 18 lakh" (understood by the optional AI,
 * src/server/ai) isn't asked again. With AI on, typed messages are read by
 * the AI first (see aiAgent): it tells answers from questions, small talk,
 * corrections and requests, and replies like a person before the next question. Known sellers skip ASK_NAME. HUMAN means a person from
 * our team is chatting; the bot stays silent until the seller sends MENU.
 * The step lives in WhatsAppConversation.step and partial answers in .draft.
 *
 * Global commands (CANCEL, HELP, MENU, STATUS, ID, TALK, YES, NO, SOLD) work
 * at any step. Interactive reply ids look like `type:AGRICULTURAL`,
 * `city:<id>`, `photos:done`, `sold:yes:<propertyId>`, `avail:yes`,
 * `avail:no`, `nosold:<propertyId>`.
 *
 * Weekly availability check (notify.ts sendAvailabilityCheck, one message per
 * seller, plots numbered oldest first = plotsAwaitingAvailability):
 *   YES / avail:yes → every awaiting plot stays live (lastConfirmedAt) and
 *     plots hidden for no reply go live again.
 *   NO / avail:no / "bik gaya" → one awaiting plot: marked sold. Several:
 *     "Which property is sold?" (list `nosold:<id>`, or a typed number while
 *     in ASK_SOLD_WHICH). "NO 2" picks number 2 directly. None awaiting: the
 *     seller's only live/hidden plot (after a confirm button) or the list.
 *   Mid-listing, a plain "no" stays an answer to the listing question when
 *   that question can take a no (name, price suggestion, photos, pin,
 *   description, summary) or when nothing is awaiting a check. Explicit
 *   replies ("NO 2", "bik gaya", the NO button) still answer the check, and
 *   the listing question is repeated afterwards. Bare numbers only count in
 *   ASK_SOLD_WHICH (never mid-listing, where "2" could be a size or price).
 */

// ───────────────────────────── Steps & draft ─────────────────────────────

export const BOT_STEPS = [
  "IDLE",
  "ASK_NAME",
  "ASK_SELLER_TYPE",
  "ASK_LAND_TYPE",
  "ASK_STATE",
  "ASK_CITY",
  "ASK_LOCALITY",
  "ASK_AREA",
  "ASK_AREA_UNIT",
  "ASK_PRICE",
  "ASK_PHOTOS",
  "ASK_LOCATION",
  "ASK_DESCRIPTION",
  "CONFIRM",
  "SUBMITTING",
  "HUMAN",
  /** Not part of a listing: we asked "Which property is sold?" and accept a typed number. */
  "ASK_SOLD_WHICH",
] as const;
export type BotStep = (typeof BOT_STEPS)[number];

const STEP_LABELS: Record<BotStep, string> = {
  IDLE: "Idle",
  ASK_NAME: "Asking name",
  ASK_SELLER_TYPE: "Owner or broker?",
  ASK_LAND_TYPE: "Asking land type",
  ASK_STATE: "Asking state",
  ASK_CITY: "Asking city / district",
  ASK_LOCALITY: "Asking village / area",
  ASK_AREA: "Asking land size",
  ASK_AREA_UNIT: "Asking size unit",
  ASK_PRICE: "Asking price",
  ASK_PHOTOS: "Collecting photos",
  ASK_LOCATION: "Asking location pin",
  ASK_DESCRIPTION: "Asking description",
  CONFIRM: "Reviewing summary",
  SUBMITTING: "Submitting",
  HUMAN: "Needs a person",
  ASK_SOLD_WHICH: "Asking which plot is sold",
};

export function toBotStep(step: string | null | undefined): BotStep {
  return (BOT_STEPS as readonly string[]).includes(step ?? "") ? (step as BotStep) : "IDLE";
}

/** Human-readable step, for the admin inbox. */
export function describeStep(step: string): string {
  return STEP_LABELS[toBotStep(step)];
}

/** Steps in which the seller is in the middle of a listing. */
const FLOW_ORDER: BotStep[] = [
  "ASK_NAME",
  "ASK_LAND_TYPE",
  "ASK_STATE",
  "ASK_CITY",
  "ASK_LOCALITY",
  "ASK_AREA",
  "ASK_PRICE",
  "ASK_PHOTOS",
  "ASK_LOCATION",
  "ASK_DESCRIPTION",
  "CONFIRM",
];

function isInFlow(step: BotStep): boolean {
  // ASK_SELLER_TYPE: no longer asked, but older chats may still be paused on it.
  return FLOW_ORDER.includes(step) || step === "ASK_AREA_UNIT" || step === "ASK_SELLER_TYPE" || step === "SUBMITTING";
}

export const MAX_PHOTOS = 10;

const storedImageSchema = z.object({ url: z.string(), width: z.number(), height: z.number() });

const draftSchema = z
  .object({
    name: z.string(),
    sellerType: z.enum(["OWNER", "BROKER"]),
    landType: z.enum(Object.values(LandType) as [LandType, ...LandType[]]),
    cityId: z.string(),
    cityName: z.string(),
    cityState: z.string(),
    locality: z.string(),
    village: z.string(),
    area: z.number(),
    areaUnit: z.enum(Object.values(AreaUnit) as [AreaUnit, ...AreaUnit[]]),
    pendingArea: z.number(),
    price: z.number(),
    suggestedPrice: z.number(),
    photos: z.array(storedImageSchema),
    latitude: z.number(),
    longitude: z.number(),
    locationAsked: z.boolean(),
    description: z.string(),
    descriptionGenerated: z.boolean(),
    features: z.array(z.string()),
    /** Set when submit validation sent the seller back to fix one answer. */
    returnToConfirm: z.boolean(),
    /** ASK_SOLD_WHICH: property ids in the order we numbered them. */
    soldChoices: z.array(z.string()),
    /** What to do once the seller picks a language. */
    afterLanguage: z.enum(["START", "MENU"]),
  })
  .partial();
export type BotDraft = z.infer<typeof draftSchema>;

function readDraft(value: Prisma.JsonValue | null): BotDraft {
  const parsed = draftSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

// ───────────────────────────── Turn input / output ─────────────────────────────

export type BotInput = {
  kind: "text" | "interactive" | "image" | "location" | "other";
  text?: string;
  replyId?: string;
  replyTitle?: string;
  /** Inbound photo, already stored by inbound.ts. Null when saving it failed. */
  image?: StoredImage | null;
  latitude?: number;
  longitude?: number;
  /** Meta's message type for kind "other" (audio, sticker, video…). */
  otherType?: string;
};

export type BotReply = {
  /** The stored WhatsAppMessage id (simulation mode only). */
  messageId: string | null;
  message: OutgoingMessage;
};

type ConversationWithSeller = WhatsAppConversation & { seller: Seller | null };

const META_BODY_LIMIT = { text: 4096, interactive: 1024 };

class Turn {
  readonly replies: BotReply[] = [];
  step: BotStep;
  draft: BotDraft;
  seller: Seller | null;
  /** Set when this turn ended with a question for the seller (so we don't repeat the listing question over it). */
  asked = false;
  /** The AI already read this message (it runs at most once per turn). */
  agentTried = false;
  lang: Lang;

  constructor(
    public conv: ConversationWithSeller,
    private readonly simulate: boolean,
  ) {
    this.step = toBotStep(conv.step);
    this.draft = readDraft(conv.draft);
    this.seller = conv.seller;
    this.lang = toLang(conv.language);
  }

  /** The assistant's words in this chat's language. */
  get c(): Copy {
    return copy(this.lang);
  }

  get hasLanguage() {
    return this.conv.language === "en" || this.conv.language === "hi";
  }

  async setLanguage(lang: Lang) {
    this.lang = lang;
    this.conv = { ...this.conv, language: lang };
    await db.whatsAppConversation.update({ where: { id: this.conv.id }, data: { language: lang } });
  }

  get phone() {
    return this.conv.phone;
  }

  /** Every bot message goes through here. Simulation never reaches Meta. */
  async reply(message: OutgoingMessage, sentBy: "bot" | "system" = "bot") {
    const m = clipMessage(message);
    if (this.simulate) {
      const messageId = await recordOutboundOnly(this.phone, m, sentBy);
      this.replies.push({ messageId, message: m });
    } else {
      await sendAndRecord(this.phone, m, sentBy);
      this.replies.push({ messageId: null, message: m });
    }
  }

  text(text: string) {
    return this.reply({ type: "text", text });
  }

  async save(step: BotStep, draft: BotDraft | null = this.draft) {
    this.step = step;
    this.draft = draft ?? {};
    await db.whatsAppConversation.update({
      where: { id: this.conv.id },
      data: { step, draft: draft && Object.keys(draft).length ? (draft as Prisma.InputJsonValue) : Prisma.DbNull },
    });
  }

  async loadSeller() {
    this.seller = await db.seller.findUnique({ where: { phone: this.phone } });
    return this.seller;
  }

  get isSimulation() {
    return this.simulate;
  }
}

function clipMessage(m: OutgoingMessage): OutgoingMessage {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  switch (m.type) {
    case "text":
      return { ...m, text: clip(m.text, META_BODY_LIMIT.text) };
    case "buttons":
      return {
        ...m,
        body: clip(m.body, META_BODY_LIMIT.interactive),
        buttons: m.buttons.slice(0, 3).map((b) => ({ ...b, title: clip(b.title, 20) })),
      };
    case "list":
      return {
        ...m,
        body: clip(m.body, META_BODY_LIMIT.interactive),
        buttonLabel: clip(m.buttonLabel, 20),
        rows: m.rows.slice(0, 10).map((r) => ({
          ...r,
          title: clip(r.title, 24),
          ...(r.description ? { description: clip(r.description, 72) } : {}),
        })),
      };
    default:
      return m;
  }
}

// ───────────────────────────── Entry point ─────────────────────────────

/**
 * Runs one bot turn for an inbound message that inbound.ts has already
 * stored. Never throws — on an unexpected error the seller gets a polite
 * apology and the error is logged without PII.
 */
export async function runBot(conversationId: string, input: BotInput, opts: { simulate?: boolean } = {}): Promise<BotReply[]> {
  const conv = await db.whatsAppConversation.findUniqueOrThrow({ where: { id: conversationId }, include: { seller: true } });
  const turn = new Turn(conv, Boolean(opts.simulate));
  try {
    await handle(turn, input);
  } catch (err) {
    console.error("whatsapp-bot: turn failed", {
      phone: maskPhoneForLogging(conv.phone),
      step: turn.step,
      err: err instanceof Error ? err.message : String(err),
    });
    await turn.text(turn.c.errorGeneric).catch(() => {});
  }
  return turn.replies;
}

async function handle(t: Turn, input: BotInput) {
  const replyId = input.kind === "interactive" ? input.replyId : undefined;
  // Typed text, or the tapped title when no id came through (e.g. simulator after a reload).
  const text = (input.kind === "text" ? input.text : input.kind === "interactive" && !replyId ? input.replyTitle : undefined)?.trim();
  const command = text ? detectCommand(text) : null;

  // ── Language: chosen by tap, by typing ("hindi"), or asked for (LANGUAGE / भाषा).
  const picked = replyId === "lang:en" ? "en" : replyId === "lang:hi" ? "hi" : !t.hasLanguage || command === "LANGUAGE" ? parseLanguage(text) : null;
  if (picked) return chooseLanguage(t, picked);
  if (command === "LANGUAGE") return askLanguage(t, isInFlow(t.step) ? undefined : "MENU");
  if (!t.hasLanguage) {
    // Chats that were already going, and answers to our own messages (weekly check, sold
    // buttons, STATUS…), carry on in English. A fresh "hi" / "SELL" first picks a language.
    const carryOn =
      isInFlow(t.step) ||
      t.step === "HUMAN" ||
      t.step === "ASK_SOLD_WHICH" ||
      Boolean(replyId && !replyId.startsWith("menu:")) ||
      (command !== null && command !== "GREETING" && command !== "MENU" && command !== "START");
    if (!carryOn) return askLanguage(t, command === "START" || replyId === "menu:list" ? "START" : "MENU");
    await t.setLanguage("en");
  }

  // ── A person from our team is handling this chat: stay silent unless asked back.
  if (t.step === "HUMAN") {
    if (command === "MENU" || command === "START" || replyId === "menu:list" || replyId === "menu:bot") {
      await t.save("IDLE", null);
      if (command === "START" || replyId === "menu:list") return startListing(t);
      return sendMenu(t, t.c.backWithAssistant);
    }
    return;
  }

  // ── "Which property is sold?" — a typed number picks from the list we showed.
  if (t.step === "ASK_SOLD_WHICH") {
    const n = !replyId && !command && input.kind === "text" ? parseListNumber(text) : null;
    if (n !== null) return pickSoldByNumber(t, n);
    if (!replyId && !command && input.kind === "text") return reprompt(t, t.c.replyWithNumber);
    await t.save("IDLE", null); // anything else moves on
  }

  // ── Stateless replies (menu taps, SOLD and availability answers work from any step).
  if (replyId?.startsWith("menu:")) {
    if (replyId === "menu:list") return startListing(t);
    if (replyId === "menu:status") return withResume(t, () => sendStatus(t));
    if (replyId === "menu:human") return handOverToHuman(t);
    if (replyId === "menu:continue") return reprompt(t);
  }
  if (replyId?.startsWith("sold:")) return handleSoldReply(t, replyId);
  if (replyId === "avail:yes") return withResume(t, () => confirmAvailability(t));
  if (replyId === "avail:no") return withResume(t, () => answerNo(t, null));
  if (replyId?.startsWith("nosold:")) return withResume(t, () => pickSold(t, replyId.slice(7)));
  if (replyId === "confirm:cancel") return cancel(t);
  if (replyId === "confirm:submit" && (t.step === "IDLE" || t.step === "SUBMITTING")) {
    // A second tap on an old summary — the listing was already sent.
    if (t.step === "IDLE") await t.text(t.c.alreadySubmitted);
    return;
  }
  if (replyId === "confirm:restart" && isInFlow(t.step)) return restartDetails(t);

  // ── Global commands.
  if (command) {
    const handled = await handleCommand(t, command, text ?? "");
    if (handled) return;
  }

  // ── Photos are welcome at any point of a listing.
  if (input.kind === "image") return handleImage(t, input.image ?? null);

  if (input.kind === "other") {
    if (!isInFlow(t.step)) return sendMenu(t, unsupportedNote(t, input.otherType));
    await t.text(unsupportedNote(t, input.otherType));
    return reprompt(t);
  }

  await handleStep(t, { ...input, text, replyId });
}

// ───────────────────────────── Language ─────────────────────────────

async function askLanguage(t: Turn, after?: "START" | "MENU") {
  t.asked = true;
  if (after && !isInFlow(t.step)) await t.save(t.step === "ASK_SOLD_WHICH" ? "IDLE" : t.step, { ...t.draft, afterLanguage: after });
  await t.reply({ type: "buttons", body: LANGUAGE_PICKER.body, buttons: LANGUAGE_PICKER.buttons });
}

async function chooseLanguage(t: Turn, lang: Lang) {
  await t.setLanguage(lang);
  const after = t.draft.afterLanguage;
  if (after) {
    const { afterLanguage, ...rest } = t.draft;
    void afterLanguage;
    await t.save(t.step, rest);
  }
  if (isInFlow(t.step) && t.step !== "SUBMITTING") return reprompt(t, t.c.languageSet);
  if (after === "START") {
    await t.text(t.c.languageSet);
    return startListing(t);
  }
  return sendMenu(t, t.c.languageSet);
}

function unsupportedNote(t: Turn, type?: string) {
  return type === "audio" || type === "voice" ? t.c.voiceNote : t.c.unsupported;
}

/** Runs a side action mid-listing, then repeats the current question so the seller knows where they are. */
async function withResume(t: Turn, action: () => Promise<void>) {
  t.asked = false;
  await action();
  if (!t.asked && isInFlow(t.step) && t.step !== "SUBMITTING") await reprompt(t, t.c.continueListing);
}

async function handleCommand(t: Turn, command: BotCommand, text: string): Promise<boolean> {
  switch (command) {
    case "START":
      await startListing(t);
      return true;
    case "CANCEL":
      await cancel(t);
      return true;
    case "HELP":
      await t.text(t.c.help({ url: site.url }));
      if (isInFlow(t.step)) await reprompt(t, t.c.continueListing);
      return true;
    case "MENU":
    case "GREETING":
      if (isInFlow(t.step)) {
        await reprompt(t, command === "GREETING" ? t.c.greetingMidListing : undefined);
        return true;
      }
      await sendMenu(t);
      return true;
    case "STATUS":
      await withResume(t, () => sendStatus(t));
      return true;
    case "ID":
      await withResume(t, () => sendSellerId(t));
      return true;
    case "HUMAN":
      await handOverToHuman(t);
      return true;
    case "YES":
      // "Yes" answers the question on screen when there is one.
      if (t.step === "CONFIRM") {
        await submit(t);
        return true;
      }
      if (t.step === "ASK_PRICE" && t.draft.suggestedPrice) {
        await acceptPrice(t, t.draft.suggestedPrice);
        return true;
      }
      if (t.step === "ASK_NAME" && t.conv.profileName && parseName(t.conv.profileName)) {
        await acceptName(t, parseName(t.conv.profileName)!);
        return true;
      }
      await withResume(t, () => confirmAvailability(t));
      return true;
    case "NO": {
      const reply = parseAvailabilityReply(text);
      const number = reply?.answer === "NO" ? reply.number : null;
      const plain = reply?.answer === "NO" ? reply.plain : true;
      if (isInFlow(t.step)) {
        // Mid-listing "no" is usually an answer to our question — see the rules at the top.
        if (plain && stepTakesNo(t)) return false;
        const seller = t.seller ?? (await t.loadSeller());
        const awaiting = seller ? await plotsAwaitingAvailability(seller.id) : [];
        if (awaiting.length === 0) return false;
        await withResume(t, () => answerNo(t, number));
        return true;
      }
      await answerNo(t, number);
      return true;
    }
    case "SOLD":
      await withResume(t, () => startSold(t));
      return true;
  }
  return false;
}

/** Listing questions where "no" / "nahi" is a meaningful answer. */
function stepTakesNo(t: Turn): boolean {
  switch (t.step) {
    case "ASK_NAME":
    case "ASK_PHOTOS":
    case "ASK_LOCATION":
    case "ASK_DESCRIPTION":
    case "CONFIRM":
    case "SUBMITTING":
      return true;
    case "ASK_PRICE":
      return Boolean(t.draft.suggestedPrice);
    default:
      return false;
  }
}

// ───────────────────────────── Menu / cancel / human ─────────────────────────────

async function sendMenu(t: Turn, lead?: string) {
  const seller = t.seller ?? (await t.loadSeller());
  const intro = seller ? t.c.welcomeBack({ name: seller.name, code: seller.code }) : t.c.welcomeNew;
  await t.reply({
    type: "buttons",
    body: `${lead ? `${lead}\n\n` : ""}${intro}`,
    buttons: [
      { id: "menu:list", title: t.c.btnList },
      { id: "menu:status", title: t.c.btnMine },
      { id: "menu:human", title: t.c.btnTalk },
    ],
  });
}

async function cancel(t: Turn) {
  const hadDraft = isInFlow(t.step);
  await t.save("IDLE", null);
  await t.reply({
    type: "buttons",
    body: hadDraft ? t.c.cancelled : t.c.whenReady,
    buttons: [
      { id: "menu:list", title: t.c.btnList },
      { id: "menu:status", title: t.c.btnMine },
    ],
  });
}

async function handOverToHuman(t: Turn) {
  await t.save("HUMAN", t.draft);
  await t.text(t.c.human);
}

function statusWords(t: Turn, p: { status: ListingStatus; hiddenReason: HiddenReason | null; availabilityCheckSentAt?: Date | null }) {
  if (p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED") return t.c.unavailableReplyYes;
  if (p.status === "ACTIVE" && p.availabilityCheckSentAt) return t.c.liveReplyYes;
  return statusWord(t.lang, p.status);
}

async function sendStatus(t: Turn) {
  const seller = await t.loadSeller();
  if (!seller) {
    if (isInFlow(t.step)) {
      await t.text(t.c.noPlotsYetInFlow);
      return;
    }
    await t.reply({ type: "buttons", body: t.c.noPlotsYet, buttons: [{ id: "menu:list", title: t.c.btnList }] });
    return;
  }
  const plots = await db.property.findMany({
    where: { sellerId: seller.id, removedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, code: true, status: true, hiddenReason: true, slug: true, lastConfirmedAt: true, availabilityCheckSentAt: true },
  });
  const total = await db.property.count({ where: { sellerId: seller.id, removedAt: null } });
  const lines = plots.map((p, i) => {
    const confirmed = p.lastConfirmedAt && p.status === "ACTIVE" ? ` · ${t.c.confirmed({ when: daysAgo(t.lang, p.lastConfirmedAt) })}` : "";
    const link = p.status === "ACTIVE" ? `\n   ${site.url}/property/${p.slug}` : "";
    return `${i + 1}. *${p.title}* (${p.code})\n   ${statusWords(t, p)}${confirmed}${link}`;
  });
  const more = total > plots.length ? `\n${t.c.andMore({ n: total - plots.length })}` : "";
  await t.text(
    [
      plots.length ? `${t.c.yourListings}\n\n${lines.join("\n\n")}${more}` : t.c.noneListed,
      "",
      t.c.idLine({ code: seller.code }),
      t.c.manageAt({ url: site.url }),
    ].join("\n"),
  );
}

async function sendSellerId(t: Turn) {
  const seller = await t.loadSeller();
  if (!seller) {
    await t.text(t.c.noIdYet);
    return;
  }
  await t.text(t.c.yourId({ code: seller.code, url: site.url }));
}

// ───────────────────────────── Weekly availability: YES / NO ─────────────────────────────

const plotLink = (slug: string) => `${site.url}/property/${slug}`;

/**
 * YES: every plot awaiting a reply stays live (lastConfirmedAt), and plots
 * hidden because we didn't hear back go live again. The bot writes its own
 * reply, so the listing service doesn't notify.
 */
async function confirmAvailability(t: Turn) {
  const seller = await t.loadSeller();
  if (!seller) {
    await sendMenu(t, "👍");
    return;
  }
  const awaiting = await plotsAwaitingAvailability(seller.id);
  const hidden = await db.property.findMany({
    where: { sellerId: seller.id, status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED", removedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, slug: true },
  });
  if (awaiting.length === 0 && hidden.length === 0) {
    await t.text(t.c.nothingToConfirm);
    return;
  }
  for (const p of [...awaiting, ...hidden]) {
    await changeListingStatus(p.id, { type: "CONFIRM_AVAILABLE" }, { notify: false, via: "whatsapp" });
  }

  const parts: string[] = [];
  if (awaiting.length === 1) parts.push(t.c.staysLiveOne({ title: awaiting[0].title }));
  if (awaiting.length > 1) parts.push(t.c.staysLiveMany({ list: awaiting.map((p) => `• ${p.title}`).join("\n") }));
  const also = awaiting.length ? "1" : "";
  if (hidden.length === 1) parts.push(t.c.backLiveOne({ also, title: hidden[0].title, link: plotLink(hidden[0].slug) }));
  if (hidden.length > 1) parts.push(t.c.backLiveMany({ also, list: hidden.map((p) => `• ${p.title}`).join("\n") }));
  await t.text(parts.join("\n\n"));
}

type SoldCandidate = { id: string; title: string; code: string; price: bigint };

/**
 * NO (or "bik gaya", "NO 2", the NO button). Which plot:
 *  - "NO <n>" → number n of the plots awaiting a reply (the weekly message's numbering);
 *  - exactly one awaiting → that one;
 *  - several awaiting → "Which property is sold?";
 *  - none awaiting → the seller's only live/hidden plot, or plot <n> of them
 *    (oldest first), after a confirm button; otherwise the list.
 */
async function answerNo(t: Turn, number: number | null) {
  const seller = await t.loadSeller();
  if (!seller) {
    await sendMenu(t, "👍");
    return;
  }
  const awaiting = await plotsAwaitingAvailability(seller.id);
  if (awaiting.length > 0) {
    if (number !== null) {
      const plot = awaiting[number - 1];
      if (!plot) return askWhichSold(t, awaiting, t.c.noNumber({ n: number }));
      return markSold(t, seller.id, plot);
    }
    if (awaiting.length === 1) return markSold(t, seller.id, awaiting[0]);
    return askWhichSold(t, awaiting);
  }

  // Nothing awaiting (e.g. the plot was already hidden for no reply) — be careful and confirm.
  const plots = await sellablePlots(seller.id);
  if (plots.length === 0) {
    await t.text(t.c.noLivePlots);
    return;
  }
  const picked = number !== null ? plots[number - 1] : undefined;
  if (picked) return askSoldConfirm(t, picked);
  if (plots.length === 1) return askSoldConfirm(t, plots[0]);
  return askWhichSold(t, plots);
}

/** "Which property is sold?" — tap a row, or (outside a listing) reply with the number. */
async function askWhichSold(t: Turn, plots: SoldCandidate[], lead?: string) {
  t.asked = true;
  const shown = plots.slice(0, 10);
  if (!isInFlow(t.step)) await t.save("ASK_SOLD_WHICH", { soldChoices: shown.map((p) => p.id) });
  await t.reply(whichSoldMessage(t, shown, lead, !isInFlow(t.step)));
}

function whichSoldMessage(t: Turn, plots: SoldCandidate[], lead: string | undefined, acceptsNumber: boolean): OutgoingMessage {
  const list = plots.map((p, i) => `${i + 1}. ${p.title} — ${priceText(t.lang, p.price)}`).join("\n");
  return {
    type: "list",
    body: `${lead ? `${lead}\n\n` : ""}${t.c.whichSold}\n\n${list}\n\n${acceptsNumber ? t.c.replyNumberOrTap : t.c.tapToChoose}`,
    buttonLabel: t.c.chooseProperty,
    rows: plots.map((p, i) => ({ id: `nosold:${p.id}`, title: `${i + 1}. ${p.code}`, description: p.title })),
  };
}

async function pickSoldByNumber(t: Turn, n: number) {
  const id = t.draft.soldChoices?.[n - 1];
  if (!id) return reprompt(t, t.c.noNumber({ n }));
  return pickSold(t, id);
}

/** A row tapped in "Which property is sold?" (or a typed number). */
async function pickSold(t: Turn, propertyId: string) {
  const seller = await t.loadSeller();
  const plot = seller
    ? await db.property.findFirst({
        where: { id: propertyId, sellerId: seller.id, removedAt: null },
        select: { id: true, title: true, code: true, price: true, status: true },
      })
    : null;
  if (t.step === "ASK_SOLD_WHICH") await t.save("IDLE", null);
  if (!seller || !plot) {
    await t.text(t.c.notFound);
    return;
  }
  if (plot.status === "SOLD") {
    await t.text(t.c.alreadySold({ title: plot.title }));
    return;
  }
  if (plot.status !== "ACTIVE" && plot.status !== "HIDDEN") {
    await t.text(t.c.notLive({ title: plot.title }));
    return;
  }
  return markSold(t, seller.id, plot);
}

/** Marks one plot sold and, if other plots still await a reply, asks about them. */
async function markSold(t: Turn, sellerId: string, plot: { id: string; title: string }) {
  await changeListingStatus(plot.id, { type: "MARK_SOLD" }, { notify: false, via: "whatsapp" });
  if (t.step === "ASK_SOLD_WHICH") await t.save("IDLE", null);
  const others = await plotsAwaitingAvailability(sellerId);
  if (others.length === 0) {
    await t.text(t.c.soldCongrats({ title: plot.title }));
    return;
  }
  t.asked = true;
  const list = others.map((p, i) => `${others.length > 1 ? `${i + 1}. ` : ""}${p.title} — ${priceText(t.lang, p.price)}`).join("\n");
  await t.reply({
    type: "buttons",
    body: t.c.soldAskOthers({ title: plot.title, many: others.length > 1 ? "1" : "", list }),
    buttons: [
      { id: "avail:yes", title: t.c.btnYesAvailable },
      { id: "avail:no", title: others.length > 1 ? t.c.btnAnotherSold : t.c.btnAlsoSold },
    ],
  });
}

// ───────────────────────────── SOLD (explicit) ─────────────────────────────

/** Live or hidden plots, oldest first. */
async function sellablePlots(sellerId: string) {
  return db.property.findMany({
    where: { sellerId, status: { in: ["ACTIVE", "HIDDEN"] }, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, code: true, price: true, area: true, areaUnit: true },
    take: 10,
  });
}

async function startSold(t: Turn) {
  const seller = await t.loadSeller();
  const plots = seller ? await sellablePlots(seller.id) : [];
  if (plots.length === 0) {
    await t.text(t.c.noSellable);
    return;
  }
  if (plots.length === 1) return askSoldConfirm(t, plots[0]);
  t.asked = true;
  await t.reply({
    type: "list",
    body: t.c.whichSoldCongrats,
    buttonLabel: t.c.choosePlot,
    rows: plots.map((p) => ({ id: `sold:pick:${p.id}`, title: `${p.code} · ${areaText(t.lang, p.area, p.areaUnit)}`, description: p.title })),
  });
}

async function askSoldConfirm(t: Turn, p: { id: string; title: string; code: string }) {
  t.asked = true;
  await t.reply({
    type: "buttons",
    body: t.c.confirmSold({ title: p.title, code: p.code }),
    buttons: [
      { id: `sold:yes:${p.id}`, title: t.c.btnYesSold },
      { id: `sold:no:${p.id}`, title: t.c.btnStillAvailable },
    ],
  });
}

async function handleSoldReply(t: Turn, replyId: string) {
  const [, action, propertyId] = replyId.split(":");
  const seller = await t.loadSeller();
  const plot =
    seller && propertyId
      ? await db.property.findFirst({
          where: { id: propertyId, sellerId: seller.id, removedAt: null },
          select: { id: true, title: true, code: true, status: true, hiddenReason: true, availabilityCheckSentAt: true },
        })
      : null;
  if (!seller || !plot) {
    await t.text(t.c.notFound);
    return;
  }
  if (action === "pick") return askSoldConfirm(t, plot);
  if (action === "no") {
    // "No, still available" also answers a pending availability check.
    const pendingCheck =
      (plot.status === "ACTIVE" && plot.availabilityCheckSentAt) || (plot.status === "HIDDEN" && plot.hiddenReason === "AVAILABILITY_UNCONFIRMED");
    if (pendingCheck) {
      await changeListingStatus(plot.id, { type: "CONFIRM_AVAILABLE" }, { notify: false, via: "whatsapp" });
      await withResume(t, () => t.text(plot.status === "ACTIVE" ? t.c.staysLiveOne({ title: plot.title }) : t.c.liveAgainShort({ title: plot.title })));
      return;
    }
    await withResume(t, () => t.text(t.c.staysAsIs({ title: plot.title })));
    return;
  }
  if (action === "yes") {
    if (plot.status !== "ACTIVE" && plot.status !== "HIDDEN") {
      await t.text(t.c.alreadyStatus({ title: plot.title, code: plot.code, status: statusWord(t.lang, plot.status).replace(/^\S+\s/, "").toLowerCase() }));
      return;
    }
    await withResume(t, () => markSold(t, seller.id, plot));
  }
}

// ───────────────────────────── Listing flow ─────────────────────────────

async function startListing(t: Turn, prefill: BotDraft = {}, lead?: string) {
  const seller = await t.loadSeller();
  if (seller?.isBlocked) {
    await t.save("IDLE", null);
    await t.text(t.c.blocked);
    return;
  }
  if (!t.isSimulation) await trackEvent("listing_started", { sellerId: seller?.id ?? null, props: { via: "whatsapp", lang: t.lang } });
  const intro = seller ? t.c.startReturning({ name: seller.name, code: seller.code }) : t.c.startNew;
  const draft: BotDraft = { ...prefill, ...(seller ? { name: seller.name, sellerType: seller.sellerType } : {}) };
  await goTo(t, "ASK_NAME", draft, lead ? `${intro}\n\n${lead}` : intro);
}

/** "Start over" from the summary: keep who the seller is, redo the plot details. */
async function restartDetails(t: Turn) {
  const seller = t.seller ?? (await t.loadSeller());
  const name = seller?.name ?? t.draft.name;
  if (!name) return goTo(t, "ASK_NAME", {}, t.c.restartTop);
  await goTo(t, "ASK_LAND_TYPE", { name, sellerType: seller?.sellerType ?? t.draft.sellerType }, t.c.restart);
}

function nextStep(step: BotStep): BotStep {
  if (step === "ASK_AREA_UNIT") return "ASK_PRICE";
  if (step === "ASK_SELLER_TYPE") return "ASK_LAND_TYPE"; // older chats paused on the removed question
  const i = FLOW_ORDER.indexOf(step);
  return i >= 0 && i < FLOW_ORDER.length - 1 ? FLOW_ORDER[i + 1] : "CONFIRM";
}

/** Moves on after an answer — back to the summary if we were fixing one thing. */
async function advance(t: Turn, from: BotStep, draft: BotDraft, lead?: string) {
  if (draft.returnToConfirm) {
    const { returnToConfirm, ...rest } = draft;
    void returnToConfirm;
    return goTo(t, "CONFIRM", rest, lead);
  }
  return goTo(t, nextStep(from), draft, lead);
}

/** A question whose answer we already have (typed earlier, or understood from a longer message). */
function answered(step: BotStep, d: BotDraft): boolean {
  switch (step) {
    case "ASK_NAME":
      return Boolean(d.name);
    case "ASK_LAND_TYPE":
      return Boolean(d.landType);
    case "ASK_STATE":
      return Boolean(d.cityState);
    case "ASK_CITY":
      return Boolean(d.cityId);
    case "ASK_LOCALITY":
      return Boolean(d.locality);
    case "ASK_AREA":
      return Boolean(d.area && d.areaUnit);
    case "ASK_PRICE":
      return Boolean(d.price);
    default:
      return false;
  }
}

/** Saves the step and asks its question, skipping questions already answered (unless we're fixing that answer). */
async function goTo(t: Turn, step: BotStep, draft: BotDraft, lead?: string): Promise<void> {
  if (!draft.returnToConfirm && answered(step, draft)) return advance(t, step, draft, lead);
  await t.save(step, draft);
  await t.reply(await promptFor(t, step, lead));
}

/** Repeats the current question (after help, a stray message, or a stale button tap), in the AI's fresh words when given. */
async function reprompt(t: Turn, lead?: string, ask?: string) {
  if (t.step === "ASK_SOLD_WHICH") return t.reply(await promptFor(t, t.step, lead));
  if (!isInFlow(t.step) || t.step === "SUBMITTING") return sendMenu(t, lead);
  await t.reply(await promptFor(t, t.step, lead, ask));
}

/** True when the main menu went out in the last few messages: chatting on then shouldn't resend it every time. */
async function menuShownRecently(t: Turn): Promise<boolean> {
  const recent = await db.whatsAppMessage.findMany({
    where: { conversationId: t.conv.id, direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { body: true },
  });
  return recent.some((m) => m.body?.includes(`▸ ${t.c.btnList}`) && m.body.includes(`▸ ${t.c.btnTalk}`));
}

/**
 * A buyer on WhatsApp told us where they want land: save it as a request (like the website's
 * "Tell us what you need"), so our team can message them when it's listed. Returns the place, or null.
 */
async function saveBuyerAlert(t: Turn, f: ExtractedListing): Promise<string | null> {
  if (!f.city) return null;
  const limited = await hitRateLimit("buyerRequestPerPhone", t.conv.phone);
  if (!limited.ok) return null;
  const named = t.seller?.name ?? (t.conv.profileName ? parseName(t.conv.profileName) : null);
  const base = { phone: t.conv.phone, place: f.city, landType: f.landType, budgetMax: f.priceRupees };
  const parsed = buyerRequestSchema.safeParse({ ...base, name: named ?? "WhatsApp buyer" });
  const valid = parsed.success ? parsed : buyerRequestSchema.safeParse({ ...base, name: "WhatsApp buyer" });
  if (!valid.success) return null;
  await saveBuyerRequest({ ...valid.data, phone: t.conv.phone });
  return valid.data.place;
}

/** States that already have listings, most active first (shown as quick picks; any state can be typed). */
async function popularStates(): Promise<string[]> {
  const rows = await db.city.findMany({ where: { isLive: true }, select: { state: true, _count: { select: { properties: true } } } });
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.state, (totals.get(r.state) ?? 0) + r._count.properties);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([state]) => state).slice(0, 9);
}

/** Cities already used in this state, most active first (quick picks; any city can be typed). */
function citiesInState(state: string) {
  return db.city.findMany({ where: { isLive: true, state }, orderBy: [{ properties: { _count: "desc" } }, { name: "asc" }], take: 9 });
}

async function promptFor(t: Turn, step: BotStep, lead?: string, ask?: string): Promise<OutgoingMessage> {
  const pre = lead ? `${lead}\n\n` : "";
  // When the AI re-asks the open question in its own words, that replaces our fixed wording
  // (buttons and lists stay the same), so the chat doesn't repeat itself.
  const q = (fixed: string) => ask || fixed;
  const d = t.draft;
  const c = t.c;
  switch (step) {
    case "ASK_NAME": {
      const suggested = t.conv.profileName ? parseName(t.conv.profileName) : null;
      if (suggested && suggested.length <= 40) {
        return { type: "buttons", body: `${pre}${c.askNameSuggested({ name: suggested })}`, buttons: [{ id: "name:profile", title: c.btnUseName({ name: suggested }).slice(0, 20) }] };
      }
      return { type: "text", text: `${pre}${q(c.askName)}` };
    }
    case "ASK_LAND_TYPE":
      return {
        type: "list",
        body: `${pre}${q(c.askLandType)}`,
        buttonLabel: c.chooseLandType,
        rows: LAND_TYPE_ORDER.map((lt) => ({ id: `type:${lt}`, title: landLabel(t.lang, lt), description: landHint(t.lang, lt) })),
      };
    case "ASK_STATE": {
      const states = await popularStates();
      return { type: "list", body: `${pre}${q(c.askState)}`, buttonLabel: c.chooseState, rows: states.map((st) => ({ id: `state:${st}`, title: st })) };
    }
    case "ASK_CITY": {
      const cities = d.cityState ? await citiesInState(d.cityState) : [];
      if (cities.length === 0) return { type: "text", text: `${pre}${q(c.askCityTyped({ state: d.cityState ?? "" }))}` };
      return {
        type: "list",
        body: `${pre}${q(c.askCityList({ state: d.cityState ?? "" }))}`,
        buttonLabel: c.chooseCity,
        rows: cities.map((city) => ({ id: `city:${city.id}`, title: city.name, description: city.state })),
      };
    }
    case "ASK_LOCALITY":
      return { type: "text", text: `${pre}${q(c.askLocality)}` };
    case "ASK_AREA":
      return { type: "text", text: `${pre}${q(c.askArea)}` };
    case "ASK_AREA_UNIT":
      return {
        type: "list",
        body: `${pre}${q(c.askUnit({ n: formatNumberPlain(d.pendingArea ?? 0) }))}`,
        buttonLabel: c.chooseUnit,
        rows: UNIT_ROWS[t.lang].map((u) => ({ id: `unit:${u.unit}`, title: u.title, description: u.description })),
      };
    case "ASK_PRICE":
      return { type: "text", text: `${pre}${q(c.askPrice)}` };
    case "ASK_PHOTOS": {
      const count = d.photos?.length ?? 0;
      return {
        type: "buttons",
        body: `${pre}${q(count > 0 ? c.askPhotosMore({ n: count, max: MAX_PHOTOS }) : c.askPhotosFirst({ max: MAX_PHOTOS }))}`,
        buttons: [
          { id: "photos:done", title: c.btnDone },
          { id: "photos:skip", title: c.btnSkipPhotos },
        ],
      };
    }
    case "ASK_LOCATION":
      return { type: "buttons", body: `${pre}${q(c.askLocation)}`, buttons: [{ id: "loc:skip", title: c.btnSkip }] };
    case "ASK_DESCRIPTION":
      return { type: "buttons", body: `${pre}${q(c.askDescription)}`, buttons: [{ id: "desc:skip", title: c.btnSkip }] };
    case "ASK_SOLD_WHICH": {
      const ids = d.soldChoices ?? [];
      const found = await db.property.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, code: true, price: true } });
      const plots = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is SoldCandidate => Boolean(p));
      return whichSoldMessage(t, plots, lead, true);
    }
    case "CONFIRM":
      return {
        type: "buttons",
        body: `${pre}${summary(t)}\n\n${c.confirmPrompt}`,
        buttons: [
          { id: "confirm:submit", title: c.btnSubmit },
          { id: "confirm:restart", title: c.btnStartOver },
          { id: "confirm:cancel", title: c.btnCancel },
        ],
      };
    default:
      return { type: "text", text: `${pre}${c.idleNudge}` };
  }
}

/** The plain-words question for a step (given to the AI so it can help the seller answer it). */
function questionText(t: Turn): string | null {
  const c = t.c;
  const map: Partial<Record<BotStep, string>> = {
    ASK_NAME: c.askName,
    ASK_LAND_TYPE: c.askLandType,
    ASK_STATE: c.askState,
    ASK_CITY: c.askCityTyped({ state: t.draft.cityState ?? "" }),
    ASK_LOCALITY: c.askLocality,
    ASK_AREA: c.askArea,
    ASK_AREA_UNIT: c.askUnit({ n: formatNumberPlain(t.draft.pendingArea ?? 0) }),
    ASK_PRICE: c.askPrice,
    ASK_PHOTOS: c.askPhotosFirst({ max: MAX_PHOTOS }),
    ASK_LOCATION: c.askLocation,
    ASK_DESCRIPTION: c.askDescription,
    CONFIRM: c.confirmPrompt,
  };
  return map[t.step] ?? null;
}

function summary(t: Turn): string {
  const d = t.draft;
  const c = t.c;
  const name = t.seller?.name ?? d.name;
  const lines = [c.checkListing, ""];
  if (d.landType && d.area && d.areaUnit && d.locality) {
    lines.push(`🏷️ *${buildTitle({ area: d.area, areaUnit: d.areaUnit, landType: d.landType, locality: d.locality, village: d.village })}*`);
  }
  if (d.landType) lines.push(`🌾 ${c.sumType}: ${landLabel(t.lang, d.landType)}`);
  if (d.locality) lines.push(`📍 ${c.sumPlace}: ${d.locality}${d.cityName ? `, ${d.cityName}` : ""}`);
  if (d.area && d.areaUnit) lines.push(`📐 ${c.sumSize}: ${areaText(t.lang, d.area, d.areaUnit)}${sqftHintFor(d.area, d.areaUnit)}`);
  if (d.price) lines.push(`💰 ${c.sumPrice}: ${priceText(t.lang, d.price)} ${c.sumPriceNote}`);
  lines.push(`📸 ${c.sumPhotos}: ${d.photos?.length ? d.photos.length : c.sumNone}`);
  lines.push(`🗺️ ${c.sumPin}: ${d.latitude !== undefined && d.longitude !== undefined ? c.sumShared : c.sumNotShared}`);
  if (name) lines.push(`👤 ${c.sumSeller}: ${name}`);
  if (d.description) {
    const desc = d.description.length > 280 ? `${d.description.slice(0, 277)}…` : d.description;
    lines.push("", `📝 ${desc}`);
  }
  return lines.join("\n");
}

/** "(≈ 2.47 acres)" for fixed units. Bigha/Biswa and Marla/Kanal vary by region (City row), so no hint for them here. */
function sqftHintFor(area: number, unit: AreaUnit): string {
  if (unit === "SQFT" || unit === "BIGHA" || unit === "BISWA" || unit === "MARLA" || unit === "KANAL") return "";
  const hint = formatSqftHint(toSqft(area, unit, 0), unit);
  return hint ? ` (${hint})` : "";
}

// ───────────────────────────── Optional AI help ─────────────────────────────

/**
 * Merges details the AI understood into the draft — only questions not yet
 * answered, and only values that pass the same checks as typed answers.
 * Returns the new draft and what was understood (for "👍 Noted: …").
 */
async function mergeExtracted(t: Turn, ex: ExtractedListing, override = false): Promise<{ draft: BotDraft; items: string[] }> {
  const d: BotDraft = { ...t.draft };
  const items: string[] = [];
  /** Fill empty answers; a correction may also replace given ones. */
  const take = (has: unknown) => override || !has;
  if (take(d.name) && !t.seller && ex.name) {
    const name = parseName(ex.name);
    if (name) d.name = name;
  }
  if (take(d.landType) && ex.landType && Object.hasOwn(LAND_TYPES, ex.landType) && ex.landType !== d.landType) {
    d.landType = ex.landType as LandType;
    items.push(landLabel(t.lang, d.landType));
  }
  if (take(d.area && d.areaUnit) && ex.area && ex.unit && (Object.values(AreaUnit) as string[]).includes(ex.unit) && (ex.area !== d.area || ex.unit !== d.areaUnit)) {
    d.area = ex.area;
    d.areaUnit = ex.unit as AreaUnit;
    items.push(areaText(t.lang, d.area, d.areaUnit));
  }
  if (take(d.price) && ex.priceRupees && ex.priceRupees !== d.price) {
    d.price = ex.priceRupees;
    items.push(priceText(t.lang, d.price));
  }
  if (ex.state && take(d.cityState)) {
    const state = matchState(ex.state);
    if (state && state !== d.cityState) {
      // A different state makes the old city wrong.
      if (d.cityState) Object.assign(d, { cityId: undefined, cityName: undefined });
      d.cityState = state;
    }
  }
  if (take(d.cityId) && ex.city) {
    const { name } = splitCityAndState(cleanFreeText(ex.city, 60));
    if (CITY_NAME_PATTERN.test(name) && !isDevanagari(name)) {
      const city = await resolveCity({ cityName: name, state: d.cityState }).catch(() => null);
      if (city) {
        d.cityId = city.id;
        d.cityName = city.name;
        d.cityState = city.state;
      }
    }
  }
  if (take(d.locality) && ex.locality && /\p{L}/u.test(ex.locality) && cleanFreeText(ex.locality, 120) !== d.locality) {
    d.locality = cleanFreeText(ex.locality, 120);
    d.village = villageFrom(d.locality);
  }
  const place = [d.locality, d.cityName].filter(Boolean).join(", ");
  if (place && (d.locality !== t.draft.locality || d.cityName !== t.draft.cityName)) items.push(place);
  return { draft: d, items };
}

/** Steps where almost any text could pass as an answer, so the AI reads it first. */
const READ_FIRST: ReadonlySet<BotStep> = new Set<BotStep>(["IDLE", "ASK_NAME", "ASK_CITY", "ASK_LOCALITY", "ASK_DESCRIPTION"]);

/** Elsewhere a short, plain answer ("2 bigha", "18 lakh", "done") goes straight to the parser — faster and free. */
function readFirst(step: BotStep, text: string): boolean {
  return READ_FIRST.has(step) || text.includes("?") || text.trim().split(/\s+/).length > 4;
}

/** The last few messages before this one, oldest first, so the AI follows the conversation. */
async function recentHistory(t: Turn): Promise<{ from: "seller" | "assistant"; text: string }[]> {
  const rows = await db.whatsAppMessage.findMany({
    where: { conversationId: t.conv.id },
    orderBy: { createdAt: "desc" },
    take: 11,
    select: { direction: true, body: true, type: true },
  });
  if (rows[0]?.direction === "INBOUND") rows.shift(); // the message we're answering now
  return rows
    .slice(0, 10)
    .reverse()
    .map((m) => ({ from: m.direction === "INBOUND" ? ("seller" as const) : ("assistant" as const), text: m.body?.trim() || `[${m.type}]` }));
}

/** What we already know about the land being listed (English, for the AI). */
function knownFacts(t: Turn): string[] {
  const d = t.draft;
  const out: string[] = [];
  if (d.name) out.push(`Seller name: ${d.name}`);
  if (d.landType) out.push(`Land type: ${landLabel("en", d.landType)}`);
  const place = [d.locality, d.cityName, d.cityState].filter(Boolean).join(", ");
  if (place) out.push(`Place: ${place}`);
  if (d.area && d.areaUnit) out.push(`Size: ${areaText("en", d.area, d.areaUnit)}`);
  if (d.price) out.push(`Price: ${priceText("en", d.price)}`);
  if (d.photos?.length) out.push(`Photos: ${d.photos.length}`);
  return out;
}

/** "Yes" / "no" in words → the button the seller would have tapped on the current question. */
function shortcutFor(t: Turn, intent: "yes" | "no"): string | null {
  const yes = intent === "yes";
  switch (t.step) {
    case "CONFIRM":
      return yes ? "confirm:submit" : null;
    case "ASK_PHOTOS":
      return yes ? "photos:done" : "photos:skip";
    case "ASK_LOCATION":
      return yes ? null : "loc:skip";
    case "ASK_DESCRIPTION":
      return yes ? null : "desc:skip";
    case "ASK_PRICE":
      return t.draft.suggestedPrice ? (yes ? `price:${t.draft.suggestedPrice}` : "price:no") : null;
    case "ASK_NAME":
      return yes && t.conv.profileName && parseName(t.conv.profileName) ? "name:profile" : null;
    default:
      return null;
  }
}

/** Where a buyer should look: the city's page when we have it, otherwise search. */
async function browseUrl(f: ExtractedListing): Promise<string> {
  if (f.city) {
    const city = await db.city.findFirst({ where: { isLive: true, name: { equals: f.city.trim(), mode: "insensitive" } }, select: { slug: true } });
    if (city) {
      const type = f.landType && Object.hasOwn(LAND_TYPE_SLUGS, f.landType) ? `/${LAND_TYPE_SLUGS[f.landType as LandType]}` : "";
      return `${site.url}/${city.slug}${type}`;
    }
  }
  return `${site.url}/search`;
}

const joinLead = (...parts: (string | undefined)[]) => parts.filter(Boolean).join("\n\n") || undefined;

/**
 * The assistant as an agent (AI on): reads what the seller means and acts on
 * it with the bot's own safe steps — saves answers and corrections (validated
 * like typed ones), answers questions and small talk in a sentence or two and
 * then repeats the open question, starts a listing, shows status, hands over
 * to our team, points buyers to the website, or asks before stopping a
 * listing. Returns false when AI is off or had nothing to add — the fixed
 * flow then handles the message. Runs at most once per message.
 */
async function aiAgent(t: Turn, text: string): Promise<boolean> {
  if (t.agentTried || !isAiEnabled()) return false;
  t.agentTried = true;
  const inFlow = isInFlow(t.step) && t.step !== "SUBMITTING";
  const u = await understandMessage({
    lang: t.lang,
    text,
    step: inFlow ? t.step : "IDLE",
    question: inFlow ? questionText(t) : null,
    known: inFlow ? knownFacts(t) : [],
    sellerName: t.seller?.name ?? null,
    history: await recentHistory(t),
    chatKey: t.conv.id,
    identityCheckAvailable: isKycAvailable(),
  });
  if (!u) return false;
  const c = t.c;

  switch (u.intent) {
    case "human":
      await handOverToHuman(t);
      return true;
    case "status":
      await withResume(t, () => sendStatus(t));
      return true;
    case "sold":
      await withResume(t, () => startSold(t));
      return true;
    case "stop":
      if (!inFlow) break;
      t.asked = true;
      await t.reply({
        type: "buttons",
        body: joinLead(u.reply, c.stopConfirm)!,
        buttons: [
          { id: "confirm:cancel", title: c.btnStop },
          { id: "menu:continue", title: c.btnKeepGoing },
        ],
      });
      return true;
    case "buy": {
      const place = await saveBuyerAlert(t, u.fields);
      await t.text(joinLead(u.reply, place ? c.buyerAlertSaved({ place }) : undefined, c.browseLand({ url: await browseUrl(u.fields) }))!);
      if (inFlow) await reprompt(t, c.continueListing);
      return true;
    }
    case "yes":
    case "no": {
      const replyId = inFlow ? shortcutFor(t, u.intent) : null;
      if (replyId) {
        await handleStep(t, { kind: "interactive", replyId });
        return true;
      }
      break;
    }
  }

  // ── Not filling a listing: someone describing their land starts one, pre-filled.
  if (!inFlow) {
    const details = [u.fields.landType, u.fields.area, u.fields.priceRupees, u.fields.city, u.fields.locality].filter((v) => v !== undefined).length;
    if (u.intent === "sell" || details >= 2) {
      const saved = t.draft;
      t.draft = {};
      const { draft, items } = await mergeExtracted(t, u.fields);
      t.draft = saved;
      await startListing(t, draft, joinLead(u.reply, items.length ? c.understood({ items: items.join(" · ") }) : undefined));
      return true;
    }
    if (!u.reply) return false;
    if (await menuShownRecently(t)) await t.text(u.reply);
    else await sendMenu(t, u.reply);
    return true;
  }

  // ── Filling a listing: keep what they told us, then move on or ask again.
  if (t.step === "ASK_DESCRIPTION" && u.intent === "answer") {
    const written = cleanFreeText(u.description ?? text, 1800, true);
    if (written) {
      const description = written.length >= 15 ? written : `${defaultDescription(t)} ${written}`;
      await advance(t, "ASK_DESCRIPTION", { ...t.draft, description, descriptionGenerated: false, features: detectFeatures(written) }, u.reply);
      return true;
    }
  }
  const correcting = u.intent === "correction" || t.step === "CONFIRM";
  const { draft, items } = await mergeExtracted(t, u.fields, correcting);
  const newName = t.step === "ASK_NAME" && draft.name && draft.name !== t.draft.name ? draft.name : null;
  const noted = newName ? c.thanksName({ name: newName }) : items.length ? c.understood({ items: items.join(" · ") }) : undefined;
  if (t.step === "CONFIRM" && items.length) {
    await goTo(t, "CONFIRM", draft, joinLead(u.reply, noted));
    return true;
  }
  if (answered(t.step, draft)) {
    await advance(t, t.step, draft, joinLead(u.reply, noted));
    return true;
  }
  if (noted) {
    await t.save(t.step, draft);
    await reprompt(t, joinLead(u.reply, noted), u.ask);
    return true;
  }
  if (!u.reply) return false;
  await reprompt(t, u.reply, u.ask);
  return true;
}

/** A message the fixed parser didn't understand: let the AI read it (once), if it's on. */
async function aiAssist(t: Turn, text: string | undefined): Promise<boolean> {
  return text ? aiAgent(t, text) : false;
}

// ───────────────────────────── Answers ─────────────────────────────

/** Answers to the current question. */
async function handleStep(t: Turn, input: BotInput & { text?: string }) {
  const { replyId, text } = input;
  if (input.kind === "text" && !replyId && text && t.step !== "SUBMITTING" && t.step !== "ASK_SOLD_WHICH" && readFirst(t.step, text) && (await aiAgent(t, text))) return;
  const d = t.draft;
  const c = t.c;

  switch (t.step) {
    case "ASK_SOLD_WHICH":
      return reprompt(t);

    case "IDLE":
    case "SUBMITTING":
      if (input.kind === "location") return sendMenu(t, c.thanksLocationIdle);
      if (t.step === "IDLE" && input.kind === "text" && (await aiAssist(t, text))) return;
      return sendMenu(t);

    case "ASK_NAME": {
      let name: string | null = null;
      if (replyId === "name:profile" || (text && /^(?:yes|haan|han|हाँ|हां)\b/i.test(text))) name = t.conv.profileName ? parseName(t.conv.profileName) : null;
      if (!name && text) name = parseName(text);
      if (!name) return (await aiAssist(t, text)) || reprompt(t, c.typeName);
      return acceptName(t, name);
    }

    case "ASK_SELLER_TYPE":
      // Older chats paused on the question we no longer ask: everyone is a seller.
      return advance(t, "ASK_SELLER_TYPE", { ...d, sellerType: d.sellerType ?? "OWNER" });

    case "ASK_LAND_TYPE": {
      const fromId = replyId?.startsWith("type:") ? replyId.slice(5) : null;
      const landType = fromId && Object.hasOwn(LAND_TYPES, fromId) ? (fromId as LandType) : text ? parseLandType(text) : null;
      if (!landType) return (await aiAssist(t, text)) || reprompt(t, c.chooseLandTypeFromList);
      return advance(t, "ASK_LAND_TYPE", { ...d, landType }, `${landLabel(t.lang, landType)} ✓`);
    }

    case "ASK_STATE": {
      const fromId = replyId?.startsWith("state:") ? replyId.slice(6) : null;
      const state = matchState(fromId ?? text ?? "");
      if (!state) return (await aiAssist(t, text)) || reprompt(t, c.unknownState);
      return advance(t, "ASK_STATE", { ...d, cityState: state, cityId: undefined, cityName: undefined }, c.stateOk({ state }));
    }

    case "ASK_CITY": {
      const fromId = replyId?.startsWith("city:") ? replyId.slice(5) : null;
      if (fromId) {
        const city = await db.city.findUnique({ where: { id: fromId } });
        if (city) return advance(t, "ASK_CITY", { ...d, cityId: city.id, cityName: city.name, cityState: city.state }, `🏙️ *${city.name}* ✓`);
      }
      const typed = cleanFreeText(text ?? "", 60);
      // "Mohali, Punjab" typed in full is fine too; the state we already have wins.
      let { name } = splitCityAndState(typed);
      // Typed in Hindi: use the place's English name, so it matches the existing city page.
      if (isDevanagari(name)) name = (await englishPlaceName([name, d.cityState, "India"].filter(Boolean).join(", "))) ?? "";
      const city = name && CITY_NAME_PATTERN.test(name) ? await resolveCity({ cityName: name, state: d.cityState }) : null;
      if (!city) return (await aiAssist(t, text)) || reprompt(t, isDevanagari(typed) ? c.typeCityEnglish : c.typeCity);
      return advance(t, "ASK_CITY", { ...d, cityId: city.id, cityName: city.name, cityState: city.state }, `🏙️ *${city.name}* ✓`);
    }

    case "ASK_LOCALITY": {
      if (input.kind === "location") return reprompt(t, c.typeLocalityFirst);
      const locality = cleanFreeText(text ?? "", 120);
      if (locality.length < 2 || !/\p{L}/u.test(locality) || looksLikeQuestion(locality)) return (await aiAssist(t, text)) || reprompt(t, c.typeLocality);
      return advance(t, "ASK_LOCALITY", { ...d, locality, village: villageFrom(locality) }, `📍 *${locality}* ✓`);
    }

    case "ASK_AREA": {
      if (!text) return reprompt(t);
      const parsed = parseArea(text);
      if (parsed) return acceptArea(t, parsed.area, parsed.unit);
      const n = parseNumber(text);
      if (n && n > 0) return goTo(t, "ASK_AREA_UNIT", { ...d, pendingArea: n });
      return (await aiAssist(t, text)) || reprompt(t, c.didntGetSize);
    }

    case "ASK_AREA_UNIT": {
      const fromId = replyId?.startsWith("unit:") ? replyId.slice(5) : null;
      if (fromId && (Object.values(AreaUnit) as string[]).includes(fromId) && d.pendingArea) return acceptArea(t, d.pendingArea, fromId as AreaUnit);
      if (text) {
        const full = parseArea(text);
        if (full) return acceptArea(t, full.area, full.unit);
        const unit = parseUnit(text);
        if (unit && d.pendingArea) return acceptArea(t, d.pendingArea, unit);
      }
      return reprompt(t, c.chooseUnitFromList);
    }

    case "ASK_PRICE": {
      if (replyId?.startsWith("price:")) {
        const v = Number(replyId.slice(6));
        if (Number.isFinite(v) && v >= 10_000) return acceptPrice(t, v);
        await t.save("ASK_PRICE", { ...d, suggestedPrice: undefined });
        return reprompt(t, c.typePriceAgain);
      }
      if (!text) return reprompt(t);
      if (d.suggestedPrice && /^(?:no|nahi|nahin|nope|galat|wrong|नहीं|गलत|ग़लत)/i.test(text.trim())) {
        await t.save("ASK_PRICE", { ...d, suggestedPrice: undefined });
        return reprompt(t, c.typePriceAgain);
      }
      const amount = parsePrice(text);
      if (amount && looksLikePerUnitPrice(text)) return reprompt(t, c.totalNotPerUnit);
      if (amount) return acceptPrice(t, amount);
      // "18" almost always means 18 lakh.
      const n = parseNumber(text);
      if (n && n >= 1 && n < 1000 && /^\d+(?:\.\d+)?$/.test(normalizeInput(text))) {
        const suggestion = Math.round(n * 1_00_000);
        await t.save("ASK_PRICE", { ...d, suggestedPrice: suggestion });
        await t.reply({
          type: "buttons",
          body: c.didYouMean({ price: priceText(t.lang, suggestion) }),
          buttons: [
            { id: `price:${suggestion}`, title: c.btnYesPrice({ price: priceText(t.lang, suggestion) }).slice(0, 20) },
            { id: "price:no", title: c.btnNo },
          ],
        });
        return;
      }
      return (await aiAssist(t, text)) || reprompt(t, c.didntGetPrice);
    }

    case "ASK_PHOTOS": {
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "photos:done" || /^(?:done|ho gaya|hogaya|ho gya|bas|finish|finished|complete|that'?s all|ok done|next|हो गया|बस)/.test(lowered)) {
        if (!d.photos?.length) return reprompt(t, c.noPhotosYet);
        return advance(t, "ASK_PHOTOS", d, c.photosAdded({ n: d.photos.length }));
      }
      if (replyId === "photos:skip" || /^(?:skip|no photos?|nahi|nahin|no|later|baad me|baad mein|नहीं|बाद में|फ़ोटो बाद में|फोटो बाद में)/.test(lowered)) {
        return advance(t, "ASK_PHOTOS", d, c.noPhotosOk);
      }
      if (input.kind === "location") {
        return advance(t, "ASK_LOCATION", { ...d, latitude: input.latitude, longitude: input.longitude, locationAsked: true }, c.locationSaved);
      }
      return (await aiAssist(t, text)) || reprompt(t, c.sendPhotosOrTap);
    }

    case "ASK_LOCATION": {
      if (input.kind === "location" && isCoord(input.latitude, input.longitude)) {
        return advance(t, "ASK_LOCATION", { ...d, latitude: input.latitude, longitude: input.longitude, locationAsked: true }, c.locationSaved);
      }
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "loc:skip" || /^(?:skip|no|nahi|nahin|later|not now|don'?t know|pata nahi|छोड़ें|नहीं|पता नहीं|बाद में)/.test(lowered)) {
        return advance(t, "ASK_LOCATION", { ...d, locationAsked: true }, c.noProblem);
      }
      const coords = text ? parseCoordinates(text) : null;
      if (coords) return advance(t, "ASK_LOCATION", { ...d, ...coords, locationAsked: true }, c.locationSaved);
      return (await aiAssist(t, text)) || reprompt(t, c.sendPinOrSkip);
    }

    case "ASK_DESCRIPTION": {
      if (replyId === "desc:skip" || (text && /^(?:skip|no|nahi|nahin|nothing|kuch nahi|छोड़ें|नहीं|कुछ नहीं)$/i.test(normalizeInput(text)))) {
        return advance(t, "ASK_DESCRIPTION", { ...d, description: defaultDescription(t), descriptionGenerated: true, features: [] });
      }
      if (input.kind === "location") return reprompt(t, c.gotLocationNowDesc);
      const written = cleanFreeText(text ?? "", 1800, true);
      if (!written) return reprompt(t);
      const description = written.length >= 15 ? written : `${defaultDescription(t)} ${written}`;
      return advance(t, "ASK_DESCRIPTION", { ...d, description, descriptionGenerated: false, features: detectFeatures(written) });
    }

    case "CONFIRM": {
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "confirm:submit" || /^(?:submit|ok|okay|confirm|done|correct|sahi|sahi hai|theek hai|thik hai|submit ✅|भेजें|भेज दो|सही है|ठीक है)/.test(lowered)) {
        return submit(t);
      }
      if (/^(?:start over|restart|edit|change|again|dobara|फिर से|दोबारा)/.test(lowered)) return restartDetails(t);
      return (await aiAssist(t, text)) || reprompt(t, c.confirmHint);
    }
  }
}

async function acceptName(t: Turn, name: string) {
  await advance(t, "ASK_NAME", { ...t.draft, name }, t.c.thanksName({ name }));
}

async function acceptArea(t: Turn, area: number, unit: AreaUnit) {
  const { pendingArea, ...rest } = t.draft;
  void pendingArea;
  await advance(t, "ASK_AREA", { ...rest, area, areaUnit: unit }, `📐 *${areaText(t.lang, area, unit)}* ✓`);
}

async function acceptPrice(t: Turn, amount: number) {
  const { suggestedPrice, ...rest } = t.draft;
  void suggestedPrice;
  await advance(t, "ASK_PRICE", { ...rest, price: amount }, `💰 *${priceText(t.lang, amount)}* ✓`);
}

// ───────────────────────────── Photos ─────────────────────────────

async function handleImage(t: Turn, image: StoredImage | null) {
  if (!isInFlow(t.step)) return sendMenu(t, t.c.photoThanksIdle);
  if (!image) {
    await t.text(t.c.photoFailed);
    return;
  }
  const count = await appendPhoto(t.conv.id, image);
  if (count === null) {
    await t.text(t.c.photoMax({ max: MAX_PHOTOS }));
    if (t.step === "ASK_PHOTOS") await advance(t, "ASK_PHOTOS", readDraft((await reloadDraft(t.conv.id)) ?? null));
    return;
  }
  t.draft = { ...t.draft, photos: [...(t.draft.photos ?? []), image] };

  if (t.step !== "ASK_PHOTOS") {
    await t.text(t.c.photoAddedOutside({ n: count }));
    return;
  }
  if (count >= MAX_PHOTOS) {
    t.draft = readDraft(await reloadDraft(t.conv.id));
    return advance(t, "ASK_PHOTOS", t.draft, t.c.photoMaxDone({ max: MAX_PHOTOS }));
  }
  await t.reply({ type: "buttons", body: t.c.photoReceived({ n: count }), buttons: [{ id: "photos:done", title: t.c.btnDone }] });
}

/**
 * Appends a photo to the draft atomically (sellers often send 5 photos at
 * once, which arrive as 5 near-simultaneous webhooks). Returns the new
 * count, or null if the draft already has MAX_PHOTOS.
 */
async function appendPhoto(conversationId: string, image: StoredImage): Promise<number | null> {
  const item = JSON.stringify([{ url: image.url, width: image.width, height: image.height }]);
  const rows = await db.$queryRaw<{ count: number }[]>`
    UPDATE whatsapp_conversations
    SET draft = jsonb_set(
          CASE WHEN jsonb_typeof(draft) = 'object' THEN draft ELSE '{}'::jsonb END,
          '{photos}',
          COALESCE(CASE WHEN jsonb_typeof(draft) = 'object' THEN draft->'photos' END, '[]'::jsonb) || ${item}::jsonb
        ),
        "updatedAt" = now()
    WHERE id = ${conversationId}
      AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(draft) = 'object' AND jsonb_typeof(draft->'photos') = 'array' THEN draft->'photos' END), 0) < ${MAX_PHOTOS}
    RETURNING jsonb_array_length(draft->'photos')::int AS count`;
  return rows[0]?.count ?? null;
}

async function reloadDraft(conversationId: string) {
  const c = await db.whatsAppConversation.findUnique({ where: { id: conversationId }, select: { draft: true } });
  return c?.draft ?? null;
}

// ───────────────────────────── Submit ─────────────────────────────

const FIELD_TO_STEP: Partial<Record<keyof ListingInput, BotStep>> = {
  cityId: "ASK_CITY",
  cityName: "ASK_CITY",
  state: "ASK_STATE",
  landType: "ASK_LAND_TYPE",
  area: "ASK_AREA",
  areaUnit: "ASK_AREA",
  price: "ASK_PRICE",
  locality: "ASK_LOCALITY",
  description: "ASK_DESCRIPTION",
  latitude: "ASK_LOCATION",
  longitude: "ASK_LOCATION",
};

async function submit(t: Turn) {
  // Re-read the draft: photos may have been appended by a parallel webhook.
  t.draft = readDraft(await reloadDraft(t.conv.id));
  const d = t.draft;
  const seller = await t.loadSeller();
  const name = seller?.name ?? d.name;
  // Everyone is a "seller"; the stored type only matters for older records.
  const sellerType: SellerType = seller?.sellerType ?? d.sellerType ?? "OWNER";
  if (!name) return goTo(t, "ASK_NAME", { ...d, returnToConfirm: true }, t.c.oneMoreThing);
  if (seller?.isBlocked) {
    await t.save("IDLE", null);
    await t.text(t.c.blocked);
    return;
  }

  const parsed = listingInputSchema.safeParse({
    cityId: d.cityId,
    cityName: d.cityName,
    state: d.cityState,
    landType: d.landType,
    area: d.area,
    areaUnit: d.areaUnit,
    price: d.price,
    priceNegotiable: true,
    locality: d.locality,
    village: d.village,
    latitude: d.latitude,
    longitude: d.longitude,
    description: d.description,
    features: d.features ?? [],
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] as keyof ListingInput | undefined;
    const step = (field && FIELD_TO_STEP[field]) || "ASK_LAND_TYPE";
    const fixed: BotDraft = { ...d, returnToConfirm: true };
    if (step === "ASK_LOCATION") {
      delete fixed.latitude;
      delete fixed.longitude;
    }
    return goTo(t, step, fixed, t.c.needsFixing({ issue: issue?.message ?? "please check this answer" }));
  }
  // Guard against a double tap on Submit: only one turn may move CONFIRM → SUBMITTING.
  const claimed = await db.whatsAppConversation.updateMany({
    where: { id: t.conv.id, step: "CONFIRM" },
    data: { step: "SUBMITTING" },
  });
  if (claimed.count === 0) return;
  t.step = "SUBMITTING";

  try {
    const s = await findOrCreateSeller({ phone: t.phone, name, sellerType, phoneVerified: true });
    const property = await createListing({
      sellerId: s.id,
      source: "WHATSAPP",
      input: parsed.data,
      images: d.photos ?? [],
      // In simulation the confirmation is recorded below instead of being sent to Meta.
      notify: !t.isSimulation,
    });
    await db.whatsAppConversation.update({ where: { id: t.conv.id }, data: { sellerId: s.id } });
    await t.save("IDLE", null);
    t.seller = s;

    if (t.isSimulation) {
      // Mirrors notifySeller(…, "LISTING_RECEIVED") so the simulator shows the real experience.
      const plot = `${property.title}\n${placeName(property)}${d.cityName ? `, ${d.cityName}` : ""} · ${priceText(t.lang, property.price)}`;
      await t.reply({ type: "text", text: t.c.nReceived({ plot, code: s.code }) }, "system");
    }
    await t.text(t.c.submitted({ name: s.name }));
    await nudgeIdentity(t, s);
  } catch (err) {
    await db.whatsAppConversation.update({ where: { id: t.conv.id }, data: { step: "CONFIRM" } });
    t.step = "CONFIRM";
    throw err;
  }
}

/**
 * After a submit: a gentle nudge to verify identity (DigiLocker) when KYC is
 * switched on. Never blocks the listing — it is already submitted.
 */
async function nudgeIdentity(t: Turn, s: Seller) {
  if (!isKycAvailable() || s.identityStatus === "VERIFIED") return;
  if (!t.isSimulation) {
    await notifyVerifyIdentity(s.id).catch(() => false);
    return;
  }
  // Mirrors notifyVerifyIdentity so the simulator shows the real experience.
  await t.reply({ type: "text", previewUrl: false, text: t.c.nVerifyIdentity({ name: s.name, url: site.url }) }, "system");
}

// ───────────────────────────── Helpers ─────────────────────────────

/** The description we write when the seller skips it (public, so in English like the rest of the listing page). */
function defaultDescription(t: Turn): string {
  const d = t.draft;
  const what = d.landType ? LAND_TYPES[d.landType].label.toLowerCase() : "land";
  const size = d.area && d.areaUnit ? `${formatArea(d.area, d.areaUnit)} ` : "";
  const where = [d.locality, d.cityName].filter(Boolean).join(", ");
  return `${size}${what}${where ? ` in ${where}` : ""}. Listed by the seller on ${site.name}. Call or WhatsApp the seller for details and a site visit.`.replace(/^./, (ch) =>
    ch.toUpperCase(),
  );
}

/** "Sathiyaon, near Panchayat Bhawan" → "Sathiyaon" (used in the title). */
function villageFrom(locality: string): string | undefined {
  const head = locality.split(/,|\s+near\s+|\s+ke paas\s+|\s+के पास\s+|\s+opp\.?\s+|\s+opposite\s+/i)[0]?.trim();
  if (!head || head === locality || head.length < 2 || head.length > 60) return undefined;
  return head;
}

function cleanFreeText(text: string, max: number, multiline = false): string {
  let s = text.normalize("NFC").replace(/[​-‍﻿]/g, "");
  s = multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function formatNumberPlain(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function isCoord(lat: number | undefined, lng: number | undefined): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
