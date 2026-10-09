import { formatRelativeDate } from "./format";

/**
 * Honest freshness copy. Only an explicit seller confirmation counts as
 * "confirmed"; otherwise we say when it was listed. `short` fits a card footer
 * (the green dot already says "available").
 */
export function freshnessLabel(p: { lastConfirmedAt: Date | null; publishedAt: Date | null; createdAt: Date }, now = new Date()) {
  const confirmed = p.lastConfirmedAt;
  if (confirmed && (!p.publishedAt || confirmed >= p.publishedAt)) {
    const days = Math.floor((now.getTime() - confirmed.getTime()) / 86_400_000);
    if (days <= 0) return { text: "Available · confirmed today", short: "Confirmed today", fresh: true };
    if (days <= 7) {
      const when = formatRelativeDate(confirmed, now).toLowerCase();
      return { text: `Available · confirmed ${when}`, short: `Confirmed ${when}`, fresh: true };
    }
    const text = `Confirmed ${formatRelativeDate(confirmed, now).toLowerCase()}`;
    return { text, short: text, fresh: false };
  }
  const text = `Listed ${formatRelativeDate(p.publishedAt ?? p.createdAt, now).toLowerCase()}`;
  return { text, short: text, fresh: false };
}
