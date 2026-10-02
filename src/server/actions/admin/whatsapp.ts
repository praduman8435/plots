"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/require";
import { formatPrice } from "@/lib/format";
import { placeName } from "@/lib/land";
import { normalizePhoneNumber } from "@/lib/phone";
import { changeListingStatus, plotsAwaitingAvailability } from "@/server/listings/service";
import { MAX_UPLOAD_BYTES } from "@/server/storage";
import { describeStep, toBotStep, type BotReply } from "@/server/whatsapp/bot";
import type { OutgoingMessage } from "@/server/whatsapp/client";
import { processInbound, type InboundMessage } from "@/server/whatsapp/inbound";
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

export type SimOption = { id?: string; title: string; description?: string };

export type SimInteractive = {
  kind: "buttons" | "list";
  /** Body text without the option lines. */
  body: string;
  buttonLabel?: string;
  options: SimOption[];
};

export type SimMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string | null;
  mediaUrl: string | null;
  sentBy: string | null;
  createdAt: string;
  /** Known only for bot messages produced in this session (ids aren't stored in the DB). */
  interactive?: SimInteractive;
};

export type SimState = {
  phone: string;
  profileName: string | null;
  conversationId: string | null;
  step: string;
  stepLabel: string;
  seller: { id: string; code: string; name: string } | null;
  /** The seller's plots, for the availability dev controls. */
  plots: { live: number; awaiting: number; unavailable: number; pending: number };
  /** Live cities, for suggestions and "drop a pin". */
  cities: { name: string; latitude: number; longitude: number }[];
  messages: SimMessage[];
  error?: string;
};

/** Loads the simulated chat for a number. */
export async function simulatorLoad(phoneInput: string): Promise<SimState> {
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
export async function simulatorSend(formData: FormData): Promise<SimState> {
  await requireAdmin();
  const phone = normalizePhoneNumber(String(formData.get("phone") ?? ""));
  if (!phone.valid) return emptyState(String(formData.get("phone") ?? ""), "Enter a valid 10-digit Indian mobile number.");

  const kind = String(formData.get("kind") ?? "text");
  const profileName = String(formData.get("profileName") ?? "").trim().slice(0, 80) || undefined;
  const base = { from: phone.normalized, profileName };
  let msg: InboundMessage;

  switch (kind) {
    case "interactive": {
      const replyId = String(formData.get("replyId") ?? "") || undefined;
      const replyTitle = String(formData.get("replyTitle") ?? "") || undefined;
      if (!replyId && !replyTitle) return { ...(await loadState(phone.normalized)), error: "Nothing to send." };
      msg = { ...base, kind: "interactive", replyId, replyTitle };
      break;
    }
    case "image": {
      const file = formData.get("image");
      if (!(file instanceof File) || file.size === 0) return { ...(await loadState(phone.normalized)), error: "Choose a photo first." };
      if (file.size > MAX_UPLOAD_BYTES) return { ...(await loadState(phone.normalized)), error: "That photo is too large." };
      if (file.type && !file.type.startsWith("image/")) return { ...(await loadState(phone.normalized)), error: "Only photos can be attached." };
      const caption = String(formData.get("text") ?? "").trim() || undefined;
      msg = { ...base, kind: "image", imageBytes: Buffer.from(await file.arrayBuffer()), caption };
      break;
    }
    case "location": {
      const latitude = Number(formData.get("latitude"));
      const longitude = Number(formData.get("longitude"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ...(await loadState(phone.normalized)), error: "Invalid location." };
      msg = { ...base, kind: "location", latitude, longitude };
      break;
    }
    default: {
      const text = String(formData.get("text") ?? "").trim().slice(0, 4000);
      if (!text) return loadState(phone.normalized);
      msg = { ...base, kind: "text", text };
    }
  }

  const result = await processInbound(msg, { simulate: true });
  return loadState(phone.normalized, result.replies);
}

/** Deletes a simulated chat so a demo can start fresh. Refuses threads with real WhatsApp traffic. */
export async function simulatorReset(phoneInput: string): Promise<SimState> {
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
export async function simulatorAvailabilityCheck(phoneInput: string): Promise<SimState> {
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
export async function simulatorNoReply(phoneInput: string): Promise<SimState> {
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

function emptyState(phone: string, error?: string): SimState {
  return {
    phone,
    profileName: null,
    conversationId: null,
    step: "IDLE",
    stepLabel: describeStep("IDLE"),
    seller: null,
    plots: { live: 0, awaiting: 0, unavailable: 0, pending: 0 },
    cities: [],
    messages: [],
    error,
  };
}

function liveCities() {
  return db.city.findMany({
    where: { isLive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 5,
    select: { name: true, latitude: true, longitude: true },
  });
}

async function plotCounts(sellerId: string | undefined): Promise<SimState["plots"]> {
  if (!sellerId) return { live: 0, awaiting: 0, unavailable: 0, pending: 0 };
  const [live, awaiting, unavailable, pending] = await Promise.all([
    db.property.count({ where: { sellerId, status: "ACTIVE" } }),
    db.property.count({ where: { sellerId, status: "ACTIVE", availabilityCheckSentAt: { not: null } } }),
    db.property.count({ where: { sellerId, status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED" } }),
    db.property.count({ where: { sellerId, status: "PENDING" } }),
  ]);
  return { live, awaiting, unavailable, pending };
}

async function loadState(phone: string, replies: BotReply[] = []): Promise<SimState> {
  const conversation = await db.whatsAppConversation.findUnique({
    where: { phone },
    include: { seller: { select: { id: true, code: true, name: true } } },
  });
  const seller = conversation?.seller ?? (await db.seller.findUnique({ where: { phone }, select: { id: true, code: true, name: true } }));
  const [plots, cities] = await Promise.all([plotCounts(seller?.id), liveCities()]);
  if (!conversation) return { ...emptyState(phone), seller, plots, cities };

  const rows = await db.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  const fresh = new Map(replies.filter((r) => r.messageId).map((r) => [r.messageId!, r.message]));

  const messages: SimMessage[] = rows.reverse().map((m) => {
    const out: SimMessage = {
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      mediaUrl: m.mediaUrl,
      sentBy: m.sentBy,
      createdAt: m.createdAt.toISOString(),
    };
    const sent = fresh.get(m.id);
    if (sent?.type === "buttons") {
      out.interactive = { kind: "buttons", body: sent.body, options: sent.buttons.map((b) => ({ id: b.id, title: b.title })) };
    } else if (sent?.type === "list") {
      out.interactive = {
        kind: "list",
        body: sent.body,
        buttonLabel: sent.buttonLabel,
        options: sent.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
      };
    }
    return out;
  });

  return {
    phone,
    profileName: conversation.profileName,
    conversationId: conversation.id,
    step: conversation.step,
    stepLabel: describeStep(conversation.step),
    seller,
    plots,
    cities,
    messages,
  };
}
