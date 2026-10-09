import "server-only";
import { isDemoMode } from "@/lib/demo";
import { maskPhoneForLogging } from "@/lib/phone";
import { sendWhatsAppMessage } from "@/server/whatsapp/client";
import { isWhatsAppConfigured } from "@/server/whatsapp/config";

/** The boundary between OTP logic and how a code reaches the seller (shop project design). */
export type OtpProvider = {
  sendOtp(params: { phoneNormalized: string; code: string; purpose: string }): Promise<void>;
};

/** Local development only: prints the code to the server terminal. Never runs in production. */
export class ConsoleOtpProvider implements OtpProvider {
  async sendOtp({ phoneNormalized, code, purpose }: { phoneNormalized: string; code: string; purpose: string }) {
    if (process.env.NODE_ENV === "production" && !isDemoMode()) throw new Error("ConsoleOtpProvider must never run in production.");
    // Production logs are readable by more people than a login code should be.
    if (process.env.NODE_ENV === "production") return;
    console.log(
      `\n┌──────────────────────────────────────────────\n│ [DEV OTP] ${maskPhoneForLogging(phoneNormalized)}  code: ${code}  (${purpose})\n└──────────────────────────────────────────────\n`,
    );
  }
}

/** Production: a Meta "Authentication" template with one body parameter (the code). */
export class WhatsAppOtpProvider implements OtpProvider {
  constructor(private readonly templateName: string, private readonly language: string) {}

  async sendOtp({ phoneNormalized, code }: { phoneNormalized: string; code: string; purpose: string }) {
    await sendWhatsAppMessage(
      phoneNormalized,
      { type: "template", templateName: this.templateName, language: this.language, bodyParameters: [code] },
      "otp",
    );
  }
}

export function isWhatsAppOtpConfigured(): boolean {
  return isWhatsAppConfigured() && Boolean(process.env.WHATSAPP_OTP_TEMPLATE_NAME);
}

/**
 * Production always uses WhatsApp (fails closed if unconfigured).
 * Non-production uses WhatsApp only when OTP_PROVIDER=whatsapp; otherwise the console.
 */
export function getOtpProvider(): OtpProvider {
  const wantsWhatsApp =
    process.env.OTP_PROVIDER?.trim().toLowerCase() === "whatsapp" ||
    (process.env.NODE_ENV === "production" && !(isDemoMode() && !isWhatsAppOtpConfigured()));
  if (!wantsWhatsApp) return new ConsoleOtpProvider();

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  if (!isWhatsAppConfigured() || !templateName) {
    throw new Error("WhatsApp OTP is not configured — set WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_OTP_TEMPLATE_NAME.");
  }
  return new WhatsAppOtpProvider(templateName, process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "en");
}
