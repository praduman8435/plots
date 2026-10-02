import "server-only";
import { z } from "zod";
import { Prisma, type Seller, type WhatsAppConversation } from "@/generated/prisma/client";
import { AreaUnit, LandType, type ListingStatus, type HiddenReason, type SellerType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES, buildTitle, placeName } from "@/lib/land";
import { maskPhoneForLogging } from "@/lib/phone";
import { site } from "@/lib/site";
import { formatArea, formatSqftHint, toSqft } from "@/lib/units";
import { listingInputSchema, type ListingInput } from "@/lib/validation/listing";
import { trackEvent } from "@/server/analytics";
import { isKycAvailable } from "@/server/kyc/provider";
import { changeListingStatus, createListing, findOrCreateSeller, plotsAwaitingAvailability } from "@/server/listings/service";
import type { StoredImage } from "@/server/storage";
import type { OutgoingMessage } from "./client";
import { recordOutboundOnly, sendAndRecord } from "./messaging";
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
  parseListNumber,
  parseName,
  parseNumber,
  parsePrice,
  parseSellerType,
  parseUnit,
  type BotCommand,
} from "./parse";

/**
 * The WhatsApp listing assistant — a small state machine.
 *
 *   IDLE ─SELL→ ASK_NAME → ASK_SELLER_TYPE → ASK_LAND_TYPE → ASK_CITY →
 *   ASK_LOCALITY → ASK_AREA (→ ASK_AREA_UNIT) → ASK_PRICE → ASK_PHOTOS →
 *   ASK_LOCATION → ASK_DESCRIPTION → CONFIRM ─Submit→ PENDING listing → IDLE
 *
 * Known sellers skip ASK_NAME / ASK_SELLER_TYPE. HUMAN means a person from
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
  ASK_CITY: "Asking city",
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
  "ASK_SELLER_TYPE",
  "ASK_LAND_TYPE",
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
  return FLOW_ORDER.includes(step) || step === "ASK_AREA_UNIT" || step === "SUBMITTING";
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

  constructor(
    public conv: ConversationWithSeller,
    private readonly simulate: boolean,
  ) {
    this.step = toBotStep(conv.step);
    this.draft = readDraft(conv.draft);
    this.seller = conv.seller;
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
    await turn
      .text("Sorry, something went wrong on our side 🙏 Please try again in a moment, or send *TALK* to reach our team.")
      .catch(() => {});
  }
  return turn.replies;
}

async function handle(t: Turn, input: BotInput) {
  const replyId = input.kind === "interactive" ? input.replyId : undefined;
  // Typed text, or the tapped title when no id came through (e.g. simulator after a reload).
  const text = (input.kind === "text" ? input.text : input.kind === "interactive" && !replyId ? input.replyTitle : undefined)?.trim();
  const command = text ? detectCommand(text) : null;

  // ── A person from our team is handling this chat: stay silent unless asked back.
  if (t.step === "HUMAN") {
    if (command === "MENU" || command === "START" || replyId === "menu:list" || replyId === "menu:bot") {
      await t.save("IDLE", null);
      if (command === "START" || replyId === "menu:list") return startListing(t);
      return sendMenu(t, "👋 You're back with the Plots assistant.");
    }
    return;
  }

  // ── "Which property is sold?" — a typed number picks from the list we showed.
  if (t.step === "ASK_SOLD_WHICH") {
    const n = !replyId && !command && input.kind === "text" ? parseListNumber(text) : null;
    if (n !== null) return pickSoldByNumber(t, n);
    if (!replyId && !command && input.kind === "text") {
      return reprompt(t, "Please reply with the number from the list, or tap *Choose property* 👇");
    }
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
    if (t.step === "IDLE") await t.text("✅ This listing has already been submitted. Send *STATUS* to see your plots.");
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
    if (!isInFlow(t.step)) return sendMenu(t, unsupportedNote(input.otherType));
    await t.text(unsupportedNote(input.otherType));
    return reprompt(t);
  }

  await handleStep(t, { ...input, text, replyId });
}

function unsupportedNote(type?: string) {
  if (type === "audio" || type === "voice") {
    return "🎙️ Sorry, I can't listen to voice notes yet. Please type your answer — or send *TALK* and someone from our team will help.";
  }
  return "Sorry, I can only read text, photos and location pins 🙏";
}

/** Runs a side action mid-listing, then repeats the current question so the seller knows where they are. */
async function withResume(t: Turn, action: () => Promise<void>) {
  t.asked = false;
  await action();
  if (!t.asked && isInFlow(t.step) && t.step !== "SUBMITTING") await reprompt(t, "👇 Let's continue your listing.");
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
      await t.text(helpText());
      if (isInFlow(t.step)) await reprompt(t, "👇 Let's continue your listing.");
      return true;
    case "MENU":
    case "GREETING":
      if (isInFlow(t.step)) {
        await reprompt(t, command === "GREETING" ? "Namaste 🙏 We were in the middle of your listing." : undefined);
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

// ───────────────────────────── Menu / help / commands ─────────────────────────────

function helpText() {
  return [
    "Here's what I can do 🙂",
    "",
    "• *SELL* — list your land (about 2 minutes)",
    "• *STATUS* — see your plots",
    "• *ID* — your Seller ID",
    "• *YES* — your plot is still available",
    "• *NO* — your plot is sold (e.g. *NO 2* for plot 2)",
    "• *SOLD* — mark a plot as sold",
    "• *TALK* — chat with a person from our team",
    "• *CANCEL* — stop the current listing",
    "",
    `Manage your plots online: ${site.url}/seller`,
  ].join("\n");
}

async function sendMenu(t: Turn, lead?: string) {
  const seller = t.seller ?? (await t.loadSeller());
  const intro = seller
    ? `Namaste ${firstName(seller.name)} 🙏\nYour Seller ID: *${seller.code}*`
    : `Namaste 🙏 Welcome to *${site.name}* — sell your land directly to buyers in ${await liveCityNames()}. Listing takes about 2 minutes, right here on WhatsApp.`;
  await t.reply({
    type: "buttons",
    body: `${lead ? `${lead}\n\n` : ""}${intro}\n\nWhat would you like to do?`,
    buttons: [
      { id: "menu:list", title: "List my land" },
      { id: "menu:status", title: "My plots" },
      { id: "menu:human", title: "Talk to us" },
    ],
  });
}

async function liveCityNames(): Promise<string> {
  const cities = await db.city.findMany({ where: { isLive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 3 });
  if (cities.length === 0) return "your area";
  return cities.map((c) => c.name).join(", ");
}

async function cancel(t: Turn) {
  const hadDraft = isInFlow(t.step);
  await t.save("IDLE", null);
  await t.reply({
    type: "buttons",
    body: hadDraft
      ? "Okay, I've cancelled this listing. Nothing was submitted.\n\nWhenever you're ready, tap *List my land* or send *SELL*."
      : "Okay 👍 Whenever you're ready, tap *List my land* or send *SELL*.",
    buttons: [
      { id: "menu:list", title: "List my land" },
      { id: "menu:status", title: "My plots" },
    ],
  });
}

async function handOverToHuman(t: Turn) {
  await t.save("HUMAN", t.draft);
  await t.text(
    "🙋 Sure! Someone from the Plots team will reply here soon.\n\nYou can type your question now. To go back to the assistant anytime, send *MENU*.",
  );
}

const STATUS_WORDS: Record<ListingStatus, string> = {
  PENDING: "⏳ Pending approval",
  ACTIVE: "✅ Live",
  HIDDEN: "🙈 Hidden",
  SOLD: "🏁 Sold",
  REJECTED: "❌ Rejected",
};

function statusWords(p: { status: ListingStatus; hiddenReason: HiddenReason | null; availabilityCheckSentAt?: Date | null }) {
  if (p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED") return "⏸️ Unavailable – reply *YES* to reactivate";
  if (p.status === "ACTIVE" && p.availabilityCheckSentAt) return "✅ Live – reply *YES* if still available";
  return STATUS_WORDS[p.status];
}

/** "today", "yesterday", "5 days ago". */
function daysAgo(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

async function sendStatus(t: Turn) {
  const seller = await t.loadSeller();
  if (!seller) {
    if (isInFlow(t.step)) {
      await t.text("You don't have any plots with us yet — the one you're adding now will be your first! 🙂");
      return;
    }
    await t.reply({
      type: "buttons",
      body: "You haven't listed any plots with us yet.\n\nTap *List my land* to add your first one — it takes about 2 minutes.",
      buttons: [{ id: "menu:list", title: "List my land" }],
    });
    return;
  }
  const plots = await db.property.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, code: true, status: true, hiddenReason: true, slug: true, lastConfirmedAt: true, availabilityCheckSentAt: true },
  });
  const total = await db.property.count({ where: { sellerId: seller.id } });
  const lines = plots.map((p, i) => {
    const confirmed = p.lastConfirmedAt && p.status === "ACTIVE" ? ` · confirmed ${daysAgo(p.lastConfirmedAt)}` : "";
    const link = p.status === "ACTIVE" ? `\n   ${site.url}/property/${p.slug}` : "";
    return `${i + 1}. *${p.title}* (${p.code})\n   ${statusWords(p)}${confirmed}${link}`;
  });
  const more = total > plots.length ? `\n…and ${total - plots.length} more.` : "";
  await t.text(
    [
      plots.length ? `📋 *Your plots*\n\n${lines.join("\n\n")}${more}` : "You don't have any plots listed yet. Send *SELL* to add one.",
      "",
      `Your Seller ID: *${seller.code}*`,
      `See and manage everything at ${site.url}/seller`,
    ].join("\n"),
  );
}

async function sendSellerId(t: Turn) {
  const seller = await t.loadSeller();
  if (!seller) {
    await t.text("You don't have a Seller ID yet — you'll get one as soon as you list your first plot. Send *SELL* to start.");
    return;
  }
  await t.text(
    `🪪 Your Seller ID is *${seller.code}*\n\nUse it to sign in at ${site.url}/seller — we'll send a code to this WhatsApp number. Keep it handy; it never changes.`,
  );
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
    where: { sellerId: seller.id, status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, slug: true },
  });
  if (awaiting.length === 0 && hidden.length === 0) {
    await t.text("Thanks! 👍 Nothing needs confirming right now — your plots are up to date.\n\nSend *STATUS* to see them.");
    return;
  }
  for (const p of [...awaiting, ...hidden]) {
    await changeListingStatus(p.id, { type: "CONFIRM_AVAILABLE" }, { notify: false, via: "whatsapp" });
  }

  const parts: string[] = [];
  if (awaiting.length === 1) parts.push(`Great — your listing will remain live. 👍\n\n*${awaiting[0].title}*`);
  if (awaiting.length > 1) parts.push(`Great — your listings will remain live. 👍\n\n${awaiting.map((p) => `• ${p.title}`).join("\n")}`);
  if (hidden.length === 1) {
    parts.push(`${awaiting.length ? "And it's" : "👍 Thank you! It's"} live again — buyers can see it now:\n\n*${hidden[0].title}*\n${plotLink(hidden[0].slug)}`);
  }
  if (hidden.length > 1) {
    parts.push(
      `${awaiting.length ? "And these are" : "👍 Thank you! These are"} live again — buyers can see them now:\n\n${hidden.map((p) => `• ${p.title}`).join("\n")}`,
    );
  }
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
    await sendMenu(t, "Okay 👍");
    return;
  }
  const awaiting = await plotsAwaitingAvailability(seller.id);
  if (awaiting.length > 0) {
    if (number !== null) {
      const plot = awaiting[number - 1];
      if (!plot) return askWhichSold(t, awaiting, `There's no number ${number} in the list 🙏`);
      return markSold(t, seller.id, plot);
    }
    if (awaiting.length === 1) return markSold(t, seller.id, awaiting[0]);
    return askWhichSold(t, awaiting);
  }

  // Nothing awaiting (e.g. the plot was already hidden for no reply) — be careful and confirm.
  const plots = await sellablePlots(seller.id);
  if (plots.length === 0) {
    await t.text("Okay 👍 You don't have any live plots right now.\n\nSend *STATUS* to see your plots, or *SELL* to list a new one.");
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
  await t.reply(whichSoldMessage(shown, lead, !isInFlow(t.step)));
}

function whichSoldMessage(plots: SoldCandidate[], lead: string | undefined, acceptsNumber: boolean): OutgoingMessage {
  const list = plots.map((p, i) => `${i + 1}. ${p.title} — ${formatPrice(p.price)}`).join("\n");
  return {
    type: "list",
    body: `${lead ? `${lead}\n\n` : ""}Which property is sold?\n\n${list}\n\n${acceptsNumber ? "Reply with its number, or tap below." : "Tap below to choose."}`,
    buttonLabel: "Choose property",
    rows: plots.map((p, i) => ({ id: `nosold:${p.id}`, title: `${i + 1}. ${p.code}`, description: p.title })),
  };
}

async function pickSoldByNumber(t: Turn, n: number) {
  const id = t.draft.soldChoices?.[n - 1];
  if (!id) return reprompt(t, `There's no number ${n} in the list 🙏`);
  return pickSold(t, id);
}

/** A row tapped in "Which property is sold?" (or a typed number). */
async function pickSold(t: Turn, propertyId: string) {
  const seller = await t.loadSeller();
  const plot = seller
    ? await db.property.findFirst({
        where: { id: propertyId, sellerId: seller.id },
        select: { id: true, title: true, code: true, price: true, status: true },
      })
    : null;
  if (t.step === "ASK_SOLD_WHICH") await t.save("IDLE", null);
  if (!seller || !plot) {
    await t.text("Sorry, I couldn't find that property. Send *STATUS* to see your plots.");
    return;
  }
  if (plot.status === "SOLD") {
    await t.text(`*${plot.title}* is already marked as sold. 👍`);
    return;
  }
  if (plot.status !== "ACTIVE" && plot.status !== "HIDDEN") {
    await t.text(`*${plot.title}* isn't live, so there's nothing to mark. Send *STATUS* to see your plots.`);
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
    await t.text(`Got it. We've marked your property as sold.\n\n*${plot.title}*\n\nCongratulations! 🎉 Send *SELL* anytime to list another property.`);
    return;
  }
  t.asked = true;
  const list = others.map((p, i) => `${others.length > 1 ? `${i + 1}. ` : ""}${p.title} — ${formatPrice(p.price)}`).join("\n");
  await t.reply({
    type: "buttons",
    body: `Got it. We've marked *${plot.title}* as sold. Congratulations! 🎉\n\n${others.length > 1 ? "Are the others still available?" : "Is this one still available?"}\n\n${list}`,
    buttons: [
      { id: "avail:yes", title: "YES, available" },
      { id: "avail:no", title: others.length > 1 ? "Another is sold" : "NO, it's sold too" },
    ],
  });
}

// ───────────────────────────── SOLD (explicit) ─────────────────────────────

/** Live or hidden plots, oldest first. */
async function sellablePlots(sellerId: string) {
  return db.property.findMany({
    where: { sellerId, status: { in: ["ACTIVE", "HIDDEN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, code: true, price: true, area: true, areaUnit: true },
    take: 10,
  });
}

async function startSold(t: Turn) {
  const seller = await t.loadSeller();
  const plots = seller ? await sellablePlots(seller.id) : [];
  if (plots.length === 0) {
    await t.text("You don't have any live plots to mark as sold. Send *STATUS* to see your plots.");
    return;
  }
  if (plots.length === 1) return askSoldConfirm(t, plots[0]);
  t.asked = true;
  await t.reply({
    type: "list",
    body: "Congratulations! 🎉 Which plot has been sold?",
    buttonLabel: "Choose plot",
    rows: plots.map((p) => ({
      id: `sold:pick:${p.id}`,
      title: `${p.code} · ${formatArea(p.area, p.areaUnit)}`,
      description: p.title,
    })),
  });
}

async function askSoldConfirm(t: Turn, p: { id: string; title: string; code: string }) {
  t.asked = true;
  await t.reply({
    type: "buttons",
    body: `Mark *${p.title}* (${p.code}) as sold?\n\nBuyers will no longer see it on ${site.name}.`,
    buttons: [
      { id: `sold:yes:${p.id}`, title: "Yes, it's sold" },
      { id: `sold:no:${p.id}`, title: "No, still available" },
    ],
  });
}

async function handleSoldReply(t: Turn, replyId: string) {
  const [, action, propertyId] = replyId.split(":");
  const seller = await t.loadSeller();
  const plot =
    seller && propertyId
      ? await db.property.findFirst({
          where: { id: propertyId, sellerId: seller.id },
          select: { id: true, title: true, code: true, status: true, hiddenReason: true, availabilityCheckSentAt: true },
        })
      : null;
  if (!seller || !plot) {
    await t.text("Sorry, I couldn't find that plot. Send *STATUS* to see your plots.");
    return;
  }
  if (action === "pick") return askSoldConfirm(t, plot);
  if (action === "no") {
    // "No, still available" also answers a pending availability check.
    const pendingCheck =
      (plot.status === "ACTIVE" && plot.availabilityCheckSentAt) || (plot.status === "HIDDEN" && plot.hiddenReason === "AVAILABILITY_UNCONFIRMED");
    if (pendingCheck) {
      await changeListingStatus(plot.id, { type: "CONFIRM_AVAILABLE" }, { notify: false, via: "whatsapp" });
      await withResume(t, () =>
        t.text(plot.status === "ACTIVE" ? `Great — your listing will remain live. 👍\n\n*${plot.title}*` : `👍 *${plot.title}* is live again — buyers can see it now.`),
      );
      return;
    }
    await withResume(t, () => t.text(`👍 Okay — *${plot.title}* stays as it is.`));
    return;
  }
  if (action === "yes") {
    if (plot.status !== "ACTIVE" && plot.status !== "HIDDEN") {
      await t.text(`*${plot.title}* (${plot.code}) is already ${STATUS_WORDS[plot.status].replace(/^\S+\s/, "").toLowerCase()}.`);
      return;
    }
    await withResume(t, () => markSold(t, seller.id, plot));
  }
}

// ───────────────────────────── Listing flow ─────────────────────────────

async function startListing(t: Turn) {
  const seller = await t.loadSeller();
  if (seller?.isBlocked) {
    await t.save("IDLE", null);
    await t.text("Sorry, we can't accept new listings from this number right now. Send *TALK* if you think this is a mistake.");
    return;
  }
  if (!t.isSimulation) await trackEvent("listing_started", { sellerId: seller?.id ?? null, props: { via: "whatsapp" } });
  if (seller) {
    await goTo(
      t,
      "ASK_LAND_TYPE",
      { name: seller.name, sellerType: seller.sellerType },
      `Namaste ${firstName(seller.name)} 🙏 Welcome back!\nYour Seller ID: *${seller.code}*\n\nLet's list your new plot. (Send *CANCEL* anytime to stop.)`,
    );
    return;
  }
  await goTo(
    t,
    "ASK_NAME",
    {},
    `Namaste 🙏 Let's list your land on *${site.name}*. It takes about 2 minutes, and buyers will contact you directly.\n\n(Send *CANCEL* anytime to stop.)`,
  );
}

/** "Start over" from the summary: keep who the seller is, redo the plot details. */
async function restartDetails(t: Turn) {
  const seller = t.seller ?? (await t.loadSeller());
  const keep: BotDraft = seller ? { name: seller.name, sellerType: seller.sellerType } : { name: t.draft.name, sellerType: t.draft.sellerType };
  if (!keep.name || !keep.sellerType) return goTo(t, "ASK_NAME", {}, "No problem — let's start again from the top.");
  await goTo(t, "ASK_LAND_TYPE", keep, "No problem — let's start again. 🔄");
}

function nextStep(step: BotStep): BotStep {
  if (step === "ASK_AREA_UNIT") return "ASK_PRICE";
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

/** Saves the step and asks its question (skipping steps that answer themselves). */
async function goTo(t: Turn, step: BotStep, draft: BotDraft, lead?: string): Promise<void> {
  if (step === "ASK_CITY") {
    const cities = await liveCities();
    if (cities.length === 0) {
      await t.save("HUMAN", draft);
      await t.text(
        `${lead ? `${lead}\n\n` : ""}We're not taking listings online in your area just yet 🙏 Someone from our team will message you here soon to help.`,
      );
      return;
    }
    if (cities.length === 1) {
      const city = cities[0];
      return advance(t, "ASK_CITY", { ...draft, cityId: city.id, cityName: city.name }, joinLead(lead, `📍 City: *${city.name}*`));
    }
  }
  if (step === "ASK_SELLER_TYPE" && draft.sellerType) return advance(t, step, draft, lead);
  if (step === "ASK_NAME" && draft.name) return advance(t, step, draft, lead);

  await t.save(step, draft);
  await t.reply(await promptFor(t, step, lead));
}

function joinLead(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join("\n\n") || undefined;
}

/** Repeats the current question (after help, a stray message, or a stale button tap). */
async function reprompt(t: Turn, lead?: string) {
  if (t.step === "ASK_SOLD_WHICH") return t.reply(await promptFor(t, t.step, lead));
  if (!isInFlow(t.step) || t.step === "SUBMITTING") return sendMenu(t, lead);
  await t.reply(await promptFor(t, t.step, lead));
}

function liveCities() {
  return db.city.findMany({ where: { isLive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 10 });
}

const LAND_TYPE_HINTS: Record<LandType, string> = {
  AGRICULTURAL: "Khet / farmland, orchard",
  RESIDENTIAL_PLOT: "Plot for a house, in a colony or village",
  COMMERCIAL: "Shop, showroom, market road",
  INDUSTRIAL: "Factory, warehouse, godown",
  OTHER: "Any other kind of land",
};

const UNIT_ROWS: { unit: AreaUnit; title: string; description: string }[] = [
  { unit: "BIGHA", title: "Bigha", description: "Common for farmland" },
  { unit: "BISWA", title: "Biswa", description: "1 Bigha = 20 Biswa" },
  { unit: "MARLA", title: "Marla", description: "Punjab, Haryana, Chandigarh" },
  { unit: "KANAL", title: "Kanal", description: "1 Kanal = 20 Marla" },
  { unit: "ACRE", title: "Acre / Killa", description: "43,560 sq ft" },
  { unit: "SQFT", title: "Square feet", description: "Common for house plots" },
  { unit: "SQYD", title: "Gaj (sq yd)", description: "1 Gaj = 9 sq ft" },
  { unit: "SQM", title: "Square metre", description: "≈ 10.76 sq ft" },
  { unit: "HECTARE", title: "Hectare", description: "≈ 2.47 acres" },
];

async function promptFor(t: Turn, step: BotStep, lead?: string): Promise<OutgoingMessage> {
  const pre = lead ? `${lead}\n\n` : "";
  const d = t.draft;
  switch (step) {
    case "ASK_NAME": {
      const suggested = t.conv.profileName ? parseName(t.conv.profileName) : null;
      if (suggested && suggested.length <= 40) {
        return {
          type: "buttons",
          body: `${pre}First, what is your *name*?\n\nShould we use *${suggested}*? Tap the button, or just type your name.`,
          buttons: [{ id: "name:profile", title: `Yes, ${firstName(suggested)}`.slice(0, 20) }],
        };
      }
      return { type: "text", text: `${pre}First, what is your *name*? (e.g. Ramesh Yadav)` };
    }
    case "ASK_SELLER_TYPE":
      return {
        type: "buttons",
        body: `${pre}Are you the *owner* of this land, or a *broker / agent*?`,
        buttons: [
          { id: "seller:OWNER", title: "I'm the owner" },
          { id: "seller:BROKER", title: "I'm a broker" },
        ],
      };
    case "ASK_LAND_TYPE":
      return {
        type: "list",
        body: `${pre}What kind of land is it?`,
        buttonLabel: "Choose land type",
        rows: LAND_TYPE_ORDER.map((lt) => ({ id: `type:${lt}`, title: landTypeLabel(lt), description: LAND_TYPE_HINTS[lt] })),
      };
    case "ASK_CITY": {
      const cities = await liveCities();
      return {
        type: "list",
        body: `${pre}Which city / district is the land in?`,
        buttonLabel: "Choose city",
        rows: cities.map((c) => ({ id: `city:${c.id}`, title: c.name, description: `${c.district}, ${c.state}` })),
      };
    }
    case "ASK_LOCALITY":
      return {
        type: "text",
        text: `${pre}📍 Which *village or area* is the land in? Please add a nearby *landmark* too, so buyers can find it.\n\n_e.g. Rampur, near Panchayat Bhawan — or Sector 70, opposite the market_`,
      };
    case "ASK_AREA":
      return {
        type: "text",
        text: `${pre}📐 How big is the land? Send the size with the unit — e.g. *2 bigha*, *10 marla*, *1 kanal*, *1.5 acre*, *1200 sq ft* or *200 gaj*.`,
      };
    case "ASK_AREA_UNIT":
      return {
        type: "list",
        body: `${pre}*${formatNumberPlain(d.pendingArea ?? 0)}* — in which unit?`,
        buttonLabel: "Choose unit",
        rows: UNIT_ROWS.map((u) => ({ id: `unit:${u.unit}`, title: u.title, description: u.description })),
      };
    case "ASK_PRICE":
      return {
        type: "text",
        text: `${pre}💰 What is the *total asking price* for the whole land? e.g. *18 lakh*, *1.2 crore* or *1800000*.`,
      };
    case "ASK_PHOTOS": {
      const count = d.photos?.length ?? 0;
      return {
        type: "buttons",
        body:
          count > 0
            ? `${pre}📸 You've sent ${count} photo${count === 1 ? "" : "s"} so far. Send more (up to ${MAX_PHOTOS}), or tap *Done*.`
            : `${pre}📸 Now send *photos* of the land — up to ${MAX_PHOTOS}. Plots with photos get *far more enquiries* from buyers.\n\nTip: show the road, the boundary and the full plot. Send them, then tap *Done*.`,
        buttons: [
          { id: "photos:done", title: "Done" },
          { id: "photos:skip", title: "Skip photos" },
        ],
      };
    }
    case "ASK_LOCATION":
      return {
        type: "buttons",
        body: `${pre}🗺️ Can you share the land's *location pin*? Tap 📎 → *Location* → send the spot on the map (easiest when you're at the plot).\n\nBuyers only see the approximate area, never the exact pin.`,
        buttons: [{ id: "loc:skip", title: "Skip" }],
      };
    case "ASK_DESCRIPTION":
      return {
        type: "buttons",
        body: `${pre}✍️ Last step: tell buyers about the land in a line or two — road width, electricity, water, boundary, distance to the highway or market, papers ready, etc.\n\nOr tap *Skip* and we'll write a short description for you.`,
        buttons: [{ id: "desc:skip", title: "Skip" }],
      };
    case "ASK_SOLD_WHICH": {
      const ids = d.soldChoices ?? [];
      const found = await db.property.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, code: true, price: true } });
      const plots = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is SoldCandidate => Boolean(p));
      return whichSoldMessage(plots, lead, true);
    }
    case "CONFIRM":
      return {
        type: "buttons",
        body: `${pre}${summary(t)}\n\nAll correct? Tap *Submit* and our team will verify and publish it.`,
        buttons: [
          { id: "confirm:submit", title: "Submit ✅" },
          { id: "confirm:restart", title: "Start over" },
          { id: "confirm:cancel", title: "Cancel" },
        ],
      };
    default:
      return { type: "text", text: `${pre}Send *SELL* to list your land, or *HELP* to see what I can do.` };
  }
}

function summary(t: Turn): string {
  const d = t.draft;
  const name = t.seller?.name ?? d.name;
  const sellerType = t.seller?.sellerType ?? d.sellerType;
  const lines = ["📋 *Please check your listing*", ""];
  if (d.landType && d.area && d.areaUnit && d.locality) {
    lines.push(`🏷️ *${buildTitle({ area: d.area, areaUnit: d.areaUnit, landType: d.landType, locality: d.locality, village: d.village })}*`);
  }
  if (d.landType) lines.push(`🌾 Type: ${landTypeLabel(d.landType)}`);
  if (d.locality) lines.push(`📍 Place: ${d.locality}${d.cityName ? `, ${d.cityName}` : ""}`);
  if (d.area && d.areaUnit) lines.push(`📐 Size: ${formatArea(d.area, d.areaUnit)}${sqftHintFor(d.area, d.areaUnit)}`);
  if (d.price) lines.push(`💰 Price: ${formatPrice(d.price)} (total, negotiable)`);
  lines.push(`📸 Photos: ${d.photos?.length ? d.photos.length : "none"}`);
  lines.push(`🗺️ Location pin: ${d.latitude !== undefined && d.longitude !== undefined ? "shared ✓" : "not shared"}`);
  if (name) lines.push(`👤 Seller: ${name}${sellerType ? ` (${sellerType === "OWNER" ? "Owner" : "Broker"})` : ""}`);
  if (d.description) {
    const desc = d.description.length > 280 ? `${d.description.slice(0, 277)}…` : d.description;
    lines.push("", `📝 ${desc}`);
  }
  return lines.join("\n");
}

/** "(≈ 2.47 acres)" for fixed units. Bigha/Biswa and Marla/Kanal vary by region (City row), so no hint for them here. */
function sqftHintFor(area: number, unit: AreaUnit): string {
  if (unit === "SQFT" || unit === "BIGHA" || unit === "BISWA" || unit === "MARLA" || unit === "KANAL") return "";
  return ` (${formatSqftHint(toSqft(area, unit, 0))})`;
}

/** Answers to the current question. */
async function handleStep(t: Turn, input: BotInput & { text?: string }) {
  const { replyId, text } = input;
  const d = t.draft;

  switch (t.step) {
    case "ASK_SOLD_WHICH":
      return reprompt(t);

    case "IDLE":
    case "SUBMITTING":
      if (input.kind === "location") return sendMenu(t, "Thanks for the location 📍");
      return sendMenu(t);

    case "ASK_NAME": {
      let name: string | null = null;
      if (replyId === "name:profile" || (text && /^yes\b/i.test(text))) name = t.conv.profileName ? parseName(t.conv.profileName) : null;
      if (!name && text) name = parseName(text);
      if (!name) return reprompt(t, "Please type your name (just your name, e.g. *Ramesh Yadav*).");
      return acceptName(t, name);
    }

    case "ASK_SELLER_TYPE": {
      const fromId = replyId?.startsWith("seller:") ? replyId.slice(7) : null;
      const type: SellerType | null = fromId === "OWNER" || fromId === "BROKER" ? fromId : text ? parseSellerType(text) : null;
      if (!type) return reprompt(t, "Please tap one of the buttons 👇");
      return advance(t, "ASK_SELLER_TYPE", { ...d, sellerType: type }, type === "OWNER" ? "Great, thank you! 🙏" : "Great — brokers are very welcome. 🤝");
    }

    case "ASK_LAND_TYPE": {
      const fromId = replyId?.startsWith("type:") ? replyId.slice(5) : null;
      const landType = fromId && fromId in LAND_TYPES ? (fromId as LandType) : text ? parseLandType(text) : null;
      if (!landType) return reprompt(t, "Please choose the land type from the list 👇");
      return advance(t, "ASK_LAND_TYPE", { ...d, landType }, `${landTypeLabel(landType)} ✓`);
    }

    case "ASK_CITY": {
      const cities = await liveCities();
      const fromId = replyId?.startsWith("city:") ? replyId.slice(5) : null;
      const key = text ? normalizeInput(text) : "";
      const city =
        cities.find((c) => c.id === fromId) ??
        (key ? cities.find((c) => c.name.toLowerCase() === key || c.slug === key || key.includes(c.name.toLowerCase())) : undefined);
      if (!city) return reprompt(t, "Please choose a city from the list 👇");
      return advance(t, "ASK_CITY", { ...d, cityId: city.id, cityName: city.name }, `📍 City: *${city.name}*`);
    }

    case "ASK_LOCALITY": {
      if (input.kind === "location") return reprompt(t, "Thanks! I'll ask for the pin in a moment — first, please *type* the village or area name.");
      const locality = cleanFreeText(text ?? "", 120);
      if (locality.length < 2 || !/\p{L}/u.test(locality)) return reprompt(t, "Please type the village or area name.");
      return advance(t, "ASK_LOCALITY", { ...d, locality, village: villageFrom(locality) }, `📍 *${locality}* ✓`);
    }

    case "ASK_AREA": {
      if (!text) return reprompt(t);
      const parsed = parseArea(text);
      if (parsed) return acceptArea(t, parsed.area, parsed.unit);
      const n = parseNumber(text);
      if (n && n > 0) return goTo(t, "ASK_AREA_UNIT", { ...d, pendingArea: n });
      return reprompt(t, "Sorry, I didn't get the size 🙏");
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
      return reprompt(t, "Please choose the unit from the list 👇");
    }

    case "ASK_PRICE": {
      if (replyId?.startsWith("price:")) {
        const v = Number(replyId.slice(6));
        if (Number.isFinite(v) && v >= 10_000) return acceptPrice(t, v);
        await t.save("ASK_PRICE", { ...d, suggestedPrice: undefined });
        return reprompt(t, "No problem — please type the total price again.");
      }
      if (!text) return reprompt(t);
      if (d.suggestedPrice && /^(?:no|nahi|nahin|nope|galat|wrong)\b/i.test(text)) {
        await t.save("ASK_PRICE", { ...d, suggestedPrice: undefined });
        return reprompt(t, "No problem — please type the total price again.");
      }
      const price = parsePrice(text);
      if (price && looksLikePerUnitPrice(text)) {
        return reprompt(t, "Please send the *total* price for the whole land, not the rate per unit 🙏");
      }
      if (price) return acceptPrice(t, price);
      // "18" almost always means 18 lakh.
      const n = parseNumber(text);
      if (n && n >= 1 && n < 1000 && /^\d+(?:\.\d+)?$/.test(normalizeInput(text))) {
        const suggestion = Math.round(n * 1_00_000);
        await t.save("ASK_PRICE", { ...d, suggestedPrice: suggestion });
        await t.reply({
          type: "buttons",
          body: `Did you mean *${formatPrice(suggestion)}*?`,
          buttons: [
            { id: `price:${suggestion}`, title: `Yes, ${formatPrice(suggestion)}`.slice(0, 20) },
            { id: "price:no", title: "No" },
          ],
        });
        return;
      }
      return reprompt(t, "Sorry, I didn't get the price 🙏");
    }

    case "ASK_PHOTOS": {
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "photos:done" || /^(?:done|ho gaya|hogaya|ho gya|bas|finish|finished|complete|that'?s all|ok done|next)\b/.test(lowered)) {
        if (!d.photos?.length) {
          return reprompt(t, "You haven't sent any photos yet. Send a few now — or tap *Skip photos* to continue without them.");
        }
        return advance(t, "ASK_PHOTOS", d, `👍 ${d.photos.length} photo${d.photos.length === 1 ? "" : "s"} added.`);
      }
      if (replyId === "photos:skip" || /^(?:skip|no photos?|nahi|nahin|no|later|baad me|baad mein)\b/.test(lowered)) {
        return advance(
          t,
          "ASK_PHOTOS",
          d,
          "Okay, no photos for now. (You can send them to us here later — listings with photos sell faster!)",
        );
      }
      if (input.kind === "location") {
        return advance(t, "ASK_LOCATION", { ...d, latitude: input.latitude, longitude: input.longitude, locationAsked: true }, "📍 Location saved — thank you!");
      }
      return reprompt(t, "Please send photos of the land, or tap a button 👇");
    }

    case "ASK_LOCATION": {
      if (input.kind === "location" && isCoord(input.latitude, input.longitude)) {
        return advance(t, "ASK_LOCATION", { ...d, latitude: input.latitude, longitude: input.longitude, locationAsked: true }, "📍 Location saved — thank you!");
      }
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "loc:skip" || /^(?:skip|no|nahi|nahin|later|not now|don'?t know|pata nahi)\b/.test(lowered)) {
        return advance(t, "ASK_LOCATION", { ...d, locationAsked: true }, "Okay, no problem.");
      }
      const coords = text ? parseCoordinates(text) : null;
      if (coords) return advance(t, "ASK_LOCATION", { ...d, ...coords, locationAsked: true }, "📍 Location saved — thank you!");
      return reprompt(t, "Please send the location pin (📎 → Location), or tap *Skip*.");
    }

    case "ASK_DESCRIPTION": {
      if (replyId === "desc:skip" || (text && /^(?:skip|no|nahi|nahin|nothing|kuch nahi)$/i.test(normalizeInput(text)))) {
        return advance(t, "ASK_DESCRIPTION", { ...d, description: defaultDescription(t), descriptionGenerated: true, features: [] });
      }
      if (input.kind === "location") {
        return reprompt(t, "📍 Got the location! Now please type a short description, or tap *Skip*.");
      }
      const written = cleanFreeText(text ?? "", 1800, true);
      if (!written) return reprompt(t);
      const description = written.length >= 15 ? written : `${defaultDescription(t)} ${written}`;
      return advance(t, "ASK_DESCRIPTION", { ...d, description, descriptionGenerated: false, features: detectFeatures(written) });
    }

    case "CONFIRM": {
      const lowered = text ? normalizeInput(text) : "";
      if (replyId === "confirm:submit" || /^(?:submit|ok|okay|confirm|done|correct|sahi|sahi hai|theek hai|thik hai|submit ✅)\b/.test(lowered)) {
        return submit(t);
      }
      if (/^(?:start over|restart|edit|change|again|dobara)\b/.test(lowered)) return restartDetails(t);
      return reprompt(t, "Tap *Submit* to send it for verification, *Start over* to change something, or *Cancel*.");
    }
  }
}

async function acceptName(t: Turn, name: string) {
  await advance(t, "ASK_NAME", { ...t.draft, name }, `Thanks, ${firstName(name)}! 🙏`);
}

async function acceptArea(t: Turn, area: number, unit: AreaUnit) {
  const { pendingArea, ...rest } = t.draft;
  void pendingArea;
  await advance(t, "ASK_AREA", { ...rest, area, areaUnit: unit }, `📐 *${formatArea(area, unit)}* ✓`);
}

async function acceptPrice(t: Turn, price: number) {
  const { suggestedPrice, ...rest } = t.draft;
  void suggestedPrice;
  await advance(t, "ASK_PRICE", { ...rest, price }, `💰 *${formatPrice(price)}* (total) — noted ✓`);
}

// ───────────────────────────── Photos ─────────────────────────────

async function handleImage(t: Turn, image: StoredImage | null) {
  if (!isInFlow(t.step)) {
    return sendMenu(t, "Thanks for the photo! 📸 To list a plot, tap *List my land* and send the photos when I ask.");
  }
  if (!image) {
    await t.text("Sorry, I couldn't save that photo 🙏 Please try sending it again.");
    return;
  }
  const count = await appendPhoto(t.conv.id, image);
  if (count === null) {
    await t.text(`You've already sent ${MAX_PHOTOS} photos — that's the maximum. 👍`);
    if (t.step === "ASK_PHOTOS") await advance(t, "ASK_PHOTOS", readDraft((await reloadDraft(t.conv.id)) ?? null));
    return;
  }
  t.draft = { ...t.draft, photos: [...(t.draft.photos ?? []), image] };

  if (t.step !== "ASK_PHOTOS") {
    await t.text(`📸 Photo added to your listing (${count} so far).`);
    return;
  }
  if (count >= MAX_PHOTOS) {
    t.draft = readDraft(await reloadDraft(t.conv.id));
    return advance(t, "ASK_PHOTOS", t.draft, `✅ ${MAX_PHOTOS} photos received — that's the maximum. Great set!`);
  }
  await t.reply({
    type: "buttons",
    body: `✅ Photo ${count} received. Send more, or tap *Done*.`,
    buttons: [{ id: "photos:done", title: "Done" }],
  });
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
  const sellerType = seller?.sellerType ?? d.sellerType;
  if (!name) return goTo(t, "ASK_NAME", { ...d, returnToConfirm: true }, "One more thing before we submit:");
  if (!sellerType) return goTo(t, "ASK_SELLER_TYPE", { ...d, returnToConfirm: true }, "One more thing before we submit:");
  if (seller?.isBlocked) {
    await t.save("IDLE", null);
    await t.text("Sorry, we can't accept new listings from this number right now. Send *TALK* if you think this is a mistake.");
    return;
  }

  const parsed = listingInputSchema.safeParse({
    cityId: d.cityId,
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
    return goTo(t, step, fixed, `⚠️ One thing needs fixing: ${issue?.message ?? "please check this answer"}.`);
  }
  const city = await db.city.findUnique({ where: { id: parsed.data.cityId }, select: { id: true, isLive: true } });
  if (!city?.isLive) {
    const { cityId, cityName, ...rest } = d;
    void cityId;
    void cityName;
    return goTo(t, "ASK_CITY", { ...rest, returnToConfirm: true }, "⚠️ Please choose the city again.");
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
      await t.reply(
        {
          type: "text",
          text: `✅ Your land has been submitted.\n\n${property.title}\n${placeName(property)}${d.cityName ? `, ${d.cityName}` : ""} · ${formatPrice(property.price)}\n\nWe'll review it and message you when it's live — usually within a few hours.\n\nSeller ID: *${s.code}*`,
        },
        "system",
      );
    }
    await t.text(
      `🙏 Thank you, ${firstName(s.name)}! We'll message you here as soon as your plot is live.\n\nTo list another plot, send *SELL*. To check your plots, send *STATUS*.`,
    );
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
  await t.reply(
    {
      type: "text",
      previewUrl: false,
      text: `One small step, ${firstName(s.name)}: verify your identity so buyers see *✓ Identity verified* on your listings.\n\nIt takes 2 minutes with DigiLocker. We never show your Aadhaar to anyone.\n\n${site.url}/seller/verify`,
    },
    "system",
  );
}

// ───────────────────────────── Helpers ─────────────────────────────

/** "Other" reads as plain "Land" elsewhere; in the chat we say what it is. */
function landTypeLabel(lt: LandType): string {
  return lt === "OTHER" ? "Other land" : LAND_TYPES[lt].label;
}

function defaultDescription(t: Turn): string {
  const d = t.draft;
  const sellerType = t.seller?.sellerType ?? d.sellerType;
  const what = d.landType ? LAND_TYPES[d.landType].label.toLowerCase() : "land";
  const size = d.area && d.areaUnit ? `${formatArea(d.area, d.areaUnit)} ` : "";
  const where = [d.locality, d.cityName].filter(Boolean).join(", ");
  const by = sellerType === "BROKER" ? "Listed by a local broker." : "Listed directly by the owner.";
  return `${size}${what}${where ? ` in ${where}` : ""}. ${by} Contact the seller on WhatsApp or call for details and a site visit.`.replace(/^./, (c) =>
    c.toUpperCase(),
  );
}

/** "Sathiyaon, near Panchayat Bhawan" → "Sathiyaon" (used in the title). */
function villageFrom(locality: string): string | undefined {
  const head = locality.split(/,|\s+near\s+|\s+ke paas\s+|\s+के पास\s+|\s+opp\.?\s+|\s+opposite\s+/i)[0]?.trim();
  if (!head || head === locality || head.length < 2 || head.length > 60) return undefined;
  return head;
}

function cleanFreeText(text: string, max: number, multiline = false): string {
  let t = text.normalize("NFC").replace(/[​-‍﻿]/g, "");
  t = multiline ? t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : t.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function formatNumberPlain(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function isCoord(lat: number | undefined, lng: number | undefined): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
