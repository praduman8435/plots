"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/require";
import { formatPrice } from "@/lib/format";
import { placeName } from "@/lib/land";
import { normalizePhoneNumber } from "@/lib/phone";
import { changeListingStatus, plotsAwaitingAvailability } from "@/server/listings/service";
import { toBotStep, type BotReply } from "@/server/whatsapp/bot";
import { emptyChatState, inboundFromForm, loadChatState, type ChatState } from "@/server/whatsapp/chat-state";
import type { OutgoingMessage } from "@/server/whatsapp/client";
import { processInbound } from "@/server/whatsapp/inbound";
import { recordOutboundOnly, sendAndRecord } from "@/server/whatsapp/messaging";
import { buildAvailabilityCheckMessage } from "@/server/whatsapp/notify";

// ───────────────────────────── Inbox ─────────────────────────────

/** Admin reply from the inbox thread. Taking part in an idle chat hands it to a person. */
export async function sendAdminReply(formData: FormData): Promise<void> {
  await requireAdmin();
  const conversationId = String(formData.get("conversationId") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 4000);
  if (!conversationId || !text) return;

  const conversation = await db.whatsAppConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  await sendAndRecord(conversation.phone, { type: "text", text }, "admin");
  await db.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      unreadCount: 0,
      // So the bot doesn't answer the seller's reply to a person with its menu.
      ...(toBotStep(conversation.step) === "IDLE" ? { step: "HUMAN" } : {}),
    },
  });
  refresh();
}

/** "Take over" (HUMAN: the bot stays silent) or "Hand back to the assistant" (IDLE). */
export async function setConversationMode(formData: FormData): Promise<void> {
  await requireAdmin();
  const conversationId = String(formData.get("conversationId") ?? "");
  const mode = formData.get("mode") === "HUMAN" ? "HUMAN" : "IDLE";
  if (!conversationId) return;
  await db.whatsAppConversation.updateMany({ where: { id: conversationId }, data: { step: mode } });
  refresh();
}

// ───────────────────────────── Simulator ─────────────────────────────

// The chat state is shared with the seller-facing web chat (src/server/whatsapp/chat-state.ts).
export type {
  ChatInteractive as SimInteractive,
  ChatMessage as SimMessage,
  ChatOption as SimOption,
  ChatState as SimState,
} from "@/server/whatsapp/chat-state";

/** Loads the simulated chat for a number. */
export async function simulatorLoad(phoneInput: string): Promise<ChatState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone.valid) return emptyState(phoneInput, "Enter a valid 10-digit Indian mobile number.");
  return loadState(phone.normalized);
}

/**
 * Sends one simulated inbound message. FormData fields: phone, profileName,
 * kind (text | interactive | image | location), text, replyId, replyTitle,
 * latitude, longitude, image (File).
 */
export async function simulatorSend(formData: FormData): Promise<ChatState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(String(formData.get("phone") ?? ""));
  if (!phone.valid) return emptyState(String(formData.get("phone") ?? ""), "Enter a valid 10-digit Indian mobile number.");

  const profileName = String(formData.get("profileName") ?? "").trim().slice(0, 80) || undefined;
  const parsed = await inboundFromForm(phone.normalized, formData, profileName);
  if (!parsed.ok) return { ...(await loadState(phone.normalized)), ...(parsed.error ? { error: parsed.error } : {}) };

  const result = await processInbound(parsed.msg, { simulate: true });
  return loadState(phone.normalized, result.replies);
}

/** Deletes a simulated chat so a demo can start fresh. Refuses threads with real WhatsApp traffic. */
export async function simulatorReset(phoneInput: string): Promise<ChatState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone.valid) return emptyState(phoneInput, "Enter a valid 10-digit Indian mobile number.");
  const conversation = await db.whatsAppConversation.findUnique({ where: { phone: phone.normalized }, select: { id: true } });
  if (conversation) {
    const real = await db.whatsAppMessage.count({ where: { conversationId: conversation.id, waMessageId: { not: null } } });
    if (real > 0) {
      return { ...(await loadState(phone.normalized)), error: "This number has real WhatsApp messages — its chat can't be reset here." };
    }
    await db.whatsAppConversation.delete({ where: { id: conversation.id } });
  }
  return loadState(phone.normalized);
}

// ───────────────────────────── Simulator: weekly availability (dev controls) ─────────────────────────────

/**
 * "Send weekly availability check" — does what runAvailabilityChecks does for
 * this seller's live plots (stamps the attempt and the 24h timer) and records
 * the same message in the chat. Never sends anything to WhatsApp.
 */
export async function simulatorAvailabilityCheck(phoneInput: string): Promise<ChatState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone.valid) return emptyState(phoneInput, "Enter a valid 10-digit Indian mobile number.");
  const seller = await db.seller.findUnique({ where: { phone: phone.normalized }, select: { id: true } });
  if (!seller) return { ...(await loadState(phone.normalized)), error: "This number isn't a seller yet — list a plot first." };

  const now = new Date();
  const stamped = await db.property.updateMany({
    where: { sellerId: seller.id, status: "ACTIVE" },
    data: { lastAvailabilityCheckAt: now, availabilityCheckSentAt: now },
  });
  if (stamped.count === 0) {
    return { ...(await loadState(phone.normalized)), error: "No live plots to ask about — approve this seller's plot in Listings first." };
  }
  // Same plots, same order (oldest first) as the seller's NO <number> replies use.
  const awaiting = await plotsAwaitingAvailability(seller.id);
  const plots = await db.property.findMany({
    where: { id: { in: awaiting.map((p) => p.id) } },
    include: { city: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const { message } = buildAvailabilityCheckMessage(plots);
  const messageId = await recordOutboundOnly(phone.normalized, message, "system");
  return loadState(phone.normalized, [{ messageId, message }]);
}

/**
 * "Simulate 24h with no reply" — hides this seller's plots that are awaiting
 * a reply (HIDDEN · AVAILABILITY_UNCONFIRMED), like the weekly job does, and
 * records the "We didn't hear back…" message for each. Never sends.
 */
export async function simulatorNoReply(phoneInput: string): Promise<ChatState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone.valid) return emptyState(phoneInput, "Enter a valid 10-digit Indian mobile number.");
  const seller = await db.seller.findUnique({ where: { phone: phone.normalized }, select: { id: true } });
  const awaiting = seller ? await plotsAwaitingAvailability(seller.id) : [];
  if (awaiting.length === 0) {
    return { ...(await loadState(phone.normalized)), error: "Nothing is waiting for a reply — send the weekly availability check first." };
  }
  const plots = await db.property.findMany({
    where: { id: { in: awaiting.map((p) => p.id) } },
    include: { city: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const p of plots) {
    await changeListingStatus(p.id, { type: "HIDE_UNCONFIRMED" }, { notify: false, via: "cron" });
    // Mirrors notifySeller(…, "LISTING_UNAVAILABLE").
    const message: OutgoingMessage = {
      type: "text",
      text: `We didn't hear back, so we've hidden your property from buyers for now.\n\n${p.title}\n${placeName(p)}, ${p.city.name} · ${formatPrice(p.price)}\n\nStill available? Reply *YES* and it goes live again.`,
    };
    await recordOutboundOnly(phone.normalized, message, "system");
  }
  return loadState(phone.normalized);
}

const emptyState = emptyChatState;
const loadState = (phone: string, replies?: BotReply[]) => loadChatState(phone, replies);
