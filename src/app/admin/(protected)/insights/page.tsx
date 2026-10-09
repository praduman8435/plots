import { CalendarCheck, Store, UsersRound, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { now } from "@/components/admin/data";
import { formatDate } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/page-header";
import { Segmented } from "@/components/admin/segmented";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getInsights, INSIGHT_RANGES, type InsightRange } from "@/server/admin/insights";

export const metadata: Metadata = { title: "Insights" };

export default async function AdminInsightsPage({ searchParams }: PageProps<"/admin/insights">) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range: InsightRange = INSIGHT_RANGES.find((r) => r.value === raw)?.value ?? "7";
  const at = now();
  const { since, buyers, sellers, availability } = await getInsights(range, at);
  const enquiryTotal = buyers.enquiries.whatsapp + buyers.enquiries.call;
  const replies = availability.yes + availability.no;

  return (
    <>
      <PageHeader title="Insights" description="Is InstaPlots working? Buyers who find and contact sellers, sellers who list, and listings that stay honest." />

      <Segmented
        label="Time range"
        options={INSIGHT_RANGES.map((r) => ({ label: r.label, href: r.value === "7" ? "/admin/insights" : `/admin/insights?range=${r.value}`, active: r.value === range }))}
      />
      <p className="mt-2 text-xs text-muted">{since ? `${formatDate(since)} – ${formatDate(at)}` : "Since tracking started"}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card icon={UsersRound} title="Buyers" subtitle="Unique browsers (no login, no personal data).">
          <Funnel
            steps={[
              { label: "Visited the site", value: buyers.visited },
              { label: "Viewed a property", value: buyers.viewed },
              {
                label: "Contacted a seller",
                value: buyers.contacted,
                note: `${formatNumber(enquiryTotal)} enquir${enquiryTotal === 1 ? "y" : "ies"} recorded · ${formatNumber(buyers.enquiries.whatsapp)} WhatsApp · ${formatNumber(buyers.enquiries.call)} call${buyers.enquiries.call === 1 ? "" : "s"}`,
              },
            ]}
          />
        </Card>

        <Card icon={Store} title="Sellers" subtitle="People who list land, from first tap to approval.">
          <Funnel
            steps={[
              { label: "Started listing or sign-up", value: sellers.started },
              { label: "Registered", value: sellers.registered },
              { label: "Submitted a listing", value: sellers.submitted, note: `${formatNumber(sellers.listings.submitted)} listing${sellers.listings.submitted === 1 ? "" : "s"} submitted` },
              { label: "Got a listing approved", value: sellers.approved, note: `${formatNumber(sellers.listings.approved)} listing${sellers.listings.approved === 1 ? "" : "s"} approved` },
            ]}
          />
          <p className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-mist px-3 py-2.5 text-sm">
            <span className="text-ink-soft">Listings rejected</span>
            <span className="tabular font-bold text-ink">{formatNumber(sellers.listings.rejected)}</span>
          </p>
        </Card>

        <Card icon={CalendarCheck} title="Availability" subtitle="Weekly “still available?” checks on WhatsApp." className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Checks sent" value={availability.checksSent} />
            <Stat label="Replied YES" value={availability.yes} tone="brand" sub={pctLabel(availability.yes, availability.checksSent, "of checks")} />
            <Stat label="Replied NO (sold)" value={availability.no} sub={pctLabel(availability.no, availability.checksSent, "of checks")} />
            <Stat label="No response" value={availability.noResponse} tone="amber" sub={pctLabel(availability.noResponse, availability.checksSent, "of checks")} />
            <Stat label="Marked sold" value={availability.sold} sub="any way" />
            <Stat label="Reactivated" value={availability.reactivated} sub="back live" />
          </div>
          {availability.checksSent > 0 && (
            <div className="mt-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-mist" aria-hidden>
                <span className="bg-brand-600" style={{ width: `${share(availability.yes, availability.checksSent)}%` }} />
                <span className="bg-sky-500" style={{ width: `${share(availability.no, availability.checksSent)}%` }} />
                <span className="bg-amber-400" style={{ width: `${share(availability.noResponse, availability.checksSent)}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <Legend className="bg-brand-600" label="YES" />
                <Legend className="bg-sky-500" label="NO" />
                <Legend className="bg-amber-400" label="No response" />
                <span className="tabular ml-auto font-medium text-ink-soft">
                  Reply rate {pct(replies, availability.checksSent) ?? "—"}
                  {pct(replies, availability.checksSent) != null ? "%" : ""}
                </span>
              </p>
            </div>
          )}
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted">
        Counted from site and WhatsApp events. Buyers are counted per browser, so one person on two phones counts twice. Conversion is from the step above.
      </p>
    </>
  );
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
function share(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
}
function pctLabel(part: number, whole: number, suffix: string): string | undefined {
  const p = pct(part, whole);
  return p == null ? undefined : `${p}% ${suffix}`;
}

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Each step: count, a bar relative to the first step, and conversion from the step before. */
function Funnel({ steps }: { steps: { label: string; value: number; note?: string }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 0, ...steps.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-3.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev != null ? pct(s.value, prev) : null;
        return (
          <li key={s.label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm font-medium text-ink-soft">{s.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                {prev != null && (
                  <span className={cn("tabular text-xs font-semibold", conv == null ? "text-faint" : "text-brand-700")}>
                    {conv == null ? "—" : `${conv}%`}
                  </span>
                )}
                <span className="tabular text-xl font-extrabold text-ink">{formatNumber(s.value)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-mist" aria-hidden>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (s.value / top) * 100)}%` }} />
            </div>
            {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "brand" | "amber" }) {
  return (
    <div className="min-w-0 rounded-xl border border-line px-3 py-2.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("tabular mt-0.5 text-2xl font-extrabold", tone === "brand" ? "text-brand-700" : tone === "amber" ? "text-amber-700" : "text-ink")}>
        {formatNumber(value)}
      </p>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", className)} aria-hidden /> {label}
    </span>
  );
}
