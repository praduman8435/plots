import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;

/**
 * Daily housekeeping (run by the availability cron): removes rows that only
 * exist to expire. Business records — plots, sellers, enquiries, reports,
 * audit logs, analytics — are never touched here.
 */
export async function pruneExpiredData(now = new Date()) {
  const [sellerSessions, adminSessions, otps, buckets, loginAttempts] = await Promise.all([
    db.sellerSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY) } } }),
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * DAY) } } }),
    db.adminLoginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY) } } }),
  ]);
  return {
    sellerSessions: sellerSessions.count,
    adminSessions: adminSessions.count,
    otps: otps.count,
    rateLimitBuckets: buckets.count,
    loginAttempts: loginAttempts.count,
  };
}
