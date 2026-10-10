import "server-only";

/** The ONE place WhatsApp Cloud API credentials are read. */
export type WhatsAppTransportConfig = {
  apiToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

/** True when real WhatsApp sending is possible. Otherwise messages go to the dev outbox (console + DB). */
export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function getWhatsAppTransportConfig(): WhatsAppTransportConfig {
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!apiToken || !phoneNumberId) {
    throw new Error("WhatsApp is not configured — set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");
  }
  return { apiToken, phoneNumberId, apiVersion: process.env.WHATSAPP_API_VERSION || "v26.0" };
}
