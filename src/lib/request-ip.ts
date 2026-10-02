import "server-only";
import { headers } from "next/headers";

/**
 * Client IP for rate limiting — ONLY from a header our own infrastructure
 * sets. Any client can send X-Forwarded-For / X-Real-IP, so we never trust
 * them by default. Configure TRUSTED_IP_HEADER for the deployment:
 *
 *   Vercel      → x-real-ip   (Vercel overwrites it)
 *   Cloudflare  → cf-connecting-ip
 *   Nginx/Caddy → x-real-ip   (only if the proxy sets it and the app isn't reachable directly)
 *
 * Unset → returns null and callers fall back to limits that can't be
 * spoofed (per phone, per email, global caps).
 */
export async function getTrustedClientIp(): Promise<string | null> {
  const header = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!header) return null;
  const value = (await headers()).get(header);
  // Some platforms append to a list; the first entry is the one they set.
  const ip = value?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : null;
}
