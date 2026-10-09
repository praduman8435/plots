import "server-only";
import { createHmac, hkdfSync } from "node:crypto";

const DEV_SECRET = "plots-dev-only-keyed-hash-secret-never-use-in-production";

/**
 * One-way, keyed fingerprint of an identifier (an IP, a cookie value). Lets us
 * match "same source" without storing the identifier itself; useless to anyone
 * without SESSION_SECRET. `purpose` keeps hashes from different uses unlinkable.
 */
export function keyedHash(purpose: string, value: string): string {
  const root = process.env.SESSION_SECRET?.trim() || (process.env.NODE_ENV === "production" ? "" : DEV_SECRET);
  if (!root) throw new Error("SESSION_SECRET is not set.");
  const key = Buffer.from(hkdfSync("sha256", root, "plots-keyed-hash", purpose, 32));
  return createHmac("sha256", key).update(value).digest("base64url").slice(0, 32);
}
