import { BadgeCheck, CircleAlert, Clock, Globe, PencilLine, Phone, PhoneOff, ShieldBan, ShieldQuestionMark, ShieldX, UserCog, UserRoundPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WhatsAppIcon } from "@/components/ui/icons";
import type { HiddenReason, IdentityStatus, ListingSource, ListingStatus, SellerType } from "@/generated/prisma/enums";

/** Admin UI labels. HIDDEN splits in two — see statusLabel(). */
export const STATUS_LABELS: Record<ListingStatus, string> = {
  PENDING: "Pending approval",
  ACTIVE: "Live",
  HIDDEN: "Hidden",
  SOLD: "Sold",
  REJECTED: "Rejected",
};

export const UNAVAILABLE_LABEL = "Unavailable (no reply)";

/** "Unavailable (no reply)" for plots hidden by the availability check, otherwise the plain status label. */
export function statusLabel(status: ListingStatus, hiddenReason?: HiddenReason | null): string {
  if (status === "HIDDEN" && hiddenReason === "AVAILABILITY_UNCONFIRMED") return UNAVAILABLE_LABEL;
  return STATUS_LABELS[status];
}

const STATUS_TONES = {
  PENDING: "amber",
  ACTIVE: "solid",
  HIDDEN: "neutral",
  SOLD: "blue",
  REJECTED: "red",
} as const;

export const HIDDEN_REASON_LABELS: Record<HiddenReason, string> = {
  AVAILABILITY_UNCONFIRMED: "No reply to the availability check",
  BY_ADMIN: "Hidden by admin",
  BY_SELLER: "Hidden by seller",
};

export function StatusBadge({
  status,
  hiddenReason,
  size,
}: {
  status: ListingStatus;
  hiddenReason?: HiddenReason | null;
  size?: "sm" | "md";
}) {
  const unavailable = status === "HIDDEN" && hiddenReason === "AVAILABILITY_UNCONFIRMED";
  return (
    <Badge tone={unavailable ? "amber" : STATUS_TONES[status]} size={size}>
      {status === "ACTIVE" && <span className="size-1.5 rounded-full bg-white" aria-hidden />}
      {statusLabel(status, hiddenReason)}
    </Badge>
  );
}

/** Seller edited a live listing, which sent it back to review. */
export function EditedBadge({ size = "sm", short = false }: { size?: "sm" | "md"; short?: boolean }) {
  return (
    <Badge tone="blue" size={size} title="Edited by seller — needs re-review">
      <PencilLine /> {short ? "Edited — re-review" : "Edited by seller — needs re-review"}
    </Badge>
  );
}

export function SourceBadge({ source, size = "sm" }: { source: ListingSource; size?: "sm" | "md" }) {
  if (source === "WHATSAPP")
    return (
      <Badge tone="brand" size={size}>
        <WhatsAppIcon className="text-[#1faa55]" /> WhatsApp
      </Badge>
    );
  if (source === "ADMIN")
    return (
      <Badge tone="neutral" size={size}>
        <UserCog /> Admin
      </Badge>
    );
  return (
    <Badge tone="blue" size={size}>
      <Globe /> Web
    </Badge>
  );
}

/** Admin only: "Owner (self-declared)". The public site never says "Owner". */
export const SELLER_TYPE_LABELS: Record<SellerType, string> = { OWNER: "Owner (self-declared)", BROKER: "Broker" };

export function SellerTypeBadge({ type, size = "sm" }: { type: SellerType; size?: "sm" | "md" }) {
  return (
    <Badge tone={type === "OWNER" ? "neutral" : "amber"} size={size}>
      {SELLER_TYPE_LABELS[type]}
    </Badge>
  );
}

export function PhoneVerifiedBadge({ verified, size = "sm" }: { verified: boolean; size?: "sm" | "md" }) {
  if (!verified)
    return (
      <Badge tone="neutral" size={size}>
        <PhoneOff /> ✗ Phone not verified
      </Badge>
    );
  return (
    <Badge tone="brand" size={size}>
      <Phone /> ✓ Phone verified
    </Badge>
  );
}

export const IDENTITY_LABELS: Record<IdentityStatus, string> = {
  VERIFIED: "Identity verified",
  UNVERIFIED: "Identity not verified",
  PENDING: "Identity pending",
  FAILED: "Identity failed",
};

export function IdentityBadge({ status, size = "sm" }: { status: IdentityStatus; size?: "sm" | "md" }) {
  switch (status) {
    case "VERIFIED":
      return (
        <Badge tone="brand" size={size}>
          <BadgeCheck /> {IDENTITY_LABELS.VERIFIED}
        </Badge>
      );
    case "PENDING":
      return (
        <Badge tone="amber" size={size}>
          <Clock /> {IDENTITY_LABELS.PENDING}
        </Badge>
      );
    case "FAILED":
      return (
        <Badge tone="red" size={size}>
          <ShieldX /> {IDENTITY_LABELS.FAILED}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" size={size}>
          <ShieldQuestionMark /> {IDENTITY_LABELS.UNVERIFIED}
        </Badge>
      );
  }
}

/** Web sign-up started but not finished (no identity step yet). */
export function OnboardingBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Badge tone="amber" size={size}>
      <UserRoundPen /> Sign-up unfinished
    </Badge>
  );
}

export function BlockedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Badge tone="red" size={size}>
      <ShieldBan /> Blocked
    </Badge>
  );
}

export function DuplicateBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Badge tone="amber" size={size}>
      <CircleAlert /> Possible duplicate
    </Badge>
  );
}
