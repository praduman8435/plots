import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { maskPhoneForLogging } from "@/lib/phone";
import { saveImage, type StoredImage } from "@/server/storage";
import { runBot, type BotReply } from "./bot";
import { downloadWhatsAppMedia } from "./client";
import { getOrCreateConversation } from "./messaging";

/** One inbound WhatsApp message, normalised from Meta's webhook (or the admin simulator). */
export type InboundMessage = {
  /** E.164, e.g. +919876543210 */
  from: string;
  profileName?: string;
  /** Meta's message id — used to process webhook retries only once. */
  waMessageId?: string;
  kind: "text" | "interactive" | "image" | "location" | "other";
  text?: string;
  /** Interactive reply id (button_reply / list_reply / template button payload). */
  replyId?: string;
  replyTitle?: string;
  /** Meta media id of an inbound photo (downloaded here). */
  imageMediaId?: string;
  /** Raw photo bytes (simulator only). */
  imageBytes?: Buffer;
  caption?: string;
  latitude?: number;
  longitude?: number;
  /** Meta's original type for kind "other" (audio, sticker, video, document…). */
  otherType?: string;
};

export type ProcessResult = {
  conversationId: string | null;
  duplicate: boolean;
  /** What the bot said this turn (ids are only known in simulation mode). */
  replies: BotReply[];
};

/**
 * Stores an inbound message and lets the listing assistant answer it.
 *
 * Messages from one number are processed one at a time (sellers often send
 * several photos at once), and webhook retries are skipped via waMessageId.
 * With `simulate`, nothing is ever sent to Meta — replies are only recorded.
 */
export function processInbound(msg: InboundMessage, opts: { simulate?: boolean } = {}): Promise<ProcessResult> {
  return withPhoneLock(msg.from, () => processLocked(msg, opts));
}

async function processLocked(msg: InboundMessage, opts: { simulate?: boolean }): Promise<ProcessResult> {
  if (msg.waMessageId) {
    const seen = await db.whatsAppMessage.findUnique({ where: { waMessageId: msg.waMessageId }, select: { id: true } });
    if (seen) return { conversationId: null, duplicate: true, replies: [] };
  }

  const conversation = await getOrCreateConversation(msg.from, msg.profileName?.trim().slice(0, 80) || undefined);

  let image: StoredImage | null = null;
  if (msg.kind === "image") image = await storeInboundImage(msg);

  const stored = await storeInbound(conversation.id, msg, image);
  if (!stored) return { conversationId: conversation.id, duplicate: true, replies: [] };

  await db.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: new Date(), unreadCount: { increment: 1 } },
  });

  const replies = await runBot(
    conversation.id,
    {
      kind: msg.kind,
      text: msg.text,
      replyId: msg.replyId,
      replyTitle: msg.replyTitle,
      image,
      latitude: msg.latitude,
      longitude: msg.longitude,
      otherType: msg.otherType,
    },
    { simulate: opts.simulate },
  );
  return { conversationId: conversation.id, duplicate: false, replies };
}

async function storeInboundImage(msg: InboundMessage): Promise<StoredImage | null> {
  try {
    let bytes = msg.imageBytes;
    if (!bytes && msg.imageMediaId) bytes = (await downloadWhatsAppMedia(msg.imageMediaId)).bytes;
    if (!bytes) return null;
    return await saveImage(bytes);
  } catch (err) {
    console.error("whatsapp-inbound: could not store photo", {
      from: maskPhoneForLogging(msg.from),
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Returns false if this waMessageId was stored by a concurrent request (a webhook retry). */
async function storeInbound(conversationId: string, msg: InboundMessage, image: StoredImage | null): Promise<boolean> {
  try {
    await db.whatsAppMessage.create({
      data: {
        conversationId,
        direction: "INBOUND",
        type: messageType(msg.kind),
        body: inboundBody(msg, image),
        mediaUrl: image?.url ?? null,
        waMessageId: msg.waMessageId ?? null,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

function messageType(kind: InboundMessage["kind"]): string {
  return kind === "other" ? "unsupported" : kind;
}

function inboundBody(msg: InboundMessage, image: StoredImage | null): string | null {
  switch (msg.kind) {
    case "text":
      return msg.text ?? "";
    case "interactive":
      return msg.replyTitle ?? msg.replyId ?? "";
    case "image":
      if (!image) return msg.caption ? `${msg.caption}\n\n⚠️ Photo could not be saved` : "⚠️ Photo could not be saved";
      return msg.caption ?? null;
    case "location":
      // "lat,lng" — the admin inbox turns this into a map link.
      return typeof msg.latitude === "number" && typeof msg.longitude === "number"
        ? `${msg.latitude.toFixed(6)},${msg.longitude.toFixed(6)}`
        : null;
    case "other":
      return `[${msg.otherType ?? "unsupported"} message]`;
  }
}

// One in-flight turn per phone number in this process, so near-simultaneous
// webhooks (5 photos sent together) don't race on the conversation draft.
// Photo appends are additionally atomic in SQL (see bot.ts appendPhoto).
const locks = new Map<string, Promise<unknown>>();

async function withPhoneLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(phone) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(phone, tail);
  try {
    return await run;
  } finally {
    if (locks.get(phone) === tail) locks.delete(phone);
  }
}
