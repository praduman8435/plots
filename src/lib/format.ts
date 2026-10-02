const inr = new Intl.NumberFormat("en-IN");

/** ₹1.25 Cr · ₹45 Lakh · ₹85,000 — the way Indian buyers read prices. */
export function formatPrice(value: bigint | number): string {
  const n = Number(value);
  if (n >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)} Cr`;
  if (n >= 1_00_000) return `₹${trim(n / 1_00_000)} Lakh`;
  return `₹${inr.format(n)}`;
}

export function formatNumber(n: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: maxFractionDigits }).format(n);
}

/** "3 days ago", "2 months ago" — for listing dates. */
export function formatRelativeDate(date: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}
