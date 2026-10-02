"use server";

import { db } from "@/lib/db";
import { maskAadhaar } from "@/lib/aadhaar";
import { isDemoMode } from "@/lib/demo";
import { getSellerSession } from "@/lib/seller/session";

/**
 * LOCAL DEVELOPMENT ONLY — plays the role of the KYC provider's hosted page.
 * Refuses unless KYC_PROVIDER=mock outside production. Only the last 4
 * digits are kept (masked); the full number is never written anywhere.
 */
function mockEnabled() {
  return (process.env.NODE_ENV !== "production" || isDemoMode()) && process.env.KYC_PROVIDER?.trim().toLowerCase() === "mock";
}

export async function mockKycComplete(input: { attemptId: string; aadhaar: string; otp: string }): Promise<{ ok: boolean; message?: string }> {
  if (!mockEnabled()) return { ok: false, message: "Mock verification is disabled." };
  const seller = await getSellerSession();
  const attempt = seller ? await db.kycAttempt.findFirst({ where: { id: input.attemptId, sellerId: seller.id, status: "PENDING" } }) : null;
  if (!attempt) return { ok: false, message: "This verification session has expired. Please start again." };

  const digits = (input.aadhaar ?? "").replace(/\D/g, "");
  if (!/^[2-9]\d{11}$/.test(digits)) return { ok: false, message: "Enter your 12-digit Aadhaar number." };
  if (input.otp !== "123456") return { ok: false, message: "Incorrect OTP. Please check and try again." };

  await db.kycAttempt.update({ where: { id: attempt.id }, data: { status: "VERIFIED", masked: maskAadhaar(digits) } });
  return { ok: true };
}

export async function mockKycCancel(attemptId: string): Promise<void> {
  if (!mockEnabled()) return;
  const seller = await getSellerSession();
  if (!seller) return;
  await db.kycAttempt.updateMany({ where: { id: attemptId, sellerId: seller.id, status: "PENDING" }, data: { status: "FAILED", failReason: "Cancelled" } });
}
