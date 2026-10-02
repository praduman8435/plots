import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

const ORDER: { status: ListingStatus; label: string; className: string }[] = [
  { status: "ACTIVE", label: "live", className: "bg-brand-50 text-brand-800 ring-brand-100" },
  { status: "PENDING", label: "pending", className: "bg-amber-50 text-amber-800 ring-amber-100" },
  { status: "HIDDEN", label: "hidden", className: "bg-mist text-ink-soft ring-line" },
  { status: "SOLD", label: "sold", className: "bg-sky-50 text-sky-800 ring-sky-100" },
  { status: "REJECTED", label: "rejected", className: "bg-red-50 text-red-700 ring-red-100" },
];

/** "3 live · 1 pending · 2 sold" as small chips. */
export function PlotCounts({ counts, className }: { counts: Partial<Record<ListingStatus, number>>; className?: string }) {
  const shown = ORDER.filter((o) => (counts[o.status] ?? 0) > 0);
  if (shown.length === 0) return <span className={cn("text-xs text-faint", className)}>No plots</span>;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((o) => (
        <span key={o.status} className={cn("tabular rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", o.className)}>
          {counts[o.status]} {o.label}
        </span>
      ))}
    </span>
  );
}
