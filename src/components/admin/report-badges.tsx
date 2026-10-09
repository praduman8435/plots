import { Flag, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReportReason, ReportStatus, ReportTarget } from "@/generated/prisma/enums";
import { REASON_LABELS, STATUS_LABELS, TARGET_LABELS } from "@/lib/reports";

const STATUS_TONE = { PENDING: "amber", UNDER_REVIEW: "blue", RESOLVED: "brand", DISMISSED: "neutral" } as const;

export function ReportStatusBadge({ status, size = "sm" }: { status: ReportStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ReportReasonBadge({ reason, size = "sm" }: { reason: ReportReason; size?: "sm" | "md" }) {
  return (
    <Badge tone={reason === "FRAUD" ? "red" : "neutral"} size={size}>
      {reason === "FRAUD" ? <ShieldAlert /> : <Flag />}
      {REASON_LABELS[reason]}
    </Badge>
  );
}

export function ReportTargetBadge({ target, size = "sm" }: { target: ReportTarget; size?: "sm" | "md" }) {
  return (
    <Badge tone="neutral" size={size}>
      {TARGET_LABELS[target]}
    </Badge>
  );
}
