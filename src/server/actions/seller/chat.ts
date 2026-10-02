"use server";

import { db } from "@/lib/db";
import { canShowCodeOnScreen } from "@/lib/demo";
import { maskPhoneForDisplay, normalizePhoneNumber } from "@/lib/phone";
import { createSellerSession } from "@/lib/seller/session";
import { ConsoleOtpProvider, getOtpProvider, type OtpProvider } from "@/server/otp/provider";
import { clearChatPhoneCookie, resolveChatPhone, setChatPhoneCookie } from "@/server/seller/chat-phone";
import { requestOtp, verifyOtp } from "@/server/seller/otp";
import { inboundFromForm, loadChatState, type ChatState } from "@/server/whatsapp/chat-state";
import { processInbound } from "@/server/whatsapp/inbound";

/**
 * Public actions behind /sell/chat — the listing assistant in the browser.
 * The phone number is never taken from the client: it comes from the seller
 * session, or from the signed plots_chat_phone cookie set after an OTP check.
 * Messages go through the same assistant as WhatsApp; its replies are only
 * recorded in the thread (processInbound with `simulate`), never sent to Meta.
 */

/** Same as signup.ts: lets the screen show the code while WhatsApp isn't connected. */
class CapturingDevProvider implements OtpProvider {
  code: string | null = null;
  constructor(private readonly inner: ConsoleOtpProvider) {}
  async sendOtp(params: { phoneNormalized: string; code: string; purpose: string }) {
    this.code = params.code;
    await this.inner.sendOtp(params);
  }
}

const RATE_LIMIT = { messages: 40, windowMs: 10 * 60 * 1000 };
const BLOCKED = "This number can't be used here. Please contact us on WhatsApp.";

export type ChatAccess = { needsVerification: true; message?: string } | { needsVerification: false; state: ChatState };

export type ChatStartResult =
  | { ok: true; maskedPhone: string; code?: string; retryAfterSeconds?: number }
  | { ok: false; message: string };

export type ChatVerifyResult = { ok: true; state: ChatState } | { ok: false; message: string; clear?: boolean };

/** Step 1: send a 6-digit code to the number. */
export async function chatStartVerification(input: { phone: string }): Promise<ChatStartResult> {
  const phone = normalizePhoneNumber(String(input?.phone ?? ""));
  if (!phone.valid) return { ok: false, message: "Enter a valid 10-digit mobile number" };

  const existing = await db.seller.findUnique({ where: { phone: phone.normalized }, select: { isBlocked: true } });
  if (existing?.isBlocked) return { ok: false, message: BLOCKED };

  const base = getOtpProvider();
  const provider = base instanceof ConsoleOtpProvider ? new CapturingDevProvider(base) : base;
  const result = await requestOtp(phone.normalized, provider);
  const maskedPhone = maskPhoneForDisplay(phone.normalized);
  if (!result.success) {
    // A recent code may still be valid — let them enter it.
    if (result.error.type === "COOLDOWN") return { ok: true, maskedPhone, retryAfterSeconds: result.error.retryAfterSeconds };
    return { ok: false, message: result.error.message };
  }
  return {
    ok: true,
    maskedPhone,
    code: provider instanceof CapturingDevProvider && canShowCodeOnScreen() ? (provider.code ?? undefined) : undefined,
  };
}

/** Step 2: check the code. A known seller is signed in; anyone else gets the signed chat cookie. */
export async function chatVerify(input: { phone: string; code: string }): Promise<ChatVerifyResult> {
  const phone = normalizePhoneNumber(String(input?.phone ?? ""));
  const code = String(input?.code ?? "").trim();
  if (!phone.valid || !/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code." };

  const result = await verifyOtp(phone.normalized, code);
  if (!result.success) return { ok: false, message: result.error.message, clear: result.error.type !== "WRONG_CODE" };

  const seller = await db.seller.findUnique({ where: { phone: phone.normalized }, select: { id: true, isBlocked: true } });
  if (seller?.isBlocked) return { ok: false, message: BLOCKED, clear: true };
  if (seller) {
    await createSellerSession(seller.id);
    await clearChatPhoneCookie();
  } else {
    await setChatPhoneCookie(phone.normalized);
  }
  return { ok: true, state: await loadChatState(phone.normalized, [], { forSeller: true }) };
}

/** The thread for whoever is chatting, or `needsVerification`. */
export async function chatLoad(): Promise<ChatAccess> {
  const access = await resolveChatPhone();
  if (!access) return { needsVerification: true };
  const { phone } = access;
  if (access.via === "cookie" && access.sellerExists) await upgradeToSeller(phone);
  return { needsVerification: false, state: await loadChatState(phone, [], { forSeller: true }) };
}

/**
 * Sends one message to the assistant. FormData fields: kind (text |
 * interactive | image | location), text, replyId, replyTitle, latitude,
 * longitude, image (File). There is deliberately no phone field.
 */
export async function chatSend(formData: FormData): Promise<ChatAccess> {
  const access = await resolveChatPhone();
  if (!access) return { needsVerification: true };
  const { phone } = access;
  const upgraded = access.via === "cookie" && access.sellerExists && (await upgradeToSeller(phone));

  const since = new Date(Date.now() - RATE_LIMIT.windowMs);
  const recent = await db.whatsAppMessage.count({
    where: { direction: "INBOUND", createdAt: { gte: since }, conversation: { phone } },
  });
  if (recent >= RATE_LIMIT.messages) {
    return {
      needsVerification: false,
      state: { ...(await loadChatState(phone, [], { forSeller: true })), error: "You're sending messages very quickly. Please wait a few minutes and try again." },
    };
  }

  const parsed = await inboundFromForm(phone, formData);
  if (!parsed.ok) {
    const state = await loadChatState(phone, [], { forSeller: true });
    return { needsVerification: false, state: parsed.error ? { ...state, error: parsed.error } : state };
  }

  const result = await processInbound(parsed.msg, { simulate: true });
  // Submitting a first listing creates the seller — sign them in right away.
  if (access.via === "cookie" && !upgraded) await upgradeToSeller(phone);
  return { needsVerification: false, state: await loadChatState(phone, result.replies, { forSeller: true }) };
}

/**
 * Swaps a chat-cookie number that has become a seller for a real seller
 * session (and clears the cookie). False if there is no such seller yet.
 */
async function upgradeToSeller(phone: string): Promise<boolean> {
  const seller = await db.seller.findUnique({ where: { phone }, select: { id: true, isBlocked: true } });
  if (!seller || seller.isBlocked) return false;
  await createSellerSession(seller.id);
  await clearChatPhoneCookie();
  return true;
}
