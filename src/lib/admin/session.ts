import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

// Ported from the shop project's admin session.
export const ADMIN_SESSION_COOKIE_NAME = "plots_admin_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(adminUserId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.adminSession.create({ data: { tokenHash: hashToken(token), adminUserId, expiresAt } });

  const cookieStore = await cookies();
  // Rotate: a token this browser held before signing in again stops working.
  const previous = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (previous) await db.adminSession.deleteMany({ where: { tokenHash: hashToken(previous) } }).catch(() => {});
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Null for a missing/expired/unknown token or a deactivated admin. */
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.adminSession.findUnique({ where: { tokenHash }, include: { adminUser: true } });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.adminSession.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }
  if (!session.adminUser.isActive) return null;
  return session.adminUser;
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (token) await db.adminSession.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  cookieStore.delete({ name: ADMIN_SESSION_COOKIE_NAME, path: "/" });
}
