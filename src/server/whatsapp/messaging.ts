import "server-only";
import { db } from "@/lib/db";
import { sendWhatsAppMessage, type OutgoingMessage } from "./client";
import { isWhatsAppConfigured } from "./config";

/** WhatsApp only allows free-form messages within 24h of the user's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isServiceWindowOpen(lastInboundAt: Date | null | undefined): boolean {
  return Boolean(lastInboundAt && Date.now() - lastInboundAt.getTime() < SERVICE_WINDOW_MS);
}

export async function getOrCreateConversation(phone: string, profileName?: string) {
  const seller = await db.seller.findUnique({ where: { phone }, select: { id: true } });
  return db.whatsAppConversation.upsert({
    where: { phone },
    create: { phone, profileName, sellerId: seller?.id },
    update: { ...(profileName ? { profileName } : {}), ...(seller ? { sellerId: seller.id } : {}) },
  });
}

/**
 * Sends a message and records it in the conversation thread (so the admin
 * inbox shows everything the bot and admins said). Never throws: returns
 * false if delivery failed, so callers like "approve listing" never fail
 * because a notification couldn't be sent.
 */
export async function sendAndRecord(
  phone: string,
  message: OutgoingMessage,
  sentBy: "bot" | "admin" | "system",
): Promise<boolean> {
  const conversation = await getOrCreateConversation(phone);

  // Free-form messages outside the 24h window are rejected by Meta. In local
  // dev (no credentials) everything goes to the outbox, so allow it there.
  if (message.type !== "template" && isWhatsAppConfigured() && !isServiceWindowOpen(conversation.lastInboundAt)) {
    await recordOutbound(conversation.id, message, sentBy, null, "Not delivered — outside WhatsApp's 24-hour reply window");
    return false;
  }

  try {
    const waMessageId = await sendWhatsAppMessage(phone, message, `${sentBy}:${message.type}`);
    await recordOutbound(conversation.id, message, sentBy, waMessageId || null);
    return true;
  } catch {
    await recordOutbound(conversation.id, message, sentBy, null, "Not delivered — WhatsApp send failed");
    return false;
  }
}

/**
 * Records an outbound message in the thread WITHOUT sending it — used by the
 * admin simulator, where the bot's replies must never reach Meta. Returns
 * the stored message id.
 */
export async function recordOutboundOnly(
  phone: string,
  message: OutgoingMessage,
  sentBy: "bot" | "admin" | "system",
): Promise<string> {
  const conversation = await getOrCreateConversation(phone);
  return recordOutbound(conversation.id, message, sentBy, null);
}

async function recordOutbound(
  conversationId: string,
  message: OutgoingMessage,
  sentBy: string,
  waMessageId: string | null,
  failureNote?: string,
): Promise<string> {
  const body =
    message.type === "text"
      ? message.text
      : message.type === "template"
        ? `[template ${message.templateName}] ${message.bodyParameters.join(" · ")}`
        : message.type === "buttons"
          ? `${message.body}\n\n${message.buttons.map((b) => `▸ ${b.title}`).join("\n")}`
          : `${message.body}\n\n${message.rows.map((r) => `▸ ${r.title}`).join("\n")}`;

  const created = await db.whatsAppMessage.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      type: message.type === "text" || message.type === "template" ? message.type : "interactive",
      body: failureNote ? `${body}\n\n⚠️ ${failureNote}` : body,
      waMessageId: waMessageId && !waMessageId.startsWith("dev-") ? waMessageId : null,
      sentBy,
    },
  });
  await db.whatsAppConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return created.id;
}
