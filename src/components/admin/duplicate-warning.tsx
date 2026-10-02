import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { STATUS_LABELS } from "./badges";

export type PossibleDuplicate = {
  id: string;
  code: string;
  title: string;
  status: ListingStatus;
  seller: { name: string; code: string };
  reasons: string[];
};

/** Amber hint when findPossibleDuplicates() found similar plots. Never blocks approval. */
export function DuplicateWarning({ duplicates, className }: { duplicates: PossibleDuplicate[]; className?: string }) {
  if (duplicates.length === 0) return null;
  const shown = duplicates.slice(0, 3);
  return (
    <div role="note" className={cn("rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950", className)}>
      <p className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
        Possible duplicate{duplicates.length === 1 ? "" : "s"} — check before approving
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {shown.map((d) => (
          <li key={d.id} className="min-w-0">
            <Link href={`/admin/listings/${d.id}`} className="block truncate font-medium text-amber-900 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-600">
              {d.title}
            </Link>
            <p className="truncate text-xs text-amber-800">
              <span className="tabular">{d.code}</span> · {STATUS_LABELS[d.status]} · {d.seller.name} <span className="tabular">({d.seller.code})</span> · {d.reasons.join(", ")}
            </p>
          </li>
        ))}
      </ul>
      {duplicates.length > shown.length && <p className="mt-1 text-xs text-amber-800">+{duplicates.length - shown.length} more</p>}
    </div>
  );
}
