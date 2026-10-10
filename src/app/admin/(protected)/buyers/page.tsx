import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import { ContactButtons } from "@/components/admin/contact-buttons";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDateTime, timeAgo } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Segmented } from "@/components/admin/segmented";
import { Badge } from "@/components/ui/badge";
import type { BuyerRequestStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES } from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { setBuyerRequestStatusAction } from "@/server/actions/admin/buyer-requests";

export const metadata: Metadata = { title: "Buyer requests" };

const PAGE_SIZE = 30;
const STATUSES = [
  { value: "OPEN", label: "Waiting" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CLOSED", label: "Closed" },
  { value: "all", label: "All" },
] as const;

/**
 * "Tell us what you need" requests from buyers. When matching land is listed,
 * WhatsApp the buyer from here and mark them contacted.
 */
export default async function AdminBuyerRequestsPage({ searchParams }: PageProps<"/admin/buyers">) {
  await requireAdmin();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = STATUSES.find((s) => s.value === first(sp.status))?.value ?? "OPEN";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const where = status === "all" ? {} : { status: status as BuyerRequestStatus };

  const [total, requests] = await Promise.all([
    db.buyerRequest.count({ where }),
    db.buyerRequest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { city: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Buyer requests"
        description="Buyers who told us what land they want. When something matching is listed, WhatsApp them and mark them contacted."
      />
      <Segmented
        label="Status"
        options={STATUSES.map((s) => ({ label: s.label, href: s.value === "OPEN" ? "/admin/buyers" : `/admin/buyers?status=${s.value}`, active: s.value === status }))}
      />

      <div className="mt-5">
        {requests.length === 0 ? (
          <EmptyState icon={BellRing} title={status === "OPEN" ? "No buyers waiting right now" : "Nothing here"} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {requests.map((r) => {
              const what = r.landType ? LAND_TYPES[r.landType].label.toLowerCase() : "land";
              const where = [r.area, r.city?.name ?? r.place].filter(Boolean).join(", ");
              const budget = r.budgetMax ? `up to ${formatPrice(r.budgetMax)}` : null;
              const message = `Hi ${r.name}, this is InstaPlots. You asked us about ${what} in ${where}${budget ? `, ${budget}` : ""}. `;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[15px] font-semibold text-ink">{r.name}</span>
                      <span className="tabular text-xs text-muted">{formatPhone(r.phone)}</span>
                      {r.status !== "OPEN" && (
                        <Badge tone={r.status === "CONTACTED" ? "brand" : "neutral"} size="sm">
                          {r.status === "CONTACTED" ? "Contacted" : "Closed"}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {r.landType ? LAND_TYPES[r.landType].label : "Any land"} in <b className="font-semibold">{where}</b>
                      {budget && <> · {budget}</>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      <time dateTime={r.updatedAt.toISOString()} title={formatDateTime(r.updatedAt)}>
                        Asked {timeAgo(r.updatedAt)}
                      </time>
                      {r.contactedAt && <> · contacted {timeAgo(r.contactedAt)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ContactButtons phone={r.phone} text={message} />
                    {r.status === "OPEN" ? (
                      <>
                        <StatusButton id={r.id} status="CONTACTED" label="Mark contacted" primary />
                        <StatusButton id={r.id} status="CLOSED" label="Close" />
                      </>
                    ) : (
                      <StatusButton id={r.id} status="OPEN" label="Reopen" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination basePath="/admin/buyers" params={{ status: status !== "OPEN" ? status : undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}

function StatusButton({ id, status, label, primary = false }: { id: string; status: BuyerRequestStatus; label: string; primary?: boolean }) {
  return (
    <form action={setBuyerRequestStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          primary
            ? "h-9 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700"
            : "h-9 rounded-full px-3 text-sm font-semibold text-ink-soft ring-1 ring-line hover:bg-mist"
        }
      >
        {label}
      </button>
    </form>
  );
}
