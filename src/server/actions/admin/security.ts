"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/require";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  isAdminMfaRequired,
  otpauthUri,
  verifyTotp,
} from "@/lib/admin/mfa";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin/session";
import { db } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/scrypt-hash";

/**
 * Turning two-step sign-in on/off for the signed-in admin. Every change that
 * weakens it needs a current code; turning it on signs out other devices.
 */

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

export type MfaSetupStart = { ok: true; secret: string; uri: string } | { ok: false; message: string };
export type MfaConfirmResult = { ok: true; recoveryCodes: string[] } | { ok: false; message: string };
export type MfaSimpleResult = { ok: true } | { ok: false; message: string };

/** New secret for enrolment (not active until confirmed with a code). */
export async function startMfaSetup(): Promise<MfaSetupStart> {
  const admin = await requireAdminSession();
  if (admin.mfaEnabledAt) return { ok: false, message: "Two-step sign-in is already on." };
  const secret = generateMfaSecret();
  await db.adminUser.update({ where: { id: admin.id }, data: { mfaSecret: encryptMfaSecret(secret), mfaLastStep: null } });
  return { ok: true, secret, uri: otpauthUri(secret, admin.email) };
}

/** Confirms the app works (one valid code), turns it on, and returns recovery codes — shown once. */
export async function confirmMfaSetup(input: unknown): Promise<MfaConfirmResult> {
  const admin = await requireAdminSession();
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the 6-digit code from your app." };
  const limited = await hitRateLimit("adminMfaPerAdmin", admin.id);
  if (!limited.ok) return { ok: false, message: "Too many attempts. Please wait 15 minutes and try again." };
  if (admin.mfaEnabledAt) return { ok: false, message: "Two-step sign-in is already on." };

  const secret = admin.mfaSecret ? decryptMfaSecret(admin.mfaSecret) : null;
  if (!secret) return { ok: false, message: "Start the setup again." };
  const step = verifyTotp(secret, parsed.data.code, null);
  if (step === null) return { ok: false, message: "That code didn't work. Check the time on your phone and try the newest code." };

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map((c) => hashSecret(c)));
  await db.adminUser.update({ where: { id: admin.id }, data: { mfaEnabledAt: new Date(), mfaLastStep: step, mfaRecoveryCodes: hashes } });
  await signOutOtherDevices(admin.id);
  revalidatePath("/admin", "layout");
  return { ok: true, recoveryCodes };
}

/** Fresh recovery codes (old ones stop working). Needs a current code. */
export async function regenerateRecoveryCodes(input: unknown): Promise<MfaConfirmResult> {
  const admin = await requireAdminSession();
  const ok = await checkCurrentCode(admin, input);
  if (!ok.ok) return ok;
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map((c) => hashSecret(c)));
  await db.adminUser.update({ where: { id: admin.id }, data: { mfaRecoveryCodes: hashes } });
  return { ok: true, recoveryCodes };
}

/** Turns it off (not allowed while ADMIN_REQUIRE_MFA=true). Needs a current code. */
export async function disableMfa(input: unknown): Promise<MfaSimpleResult> {
  const admin = await requireAdminSession();
  if (isAdminMfaRequired()) return { ok: false, message: "Two-step sign-in is required for all admins and can't be turned off." };
  const ok = await checkCurrentCode(admin, input);
  if (!ok.ok) return ok;
  await db.adminUser.update({ where: { id: admin.id }, data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaRecoveryCodes: [] } });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

async function checkCurrentCode(
  admin: { id: string; mfaEnabledAt: Date | null; mfaSecret: string | null; mfaLastStep: number | null },
  input: unknown,
): Promise<MfaSimpleResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the 6-digit code from your app." };
  const limited = await hitRateLimit("adminMfaPerAdmin", admin.id);
  if (!limited.ok) return { ok: false, message: "Too many attempts. Please wait 15 minutes and try again." };
  const secret = admin.mfaEnabledAt && admin.mfaSecret ? decryptMfaSecret(admin.mfaSecret) : null;
  if (!secret) return { ok: false, message: "Two-step sign-in is off." };
  const step = verifyTotp(secret, parsed.data.code, admin.mfaLastStep);
  const claimed = step === null ? 0 : (await db.adminUser.updateMany({ where: { id: admin.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } })).count;
  return claimed ? { ok: true } : { ok: false, message: "That code didn't work. Try the newest code from your app." };
}

/** Keeps only this browser's session. */
async function signOutOtherDevices(adminUserId: string) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const keep = token ? createHash("sha256").update(token).digest("hex") : "";
  await db.adminSession.deleteMany({ where: { adminUserId, NOT: { tokenHash: keep } } });
}
