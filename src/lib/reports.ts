/**
 * Report reasons, statuses and outcomes — shared by the public report sheet,
 * the server validation and the admin. Client-safe (no server imports).
 */
import type { ReportOutcome, ReportReason, ReportStatus, ReportTarget } from "@/generated/prisma/enums";

export type ReasonOption = { code: ReportReason; label: string; hint: string };

export const LISTING_REASONS: readonly ReasonOption[] = [
  { code: "PROPERTY_SOLD", label: "Property sold", hint: "The land has already been sold or is no longer available." },
  { code: "DUPLICATE_LISTING", label: "Duplicate listing", hint: "The same property has been listed more than once." },
  { code: "FRAUD", label: "Fraud or scam", hint: "The listing looks fraudulent, misleading or suspicious." },
  { code: "INCORRECT_INFO", label: "Incorrect information", hint: "The price, area or other details are wrong." },
  { code: "WRONG_LOCATION", label: "Wrong location", hint: "The location shown is incorrect or misleading." },
  { code: "OTHER", label: "Other", hint: "Something else not covered above." },
];

export const PROFILE_REASONS: readonly ReasonOption[] = [
  { code: "FRAUD", label: "Fraud or scam", hint: "The seller seems suspicious or may be trying to cheat buyers." },
  { code: "FAKE_PROFILE", label: "Fake or misleading profile", hint: "The seller's identity or details look misleading." },
  { code: "DUPLICATE_PROFILE", label: "Duplicate profile", hint: "The same seller appears to have more than one profile." },
  { code: "MISLEADING_LISTINGS", label: "Misleading listings", hint: "The seller keeps posting inaccurate or misleading properties." },
  { code: "ABUSIVE", label: "Abusive or inappropriate behaviour", hint: "The seller behaves badly or abuses the platform." },
  { code: "OTHER", label: "Other", hint: "Something else not covered above." },
];

export function reasonsFor(target: ReportTarget): readonly ReasonOption[] {
  return target === "LISTING" ? LISTING_REASONS : PROFILE_REASONS;
}

export const REASON_LABELS: Record<ReportReason, string> = Object.fromEntries(
  [...LISTING_REASONS, ...PROFILE_REASONS].map((r) => [r.code, r.label]),
) as Record<ReportReason, string>;

export const REPORT_DESCRIPTION_MAX = 1000;
/** "Other" must say what's wrong. */
export const OTHER_DESCRIPTION_MIN = 10;

export const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

export const OUTCOME_LABELS: Record<ReportOutcome, string> = {
  NO_ACTION: "Checked — nothing needed changing",
  LISTING_MARKED_SOLD: "Listing marked sold",
  LISTING_HIDDEN: "Listing hidden",
  LISTING_REJECTED: "Listing rejected",
  SELLER_CONTACTED: "Seller contacted, details fixed",
  SELLER_SUSPENDED: "Seller suspended",
  DETAILS_CORRECTED: "Listing details corrected",
  OTHER: "Other",
};

export const TARGET_LABELS: Record<ReportTarget, string> = { LISTING: "Listing", PROFILE: "Profile" };
