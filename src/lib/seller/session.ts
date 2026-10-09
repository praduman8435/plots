import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SELLER_SESSION_DURATION_DAYS } from "@/lib/otp-config";

// Same design as the shop's customer-portal session: only the SHA-256 of a
// random token is stored; the raw token lives in an httpOnly cookie.
export const SELLER_SESSION_COOKIE_NAME = "plots_seller_session";
const SESSION_DURATION_MS = SELLER_SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Call only right after a successful OTP verification. Always mints a fresh token. */
export async function createSellerSession(sellerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.sellerSession.create({ data: { tokenHash: hashToken(token), sellerId, expiresAt } });

  const cookieStore = await cookies();
  // Rotate: a token this browser held before signing in again stops working.
  const previous = cookieStore.get(SELLER_SESSION_COOKIE_NAME)?.value;
  if (previous) await db.sellerSession.deleteMany({ where: { tokenHash: hashToken(previous) } }).catch(() => {});
  cookieStore.set(SELLER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  db.sellerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}

/** The one authorization primitive for seller pages and actions. Null = not signed in. */
export async function getSellerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SELLER_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.sellerSession.findUnique({ where: { tokenHash }, include: { seller: true } });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.sellerSession.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }
  if (session.seller.isBlocked) return null;

  db.sellerSession.update({ where: { tokenHash }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return session.seller;
}

export async function destroySellerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SELLER_SESSION_COOKIE_NAME)?.value;
  if (token) await db.sellerSession.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  cookieStore.delete({ name: SELLER_SESSION_COOKIE_NAME, path: "/" });
}
