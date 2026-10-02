import { formatRelativeDate } from "./format";

/**
 * Honest freshness copy. Only an explicit seller confirmation counts as
 * "confirmed"; otherwise we say when it was listed.
 */
export function freshnessLabel(p: { lastConfirmedAt: Date | null; publishedAt: Date | null; createdAt: Date }, now = new Date()) {
  const confirmed = p.lastConfirmedAt;
  if (confirmed && (!p.publishedAt || confirmed >= p.publishedAt)) {
    const days = Math.floor((now.getTime() - confirmed.getTime()) / 86_400_000);
    if (days <= 0) return { text: "Available · confirmed today", fresh: true };
    if (days <= 7) return { text: `Available · confirmed ${formatRelativeDate(confirmed, now).toLowerCase()}`, fresh: true };
    return { text: `Confirmed ${formatRelativeDate(confirmed, now).toLowerCase()}`, fresh: false };
  }
  return { text: `Listed ${formatRelativeDate(p.publishedAt ?? p.createdAt, now).toLowerCase()}`, fresh: false };
}
