import "server-only";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES } from "@/server/storage";
import { describeStep, type BotReply } from "./bot";
import type { InboundMessage } from "./inbound";

/**
 * The chat thread as the seller's phone shows it — shared by the admin
 * simulator and the seller-facing web chat (/sell/chat). Lives outside the
 * "use server" files on purpose: exporting these from an action module would
 * turn them into public endpoints that take any phone number.
 */

export type ChatOption = { id?: string; title: string; description?: string };

export type ChatInteractive = {
  kind: "buttons" | "list";
  /** Body text without the option lines. */
  body: string;
  buttonLabel?: string;
  options: ChatOption[];
};

export type ChatMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string | null;
  mediaUrl: string | null;
  sentBy: string | null;
  createdAt: string;
  /** Known only for bot messages produced in this request (ids aren't stored in the DB). */
  interactive?: ChatInteractive;
};

export type ChatState = {
  phone: string;
  profileName: string | null;
  conversationId: string | null;
  step: string;
  stepLabel: string;
  seller: { id: string; code: string; name: string } | null;
  /** The seller's plots (availability controls and reply suggestions). */
  plots: { live: number; awaiting: number; unavailable: number; pending: number };
  /** Live cities, for suggestions and "drop a pin". */
  cities: { name: string; latitude: number; longitude: number }[];
  /** The chat's language ("en" | "hi"); null until the seller picks one. */
  language: string | null;
  messages: ChatMessage[];
  error?: string;
};

export function emptyChatState(phone: string, error?: string): ChatState {
  return {
    phone,
    profileName: null,
    conversationId: null,
    step: "IDLE",
    stepLabel: describeStep("IDLE"),
    seller: null,
    plots: { live: 0, awaiting: 0, unavailable: 0, pending: 0 },
    cities: [],
    language: null,
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

async function plotCounts(sellerId: string | undefined): Promise<ChatState["plots"]> {
  if (!sellerId) return { live: 0, awaiting: 0, unavailable: 0, pending: 0 };
  const [live, awaiting, unavailable, pending] = await Promise.all([
    db.property.count({ where: { sellerId, status: "ACTIVE" } }),
    db.property.count({ where: { sellerId, status: "ACTIVE", availabilityCheckSentAt: { not: null } } }),
    db.property.count({ where: { sellerId, status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED" } }),
    db.property.count({ where: { sellerId, status: "PENDING" } }),
  ]);
  return { live, awaiting, unavailable, pending };
}

/** Delivery notes the admin inbox appends ("⚠️ Not delivered — …") mean nothing to the seller. */
const DELIVERY_NOTE = /\n\n⚠️ Not delivered — [^\n]*$/;

/**
 * Loads the thread for a number. `replies` are the bot's messages from this
 * turn, so their interactive buttons/lists come back with their ids.
 * `forSeller` drops admin-only delivery notes.
 */
export async function loadChatState(phone: string, replies: BotReply[] = [], opts: { forSeller?: boolean } = {}): Promise<ChatState> {
  const conversation = await db.whatsAppConversation.findUnique({
    where: { phone },
    include: { seller: { select: { id: true, code: true, name: true } } },
  });
  const seller = conversation?.seller ?? (await db.seller.findUnique({ where: { phone }, select: { id: true, code: true, name: true } }));
  const [plots, cities] = await Promise.all([plotCounts(seller?.id), liveCities()]);
  if (!conversation) return { ...emptyChatState(phone), seller, plots, cities };

  const rows = await db.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  const fresh = new Map(replies.filter((r) => r.messageId).map((r) => [r.messageId!, r.message]));

  const messages: ChatMessage[] = rows.reverse().map((m) => {
    const out: ChatMessage = {
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: opts.forSeller && m.body ? m.body.replace(DELIVERY_NOTE, "") : m.body,
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
    language: conversation.language,
    messages,
  };
}

/**
 * Turns the composer's FormData into an inbound message for `from`. The phone
 * is always supplied by the caller — never read from the form here.
 * FormData fields: kind (text | interactive | image | location), text,
 * replyId, replyTitle, latitude, longitude, image (File).
 */
export async function inboundFromForm(
  from: string,
  formData: FormData,
  profileName?: string,
): Promise<{ ok: true; msg: InboundMessage } | { ok: false; error: string | null }> {
  const kind = String(formData.get("kind") ?? "text");
  const base = { from, profileName };

  switch (kind) {
    case "interactive": {
      const replyId = String(formData.get("replyId") ?? "").slice(0, 200) || undefined;
      const replyTitle = String(formData.get("replyTitle") ?? "").slice(0, 200) || undefined;
      if (!replyId && !replyTitle) return { ok: false, error: "Nothing to send." };
      return { ok: true, msg: { ...base, kind: "interactive", replyId, replyTitle } };
    }
    case "image": {
      const file = formData.get("image");
      if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo first." };
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That photo is too large (max 15 MB)." };
      if (!file.type || !file.type.startsWith("image/")) return { ok: false, error: "Only photos can be sent here." };
      const caption = String(formData.get("text") ?? "").trim().slice(0, 1000) || undefined;
      return { ok: true, msg: { ...base, kind: "image", imageBytes: Buffer.from(await file.arrayBuffer()), caption } };
    }
    case "location": {
      const latitude = Number(formData.get("latitude"));
      const longitude = Number(formData.get("longitude"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return { ok: false, error: "That location couldn't be read. Please try again." };
      }
      return { ok: true, msg: { ...base, kind: "location", latitude, longitude } };
    }
    default: {
      const text = String(formData.get("text") ?? "").trim().slice(0, 4000);
      if (!text) return { ok: false, error: null };
      return { ok: true, msg: { ...base, kind: "text", text } };
    }
  }
}
