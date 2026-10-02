"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseSellerCode } from "@/lib/codes";
import { db } from "@/lib/db";
import { canShowCodeOnScreen } from "@/lib/demo";
import { maskPhoneForDisplay, normalizePhoneNumber } from "@/lib/phone";
import { createSellerSession, destroySellerSession } from "@/lib/seller/session";
import { ConsoleOtpProvider, getOtpProvider, type OtpProvider } from "@/server/otp/provider";
import { safeNext } from "@/server/seller/onboarding";
import { isOtpPaused, requestOtp, verifyOtp } from "@/server/seller/otp";

/** "PLT-7A41K2" or a mobile number → the seller, or null. */
async function resolveSeller(identifier: string) {
  const code = parseSellerCode(identifier);
  if (code) return db.seller.findUnique({ where: { code } });
  const phone = normalizePhoneNumber(identifier);
  if (phone.valid) return db.seller.findUnique({ where: { phone: phone.normalized } });
  return null;
}

/**
 * Local development only: captures the code so the login screen can show it
 * (there is no WhatsApp locally). Never active in production — getOtpProvider
 * returns the WhatsApp provider there, and this wrapper is only used when the
 * resolved provider is the console one.
 */
class CapturingDevProvider implements OtpProvider {
  code: string | null = null;
  constructor(private readonly inner: ConsoleOtpProvider) {}
  async sendOtp(params: { phoneNormalized: string; code: string; purpose: string }) {
    this.code = params.code;
    await this.inner.sendOtp(params);
  }
}

const identifierSchema = z.object({ identifier: z.string().trim().min(3).max(32) });

export type RequestCodeResult =
  | { ok: true; maskedPhone: string; firstName: string; devCode?: string }
  | { ok: false; reason: "NOT_FOUND" | "BLOCKED" | "COOLDOWN" | "RATE_LIMITED" | "UNAVAILABLE" | "INVALID"; message: string; retryAfterSeconds?: number; maskedPhone?: string };

export async function requestSellerCode(input: unknown): Promise<RequestCodeResult> {
  const parsed = identifierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: "Enter your Seller ID or mobile number." };

  const seller = await resolveSeller(parsed.data.identifier);
  if (!seller) {
    return {
      ok: false,
      reason: "NOT_FOUND",
      message: "We couldn't find a seller with that ID or number. Check it, or list your first plot on WhatsApp to get a Seller ID.",
    };
  }
  if (seller.isBlocked) return { ok: false, reason: "BLOCKED", message: "This seller account is paused. Please contact us on WhatsApp." };

  const base = getOtpProvider();
  const provider = base instanceof ConsoleOtpProvider ? new CapturingDevProvider(base) : base;
  const result = await requestOtp(seller.phone, provider);
  const maskedPhone = maskPhoneForDisplay(seller.phone);

  if (!result.success) {
    if (result.error.type === "COOLDOWN") {
      return { ok: false, reason: "COOLDOWN", message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, maskedPhone };
    }
    return { ok: false, reason: result.error.type === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE", message: result.error.message };
  }

  return {
    ok: true,
    maskedPhone,
    firstName: seller.name.split(" ")[0],
    devCode: provider instanceof CapturingDevProvider && canShowCodeOnScreen() ? (provider.code ?? undefined) : undefined,
  };
}

const verifySchema = z.object({ identifier: z.string().trim().min(3).max(32), code: z.string().regex(/^\d{6}$/), next: z.string().max(200).optional() });

export async function verifySellerCode(input: unknown): Promise<{ ok: false; message: string; clear?: boolean } | never> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the 6-digit code." };

  const seller = await resolveSeller(parsed.data.identifier);
  if (!seller || seller.isBlocked) return { ok: false, message: "That code is invalid or has expired. Please request a new one.", clear: true };

  const result = await verifyOtp(seller.phone, parsed.data.code);
  if (!result.success) return { ok: false, message: result.error.message, clear: result.error.type !== "WRONG_CODE" };

  if (!seller.phoneVerifiedAt) await db.seller.update({ where: { id: seller.id }, data: { phoneVerifiedAt: new Date() } });
  await createSellerSession(seller.id);
  redirect(seller.onboardedAt ? safeNext(parsed.data.next, "/seller/dashboard") : "/sell/start");
}

const pausedSchema = z.object({ sellerId: z.string().trim(), phone: z.string().trim() });

/**
 * TEMPORARY (same switch as the shop project): only while isOtpPaused() —
 * production without WhatsApp OTP configured. Needs BOTH the Seller ID and
 * the registered mobile number. Refuses as soon as WhatsApp OTP is set up.
 */
export async function signInWithoutCode(input: unknown): Promise<{ ok: false; message: string } | never> {
  if (!isOtpPaused()) return { ok: false, message: "Please sign in with the code we send you on WhatsApp." };
  const parsed = pausedSchema.safeParse(input);
  const code = parsed.success ? parseSellerCode(parsed.data.sellerId) : null;
  const phone = parsed.success ? normalizePhoneNumber(parsed.data.phone) : { valid: false as const };
  if (!code || !phone.valid) return { ok: false, message: "Enter your Seller ID and registered mobile number." };

  const seller = await db.seller.findUnique({ where: { code } });
  if (!seller || seller.phone !== phone.normalized || seller.isBlocked) {
    return { ok: false, message: "That Seller ID and mobile number don't match our records." };
  }
  await createSellerSession(seller.id);
  redirect("/seller/dashboard");
}

export async function sellerSignOut() {
  await destroySellerSession();
  redirect("/seller");
}
