"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminLoginAttempts, takeAdminLoginAttempt } from "@/lib/admin/login-rate-limit";
import { clearMfaPending, decryptMfaSecret, normalizeRecoveryCode, readMfaPending, setMfaPending, verifyTotp } from "@/lib/admin/mfa";
import { createAdminSession, destroyAdminSession } from "@/lib/admin/session";
import { db } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";
import { hashSecret, verifySecretHash } from "@/lib/scrypt-hash";

export type AdminLoginResult = { ok: true; mfaRequired?: boolean } | { ok: false; message: string };

const adminLoginSchema = z.object({
  email: z.string().trim().min(1).max(254).toLowerCase(),
  password: z.string().min(1).max(200),
});

const INVALID = "Invalid email or password.";

// Memoised so the decoy path below costs exactly ONE scrypt operation (a
// verify) — the same as the real "known email, wrong password" path.
// Hashing a fresh decoy per request would cost two and leak, by timing,
// which admin emails exist. Computed at most once per server process.
let decoyHashPromise: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHashPromise ??= hashSecret("plots-decoy-comparison-value");
  return decoyHashPromise;
}

/** Email + password sign-in. Never reveals whether the email exists. */
export async function adminLogin(input: unknown): Promise<AdminLoginResult> {
  const parsed = adminLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter your email and password." };
  const { email, password } = parsed.data;

  // One attempt is taken atomically before any scrypt work (login-rate-limit.ts).
  if (!(await takeAdminLoginAttempt({ ip: await getTrustedClientIp(), email }))) {
    return { ok: false, message: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }

  const user = await db.adminUser.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await verifySecretHash({ plainSecret: password, storedHash: await getDecoyHash() });
    return { ok: false, message: INVALID };
  }

  const valid = await verifySecretHash({ plainSecret: password, storedHash: user.passwordHash });
  if (!valid) return { ok: false, message: INVALID };

  await clearAdminLoginAttempts(email);
  // Two-step sign-in on: the password alone never creates a session.
  if (user.mfaEnabledAt && user.mfaSecret) {
    await setMfaPending(user.id);
    return { ok: true, mfaRequired: true };
  }
  await createAdminSession(user.id);
  // Opportunistic cleanup of this admin's expired sessions.
  db.adminSession.deleteMany({ where: { adminUserId: user.id, expiresAt: { lt: new Date() } } }).catch(() => {});
  return { ok: true };
}

const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });

/**
 * Step 2: the 6-digit authenticator code (or a one-time recovery code). Needs
 * the signed 5-minute cookie set by a correct password just before.
 */
export async function adminVerifyMfa(input: unknown): Promise<AdminLoginResult> {
  const adminUserId = await readMfaPending();
  if (!adminUserId) return { ok: false, message: "Your sign-in timed out. Please enter your email and password again." };
  const parsed = mfaCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the 6-digit code from your authenticator app." };

  const limited = await hitRateLimit("adminMfaPerAdmin", adminUserId);
  if (!limited.ok) return { ok: false, message: "Too many attempts. Please wait 15 minutes and try again." };

  const user = await db.adminUser.findUnique({ where: { id: adminUserId } });
  const secret = user?.mfaSecret ? decryptMfaSecret(user.mfaSecret) : null;
  if (!user || !user.isActive || !user.mfaEnabledAt || !secret) {
    await clearMfaPending();
    return { ok: false, message: "Your sign-in timed out. Please enter your email and password again." };
  }

  const code = parsed.data.code.replace(/\s/g, "");
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(secret, code, user.mfaLastStep);
    // Guarded write: the same code can't be accepted twice, even concurrently.
    const claimed = step === null ? 0 : (await db.adminUser.updateMany({ where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } })).count;
    if (!claimed) return { ok: false, message: "That code didn't work. Check the time on your phone and try the newest code." };
  } else {
    const recovery = normalizeRecoveryCode(code);
    let used: string | null = null;
    for (const hash of user.mfaRecoveryCodes) {
      if (recovery && (await verifySecretHash({ plainSecret: recovery, storedHash: hash }))) used = hash;
    }
    const claimed = used ? (await db.adminUser.updateMany({ where: { id: user.id, mfaRecoveryCodes: { has: used } }, data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== used) } })).count : 0;
    if (!claimed) return { ok: false, message: "That code didn't work. Enter the 6-digit code from your app, or an unused recovery code." };
  }

  await clearMfaPending();
  await createAdminSession(user.id);
  db.adminSession.deleteMany({ where: { adminUserId: user.id, expiresAt: { lt: new Date() } } }).catch(() => {});
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}
