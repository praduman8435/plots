import type { LandType } from "@/generated/prisma/enums";

const TZ = "Asia/Kolkata";

/** "just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", then a date. */
export function timeAgo(date: Date, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return formatDate(date);
}

/** "2 Oct 2026" */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(date);
}

/** "2 Oct, 4:05 pm" */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(date);
}

export function daysSince(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

/** Whole hours left before `start + windowMs` (0 when past). */
export function hoursLeft(start: Date, windowMs: number, now = new Date()): number {
  return Math.max(0, Math.ceil((start.getTime() + windowMs - now.getTime()) / 3_600_000));
}

/** Admin wording for land types — "Other" is shown as such (the public site says "Land"). */
const LAND_TYPE_LABELS: Record<LandType, string> = {
  RESIDENTIAL_PLOT: "Residential plot",
  AGRICULTURAL: "Agricultural land",
  COMMERCIAL: "Commercial land",
  INDUSTRIAL: "Industrial land",
  OTHER: "Other land",
};

export function landTypeLabel(type: LandType): string {
  return LAND_TYPE_LABELS[type];
}

/** timeAgo() for use mid-sentence: "yesterday", "3 days ago", "2 Oct 2026". */
export function timeAgoInline(date: Date, now = new Date()): string {
  const s = timeAgo(date, now);
  return s === "Yesterday" ? "yesterday" : s;
}
