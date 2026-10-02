import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { maskPhoneForLogging, normalizePhoneNumber } from "@/lib/phone";
import { processInbound, type InboundMessage } from "@/server/whatsapp/inbound";

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — subscription verification (hub.mode / hub.verify_token / hub.challenge).
 * POST — inbound messages. The raw body is authenticated with
 *        X-Hub-Signature-256 (HMAC-SHA256 with WHATSAPP_APP_SECRET), then each
 *        message is handed to the listing assistant. Delivery statuses are
 *        ignored. Always answers 200 once authenticated, so Meta doesn't
 *        retry messages we already stored (retries are de-duplicated anyway).
 */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token && safeEqual(token, expected) && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    if (!isValidSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("whatsapp-webhook: WHATSAPP_APP_SECRET is not set — rejecting unauthenticated webhook");
    return new Response("Webhook not configured", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  for (const msg of parseWebhookPayload(payload)) {
    try {
      await processInbound(msg);
    } catch (err) {
      console.error("whatsapp-webhook: failed to process message", {
        from: maskPhoneForLogging(msg.from),
        kind: msg.kind,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return Response.json({ ok: true });
}

function isValidSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ───────────────────────────── Payload parsing ─────────────────────────────

type MetaMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { payload?: string; text?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  location?: { latitude?: number | string; longitude?: number | string; name?: string; address?: string };
};

type MetaValue = {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: MetaMessage[];
  statuses?: unknown[];
};

type MetaPayload = {
  object?: string;
  entry?: { changes?: { field?: string; value?: MetaValue }[] }[];
};

/** Meta's webhook body → normalised inbound messages. Unknown shapes are skipped. */
function parseWebhookPayload(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const body = payload as MetaPayload;
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field && change.field !== "messages") continue;
      const value = change?.value;
      if (!value?.messages?.length) continue; // e.g. delivery/read statuses only

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);

      for (const m of value.messages) {
        const parsed = toInbound(m, m.from ? names.get(m.from) : undefined);
        if (parsed) out.push(parsed);
      }
    }
  }
  return out;
}

function toE164(waId: string): string | null {
  const india = normalizePhoneNumber(`+${waId}`);
  if (india.valid) return india.normalized;
  const digits = waId.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Our interactive reply ids look like "avail:yes", "sold:yes:<id>", "nosold:<id>". */
const REPLY_ID = /^[a-z]+:[A-Za-z0-9:_-]+$/;

function toInbound(m: MetaMessage, profileName: string | undefined): InboundMessage | null {
  if (!m.from) return null;
  const from = toE164(m.from);
  if (!from) return null;
  const base = { from, profileName, waMessageId: m.id };

  switch (m.type) {
    case "text":
      return { ...base, kind: "text", text: m.text?.body ?? "" };
    case "interactive": {
      const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
      if (!reply) return { ...base, kind: "other", otherType: `interactive:${m.interactive?.type ?? "unknown"}` };
      return { ...base, kind: "interactive", replyId: reply.id, replyTitle: reply.title };
    }
    case "button": {
      // Quick-reply button on a template message (e.g. the weekly availability
      // check outside the 24h window). Its payload is one of our reply ids
      // ("avail:yes") when the template sets one, otherwise just the button
      // text ("Yes", "NO, it's sold") — the assistant reads that like a typed reply.
      const payload = m.button?.payload?.trim();
      const title = m.button?.text?.trim() || payload;
      if (payload && REPLY_ID.test(payload)) return { ...base, kind: "interactive", replyId: payload, replyTitle: title };
      if (!title) return { ...base, kind: "other", otherType: "button" };
      return { ...base, kind: "interactive", replyTitle: title };
    }
    case "image":
      return { ...base, kind: "image", imageMediaId: m.image?.id, caption: m.image?.caption };
    case "location": {
      const latitude = Number(m.location?.latitude);
      const longitude = Number(m.location?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ...base, kind: "other", otherType: "location" };
      return { ...base, kind: "location", latitude, longitude };
    }
    case "reaction":
    case "system":
    case "ephemeral":
      return null; // a 👍 reaction shouldn't trigger the menu
    default:
      return { ...base, kind: "other", otherType: m.type ?? "unknown" };
  }
}
