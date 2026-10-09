import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Admin two-step sign-in with an authenticator app (Google Authenticator,
 * Microsoft Authenticator, 1Password, …): standard TOTP (RFC 6238 — HMAC-SHA1,
 * 6 digits, 30-second steps), built on node:crypto only.
 *
 * - The shared secret is stored AES-256-GCM encrypted with a key derived from
 *   SESSION_SECRET (rotating SESSION_SECRET means re-enrolling).
 * - A code is accepted for the current step ±1 (clock drift) and never twice
 *   (mfaLastStep).
 * - Between the password and the code, the browser holds a 5-minute signed
 *   "pending" cookie naming the admin — never a session.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const DEV_SECRET = "plots-dev-only-admin-mfa-secret-never-use-in-production";

function rootSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set — it is required for admin two-step sign-in.");
  return DEV_SECRET;
}

function key(purpose: "encrypt" | "pending"): Buffer {
  return Buffer.from(hkdfSync("sha256", rootSecret(), "plots-admin-mfa", purpose, 32));
}

// ── Base32 (RFC 4648, no padding) — what authenticator apps expect ──
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── TOTP ──
export function generateMfaSecret(): string {
  return base32Encode(randomBytes(20)); // 160 bits, as RFC 4226 recommends
}

export function totpAt(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return binary.toString().padStart(DIGITS, "0");
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** The matching step (current ±1), or null. Steps ≤ lastStep are refused (no replay). */
export function verifyTotp(secretBase32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const expected = Buffer.from(totpAt(secretBase32, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

export function otpauthUri(secretBase32: string, account: string, issuer = "InstaPlots Admin"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

// ── Secret at rest ──
export function encryptMfaSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("encrypt"), iv);
  const data = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptMfaSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key("encrypt"), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── Recovery codes: 8 single-use codes like "K7QD-M2XP-4HNA" ──
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(8)).slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export function normalizeRecoveryCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  return clean.length === 12 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}` : "";
}

// ── The short-lived "password OK, code pending" cookie ──
export const ADMIN_MFA_PENDING_COOKIE = "plots_admin_mfa_pending";
const PENDING_MS = 5 * 60 * 1000;

function signPending(payload: string): Buffer {
  return createHmac("sha256", key("pending")).update(payload).digest();
}

export async function setMfaPending(adminUserId: string): Promise<void> {
  const payload = `${adminUserId}|${Date.now() + PENDING_MS}`;
  const value = `${Buffer.from(payload).toString("base64url")}.${signPending(payload).toString("base64url")}`;
  (await cookies()).set(ADMIN_MFA_PENDING_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: PENDING_MS / 1000,
  });
}

export async function readMfaPending(): Promise<string | null> {
  const raw = (await cookies()).get(ADMIN_MFA_PENDING_COOKIE)?.value;
  if (!raw) return null;
  const [encoded, mac, extra] = raw.split(".");
  if (!encoded || !mac || extra !== undefined) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = signPending(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [id, exp] = payload.split("|");
  return id && Number(exp) > Date.now() ? id : null;
}

export async function clearMfaPending(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_MFA_PENDING_COOKIE, path: "/admin" });
}

/** ADMIN_REQUIRE_MFA=true: every admin must have two-step sign-in on before using the admin. */
export function isAdminMfaRequired(): boolean {
  return process.env.ADMIN_REQUIRE_MFA?.trim().toLowerCase() === "true";
}
