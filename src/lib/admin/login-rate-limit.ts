import "server-only";
import { db } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 8; // per 15 min — can't be bypassed by spoofing headers
const MAX_PER_IP = 20; // per 15 min — only when a trusted IP header is configured

function keys(input: { ip: string | null; email: string | null }) {
  return [input.email ? `email:${input.email}` : null, input.ip ? `ip:${input.ip}` : null].filter(Boolean) as string[];
}

/** Rate limit for /admin/login, keyed per email (always) and per IP (trusted proxy only). */
export async function isAdminLoginRateLimited(input: { ip: string | null; email: string | null }): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    input.email ? db.adminLoginAttempt.count({ where: { key: `email:${input.email}`, createdAt: { gte: since } } }) : 0,
    input.ip ? db.adminLoginAttempt.count({ where: { key: `ip:${input.ip}`, createdAt: { gte: since } } }) : 0,
  ]);
  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

export async function recordAdminLoginAttempt(input: { ip: string | null; email: string | null }): Promise<void> {
  const ks = keys(input);
  if (ks.length) await db.adminLoginAttempt.createMany({ data: ks.map((key) => ({ key })) });
  db.adminLoginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch(() => {});
}

/** Successful login clears the email's failed-attempt counter. */
export async function clearAdminLoginAttempts(email: string): Promise<void> {
  await db.adminLoginAttempt.deleteMany({ where: { key: `email:${email}` } });
}
