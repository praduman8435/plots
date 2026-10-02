"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { canShowCodeOnScreen } from "@/lib/demo";
import { maskPhoneForDisplay, normalizePhoneNumber } from "@/lib/phone";
import { requireSeller } from "@/lib/seller/require";
import { createSellerSession } from "@/lib/seller/session";
import { trackEvent } from "@/server/analytics";
import { isKycAvailable } from "@/server/kyc/provider";
import { findOrCreateSeller } from "@/server/listings/service";
import { ConsoleOtpProvider, getOtpProvider, type OtpProvider } from "@/server/otp/provider";
import { finishOnboarding, safeNext, startIdentityVerification } from "@/server/seller/onboarding";
import { requestOtp, verifyOtp } from "@/server/seller/otp";

const nameSchema = z.string().trim().min(2, "Please enter your name").max(60).regex(/^[\p{L}\p{M} .'-]+$/u, "Please use letters only");

/** Local dev only — lets the screen show the code since WhatsApp isn't connected (see auth.ts). */
class CapturingDevProvider implements OtpProvider {
  code: string | null = null;
  constructor(private readonly inner: ConsoleOtpProvider) {}
  async sendOtp(params: { phoneNormalized: string; code: string; purpose: string }) {
    this.code = params.code;
    await this.inner.sendOtp(params);
  }
}

export type StartSignupResult =
  | { ok: true; maskedPhone: string; existingName?: string; devCode?: string; retryAfterSeconds?: number }
  | { ok: false; field?: "name" | "phone"; message: string };

/** Step 2 → 3: validate name + mobile and send the code. Works for new and existing sellers alike. */
export async function startSignup(input: { name: string; phone: string }): Promise<StartSignupResult> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, field: "name", message: name.error.issues[0].message };
  const phone = normalizePhoneNumber(input.phone ?? "");
  if (!phone.valid) return { ok: false, field: "phone", message: "Enter a valid 10-digit mobile number" };

  const existing = await db.seller.findUnique({ where: { phone: phone.normalized }, select: { name: true, isBlocked: true } });
  if (existing?.isBlocked) return { ok: false, field: "phone", message: "This number can't be used. Please contact us on WhatsApp." };

  const base = getOtpProvider();
  const provider = base instanceof ConsoleOtpProvider ? new CapturingDevProvider(base) : base;
  const result = await requestOtp(phone.normalized, provider);
  if (!result.success) {
    if (result.error.type === "COOLDOWN") {
      // A recent code may still be valid — let them enter it.
      return { ok: true, maskedPhone: maskPhoneForDisplay(phone.normalized), existingName: existing?.name, retryAfterSeconds: result.error.retryAfterSeconds };
    }
    return { ok: false, field: "phone", message: result.error.message };
  }
  if (!existing) await trackEvent("seller_signup_started");

  return {
    ok: true,
    maskedPhone: maskPhoneForDisplay(phone.normalized),
    existingName: existing?.name,
    devCode: provider instanceof CapturingDevProvider && canShowCodeOnScreen() ? (provider.code ?? undefined) : undefined,
  };
}

/** Step 3: verify the code. New number → creates the seller (with a permanent Seller ID); known number → signs in. */
export async function verifySignup(input: { name: string; phone: string; code: string }): Promise<{ ok: false; message: string; clear?: boolean } | never> {
  const phone = normalizePhoneNumber(input.phone ?? "");
  const name = nameSchema.safeParse(input.name);
  if (!phone.valid || !name.success || !/^\d{6}$/.test(input.code ?? "")) return { ok: false, message: "Enter the 6-digit code." };

  const result = await verifyOtp(phone.normalized, input.code);
  if (!result.success) return { ok: false, message: result.error.message, clear: result.error.type !== "WRONG_CODE" };

  const seller = await findOrCreateSeller({ phone: phone.normalized, name: name.data, sellerType: "OWNER", phoneVerified: true, onboarded: false });
  if (seller.isBlocked) return { ok: false, message: "This account is paused. Please contact us on WhatsApp." };
  await createSellerSession(seller.id);

  // Returning seller: skip everything they've already done.
  if (seller.onboardedAt) redirect("/seller/plots/new");
  redirect("/sell/start");
}

/** Step 4: identity check with the KYC provider (hosted flow). */
export async function beginIdentityCheck(formData: FormData): Promise<void> {
  const seller = await requireSeller();
  const next = safeNext(String(formData.get("next") ?? ""), seller.onboardedAt ? "/seller/dashboard?verified=1" : "/sell/start?done=1");
  const url = await startIdentityVerification(seller.id, next);
  redirect(url ?? next);
}

/** Only when no KYC provider is configured: continue phone-verified, nothing is faked. */
export async function continueWithoutIdentity(): Promise<void> {
  const seller = await requireSeller();
  if (isKycAvailable()) redirect("/sell/start");
  await finishOnboarding(seller.id);
  redirect("/sell/start?done=1");
}
