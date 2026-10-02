import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/** Prev/next pagination that keeps the other query params. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
      <p className="tabular text-sm text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <ButtonLink href={href(page - 1)} variant="secondary" size="md" aria-label="Previous page">
            <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
          </ButtonLink>
        ) : null}
        {page < pages ? (
          <ButtonLink href={href(page + 1)} variant="secondary" size="md" aria-label="Next page">
            <span className="hidden sm:inline">Next</span> <ChevronRight />
          </ButtonLink>
        ) : null}
      </div>
    </nav>
  );
}
