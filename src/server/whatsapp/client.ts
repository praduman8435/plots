import "server-only";
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
  | { type: "template"; templateName: string; language?: string; bodyParameters: string[] };

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
          components: [{ type: "body", parameters: message.bodyParameters.map((text) => ({ type: "text", text })) }],
        },
      };
  }
}

/** Sends one message. Returns Meta's message id (or a dev-outbox id). Throws a plain Error on failure. */
export async function sendWhatsAppMessage(to: string, message: OutgoingMessage, logLabel: string): Promise<string> {
  if (!isWhatsAppConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("WhatsApp is not configured");
    console.log(`[DEV WHATSAPP OUTBOX] to=${maskPhoneForLogging(to)} label=${logLabel}\n${describe(message)}`);
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

/** Downloads an inbound media object (e.g. a plot photo) from Meta. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const config = getWhatsAppTransportConfig();
  const metaRes = await fetch(`https://graph.facebook.com/${config.apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  if (!metaRes.ok) throw new Error("WhatsApp media lookup failed");
  const meta = (await metaRes.json()) as { url: string; mime_type: string };
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.apiToken}` } });
  if (!fileRes.ok) throw new Error("WhatsApp media download failed");
  return { bytes: Buffer.from(await fileRes.arrayBuffer()), mimeType: meta.mime_type };
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
