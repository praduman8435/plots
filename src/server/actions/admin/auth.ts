"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminLoginAttempts, isAdminLoginRateLimited, recordAdminLoginAttempt } from "@/lib/admin/login-rate-limit";
import { createAdminSession, destroyAdminSession } from "@/lib/admin/session";
import { db } from "@/lib/db";
import { getTrustedClientIp } from "@/lib/request-ip";
import { hashSecret, verifySecretHash } from "@/lib/scrypt-hash";

export type AdminLoginResult = { ok: true } | { ok: false; message: string };

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

  // Checked before any scrypt work. Keyed per email (can't be spoofed) and per
  // IP only when a trusted proxy header is configured — see request-ip.ts.
  const limitKey = { ip: await getTrustedClientIp(), email };
  if (await isAdminLoginRateLimited(limitKey)) {
    return { ok: false, message: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }
  await recordAdminLoginAttempt(limitKey);

  const user = await db.adminUser.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await verifySecretHash({ plainSecret: password, storedHash: await getDecoyHash() });
    return { ok: false, message: INVALID };
  }

  const valid = await verifySecretHash({ plainSecret: password, storedHash: user.passwordHash });
  if (!valid) return { ok: false, message: INVALID };

  await clearAdminLoginAttempts(email);
  await createAdminSession(user.id);
  // Opportunistic cleanup of this admin's expired sessions.
  db.adminSession.deleteMany({ where: { adminUserId: user.id, expiresAt: { lt: new Date() } } }).catch(() => {});
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}
