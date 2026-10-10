import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { OTP_CONFIG } from "@/lib/otp-config";
import { hashSecret, verifySecretHash } from "@/lib/scrypt-hash";
import { isDemoMode } from "@/lib/demo";
import { hitIpRateLimit, hitRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";
import { getOtpProvider, isWhatsAppOtpConfigured, type OtpProvider } from "@/server/otp/provider";

// Ported from the shop project's customer-portal OTP: CSPRNG codes, scrypt
// hashes, a resend cooldown, a per-window cap, an attempt cap, and one
// active challenge per phone at a time.
const PURPOSE = "SELLER_LOGIN" as const;

/**
 * TEMPORARY (same switch as the shop): in production without WhatsApp OTP
 * set up, a code could never reach the seller. Sign-in then needs BOTH the
 * Seller ID and the registered mobile number. Turns itself off once the
 * WHATSAPP_* variables are set. Local development keeps the console code.
 */
export function isOtpPaused(): boolean {
  return process.env.NODE_ENV === "production" && !isWhatsAppOtpConfigured() && !isDemoMode();
}

function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_CONFIG.codeLength).toString().padStart(OTP_CONFIG.codeLength, "0");
}

export type RequestOtpResult =
  | { success: true }
  | {
      success: false;
      error:
        | { type: "COOLDOWN"; message: string; retryAfterSeconds: number }
        | { type: "RATE_LIMITED"; message: string }
        | { type: "PROVIDER_UNAVAILABLE"; message: string };
    };

export async function requestOtp(phoneNormalized: string, provider?: OtpProvider): Promise<RequestOtpResult> {
  const latest = await db.otpChallenge.findFirst({
    where: { phoneNormalized, purpose: PURPOSE },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const secondsSinceLast = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (secondsSinceLast < OTP_CONFIG.resendCooldownSeconds) {
      return {
        success: false,
        error: {
          type: "COOLDOWN",
          message: "A code was sent recently. Please wait before requesting another.",
          retryAfterSeconds: Math.ceil(OTP_CONFIG.resendCooldownSeconds - secondsSinceLast),
        },
      };
    }
  }

  const windowStart = new Date(Date.now() - OTP_CONFIG.requestWindowMinutes * 60 * 1000);
  const requestsInWindow = await db.otpChallenge.count({
    where: { phoneNormalized, purpose: PURPOSE, createdAt: { gte: windowStart } },
  });
  if (requestsInWindow >= OTP_CONFIG.maxRequestsPerWindow) {
    return { success: false, error: { type: "RATE_LIMITED", message: "Too many codes requested. Please try again later." } };
  }

  // The checks above give friendly messages; these reserve the send atomically, so a burst of parallel
  // requests can't all pass a count read. Per number, per trusted client IP (SMS/WhatsApp pumping), and a
  // global ceiling — with a separate, larger pool for numbers that already belong to a seller.
  const ip = await getTrustedClientIp();
  const isSeller = Boolean(await db.seller.findUnique({ where: { phone: phoneNormalized }, select: { id: true } }));
  const reserved = await Promise.all([
    hitRateLimit("otpSendCooldown", phoneNormalized),
    hitRateLimit("otpSendPerPhone", phoneNormalized, Date.now(), { limit: OTP_CONFIG.maxRequestsPerWindow }),
    ...(ip ? [hitRateLimit("otpSendPerIp", ip, Date.now(), { limit: OTP_CONFIG.maxRequestsPerIpPerHour })] : []),
    isSeller ? hitRateLimit("otpSendGlobalSellers", "all") : hitRateLimit("otpSendGlobal", "all", Date.now(), { limit: OTP_CONFIG.maxRequestsGlobalPerHour }),
  ]);
  if (!reserved[0].ok) {
    return { success: false, error: { type: "COOLDOWN", message: "A code was sent recently. Please wait before requesting another.", retryAfterSeconds: reserved[0].retryAfterSeconds } };
  }
  if (reserved.some((r) => !r.ok)) {
    return { success: false, error: { type: "RATE_LIMITED", message: "Too many codes requested. Please try again later." } };
  }

  const code = generateOtpCode();
  // Send BEFORE writing: a failed delivery must not start a cooldown or
  // supersede a still-valid earlier code.
  try {
    await (provider ?? getOtpProvider()).sendOtp({ phoneNormalized, code, purpose: PURPOSE });
  } catch {
    return {
      success: false,
      error: { type: "PROVIDER_UNAVAILABLE", message: "We couldn't send a code right now. Please try again shortly." },
    };
  }

  const codeHash = await hashSecret(code);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000);
  await db.$transaction([
    db.otpChallenge.updateMany({
      where: { phoneNormalized, purpose: PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.otpChallenge.create({ data: { phoneNormalized, purpose: PURPOSE, codeHash, expiresAt, ip } }),
  ]);

  db.otpChallenge
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => {});
  return { success: true };
}

const GENERIC_INVALID = "That code is invalid or has expired. Please request a new one.";

export type VerifyOtpResult =
  | { success: true }
  | { success: false; error: { type: "INVALID" | "TOO_MANY_ATTEMPTS" | "WRONG_CODE"; message: string } };

export async function verifyOtp(phoneNormalized: string, rawCode: string): Promise<VerifyOtpResult> {
  // Each code allows 5 tries; this caps one IP spraying guesses across many numbers.
  const limited = await hitIpRateLimit("otpVerifyPerIp");
  if (!limited.ok) return { success: false, error: { type: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait a few minutes and try again." } };

  const challenge = await db.otpChallenge.findFirst({
    where: { phoneNormalized, purpose: PURPOSE, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: { type: "INVALID", message: GENERIC_INVALID } };
  }
  // Take the attempt atomically *before* checking the code: parallel guesses can't all read a count
  // under the limit (each one needs its own increment to succeed). Plus a per-number cap across IPs.
  const [claimed, perPhone] = await Promise.all([
    db.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attemptCount: { lt: OTP_CONFIG.maxAttempts } },
      data: { attemptCount: { increment: 1 } },
    }),
    hitRateLimit("otpVerifyPerPhone", phoneNormalized),
  ]);
  if (claimed.count === 0 || !perPhone.ok) {
    return { success: false, error: { type: "TOO_MANY_ATTEMPTS", message: "Too many incorrect attempts. Please request a new code." } };
  }

  const correct = await verifySecretHash({ plainSecret: rawCode.trim(), storedHash: challenge.codeHash });
  if (!correct) {
    return { success: false, error: { type: "WRONG_CODE", message: "That code doesn't match. Please check and try again." } };
  }

  // Guarded consume: two concurrent verifies can never both succeed.
  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return { success: false, error: { type: "INVALID", message: GENERIC_INVALID } };
  return { success: true };
}
