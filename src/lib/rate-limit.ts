import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { getTrustedClientIp } from "@/lib/request-ip";

/**
 * Shared rate limiting. Counters live in Postgres (rate_limit_buckets), so the
 * limit holds across every serverless instance — an in-memory counter on
 * Vercel would reset per instance. One upsert per check, fixed windows.
 *
 * Fixed windows can let up to 2× a limit through across a window boundary;
 * every limit below is sized with that in mind.
 *
 * IP-keyed policies only apply when TRUSTED_IP_HEADER is configured (see
 * request-ip.ts) — a client-supplied X-Forwarded-For is never trusted, so it
 * can't be used to dodge or to frame-up a limit.
 */
export const LIMITS = {
  // Buyer contact taps: a person rarely contacts > 20 plots in 10 minutes.
  enquiryPerIp: { limit: 20, windowSeconds: 600 },
  // Protects one seller from a flood of fake "new buyer" WhatsApp pings even
  // if an attacker rotates IPs: 30 per plot per hour is far above real demand.
  enquiryPerProperty: { limit: 30, windowSeconds: 3600 },
  // Analytics beacon: pages send a handful of events each.
  eventsPerIp: { limit: 300, windowSeconds: 600 },
  // Page views: one counted view per visitor per plot per 30 minutes; and a ceiling per IP.
  viewPerIpProperty: { limit: 1, windowSeconds: 1800 },
  viewsPerIp: { limit: 200, windowSeconds: 600 },
  // Photo uploads (sharp re-encode + storage cost). A plot has ≤ 10 photos.
  uploadsPerUserHour: { limit: 60, windowSeconds: 3600 },
  uploadsPerUserDay: { limit: 300, windowSeconds: 86_400 },
  // Looking up a Seller ID / number before sending a code (stops enumeration).
  sellerLookupPerIp: { limit: 30, windowSeconds: 600 },
  // Checking login codes from one IP across many numbers (each code also has its own 5-try cap).
  otpVerifyPerIp: { limit: 30, windowSeconds: 600 },
  // The no-code sign-in (only active when WhatsApp OTP is unavailable): per Seller ID and per IP.
  noCodeSignInPerSeller: { limit: 5, windowSeconds: 900 },
  noCodeSignInPerIp: { limit: 10, windowSeconds: 900 },
  // Sellers adding / editing plots from the dashboard.
  listingCreatePerSeller: { limit: 20, windowSeconds: 86_400 },
  listingUpdatePerSeller: { limit: 60, windowSeconds: 3600 },
  // Buyer reports (listing / seller profile). Real people report a few things a day at most.
  reportPerIp: { limit: 10, windowSeconds: 3600 },
  reportPerReporter: { limit: 10, windowSeconds: 86_400 },
  // Caps a pile-on against one plot or seller; admins still see every report that got through.
  reportPerTarget: { limit: 50, windowSeconds: 3600 },
  // Optional AI in the WhatsApp assistant (limits overridable by AI_MAX_CALLS_*): per chat, and all chats.
  aiPerChat: { limit: 25, windowSeconds: 86_400 },
  aiGlobal: { limit: 500, windowSeconds: 86_400 },
  // Admin password step: per email+IP (the real brute-force cap), per email (high, so nobody can lock an
  // admin out from elsewhere), per IP (trusted proxy only). Counted atomically before any scrypt work.
  adminLoginPerEmailIp: { limit: 8, windowSeconds: 900 },
  adminLoginPerEmail: { limit: 40, windowSeconds: 900 },
  adminLoginPerIp: { limit: 20, windowSeconds: 900 },
  // OTP sending, reserved atomically before a message goes out (limits overridable via OTP_* env).
  otpSendCooldown: { limit: 1, windowSeconds: 45 },
  otpSendPerPhone: { limit: 5, windowSeconds: 3600 },
  otpSendPerIp: { limit: 15, windowSeconds: 3600 },
  // Everyone else shares this; numbers that already belong to a seller have their own, larger pool,
  // so a flood of sign-up codes can't stop real sellers from logging in.
  otpSendGlobal: { limit: 500, windowSeconds: 3600 },
  otpSendGlobalSellers: { limit: 2000, windowSeconds: 3600 },
  // Guesses against one number's codes, whatever the IP.
  otpVerifyPerPhone: { limit: 15, windowSeconds: 600 },
  // Admin second step (authenticator code), per admin account.
  adminMfaPerAdmin: { limit: 6, windowSeconds: 900 },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

export type LimitName = keyof typeof LIMITS;
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Counts one hit against `name` for `subject`. Over the limit → ok:false with seconds until the window resets. */
export async function hitRateLimit(name: LimitName, subject: string, now = Date.now(), override?: { limit: number }): Promise<RateLimitResult> {
  const { windowSeconds } = LIMITS[name];
  const limit = override?.limit ?? LIMITS[name].limit;
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${name}:${subject}`.slice(0, 200);

  let count: number;
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_buckets ("key", "windowStart", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = rate_limit_buckets."count" + 1
      RETURNING "count"`;
    count = rows[0]?.count ?? 1;
  } catch (err) {
    // Fail open: the limiter must never take the site down on its own. The
    // database is the same one every request needs, so this is rare.
    log("error", "rate_limit.unavailable", { policy: name, err });
    return { ok: true };
  }

  // Opportunistic cleanup of windows that ended over a day ago (~1 in 200 calls).
  if (Math.random() < 0.005) {
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now - 86_400_000 - windowMs) } } }).catch(() => {});
  }

  if (count <= limit) return { ok: true };
  // Logged once per window (the first refusal), never with the subject (it may be an IP).
  if (count === limit + 1) log("warn", "rate_limited", { policy: name });
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)) };
}

/** IP-keyed limit. No trusted client IP (TRUSTED_IP_HEADER unset) → not applied. */
export async function hitIpRateLimit(name: LimitName, suffix = ""): Promise<RateLimitResult> {
  const ip = await getTrustedClientIp();
  if (!ip) return { ok: true };
  return hitRateLimit(name, suffix ? `${ip}:${suffix}` : ip);
}

/** Standard 429 for route handlers. */
export function tooManyRequests(result: { retryAfterSeconds: number }, body: unknown = { ok: false, error: "Too many requests. Please try again shortly." }) {
  return Response.json(body, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}
