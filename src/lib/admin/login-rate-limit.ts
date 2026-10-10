import "server-only";
import { db } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * Admin password attempts. Each call takes one attempt atomically (Postgres
 * upsert counters, src/lib/rate-limit.ts) *before* the password is checked,
 * so parallel guesses can't slip past a count read. Keys:
 *   email + IP — the real brute-force cap (8 / 15 min)
 *   email      — high (40 / 15 min): someone elsewhere can't lock an admin out
 *   IP         — 20 / 15 min, only with a trusted proxy header
 * Attempts are also recorded for the audit trail.
 */
export async function takeAdminLoginAttempt(input: { ip: string | null; email: string }): Promise<boolean> {
  const hits = await Promise.all([
    hitRateLimit("adminLoginPerEmailIp", `${input.email}|${input.ip ?? "-"}`),
    hitRateLimit("adminLoginPerEmail", input.email),
    ...(input.ip ? [hitRateLimit("adminLoginPerIp", input.ip)] : []),
  ]);
  const keys = [`email:${input.email}`, ...(input.ip ? [`ip:${input.ip}`] : [])];
  await db.adminLoginAttempt.createMany({ data: keys.map((key) => ({ key })) });
  return hits.every((h) => h.ok);
}

/** Successful login clears the email's failed-attempt counters. */
export async function clearAdminLoginAttempts(email: string): Promise<void> {
  await Promise.all([
    db.adminLoginAttempt.deleteMany({ where: { key: `email:${email}` } }),
    db.rateLimitBucket.deleteMany({ where: { OR: [{ key: { startsWith: `adminLoginPerEmailIp:${email}|` } }, { key: `adminLoginPerEmail:${email}` }] } }),
  ]);
}
