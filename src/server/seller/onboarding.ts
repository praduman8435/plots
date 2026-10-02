import "server-only";
import { db } from "@/lib/db";
import { trackEvent } from "@/server/analytics";
import { getKycProvider, type KycResult } from "@/server/kyc/provider";
import { notifyRegistrationComplete } from "@/server/whatsapp/notify";

/** Marks web sign-up complete (once) and sends the Seller ID on WhatsApp. */
export async function finishOnboarding(sellerId: string): Promise<void> {
  const updated = await db.seller.updateMany({ where: { id: sellerId, onboardedAt: null }, data: { onboardedAt: new Date() } });
  if (updated.count === 0) return; // already onboarded — never send twice
  await trackEvent("seller_registered", { sellerId });
  await notifyRegistrationComplete(sellerId);
}

/** Only internal paths are allowed as post-verification destinations. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && /^\/(seller|sell)(\/|\?|$)/.test(next) && !next.startsWith("//") ? next : fallback;
}

/** Starts a hosted identity verification. Returns where to send the seller, or null if KYC isn't available. */
export async function startIdentityVerification(sellerId: string, next: string): Promise<string | null> {
  const provider = getKycProvider();
  if (!provider) return null;
  const seller = await db.seller.findUniqueOrThrow({ where: { id: sellerId } });
  const attempt = await db.kycAttempt.create({ data: { sellerId, provider: provider.id } });
  const returnUrl = `/kyc/return?${new URLSearchParams({ attempt: attempt.id, next })}`;
  const { redirectUrl, providerRef } = await provider.start({ attemptId: attempt.id, sellerName: seller.name, returnUrl });
  await db.kycAttempt.update({ where: { id: attempt.id }, data: { providerRef: providerRef ?? null } });
  await db.seller.update({ where: { id: sellerId }, data: { identityStatus: seller.identityStatus === "VERIFIED" ? "VERIFIED" : "PENDING" } });
  return redirectUrl;
}

/** Reads the provider's outcome for an attempt and records it on the seller. Never trusts the redirect's query string. */
export async function completeIdentityVerification(sellerId: string, attemptId: string): Promise<KycResult> {
  const provider = getKycProvider();
  const attempt = await db.kycAttempt.findFirst({ where: { id: attemptId, sellerId } });
  if (!provider || !attempt || attempt.provider !== provider.id) return { status: "FAILED", reason: "Verification session not found." };

  const result = await provider.fetchResult({ id: attempt.id, providerRef: attempt.providerRef });
  const now = new Date();
  if (result.status === "VERIFIED") {
    await db.kycAttempt.update({ where: { id: attempt.id }, data: { status: "VERIFIED", masked: result.masked ?? attempt.masked, completedAt: now } });
    await db.seller.update({
      where: { id: sellerId },
      data: {
        identityStatus: "VERIFIED",
        identityVerifiedAt: now,
        identityProvider: provider.id,
        identityReference: result.providerRef ?? attempt.providerRef ?? attempt.id,
        identityMasked: result.masked ?? attempt.masked,
      },
    });
    await trackEvent("identity_verified", { sellerId, props: { provider: provider.id } });
  } else if (result.status === "FAILED") {
    await db.kycAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failReason: result.reason, completedAt: now } });
    await db.seller.updateMany({ where: { id: sellerId, identityStatus: { not: "VERIFIED" } }, data: { identityStatus: "FAILED" } });
  }
  return result;
}
