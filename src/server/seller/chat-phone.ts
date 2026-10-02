import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { getSellerSession } from "@/lib/seller/session";

/**
 * Proof that this browser verified a mobile number by OTP, for people who
 * chat with the listing assistant on /sell/chat before they are sellers.
 * Value: base64url("<phone>|<expiresAtMs>") + "." + base64url(HMAC-SHA256).
 * Once a Seller exists for the number it is swapped for a seller session.
 */
export const CHAT_PHONE_COOKIE_NAME = "plots_chat_phone";
const CHAT_PHONE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const DEV_SECRET = "plots-dev-only-chat-phone-secret-never-use-in-production";

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set — it is required to sign the chat verification cookie (plots_chat_phone).");
  }
  return DEV_SECRET;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", secret()).update(`chat-phone:${payload}`).digest();
}

/** Call only right after a successful OTP verification for `phone` (E.164). */
export async function setChatPhoneCookie(phone: string): Promise<void> {
  const expiresAt = Date.now() + CHAT_PHONE_DURATION_MS;
  const payload = `${phone}|${expiresAt}`;
  const value = `${Buffer.from(payload).toString("base64url")}.${sign(payload).toString("base64url")}`;
  const cookieStore = await cookies();
  cookieStore.set(CHAT_PHONE_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/** The verified phone from the cookie, or null if it is missing, tampered with or expired. */
export async function readChatPhoneCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CHAT_PHONE_COOKIE_NAME)?.value;
  if (!raw) return null;
  const [encoded, mac, extra] = raw.split(".");
  if (!encoded || !mac || extra !== undefined) return null;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = sign(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const [phone, expiresAt] = payload.split("|");
  if (!phone || !expiresAt || !(Number(expiresAt) > Date.now())) return null;
  const normalized = normalizePhoneNumber(phone);
  return normalized.valid && normalized.normalized === phone ? phone : null;
}

/** Only from a Server Action or Route Handler (cookies can't be changed while rendering). */
export async function clearChatPhoneCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: CHAT_PHONE_COOKIE_NAME, path: "/" });
}

/**
 * Who is chatting on /sell/chat — read-only, so it is safe while rendering.
 * A seller session wins; otherwise the verified phone from the chat cookie.
 * `sellerExists`: the cookie's number has become a seller (the assistant
 * created one at Submit) and should be swapped for a seller session.
 */
export async function resolveChatPhone(): Promise<{ phone: string; via: "session" | "cookie"; sellerExists: boolean } | null> {
  const seller = await getSellerSession();
  if (seller) return { phone: seller.phone, via: "session", sellerExists: true };
  const phone = await readChatPhoneCookie();
  if (!phone) return null;
  const existing = await db.seller.findUnique({ where: { phone }, select: { isBlocked: true } });
  if (existing?.isBlocked) return null;
  return { phone, via: "cookie", sellerExists: Boolean(existing) };
}
