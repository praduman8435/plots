import { Flag, SearchX, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDate } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { ReportReasonBadge, ReportStatusBadge, ReportTargetBadge } from "@/components/admin/report-badges";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { LISTING_REASONS, PROFILE_REASONS, STATUS_LABELS } from "@/lib/reports";
import { REPORTS_PAGE_SIZE, listReports, parseReportFilters, reportCounts, type ReportFilters } from "@/server/admin/reports";

export const metadata: Metadata = { title: "Reports" };

function toParams(f: ReportFilters, overrides: Partial<Record<string, string | undefined>> = {}): Record<string, string | undefined> {
  const iso = (d?: Date) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d) : undefined);
  return {
    status: f.status,
    type: f.target,
    reason: f.reason,
    from: iso(f.from),
    to: iso(f.to),
    q: f.q,
    seller: f.sellerId,
    listing: f.propertyId,
    reporter: f.reporter,
    ...overrides,
  };
}

function href(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/admin/reports?${s}` : "/admin/reports";
}

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin();
  const f = parseReportFilters(await searchParams);
  const [counts, { total, items }] = await Promise.all([reportCounts(), listReports(f)]);
  const params = toParams(f);
  const reasons = f.target === "PROFILE" ? PROFILE_REASONS : f.target === "LISTING" ? LISTING_REASONS : [...LISTING_REASONS, ...PROFILE_REASONS.filter((r) => !LISTING_REASONS.some((l) => l.code === r.code))];
  const scoped = f.sellerId || f.propertyId || f.reporter;

  const tiles = [
    { key: "PENDING", label: "Pending", value: counts.PENDING },
    { key: "UNDER_REVIEW", label: "Under review", value: counts.UNDER_REVIEW },
    { key: "RESOLVED", label: "Resolved", value: counts.RESOLVED },
    { key: "DISMISSED", label: "Dismissed", value: counts.DISMISSED },
  ] as const;

  return (
    <>
      <PageHeader
        title="Reports"
        description={counts.fraudOpen > 0 ? `${counts.fraudOpen} open report${counts.fraudOpen === 1 ? "" : "s"} about possible fraud — shown first.` : "Plots and seller profiles flagged by buyers."}
      />

      {/* Overview = status filter */}
      <nav aria-label="Report status" className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-line sm:grid-cols-4">
        {tiles.map((t) => {
          const active = f.status === t.key;
          return (
            <Link
              key={t.key}
              href={href({ ...params, status: active ? undefined : t.key, page: undefined })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-line px-4 py-3 transition hover:bg-mist [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b",
                active && "bg-brand-50 hover:bg-brand-50",
              )}
            >
              <p className={cn("text-xs font-medium", active ? "text-brand-800" : "text-muted")}>{t.label}</p>
              <p className="tabular mt-0.5 text-lg font-bold text-ink">{t.value}</p>
            </Link>
          );
        })}
      </nav>

      {/* Filters — a plain GET form, works without JS */}
      <details className="group mt-4 rounded-2xl bg-white ring-1 ring-line" open={Boolean(f.target || f.reason || f.from || f.to || f.q)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-soft">
          <SlidersHorizontal className="size-4" aria-hidden /> Filters
          {(f.target || f.reason || f.from || f.to || f.q) && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white">on</span>}
        </summary>
        <Form action="/admin/reports" className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
          {f.status && <input type="hidden" name="status" value={f.status} />}
          {f.sellerId && <input type="hidden" name="seller" value={f.sellerId} />}
          {f.propertyId && <input type="hidden" name="listing" value={f.propertyId} />}
          {f.reporter && <input type="hidden" name="reporter" value={f.reporter} />}
          <label className="text-xs font-semibold text-muted">
            Search
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Report ID, plot ID/title, seller ID/name"
              className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal text-ink focus:border-brand-500 focus:outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Type
            <select name="type" defaultValue={f.target ?? ""} className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal text-ink">
              <option value="">Listings and profiles</option>
              <option value="LISTING">Listings</option>
              <option value="PROFILE">Profiles</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Reason
            <select name="reason" defaultValue={f.reason ?? ""} className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal text-ink">
              <option value="">Any reason</option>
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            From
            <input type="date" name="from" defaultValue={params.from} className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal text-ink" />
          </label>
          <label className="text-xs font-semibold text-muted">
            To
            <input type="date" name="to" defaultValue={params.to} className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal text-ink" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-10 flex-1 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
              Apply
            </button>
            <Link href={href({ status: f.status })} className="flex h-10 items-center rounded-full px-3 text-sm font-semibold text-muted hover:text-ink">
              Clear
            </Link>
          </div>
        </Form>
      </details>

      {scoped && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Showing reports {f.propertyId ? "about one plot" : f.sellerId ? "about one seller and their plots" : "from one reporter"}.
          <Link href={href({ ...params, seller: undefined, listing: undefined, reporter: undefined, page: undefined })} className="font-semibold text-brand-700 hover:text-brand-800">
            Show all
          </Link>
        </p>
      )}

      <div className="mt-4">
        {items.length === 0 ? (
          f.q || f.target || f.reason || f.from || f.to || scoped ? (
            <EmptyState icon={SearchX} title="No reports match these filters" />
          ) : (
            <EmptyState icon={Flag} title={f.status ? `No ${STATUS_LABELS[f.status as keyof typeof STATUS_LABELS]?.toLowerCase() ?? "open"} reports` : "No reports yet"}>
              When a buyer reports a plot or a seller profile, it shows up here.
            </EmptyState>
          )
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reports/${r.id}`}
                  className={cn(
                    "block rounded-2xl bg-white p-4 ring-1 transition hover:bg-mist/60 active:bg-mist",
                    r.priority && (r.status === "PENDING" || r.status === "UNDER_REVIEW") ? "ring-red-200" : "ring-line",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ReportStatusBadge status={r.status} />
                    <ReportReasonBadge reason={r.reason} />
                    <ReportTargetBadge target={r.target} />
                    {r.openOnTarget > 1 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{r.openOnTarget} open reports on this {r.target === "LISTING" ? "plot" : "profile"}</span>
                    )}
                    <span className="tabular ml-auto text-xs text-faint">{r.code}</span>
                  </div>
                  <p className="mt-2 truncate font-semibold text-ink">{r.targetLabel}</p>
                  <p className="tabular text-[13px] text-muted">
                    {r.target === "LISTING" && r.property ? `${r.property.code} · ` : ""}
                    Seller {r.seller.name} ({r.seller.code}){r.seller.isBlocked ? " · suspended" : ""}
                  </p>
                  {r.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">“{r.description}”</p>}
                  <p className="mt-2 text-xs text-faint">
                    {formatDate(r.createdAt)} · Reported by {r.reporterSeller ? `${r.reporterSeller.name} (${r.reporterSeller.code})` : "a visitor"}
                    {r.assignedAdmin ? ` · ${r.assignedAdmin.name}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/admin/reports" params={params} page={f.page} pageSize={REPORTS_PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
