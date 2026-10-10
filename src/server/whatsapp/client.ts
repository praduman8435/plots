import "server-only";
import { isDemoMode } from "@/lib/demo";
import { maskPhoneForLogging } from "@/lib/phone";
import { getWhatsAppTransportConfig, isWhatsAppConfigured } from "./config";

/**
 * The ONE low-level Meta WhatsApp Cloud API client (ported from the shop
 * project). Retry discipline: only a network-level failure is retried, and
 * only once — an HTTP response (even 5xx) means Meta may already have
 * queued the message, so a retry could double-send.
 *
 * Without credentials outside production, sends go to the dev outbox
 * (server console) so every flow works locally.
 */

const MAX_SEND_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

export type OutgoingMessage =
  | { type: "text"; text: string; previewUrl?: boolean }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[]; footer?: string }
  | {
      type: "list";
      body: string;
      buttonLabel: string;
      rows: { id: string; title: string; description?: string }[];
      footer?: string;
    }
  | {
      type: "template";
      templateName: string;
      language?: string;
      bodyParameters: string[];
      /** Authentication templates: the code again for the "Copy code" button (Meta rejects the send without it). */
      copyCode?: string;
    };

/** Builds Meta's request body. Exported for tests. */
export function toMetaPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, "") };
  switch (message.type) {
    case "text":
      return { ...base, type: "text", text: { body: message.text, preview_url: message.previewUrl ?? false } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            // Meta: max 3 buttons, titles ≤ 20 chars.
            buttons: message.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            button: message.buttonLabel.slice(0, 20),
            // Meta: max 10 rows, titles ≤ 24 chars, descriptions ≤ 72 chars.
            sections: [
              {
                title: "Options",
                rows: message.rows.slice(0, 10).map((r) => ({
                  id: r.id,
                  title: r.title.slice(0, 24),
                  ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                })),
              },
            ],
          },
        },
      };
    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: message.templateName,
          language: { code: message.language ?? "en" },
          components: [
            { type: "body", parameters: message.bodyParameters.map((text) => ({ type: "text", text })) },
            ...(message.copyCode ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: message.copyCode }] }] : []),
          ],
        },
      };
  }
}

/** Sends one message. Returns Meta's message id (or a dev-outbox id). Throws a plain Error on failure. */
export async function sendWhatsAppMessage(to: string, message: OutgoingMessage, logLabel: string): Promise<string> {
  if (!isWhatsAppConfigured()) {
    // Before Meta is connected (DEMO_MODE), messages live in the in-site chat (/sell/chat) instead.
    if (process.env.NODE_ENV === "production" && !isDemoMode()) throw new Error("WhatsApp is not configured");
    // Message bodies can hold login codes and buyer numbers: print them only on a developer's machine.
    if (process.env.NODE_ENV === "production") console.log(`[whatsapp outbox] to=${maskPhoneForLogging(to)} label=${logLabel}`);
    else console.log(`[DEV WHATSAPP OUTBOX] to=${maskPhoneForLogging(to)} label=${logLabel}\n${describe(message)}`);
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const config = getWhatsAppTransportConfig();
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const body = JSON.stringify(toMetaPayload(to, message));

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as { messages?: { id: string }[] };
        return data.messages?.[0]?.id ?? "";
      }
      const err = (await response.json().catch(() => ({}))) as { error?: { code?: number; type?: string } };
      console.error("whatsapp-client: send failed", {
        logLabel,
        to: maskPhoneForLogging(to),
        httpStatus: response.status,
        metaErrorCode: err.error?.code,
        metaErrorType: err.error?.type,
      });
      throw new Error("WhatsApp message delivery failed");
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      if (isNetwork && attempt < MAX_SEND_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err instanceof Error ? err : new Error("WhatsApp message delivery failed");
    }
  }
  throw new Error("WhatsApp message delivery failed");
}

/** Meta serves media from its own CDN hosts; the bearer token is never sent anywhere else. */
export function isMetaMediaUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "lookaside.fbsbx.com" || /\.(fbsbx|facebook|whatsapp)\.(com|net)$/.test(u.hostname));
  } catch {
    return false;
  }
}

const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/** Downloads an inbound media object (e.g. a plot photo) from Meta. Timeouts, a size cap and no redirects off Meta. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!/^\d{1,30}$/.test(mediaId)) throw new Error("Invalid WhatsApp media id");
  const config = getWhatsAppTransportConfig();
  const metaRes = await fetch(`https://graph.facebook.com/${config.apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!metaRes.ok) throw new Error("WhatsApp media lookup failed");
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!isMetaMediaUrl(meta.url)) throw new Error("WhatsApp media URL is not a Meta host");
  if (meta.file_size && meta.file_size > MEDIA_MAX_BYTES) throw new Error("WhatsApp media is too large");

  // Follow redirects by hand so every hop is checked to be a Meta host before the token is sent.
  let url = meta.url!;
  let fileRes: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    fileRes = await fetch(url, { headers: { Authorization: `Bearer ${config.apiToken}` }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const location = fileRes.status >= 300 && fileRes.status < 400 ? fileRes.headers.get("location") : null;
    if (!location) break;
    url = new URL(location, url).toString();
    if (!isMetaMediaUrl(url)) throw new Error("WhatsApp media redirected off Meta");
    fileRes = null;
  }
  if (!fileRes?.ok || !fileRes.body) throw new Error("WhatsApp media download failed");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of fileRes.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MEDIA_MAX_BYTES) throw new Error("WhatsApp media is too large");
    chunks.push(Buffer.from(chunk));
  }
  return { bytes: Buffer.concat(chunks), mimeType: meta.mime_type ?? "" };
}

function describe(m: OutgoingMessage): string {
  switch (m.type) {
    case "text":
      return m.text;
    case "buttons":
      return `${m.body}\n${m.buttons.map((b) => `[${b.title}]`).join(" ")}`;
    case "list":
      return `${m.body}\n<${m.buttonLabel}> ${m.rows.map((r) => r.title).join(" | ")}`;
    case "template":
      return `template:${m.templateName}(${m.bodyParameters.join(", ")})`;
  }
}
